import type { TaxBridge } from '@shared/bridge'

declare global {
  interface Window {
    tax?: TaxBridge
  }
}

if (!window.tax) {
  // 只有在 Electron 之外開啟（例如直接用瀏覽器連 vite dev server）才會發生
  throw new Error('找不到 window.tax — 這個介面必須在 Electron 中執行（請用 npm run dev）')
}

export const tax: TaxBridge = window.tax
