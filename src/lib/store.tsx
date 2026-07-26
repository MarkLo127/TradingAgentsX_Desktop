import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppInfo,
  BackendLogLine,
  BackendStatus,
  ReportMeta,
  SecretsState,
  Settings,
  StartAnalysisInput,
  StoredReport,
  TaskStatus,
} from '@shared/types'
import { tax } from './bridge'
import { parseConfidence, parseVerdict } from './report'

/* ------------------------------------------------------------------ 路由 */

export type RouteName = 'dashboard' | 'new' | 'running' | 'report' | 'settings'

export interface Route {
  name: RouteName
  /** report 路由用：報告檔名 */
  fileName?: string
}

/* ------------------------------------------------------------ 執行中任務 */

export interface RunningTask {
  taskId: string
  input: StartAnalysisInput
  startedAt: number
  status: TaskStatus | null
  /** 輪詢或啟動失敗的訊息 */
  error: string | null
  /** 完成後寫入的本機檔名 */
  savedFileName: string | null
}

const IDLE_BACKEND: BackendStatus = {
  phase: 'idle',
  url: null,
  port: null,
  pid: null,
  message: null,
  version: null,
  redisConnected: false,
  startedAt: null,
}

interface AppStore {
  route: Route
  navigate: (route: Route) => void

  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => Promise<void>

  backend: BackendStatus
  logs: BackendLogLine[]
  restartBackend: () => Promise<void>

  secrets: SecretsState
  refreshSecrets: () => Promise<void>

  reports: ReportMeta[]
  refreshReports: () => Promise<void>

  appInfo: AppInfo | null

  task: RunningTask | null
  startAnalysis: (input: StartAnalysisInput) => Promise<{ ok: boolean; message?: string }>
  dismissTask: () => void
}

const StoreContext = createContext<AppStore | null>(null)

const POLL_MS = 2000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' })
  const [settings, setSettings] = useState<Settings | null>(null)
  const [backend, setBackend] = useState<BackendStatus>(IDLE_BACKEND)
  const [logs, setLogs] = useState<BackendLogLine[]>([])
  const [secrets, setSecrets] = useState<SecretsState>({ encryptionAvailable: false, items: [] })
  const [reports, setReports] = useState<ReportMeta[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [task, setTask] = useState<RunningTask | null>(null)

  // 輪詢的 effect 只相依 taskId 與是否結束（見下方），
  // 但 tick 裡需要 input / startedAt 來落地報告，所以用 ref 帶最新的 task。
  const taskRef = useRef<RunningTask | null>(null)
  useEffect(() => {
    taskRef.current = task
  }, [task])

  /* ------------------------------------------------------------ 初始載入 */

  useEffect(() => {
    void (async () => {
      const [s, b, l, sec, r, info] = await Promise.all([
        tax.settings.get(),
        tax.backend.status(),
        tax.backend.logs(),
        tax.secrets.state(),
        tax.reports.list(),
        tax.app.info(),
      ])
      setSettings(s)
      setBackend(b)
      setLogs(l)
      setSecrets(sec)
      setReports(r)
      setAppInfo(info)
    })()

    const offStatus = tax.backend.onStatus(setBackend)
    const offLog = tax.backend.onLog((line) =>
      setLogs((prev) => (prev.length > 400 ? [...prev.slice(-399), line] : [...prev, line])),
    )
    return () => {
      offStatus()
      offLog()
    }
  }, [])

  /* -------------------------------------------------------------- 動作 */

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await tax.settings.set(patch)
    setSettings(next)
  }, [])

  const restartBackend = useCallback(async () => {
    setLogs([])
    await tax.backend.restart()
  }, [])

  const refreshSecrets = useCallback(async () => {
    setSecrets(await tax.secrets.state())
  }, [])

  const refreshReports = useCallback(async () => {
    setReports(await tax.reports.list())
  }, [])

  const navigate = useCallback((r: Route) => setRoute(r), [])

  const startAnalysis = useCallback(
    async (input: StartAnalysisInput) => {
      const res = await tax.analysis.start(input)
      if (!res.ok) return { ok: false, message: res.message }
      setTask({
        taskId: res.data.task_id,
        input,
        startedAt: Date.now(),
        status: null,
        error: null,
        savedFileName: null,
      })
      setRoute({ name: 'running' })
      return { ok: true }
    },
    [],
  )

  const dismissTask = useCallback(() => setTask(null), [])

  /* ------------------------------------------------------------ 任務輪詢 */

  // 相依只放 taskId 與是否結束。若相依整個 task，每次輪詢的 setTask 都會重建 effect，
  // 立刻再打一次 API —— 那會變成沒有間隔的緊迴圈。
  const taskId = task?.taskId ?? null
  const taskFinished = task?.status?.status === 'completed' || task?.status?.status === 'failed'

  useEffect(() => {
    if (!taskId || taskFinished) return

    let cancelled = false

    const tick = async () => {
      const current = taskRef.current
      if (!current || cancelled) return
      const res = await tax.analysis.status(current.taskId)
      if (cancelled) return

      if (!res.ok) {
        setTask((t) => (t ? { ...t, error: res.message } : t))
        return
      }

      const status = res.data
      setTask((t) => (t ? { ...t, status, error: null } : t))

      if (status.status === 'completed' && status.result) {
        const saved = await persistReport(current, status)
        if (cancelled) return
        setTask((t) => (t ? { ...t, savedFileName: saved } : t))
        setReports(await tax.reports.list())
        // 結果已經落地，就把後端的暫存清掉
        void tax.analysis.cleanup(current.taskId)
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [taskId, taskFinished])

  const value = useMemo<AppStore>(
    () => ({
      route,
      navigate,
      settings,
      updateSettings,
      backend,
      logs,
      restartBackend,
      secrets,
      refreshSecrets,
      reports,
      refreshReports,
      appInfo,
      task,
      startAnalysis,
      dismissTask,
    }),
    [
      route,
      navigate,
      settings,
      updateSettings,
      backend,
      logs,
      restartBackend,
      secrets,
      refreshSecrets,
      reports,
      refreshReports,
      appInfo,
      task,
      startAnalysis,
      dismissTask,
    ],
  )

  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore(): AppStore {
  const ctx = use(StoreContext)
  if (!ctx) throw new Error('useStore 必須在 StoreProvider 內使用')
  return ctx
}

/* ------------------------------------------------------------ 落地報告 */

async function persistReport(task: RunningTask, status: TaskStatus): Promise<string | null> {
  const result = status.result
  if (!result) return null

  const createdAt = status.completed_at ?? new Date().toISOString()
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '')
  const safeTicker = task.input.ticker.replace(/[^A-Za-z0-9.]/g, '_')
  const fileName = `${task.input.analysisDate}_${safeTicker}_${stamp}.json`

  const report: StoredReport = {
    id: task.taskId,
    ticker: task.input.ticker,
    analysisDate: task.input.analysisDate,
    marketType: task.input.marketType,
    verdict: parseVerdict(result),
    confidence: parseConfidence(result),
    deepThinkLlm: task.input.deepThinkLlm,
    quickThinkLlm: task.input.quickThinkLlm,
    analystCount: task.input.analysts.length,
    durationMs: Date.now() - task.startedAt,
    createdAt,
    fileName,
    result,
  }

  try {
    await tax.reports.save(report)
    return fileName
  } catch {
    return null
  }
}
