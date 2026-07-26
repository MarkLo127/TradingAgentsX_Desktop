import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { BackendLogLine, BackendStatus } from '../shared/types'
import { readSettings } from './store'

const MAX_LOG_LINES = 400
const HEALTH_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 700

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

/** 往上找 TradingAgentsX repo 根目錄（含 backend/app/main.py 者） */
function detectRepoRoot(): string | null {
  const starts = [app.getAppPath(), process.cwd()]
  for (const start of starts) {
    let dir = start
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'backend', 'app', 'main.py'))) return dir
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

/**
 * 內建的後端執行環境（隨 App 一起打包，使用者不需要 clone repo 或自備 Python）。
 * 由 scripts/build-backend.mjs 產生，透過 electron-builder 的 extraResources 放進：
 *   <resources>/pybackend/   —— 可重定位的 Python 執行環境（含所有依賴）
 *   <resources>/appsrc/      —— backend/ 與 tradingagents/ 原始碼
 * 開發時可用環境變數 TAX_BUNDLE_DIR 指向本機建好的 bundle 來測試。
 */
function detectBundledBackend(): { python: string; appsrc: string } | null {
  const base = app.isPackaged ? process.resourcesPath : process.env.TAX_BUNDLE_DIR
  if (!base) return null
  const python =
    process.platform === 'win32'
      ? path.join(base, 'pybackend', 'python.exe')
      : path.join(base, 'pybackend', 'bin', 'python3')
  const appsrc = path.join(base, 'appsrc')
  if (fs.existsSync(python) && fs.existsSync(path.join(appsrc, 'backend', '__main__.py'))) {
    return { python, appsrc }
  }
  return null
}

