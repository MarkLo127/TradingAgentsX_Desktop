/** 格式化工具。一律回傳可直接放進畫面的字串。 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

/** mm:ss 或 h:mm:ss */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('zh-TW', { hour12: false })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const date = sameYear
    ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    : d.toLocaleDateString('zh-TW')
  return `${date} ${d.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
}

/** 「3 小時前」這種相對時間 */
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 30) return `${day} 天前`
  return formatDateTime(iso)
}

/** YYYY-MM-DD（本地時區，不用 toISOString 以免跨日錯位） */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
