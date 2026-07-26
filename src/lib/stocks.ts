import type { MarketType } from '@shared/types'

/**
 * 股票代號搜尋。
 *
 * 資料由 scripts/sync-stocks.mjs 從 web 版的 public/data 同步進 src/data，
 * 這裡用動態 import 讓它成為獨立 chunk —— 只有使用者真的開始輸入代號時才載入。
 * （打包後渲染行程是 file:// origin，沒辦法用 fetch 讀靜態檔。）
 *
 * 排序邏輯與 frontend/lib/stock-search.ts 一致，兩邊行為才不會分歧。
 */

export interface StockItem {
  symbol: string
  /** 中文名（美股與英文名相同） */
  zh: string
  /** 英文名，長尾台股可能為空字串 */
  en: string
  market: MarketType
  /** 原始檔案順序，越小越知名 */
  pop: number
}

type UsRow = [string, string]
type TwRow = [string, string, string, string]

let usPromise: Promise<StockItem[]> | null = null
let twPromise: Promise<StockItem[]> | null = null

async function loadUs(): Promise<StockItem[]> {
  if (!usPromise) {
    usPromise = import('../data/stocks-us.json')
      .then((m) =>
        (m.default as UsRow[]).map(([symbol, name], i) => ({
          symbol,
          zh: name,
          en: name,
          market: 'us' as MarketType,
          pop: i,
        })),
      )
      .catch((err: unknown) => {
        usPromise = null // 允許下次重試
        throw err
      })
  }
  return usPromise
}

async function loadTw(): Promise<StockItem[]> {
  if (!twPromise) {
    twPromise = import('../data/stocks-tw.json')
      .then((m) =>
        (m.default as TwRow[]).map(([symbol, zh, en, market], i) => ({
          symbol,
          zh,
          en,
          market: (market === 'twse' ? 'twse' : 'tpex') as MarketType,
          pop: i,
        })),
      )
      .catch((err: unknown) => {
        twPromise = null
        throw err
      })
  }
  return twPromise
}

/** 載入指定市場的清單（台股會依上市／上櫃再篩一次） */
export async function loadStocks(market: MarketType): Promise<StockItem[]> {
  if (market === 'us') return loadUs()
  const all = await loadTw()
  return all.filter((s) => s.market === market)
}

/** 台股不分上市上櫃的完整清單，用於「輸入數字代號時自動判斷市場」 */
export async function loadAllTw(): Promise<StockItem[]> {
  return loadTw()
}

export function displayName(item: StockItem, locale: string): string {
  if (locale.startsWith('zh')) return item.zh || item.en || item.symbol
  return item.en || item.zh || item.symbol
}

export interface StockMatch extends StockItem {
  /** 已依語系解析好的顯示名稱 */
  name: string
}

/**
 * 依查詢字串排序。
 * 優先序：代號完全相同 > 代號前綴 > 名稱前綴 > 代號包含 > 名稱包含。
 */
export function rankStocks(
  items: StockItem[],
  query: string,
  locale: string,
  limit = 8,
): StockMatch[] {
  const q = query.trim()
  if (!q) return []
  const qUpper = q.toUpperCase()

  const scored: { item: StockItem; score: number }[] = []
  for (const item of items) {
    const sym = item.symbol.toUpperCase()
    const name = displayName(item, locale)
    const nameUpper = name.toUpperCase()
    // 同時比對另一語系的名稱，這樣中文介面下打英文也找得到
    const altUpper = (locale.startsWith('zh') ? item.en : item.zh).toUpperCase()

    let score = -1
    if (sym === qUpper) score = 0
    else if (sym.startsWith(qUpper)) score = 1
    else if (nameUpper.startsWith(qUpper) || altUpper.startsWith(qUpper)) score = 2
    else if (sym.includes(qUpper)) score = 3
    else if (nameUpper.includes(qUpper) || altUpper.includes(qUpper)) score = 4

    if (score >= 0) scored.push({ item, score })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.item.pop !== b.item.pop) return a.item.pop - b.item.pop
    return a.item.symbol.localeCompare(b.item.symbol)
  })

  return scored.slice(0, limit).map(({ item }) => ({ ...item, name: displayName(item, locale) }))
}

/** 查單一代號的名稱，找不到回 null（用來在輸入框旁顯示公司名） */
export async function lookupStock(
  symbol: string,
  market: MarketType,
): Promise<StockItem | null> {
  const s = symbol.trim().toUpperCase()
  if (!s) return null
  const items = await loadStocks(market)
  return items.find((x) => x.symbol.toUpperCase() === s) ?? null
}