/** 依序嘗試常見的 Python 位置，回傳第一個存在的 */
function detectPython(repoRoot: string): string | null {
  const home = os.homedir()
  const exe = process.platform === 'win32' ? 'python.exe' : 'python'
  const candidates = [
    path.join(repoRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', exe),
    path.join(home, 'anaconda3', 'envs', 'tradingagents', 'bin', 'python'),
    path.join(home, 'miniconda3', 'envs', 'tradingagents', 'bin', 'python'),
    path.join(home, 'miniforge3', 'envs', 'tradingagents', 'bin', 'python'),
    path.join(home, '.conda', 'envs', 'tradingagents', 'bin', 'python'),
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

class BackendController extends EventEmitter {
  private proc: ChildProcess | null = null
  private logs: BackendLogLine[] = []
  private stopping = false
  private status: BackendStatus = {
    phase: 'idle',
    url: null,
    port: null,
    pid: null,
    message: null,
    version: null,
    redisConnected: false,
    startedAt: null,
  }

  getStatus(): BackendStatus {
    return this.status
  }

  getLogs(): BackendLogLine[] {
    return this.logs
  }

  private setStatus(patch: Partial<BackendStatus>) {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.status)
  }

  private log(stream: BackendLogLine['stream'], text: string) {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trimEnd()
      if (!t) continue
      const entry: BackendLogLine = { at: new Date().toISOString(), stream, text: t }
      this.logs.push(entry)
      if (this.logs.length > MAX_LOG_LINES) this.logs.shift()
      this.emit('log', entry)
    }
  }

  async start(): Promise<BackendStatus> {
    await this.stop()
    this.stopping = false
    this.logs = []

    const settings = readSettings()

    if (settings.backend.mode === 'external') {
      const url = settings.backend.url.replace(/\/+$/, '')
      this.setStatus({ phase: 'starting', url, port: null, pid: null, message: '連線至外部後端…' })
      this.log('app', `外部後端模式：${url}`)
      const ok = await this.waitForHealth(url, 15_000)
      if (!ok) {
        this.setStatus({ phase: 'error', message: `無法連線到 ${url}` })
      }
      return this.status
    }

    // 優先使用隨 App 打包的內建執行環境（使用者無需 clone repo / 安裝 Python）。
    // 只有在使用者沒有手動指定 Python 路徑時才自動採用，保留進階者的覆寫能力。
    const bundled = settings.backend.command ? null : detectBundledBackend()

    let python: string
    let cwd: string
    // bundled 模式要額外注入的環境變數（把後端的中間檔導離唯讀的 App bundle）
    const extraEnv: Record<string, string> = {}
    if (bundled) {
      python = bundled.python
      // App 的 Resources 是唯讀的。後端有些中間檔是相對「工作目錄」寫的（例如 eval_results/），
      // 所以用一個可寫的工作目錄，並把 backend/tradingagents 用 PYTHONPATH 掛上；
      // 資料與快取也一併導到可寫的 userData 底下。
      const runDir = path.join(app.getPath('userData'), 'backend-run')
      const dataDir = path.join(app.getPath('userData'), 'data')
      const cacheDir = path.join(app.getPath('userData'), 'data-cache')
      for (const d of [runDir, dataDir, cacheDir]) fs.mkdirSync(d, { recursive: true })
      cwd = runDir
      extraEnv.PYTHONPATH = bundled.appsrc
      extraEnv.TRADINGAGENTS_DATA_DIR = dataDir
      extraEnv.TRADINGAGENTS_DATA_CACHE_DIR = cacheDir
      this.log('app', '使用內建後端執行環境（隨 App 打包）')
    } else {
      const repoRoot = settings.backend.cwd || detectRepoRoot()
      if (!repoRoot) {
        const msg = '找不到 TradingAgentsX 專案目錄，請到「設定 → 後端」手動指定'
        this.log('app', msg)
        this.setStatus({ phase: 'error', message: msg, url: null, port: null, pid: null })
        return this.status
      }
      const found = settings.backend.command || detectPython(repoRoot)
      if (!found) {
        const msg = '找不到可用的 Python，請到「設定 → 後端」手動指定直譯器路徑'
        this.log('app', msg)
        this.setStatus({ phase: 'error', message: msg, url: null, port: null, pid: null })
        return this.status
      }
      python = found
      cwd = repoRoot
    }

    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    this.setStatus({
      phase: 'starting',
      url,
      port,
      pid: null,
      message: '正在啟動本機後端…',
      startedAt: new Date().toISOString(),
    })
    this.log('app', `${python} -m backend --port ${port}`)
    this.log('app', `工作目錄 ${cwd}`)

    const child = spawn(
      python,
      ['-m', 'backend', '--host', '127.0.0.1', '--port', String(port), '--reload', 'false'],
      {
        cwd,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          BACKEND_HOST: '127.0.0.1',
          BACKEND_PORT: String(port),
          PORT: String(port),
          BACKEND_RELOAD: 'false',
          // 桌面版沒有多使用者概念，關掉分析端點的登入要求
          REQUIRE_AUTH_FOR_ANALYZE: 'false',
          CORS_ORIGINS: 'http://localhost:5173',
          // 後端 pydantic Settings 讀的是 RESULTS_DIR；一併設 TRADINGAGENTS_RESULTS_DIR。
          // 都指到使用者的報告資料夾（可寫），不會寫進唯讀的 App bundle。
          RESULTS_DIR: settings.reportsDir,
          TRADINGAGENTS_RESULTS_DIR: settings.reportsDir,
          ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    this.proc = child
    this.setStatus({ pid: child.pid ?? null })

    child.stdout?.on('data', (b: Buffer) => this.log('stdout', b.toString()))
    child.stderr?.on('data', (b: Buffer) => this.log('stderr', b.toString()))

    child.on('error', (err) => {
      this.log('app', `啟動失敗：${err.message}`)
      this.setStatus({ phase: 'error', message: err.message })
    })

    child.on('exit', (code, signal) => {
      this.proc = null
      if (this.stopping) {
        this.setStatus({ phase: 'stopped', message: null, pid: null })
        return
      }
      const msg = `後端行程結束（code=${code ?? '-'} signal=${signal ?? '-'}）`
      this.log('app', msg)
      this.setStatus({ phase: 'error', message: msg, pid: null })
    })

    const ok = await this.waitForHealth(url, HEALTH_TIMEOUT_MS)
    if (!ok && this.status.phase !== 'error') {
      this.setStatus({ phase: 'error', message: '後端啟動逾時，請查看日誌' })
    }
    return this.status
  }

  private async waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.stopping) return false
      // 行程已死就不用再等了
      if (this.status.phase === 'error' && !this.proc && readSettings().backend.mode === 'auto') {
        return false
      }
      try {
        const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2500) })
        if (res.ok) {
          const body = (await res.json()) as { version?: string; redis_connected?: boolean }
          this.log('app', '後端就緒')
          this.setStatus({
            phase: 'ready',
            url,
            message: null,
            version: body.version ?? null,
            redisConnected: Boolean(body.redis_connected),
          })
          return true
        }
      } catch {
        /* 還沒起來，繼續等 */
      }
      await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS))
    }
    return false
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.proc
    if (!child) {
      if (this.status.phase !== 'idle') this.setStatus({ phase: 'stopped', pid: null })
      return
    }
    this.proc = null
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      child.once('exit', done)
      child.kill('SIGTERM')
      // 5 秒還沒退就強制結束，避免關 App 時卡住
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
        resolve()
      }, 5000)
    })
    this.setStatus({ phase: 'stopped', pid: null })
  }

  /** 對後端發請求；未就緒時直接失敗，不做隱式等待 */
  async request<T>(
    method: string,
    apiPath: string,
    body?: unknown,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    const base = this.status.url
    if (!base || this.status.phase !== 'ready') {
      return { ok: false, status: 0, message: '本機後端尚未就緒' }
    }
    try {
      const res = await fetch(`${base}${apiPath}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(300_000),
      })
      const text = await res.text()
      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      if (!res.ok) {
        const detail =
          parsed && typeof parsed === 'object' && 'detail' in parsed
            ? String((parsed as { detail: unknown }).detail)
            : String(text || res.statusText)
        return { ok: false, status: res.status, message: detail }
      }
      return { ok: true, data: parsed as T }
    } catch (err) {
      return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) }
    }
  }
}

export const backend = new BackendController()
export { detectPython, detectRepoRoot }
