/**
 * 把股票代號清單從 web 版的 public/data 同步過來。
 *
 * 桌面版打包後不能在 file:// 下 fetch 靜態檔，所以資料必須進 bundle；
 * 但又不想讓兩份清單各自漂移，因此在 dev / build 前自動複製一次。
 * 來源不存在時保留現有副本，不讓建置失敗。
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const srcDir = path.join(root, '..', 'frontend', 'public', 'data')
const destDir = path.join(root, 'src', 'data')

const files = ['stocks-us.json', 'stocks-tw.json']

mkdirSync(destDir, { recursive: true })

let copied = 0
for (const name of files) {
  const src = path.join(srcDir, name)
  const dest = path.join(destDir, name)

  if (!existsSync(src)) {
    if (existsSync(dest)) {
      console.log(`[stocks] 找不到來源 ${name}，沿用現有副本`)
      continue
    }
    console.error(`[stocks] 找不到 ${src}，且沒有現有副本 — 代號提示會是空的`)
    continue
  }

  // 內容相同就不重寫，避免每次都觸發 Vite 重新打包
  if (existsSync(dest) && statSync(src).size === statSync(dest).size) continue

  copyFileSync(src, dest)
  copied += 1
}

if (copied) console.log(`[stocks] 已同步 ${copied} 個檔案`)
