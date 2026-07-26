import { BrowserWindow, app, dialog, ipcMain, nativeTheme, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AppInfo,
  SecretId,
  Settings,
  StartAnalysisInput,
  StoredReport,
  ThemePreference,
} from '../shared/types'
import { PROVIDERS, baseUrlForModel, embeddingProvider, providerForModel } from '../shared/providers'
import { backend, detectPython, detectRepoRoot } from './backend'
import * as store from './store'
import * as secrets from './secrets'

function win(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

export function applyTheme(pref: ThemePreference) {
  nativeTheme.themeSource = pref
}

export function registerIpc() {
  /* ---------------------------------------------------------- app / 視窗 */

  ipcMain.handle('app:info', (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      reportsDir: store.readSettings().reportsDir,
      isPackaged: app.isPackaged,
    }
  })

  ipcMain.handle('win:minimize', () => win()?.minimize())
  ipcMain.handle('win:toggleMaximize', () => {
    const w = win()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  ipcMain.handle('win:close', () => win()?.close())
  ipcMain.handle('win:isMaximized', () => win()?.isMaximized() ?? false)

  /* ------------------------------------------------------------------ 設定 */

  ipcMain.handle('settings:get', (): Settings => store.readSettings())

  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>): Settings => {
    const next = store.writeSettings(patch)
    if (patch.theme) applyTheme(patch.theme)
    return next
  })

  ipcMain.handle('settings:selectDir', async (_e, current?: string) => {
    const w = win()
    if (!w) return null
    const res = await dialog.showOpenDialog(w, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: current,
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('settings:selectFile', async (_e, current?: string) => {
    const w = win()
    if (!w) return null
    const res = await dialog.showOpenDialog(w, {
      properties: ['openFile'],
      defaultPath: current,
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('settings:detect', () => {
    const repoRoot = detectRepoRoot()
    return {
      repoRoot,
      python: repoRoot ? detectPython(repoRoot) : null,
    }
  })

  /* ------------------------------------------------------------------ 金鑰 */

  ipcMain.handle('secrets:state', () => secrets.secretsState())

  ipcMain.handle('secrets:set', (_e, id: SecretId, value: string) => {
    secrets.setSecret(id, value)
    return secrets.secretsState()
  })

  ipcMain.handle('secrets:remove', (_e, id: SecretId) => {
    secrets.removeSecret(id)
    return secrets.secretsState()
  })

  /**
   * 直接向供應商發一次最小成本的請求來驗證金鑰。
   * 金鑰不會離開主行程 —— 渲染行程只拿得到成功／失敗。
   */
  ipcMain.handle('secrets:verify', async (_e, id: SecretId) => {
    const key = secrets.getSecret(id)
    if (!key) return { ok: false, message: '尚未設定金鑰' }
    try {
      if (id === 'custom') {
        // 自訂端點的 base URL 在啟動分析時才知道，這裡只確認金鑰已存
        return { ok: true, message: '已儲存（自訂端點於分析時連線，無法預先驗證）' }
      }
      if (id === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(12_000),
        })
        return res.ok
          ? { ok: true, message: '驗證成功' }
          : { ok: false, message: `驗證失敗（HTTP ${res.status}）` }
      }
      if (id === 'alphavantage') {
        const res = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(12_000) },
        )
        const body = (await res.json()) as Record<string, unknown>
        if ('Error Message' in body || 'Information' in body) {
          return { ok: false, message: String(body['Error Message'] ?? body['Information']) }
        }
        return { ok: true, message: '驗證成功' }
      }
      if (id === 'finmind') {
        const res = await fetch(
          `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&token=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(12_000) },
        )
        return res.ok
          ? { ok: true, message: '驗證成功' }
          : { ok: false, message: `驗證失敗（HTTP ${res.status}）` }
      }
      // 其餘供應商皆相容 OpenAI 的 /models
      const base = PROVIDERS[id].baseUrl
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(12_000),
      })
      return res.ok
        ? { ok: true, message: '驗證成功' }
        : { ok: false, message: `驗證失敗（HTTP ${res.status}）` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  /* ------------------------------------------------------------------ 後端 */

  ipcMain.handle('backend:status', () => backend.getStatus())
  ipcMain.handle('backend:logs', () => backend.getLogs())
  ipcMain.handle('backend:restart', () => backend.start())
  ipcMain.handle('backend:stop', () => backend.stop())

  ipcMain.handle('backend:get', (_e, apiPath: string) => backend.request('GET', apiPath))
  ipcMain.handle('backend:delete', (_e, apiPath: string) => backend.request('DELETE', apiPath))

  backend.on('status', (s) => broadcast('backend:status', s))
  backend.on('log', (l) => broadcast('backend:log', l))

  /* ------------------------------------------------------------------ 分析 */

  /**
   * 啟動分析。金鑰由主行程在此注入 —— 渲染行程從頭到尾拿不到明文。
   */
  ipcMain.handle('analysis:start', async (_e, input: StartAnalysisInput) => {
    // 'custom' 模型：實際模型名稱、base URL 由設定帶入，金鑰用 'custom' 這把
    const isDeepCustom = input.deepThinkLlm === 'custom'
    const isQuickCustom = input.quickThinkLlm === 'custom'
    const isEmbedCustom = input.embeddingModel === 'custom'

    const deepModel = isDeepCustom ? (input.customDeepModel ?? '').trim() : input.deepThinkLlm
    const quickModel = isQuickCustom ? (input.customQuickModel ?? '').trim() : input.quickThinkLlm
    const embedModel = isEmbedCustom ? (input.customEmbeddingModel ?? '').trim() : input.embeddingModel
    const customBaseUrl = (input.customBaseUrl ?? '').trim()

    const deepProvider = providerForModel(input.deepThinkLlm)
    const quickProvider = providerForModel(input.quickThinkLlm)

    const deepKey = secrets.getSecret(deepProvider)
    const quickKey = secrets.getSecret(quickProvider)

    const missing: string[] = []
    if (!deepKey) missing.push(PROVIDERS[deepProvider].label)
    if (!quickKey && quickProvider !== deepProvider) missing.push(PROVIDERS[quickProvider].label)

    // custom 模型：需要模型名稱（此頁）與共用 base URL（設定頁）
    const usingCustom = isDeepCustom || isQuickCustom || isEmbedCustom
    const missingModel: string[] = []
    if (isDeepCustom && !deepModel) missingModel.push('深度思考')
    if (isQuickCustom && !quickModel) missingModel.push('快速思考')
    if (isEmbedCustom && !embedModel) missingModel.push('Embedding')

    // embedding 依模型決定要用哪家金鑰（gemini embedding 走 google，custom 走 custom，其餘走 openai）
    const embProvider = embeddingProvider(input.embeddingModel)
    const embeddingKey = embProvider ? secrets.getSecret(embProvider) : ''
    const embeddingBaseUrl = isEmbedCustom
      ? customBaseUrl
      : embProvider
        ? PROVIDERS[embProvider].baseUrl
        : PROVIDERS.openai.baseUrl
    if (embProvider && !embeddingKey) {
      missing.push(`${PROVIDERS[embProvider].label}（embedding 用）`)
    }

    if (missingModel.length) {
      return {
        ok: false as const,
        status: 0,
        message: `自訂模型需要填寫模型名稱：${missingModel.join('、')}。`,
      }
    }
    if (usingCustom && !customBaseUrl) {
      return {
        ok: false as const,
        status: 0,
        message: '使用自訂模型前，請先到「設定 → 自訂（OpenAI 相容）」填寫 base URL。',
      }
    }

    if (missing.length) {
      return {
        ok: false as const,
        status: 0,
        message: `缺少 API 金鑰：${[...new Set(missing)].join('、')}。請先到「設定」新增。`,
      }
    }

    const payload = {
      ticker: input.ticker,
      analysis_date: input.analysisDate,
      analysts: input.analysts,
      research_depth: input.researchDepth,
      market_type: input.marketType,
      language: input.language,

      deep_think_llm: deepModel,
      quick_think_llm: quickModel,
      deep_think_api_key: deepKey,
      quick_think_api_key: quickKey || deepKey,
      deep_think_base_url: isDeepCustom ? customBaseUrl : baseUrlForModel(input.deepThinkLlm),
      quick_think_base_url: isQuickCustom ? customBaseUrl : baseUrlForModel(input.quickThinkLlm),

      embedding_model: embedModel,
      embedding_api_key: embeddingKey,
      embedding_base_url: embeddingBaseUrl,

      openai_api_key: secrets.getSecret('openai'),
      openai_base_url: PROVIDERS.openai.baseUrl,

      alpha_vantage_api_key: secrets.getSecret('alphavantage'),
      finmind_api_key: secrets.getSecret('finmind'),
    }

    return backend.request<{ task_id: string }>('POST', '/api/analyze', payload)
  })

  ipcMain.handle('analysis:status', (_e, taskId: string) =>
    backend.request(`GET`, `/api/task/${encodeURIComponent(taskId)}`),
  )

  ipcMain.handle('analysis:cleanup', (_e, taskId: string) =>
    backend.request('DELETE', `/api/task/${encodeURIComponent(taskId)}/cleanup`),
  )

  /* ------------------------------------------------------------------ 報告 */

  ipcMain.handle('reports:list', () => store.listReports())
  ipcMain.handle('reports:get', (_e, fileName: string) => store.getReport(fileName))
  ipcMain.handle('reports:save', (_e, report: StoredReport) => store.saveReport(report))
  ipcMain.handle('reports:delete', (_e, fileName: string) => store.deleteReport(fileName))
  ipcMain.handle('reports:usage', () => store.diskUsage())

  ipcMain.handle('reports:reveal', (_e, fileName?: string) => {
    const dir = store.readSettings().reportsDir
    fs.mkdirSync(dir, { recursive: true })
    if (fileName) shell.showItemInFolder(path.join(dir, path.basename(fileName)))
    else shell.openPath(dir)
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  /* -------------------------------------------------------------- 危險操作 */

  ipcMain.handle('data:clearAll', async () => {
    const w = win()
    const res = await dialog.showMessageBox(w!, {
      type: 'warning',
      buttons: ['取消', '全部清除'],
      defaultId: 0,
      cancelId: 0,
      title: '清除所有本機資料',
      message: '確定要清除所有報告、設定與已儲存的金鑰嗎？',
      detail: '此操作無法復原。',
    })
    if (res.response !== 1) return false
    secrets.clearAllSecrets()
    for (const r of store.listReports()) store.deleteReport(r.fileName)
    store.writeSettings({ watchlist: [] })
    return true
  })
}
