import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Settings, StoredReport, ReportMeta, DiskUsage } from '../shared/types'

const userData = () => app.getPath('userData')
const settingsFile = () => path.join(userData(), 'settings.json')

export function defaultReportsDir(): string {
  return path.join(app.getPath('documents'), 'TradingAgentsX', 'reports')
}

function defaults(): Settings {
  return {
    theme: 'system',
    language: 'zh-TW',
    reportsDir: defaultReportsDir(),
    backend: { mode: 'auto', url: 'http://127.0.0.1:8000', command: '', cwd: '' },
    deepThinkLlm: 'claude-opus-5',
    quickThinkLlm: 'claude-haiku-4-5-20251001',
    embeddingModel: 'all-mpnet-base-v2',
    customDeepModel: '',
    customQuickModel: '',
    customEmbeddingModel: '',
    customBaseUrl: '',
    marketType: 'us',
    researchDepth: 3, // 平衡模式（對齊雲端版預設）
    analysts: ['market', 'social', 'news', 'fundamentals'],
    useCache: true,
    watchlist: [],
  }
}

let cache: Settings | null = null

export function readSettings(): Settings {
  if (cache) return cache
  const base = defaults()
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    // 淺層合併即可：巢狀只有 backend 一層，單獨處理
    cache = {
      ...base,
      ...parsed,
      backend: { ...base.backend, ...(parsed.backend ?? {}) },
    }
  } catch {
    cache = base
  }
  return cache
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  if (patch.backend) next.backend = { ...readSettings().backend, ...patch.backend }
  cache = next
  fs.mkdirSync(userData(), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

/* -------------------------------------------------------------- 報告存檔 */

function reportsDir(): string {
  const dir = readSettings().reportsDir
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 只取詮釋資料，不把整份 result 帶進清單 */
function toMeta(report: StoredReport, fileName = report.fileName): ReportMeta {
  return {
    id: report.id,
    ticker: report.ticker,
    analysisDate: report.analysisDate,
    marketType: report.marketType,
    verdict: report.verdict,
    confidence: report.confidence,
    deepThinkLlm: report.deepThinkLlm,
    quickThinkLlm: report.quickThinkLlm,
    analystCount: report.analystCount,
    durationMs: report.durationMs,
    createdAt: report.createdAt,
    fileName,
  }
}

export function saveReport(report: StoredReport): ReportMeta {
  const dir = reportsDir()
  fs.writeFileSync(path.join(dir, report.fileName), JSON.stringify(report, null, 2), 'utf8')
  return toMeta(report)
}

export function listReports(): ReportMeta[] {
  const dir = reportsDir()
  let names: string[]
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out: ReportMeta[] = []
  for (const name of names) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as StoredReport
      // 檔案可能被改名，一律以實際檔名為準
      out.push(toMeta(raw, name))
    } catch {
      // 壞掉的檔案略過，不讓整份清單掛掉
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getReport(fileName: string): StoredReport | null {
  const safe = path.basename(fileName)
  try {
    return JSON.parse(fs.readFileSync(path.join(reportsDir(), safe), 'utf8')) as StoredReport
  } catch {
    return null
  }
}

export function deleteReport(fileName: string): boolean {
  const safe = path.basename(fileName)
  try {
    fs.unlinkSync(path.join(reportsDir(), safe))
    return true
  } catch {
    return false
  }
}

export function diskUsage(): DiskUsage {
  const dir = reportsDir()
  let bytes = 0
  let reportCount = 0
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      bytes += fs.statSync(path.join(dir, name)).size
      reportCount += 1
    }
  } catch {
    /* 目錄不存在時回 0 */
  }
  return { reportCount, bytes }
}
