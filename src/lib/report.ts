import type { AnalysisResult, AnalystKey, Verdict } from '@shared/types'

/* --------------------------------------------------------------- 判斷解析 */

/**
 * 從後端的 decision 欄位解出 BUY / SELL / HOLD。
 * decision 可能是字串，也可能是 dict（不同版本的 graph 行為不同），兩種都處理。
 */
export function parseVerdict(result: AnalysisResult | null | undefined): Verdict {
  if (!result) return 'UNKNOWN'

  const raw = result.decision
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object') {
    const d = raw as Record<string, unknown>
    text = String(d.action ?? d.decision ?? d.signal ?? JSON.stringify(d))
  }
  if (!text) text = result.reports?.final_trade_decision ?? ''

  const upper = text.toUpperCase()
  // 只看前 200 字，避免報告後文提到別的動作而誤判
  const head = upper.slice(0, 200)
  if (/\bSELL\b|賣出|做空/.test(head)) return 'SELL'
  if (/\bBUY\b|買進|買入|做多/.test(head)) return 'BUY'
  if (/\bHOLD\b|持有|觀望/.test(head)) return 'HOLD'
  if (/\bSELL\b/.test(upper)) return 'SELL'
  if (/\bBUY\b/.test(upper)) return 'BUY'
  if (/\bHOLD\b/.test(upper)) return 'HOLD'
  return 'UNKNOWN'
}

/**
 * 嘗試從決策文字裡抓出信心度百分比。
 * 抓不到就回 null —— 寧可不顯示，也不要編一個數字出來。
 */
export function parseConfidence(result: AnalysisResult | null | undefined): number | null {
  if (!result) return null
  const candidates = [
    typeof result.decision === 'string' ? result.decision : '',
    result.reports?.final_trade_decision ?? '',
    result.reports?.trader_investment_plan ?? '',
  ]
  for (const text of candidates) {
    if (!text) continue
    const m =
      /(?:信心度|信心|confidence)[^0-9]{0,12}(\d{1,3})\s*%/i.exec(text) ??
      /(\d{1,3})\s*%[^0-9]{0,8}(?:信心|confidence)/i.exec(text)
    if (m) {
      const n = Number(m[1])
      if (n >= 0 && n <= 100) return n
    }
  }
  return null
}

export const VERDICT_CLASS: Record<Verdict, string> = {
  BUY: 'badge-buy',
  SELL: 'badge-sell',
  HOLD: 'badge-hold',
  UNKNOWN: 'badge-muted',
}

/** BUY/SELL/HOLD 通用；只有 UNKNOWN 需要語系 */
export function verdictLabel(v: Verdict, zh: boolean): string {
  if (v === 'UNKNOWN') return zh ? '無法判定' : 'Unknown'
  return v
}

/** 決策卡的配色（供 CSS 變數覆寫用） */
export function verdictStyle(v: Verdict): Record<string, string> {
  const map: Record<Verdict, string> = {
    BUY: 'accent',
    SELL: 'danger',
    HOLD: 'warn',
    UNKNOWN: 'info',
  }
  const c = map[v]
  return {
    '--verdict-color': `var(--${c})`,
    '--verdict-line': `var(--${c}-line)`,
    '--verdict-bg': `var(--${c}-bg)`,
  }
}

/* --------------------------------------------------------------- 代理人 */

export interface AgentDef {
  id: string
  name: string
  nameEn: string
  role: string
  roleEn: string
  /** 對應到 reports 裡的哪個欄位；有值代表這位代理人有產出 */
  reportKey?: keyof NonNullable<AnalysisResult['reports']>
  /** 只在對應分析師被選取時才會執行 */
  analyst?: AnalystKey
  /** 只在 researchDepth > 1 的完整模式才會執行 */
  deepOnly?: boolean
}

export interface PhaseDef {
  id: string
  title: string
  titleEn: string
  agents: AgentDef[]
}

