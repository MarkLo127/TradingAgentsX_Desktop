/**
 * 刻意不開 resolveJsonModule：股票清單有一萬多筆，
 * 讓 TS 去推導那個巨大的 tuple 型別會拖慢整個專案的型別檢查。
 * 這裡宣告成 unknown，由呼叫端明確斷言結構。
 */
declare module '*.json' {
  const value: unknown
  export default value
}
