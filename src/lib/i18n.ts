import type { Language } from '@shared/types'
import { useStore } from './store'

/**
 * 極簡雙語：直接把中英文寫在呼叫點，`t(zh, en)`。
 *
 * 為什麼不用 key→dictionary：這個 App 的字串量中等，共置式沒有漏字風險
 * （少寫一邊會被型別擋下），也不需要維護一份會漂移的 key 表。
 *
 * 介面語言與報告語言是同一個設定（settings.language）——
 * 中文介面就輸出中文報告，英文介面就輸出英文報告，符合使用者預期。
 */
export function useI18n() {
  const { settings } = useStore()
  const lang: Language = settings?.language ?? 'zh-TW'
  const zh = lang === 'zh-TW'
  const t = (zhText: string, enText: string) => (zh ? zhText : enText)
  return { t, lang, zh }
}

/** 在無法用 hook 的地方（純函式）用的等價工具 */
export function tr(lang: Language, zhText: string, enText: string): string {
  return lang === 'zh-TW' ? zhText : enText
}
