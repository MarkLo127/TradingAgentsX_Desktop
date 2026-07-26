/** 主行程與渲染行程共用的型別。兩邊都由 Vite 打包，直接 import 即可。 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type MarketType = 'us' | 'twse' | 'tpex'
export type Language = 'zh-TW' | 'en'

export type AnalystKey = 'market' | 'social' | 'news' | 'fundamentals'

/* ------------------------------------------------------------------ 設定 */

export interface BackendSettings {
  /** auto = 由 App 啟動並管理後端行程；external = 連到已在跑的後端 */
  mode: 'auto' | 'external'
  /** external 模式使用 */
  url: string
  /** auto 模式：啟動指令，留空則自動偵測 */
  command: string
  /** auto 模式：工作目錄（需為 TradingAgentsX repo 根目錄），留空則自動偵測 */
  cwd: string
}

export interface Settings {
  theme: ThemePreference
  language: Language
  reportsDir: string
  backend: BackendSettings
  deepThinkLlm: string
  quickThinkLlm: string
  embeddingModel: string
  /** 當對應模型選為 'custom' 時使用的自訂模型名稱 */
  customDeepModel: string
  customQuickModel: string
  customEmbeddingModel: string
  /** 自訂（OpenAI 相容）端點的 base URL，與自訂金鑰一起在「設定」頁維護 */
  customBaseUrl: string
  marketType: MarketType
  researchDepth: number
  analysts: AnalystKey[]
  useCache: boolean
  watchlist: WatchItem[]
}

export interface WatchItem {
  symbol: string
  name: string
  market: MarketType
}

/* ------------------------------------------------------------ 金鑰（安全） */

export type SecretId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'custom'
  | 'alphavantage'
  | 'finmind'

export interface SecretStatus {
  id: SecretId
  isSet: boolean
  /** 末四碼，僅供辨識用 */
  hint: string
  updatedAt: string | null
}

export interface SecretsState {
  /** 作業系統是否提供加密儲存（macOS 鑰匙圈 / Windows DPAPI / Linux libsecret） */
  encryptionAvailable: boolean
  items: SecretStatus[]
}

/* ---------------------------------------------------------------- 後端狀態 */

export type BackendPhase = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

export interface BackendStatus {
  phase: BackendPhase
  url: string | null
  port: number | null
  pid: number | null
  message: string | null
  /** 由 /api/health 取得 */
  version: string | null
  redisConnected: boolean
  startedAt: string | null
}

export interface BackendLogLine {
  at: string
  stream: 'stdout' | 'stderr' | 'app'
  text: string
}

/* ------------------------------------------------------------------ 分析 */

export interface StartAnalysisInput {
  ticker: string
  analysisDate: string
  marketType: MarketType
  analysts: AnalystKey[]
  researchDepth: number
  deepThinkLlm: string
  quickThinkLlm: string
  embeddingModel: string
  /** 'custom' 時的自訂模型名稱與共用 base URL */
  customDeepModel?: string
  customQuickModel?: string
  customEmbeddingModel?: string
  customBaseUrl?: string
  language: Language
}

export type TaskPhase = 'pending' | 'running' | 'completed' | 'failed'

export interface TaskStatus {
  task_id: string
  status: TaskPhase
  created_at: string
  updated_at: string
  progress: string | null
  result: AnalysisResult | null
  error: string | null
  completed_at: string | null
}

export interface DebateState {
  bull_history?: string
  bear_history?: string
  history?: string
  judge_decision?: string
  current_response?: string
  count?: number
  [k: string]: unknown
}

export interface RiskDebateState {
  risky_history?: string
  safe_history?: string
  neutral_history?: string
  judge_decision?: string
  history?: string
  count?: number
  [k: string]: unknown
}

export interface AnalysisReports {
  market_report?: string | null
  sentiment_report?: string | null
  news_report?: string | null
  fundamentals_report?: string | null
  investment_plan?: string | null
  trader_investment_plan?: string | null
  final_trade_decision?: string | null
  investment_debate_state?: DebateState | null
  risk_debate_state?: RiskDebateState | null
}

export interface PricePoint {
  Date: string
  Open: number
  High: number
  Low: number
  Close: number
  Volume: number
}

export interface PriceStats {
  growth_rate: number
  duration_days: number
  start_date: string
  end_date: string
  start_price: number
  end_price: number
}

export interface AnalysisResult {
  status: string
  ticker: string
  analysis_date: string
  decision?: string | Record<string, unknown> | null
  reports?: AnalysisReports | null
  error?: string | null
  price_data?: PricePoint[] | null
  price_stats?: PriceStats | null
  deep_think_llm?: string | null
  quick_think_llm?: string | null
}

/* ------------------------------------------------------------ 本機報告存檔 */

export type Verdict = 'BUY' | 'SELL' | 'HOLD' | 'UNKNOWN'

export interface ReportMeta {
  id: string
  ticker: string
  analysisDate: string
  marketType: MarketType
  verdict: Verdict
  confidence: number | null
  deepThinkLlm: string
  quickThinkLlm: string
  analystCount: number
  durationMs: number | null
  createdAt: string
  fileName: string
}

export interface StoredReport extends ReportMeta {
  result: AnalysisResult
}

/* ------------------------------------------------------------------ 其他 */

export interface AppInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: string
  userDataPath: string
  reportsDir: string
  isPackaged: boolean
}

export interface DiskUsage {
  reportCount: number
  bytes: number
}

export interface ApiError {
  ok: false
  status: number
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | ApiError