export const PIPELINE: PhaseDef[] = [
  {
    id: 'analysts',
    title: '分析師（平行執行）',
    titleEn: 'Analysts (parallel)',
    agents: [
      {
        id: 'market',
        name: '市場分析師',
        nameEn: 'Market Analyst',
        role: '技術指標 · MACD / RSI / 布林通道',
        roleEn: 'Technicals · MACD / RSI / Bollinger',
        reportKey: 'market_report',
        analyst: 'market',
      },
      {
        id: 'news',
        name: '新聞分析師',
        nameEn: 'News Analyst',
        role: 'Google News 與總體新聞',
        roleEn: 'Google News & macro headlines',
        reportKey: 'news_report',
        analyst: 'news',
      },
      {
        id: 'social',
        name: '社群情緒分析師',
        nameEn: 'Social Sentiment Analyst',
        role: 'Reddit 與社群討論',
        roleEn: 'Reddit & social chatter',
        reportKey: 'sentiment_report',
        analyst: 'social',
      },
      {
        id: 'fundamentals',
        name: '基本面分析師',
        nameEn: 'Fundamentals Analyst',
        role: '財報、估值與產業比較',
        roleEn: 'Financials, valuation & peers',
        reportKey: 'fundamentals_report',
        analyst: 'fundamentals',
      },
    ],
  },
  {
    id: 'research',
    title: '研究員辯論',
    titleEn: 'Researcher Debate',
    agents: [
      { id: 'bull', name: '多方研究員', nameEn: 'Bull Researcher', role: '建構看多論點', roleEn: 'Builds the bull case', deepOnly: true },
      { id: 'bear', name: '空方研究員', nameEn: 'Bear Researcher', role: '建構看空論點', roleEn: 'Builds the bear case', deepOnly: true },
      { id: 'manager', name: '研究主管', nameEn: 'Research Manager', role: '綜合多空並產出投資計畫', roleEn: 'Synthesizes into an investment plan', reportKey: 'investment_plan' },
    ],
  },
  {
    id: 'risk',
    title: '風險辯論',
    titleEn: 'Risk Debate',
    agents: [
      { id: 'risky', name: '激進派', nameEn: 'Aggressive', role: '主張承擔較高風險', roleEn: 'Argues for higher risk', deepOnly: true },
      { id: 'safe', name: '保守派', nameEn: 'Conservative', role: '主張控制下檔', roleEn: 'Argues for downside control', deepOnly: true },
      { id: 'neutral', name: '中立派', nameEn: 'Neutral', role: '折衷評估', roleEn: 'Balanced assessment', deepOnly: true },
      {
        id: 'riskmgr',
        name: '風險主管',
        nameEn: 'Risk Manager',
        role: '產出最終風險判斷',
        roleEn: 'Produces the final risk verdict',
        reportKey: 'final_trade_decision',
      },
    ],
  },
  {
    id: 'trader',
    title: '交易決策',
    titleEn: 'Trade Decision',
    agents: [
      {
        id: 'trader',
        name: '交易員',
        nameEn: 'Trader',
        role: '輸出 BUY / SELL / HOLD',
        roleEn: 'Outputs BUY / SELL / HOLD',
        reportKey: 'trader_investment_plan',
      },
    ],
  },
]

/** 依語系取代理人名稱／角色／階段標題 */
export function agentName(a: AgentDef, zh: boolean): string {
  return zh ? a.name : a.nameEn
}
export function agentRole(a: AgentDef, zh: boolean): string {
  return zh ? a.role : a.roleEn
}
export function phaseTitle(p: PhaseDef, zh: boolean): string {
  return zh ? p.title : p.titleEn
}

/**
 * 三段研究深度，對齊雲端版（frontend）的 shallow / medium / deep = 1 / 3 / 5。
 * - fast（1）：跳過多空與風險辯論，只跑分析師 + 主管 + 交易員
 * - balanced（3）：跑完整流程，辯論輪數中等（雲端版預設）
 * - deep（5）：辯論輪數最多，判斷品質最高
 */
export type ResearchMode = 'fast' | 'balanced' | 'deep'

export const RESEARCH_MODES: { mode: ResearchMode; depth: number }[] = [
  { mode: 'fast', depth: 1 },
  { mode: 'balanced', depth: 3 },
  { mode: 'deep', depth: 5 },
]

export function researchMode(depth: number): ResearchMode {
  if (depth <= 1) return 'fast'
  if (depth >= 5) return 'deep'
  return 'balanced'
}

export function researchModeLabel(depth: number, zh: boolean): string {
  const m = researchMode(depth)
  if (m === 'fast') return zh ? '快速模式' : 'Fast'
  if (m === 'deep') return zh ? '深度模式' : 'Deep'
  return zh ? '平衡模式' : 'Balanced'
}

/** 對應 Badge 的 tone（字串刻意與 ui.tsx 的 BadgeTone 相容） */
export function researchModeTone(depth: number): 'info' | 'accent' | 'violet' {
  const m = researchMode(depth)
  if (m === 'fast') return 'info'
  if (m === 'deep') return 'violet'
  return 'accent'
}

/** 依設定算出這次會實際執行的代理人 */
export function plannedAgents(analysts: AnalystKey[], researchDepth: number): AgentDef[] {
  const deep = researchDepth > 1
  return PIPELINE.flatMap((p) => p.agents).filter((a) => {
    if (a.analyst) return analysts.includes(a.analyst)
    if (a.deepOnly) return deep
    return true
  })
}

/** 分析完成後，用實際回傳的 reports 判斷哪些代理人真的有產出 */
export function agentProduced(a: AgentDef, result: AnalysisResult | null): boolean {
  if (!result?.reports || !a.reportKey) return false
  const v = result.reports[a.reportKey]
  if (typeof v === 'string') return v.trim().length > 0
  return Boolean(v)
}

/* ---------------------------------------------------- 後端日誌的活動解析 */

/**
 * 從後端 stdout 解析出「正在呼叫哪個工具」。
 * 這是唯一能從現有後端輸出穩定辨識的訊號 —— 後端目前不會回報逐一代理人的進度，
 * 因此畫面上不會宣稱某位代理人已完成，只呈現實際觀察到的工具活動。
 */
const TOOL_RE = /\b(get_[a-z0-9_]+|Tool Calls?)\b/i

export function extractToolActivity(text: string): string | null {
  const m = TOOL_RE.exec(text)
  if (!m) return null
  const name = m[1]
  if (/^tool calls?$/i.test(name)) return null
  return name
}
