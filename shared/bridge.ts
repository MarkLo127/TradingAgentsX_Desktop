import type {
  ApiResult,
  AppInfo,
  BackendLogLine,
  BackendStatus,
  DiskUsage,
  ReportMeta,
  ResolvedTheme,
  SecretId,
  SecretsState,
  Settings,
  StartAnalysisInput,
  StoredReport,
  TaskStatus,
} from './types'

/** 取消訂閱 */
export type Unsubscribe = () => void

/**
 * preload 透過 contextBridge 掛在 window.tax 上的唯一介面。
 * 渲染行程沒有 Node 權限，也永遠拿不到金鑰明文。
 */
export interface TaxBridge {
  app: {
    info(): Promise<AppInfo>
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): Unsubscribe
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    selectDir(current?: string): Promise<string | null>
    selectFile(current?: string): Promise<string | null>
    detect(): Promise<{ repoRoot: string | null; python: string | null }>
  }
  theme: {
    onResolved(cb: (theme: ResolvedTheme) => void): Unsubscribe
  }
  secrets: {
    state(): Promise<SecretsState>
    set(id: SecretId, value: string): Promise<SecretsState>
    remove(id: SecretId): Promise<SecretsState>
    verify(id: SecretId): Promise<{ ok: boolean; message: string }>
  }
  backend: {
    status(): Promise<BackendStatus>
    logs(): Promise<BackendLogLine[]>
    restart(): Promise<BackendStatus>
    stop(): Promise<void>
    get<T>(apiPath: string): Promise<ApiResult<T>>
    onStatus(cb: (s: BackendStatus) => void): Unsubscribe
    onLog(cb: (l: BackendLogLine) => void): Unsubscribe
  }
  analysis: {
    start(input: StartAnalysisInput): Promise<ApiResult<{ task_id: string }>>
    status(taskId: string): Promise<ApiResult<TaskStatus>>
    cleanup(taskId: string): Promise<ApiResult<unknown>>
  }
  reports: {
    list(): Promise<ReportMeta[]>
    get(fileName: string): Promise<StoredReport | null>
    save(report: StoredReport): Promise<ReportMeta>
    remove(fileName: string): Promise<boolean>
    usage(): Promise<DiskUsage>
    reveal(fileName?: string): Promise<void>
  }
  data: {
    clearAll(): Promise<boolean>
  }
  openExternal(url: string): Promise<void>
}
