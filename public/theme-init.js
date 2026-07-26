// 在 React 掛載前先套用主題，避免開窗瞬間閃色。
// 這裡只讀系統偏好；使用者若選了固定主題，主行程已設定 nativeTheme.themeSource，
// 因此 matchMedia 回報的就是最終結果。
// 獨立成檔案（而非內聯）是為了符合 script-src 'self' 的 CSP。
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light'
