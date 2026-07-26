import { BrowserWindow, app, nativeImage, nativeTheme, session, shell } from 'electron'
import type { NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { backend } from './backend'
import { registerIpc, applyTheme } from './ipc'
import { readSettings } from './store'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(__dirname, '..', 'dist')

const isMac = process.platform === 'darwin'

/** App 圖示：打包後在 dist/，開發時退回 public/ */
function appIcon(): NativeImage | undefined {
  for (const p of [
    path.join(RENDERER_DIST, 'logo.png'),
    path.join(__dirname, '..', 'public', 'logo.png'),
  ]) {
    try {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    } catch {
      /* 試下一個路徑 */
    }
  }
  return undefined
}

/* ------------------------------------------------------- 視窗位置記憶 */

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const windowStateFile = () => path.join(app.getPath('userData'), 'window.json')

function readWindowState(): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as WindowState
    if (s.width > 400 && s.height > 300) return s
  } catch {
    /* 用預設值 */
  }
  return { width: 1440, height: 920 }
}

function saveWindowState(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const bounds = win.getNormalBounds()
  const state: WindowState = { ...bounds, maximized: win.isMaximized() }
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify(state), 'utf8')
  } catch {
    /* 寫不進去就算了，不值得打斷關閉流程 */
  }
}

/* ----------------------------------------------------------------- CSP */

/**
 * 以 response header 注入 CSP，而不是寫在 index.html 的 meta，
 * 因為開發模式要放行 Vite 的 HMR（React Refresh 會注入內聯 script、
 * 並用 WebSocket 連回 dev server），正式版則不需要也不應該放行。
 *
 * connect-src 一律只給 'self'：所有對外請求都由主行程發出，
 * 渲染行程連 fetch 到供應商 API 的能力都沒有。
 */
function installCsp() {
  const policy = DEV_URL
    ? [
        `default-src 'self' ${DEV_URL}`,
        `script-src 'self' 'unsafe-inline' ${DEV_URL}`,
        `style-src 'self' 'unsafe-inline' ${DEV_URL} https://fonts.googleapis.com`,
        `font-src 'self' data: ${DEV_URL} https://fonts.gstatic.com`,
        `img-src 'self' data: blob: ${DEV_URL}`,
        `connect-src 'self' ${DEV_URL} ${DEV_URL.replace(/^http/, 'ws')}`,
      ]
    : [
        "default-src 'self'",
        "script-src 'self'",
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        `font-src 'self' data: https://fonts.gstatic.com`,
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ]

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy.join('; ')],
      },
    })
  })
}

/* ------------------------------------------------------------- 建立視窗 */

function backgroundFor(dark: boolean) {
  // 與 tokens.css 的 --bg 一致，避免開窗瞬間閃白
  return dark ? '#05070E' : '#EEF1F5'
}

function createWindow() {
  const state = readWindowState()

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 620,
    show: false,
    icon: appIcon(),
    backgroundColor: backgroundFor(nativeTheme.shouldUseDarkColors),
    // macOS 用系統紅綠燈並內縮；其他平台自繪視窗控制項
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    frame: isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 以 CJS 打包，只用到 contextBridge / ipcRenderer
      sandbox: false,
      spellcheck: false,
    },
  })

  if (state.maximized) win.maximize()

  // 正常情況下等首次繪製再顯示，避免看到空白窗。
  // 但若渲染程序出問題，ready-to-show 可能永遠不來 —— 那樣使用者只會看到
  // 一個「App 有在跑卻沒有視窗」的狀態，比看到錯誤畫面更難處理，所以加上保險。
  let shown = false
  const show = () => {
    if (shown || win.isDestroyed()) return
    shown = true
    win.show()
  }
  win.once('ready-to-show', show)
  setTimeout(show, 4000)

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] 載入失敗 ${code} ${desc} ${url}`)
    show()
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer] 程序結束：${details.reason}`)
  })
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      console.error(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`)
    }
  })

  const persist = () => saveWindowState(win)
  win.on('resized', persist)
  win.on('moved', persist)
  win.on('close', persist)

  const sendMaximized = () => win.webContents.send('win:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)

  // 外部連結一律用系統瀏覽器開，不在 App 內導航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = DEV_URL && url.startsWith(DEV_URL)
    if (!allowed) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }


  return win
}

/* ------------------------------------------------------------- 生命週期 */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    installCsp()
    registerIpc()
    applyTheme(readSettings().theme)

    // macOS Dock 圖示（開發模式用；打包版由 electron-builder 的 icon 設定處理）
    if (isMac) {
      const icon = appIcon()
      if (icon) app.dock?.setIcon(icon)
    }

    nativeTheme.on('updated', () => {
      const dark = nativeTheme.shouldUseDarkColors
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed()) continue
        w.setBackgroundColor(backgroundFor(dark))
        w.webContents.send('theme:resolved', dark ? 'dark' : 'light')
      }
    })

    createWindow()

    // 後端啟動很慢（要載入 langchain 等套件），不擋 UI，狀態靠事件推播
    void backend.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })

  app.on('before-quit', () => {
    void backend.stop()
  })
}
