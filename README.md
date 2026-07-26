# TradingAgentsX Desktop

在自己的電腦上跑完整分析流程的桌面版。API 金鑰存進作業系統的加密儲存區，
只在送出請求的那一刻於主行程解密，直接連到你選的 LLM 供應商 —— 不經過任何中繼伺服器。

介面沿用 [`test_frontend/`](../test_frontend) 的設計稿（暗色終端機工作站、高資訊密度、
等寬數字、6px 圓角），並補上設計稿沒有的**亮色主題**與**系統／亮色／暗色**三段偏好。

## 快速開始

前置：這個 App 會啟動 repo 根目錄的 Python 後端，所以需要先把後端裝好。

```bash
# 在 repo 根目錄
conda activate tradingagents
pip install -e . && pip install -r backend/requirements.txt
```

然後：

```bash
cd TradingAgentsX_Desktop
bun install          # 或 npm install
bun run dev          # Vite dev server + Electron，改 code 會熱更新
```

打包：

```bash
bun run build        # 型別檢查 + 產出 dist/ 與 dist-electron/
bun run dist:mac:standalone     # 產生 .dmg（見下方「發佈」的注意事項）
```

## 獨立發佈（使用者不需 git / Python）

App 本身只是介面外殼，真正跑分析的是 repo 裡的 Python 後端。要做到「下載即用」，
先把後端連同一份可攜的 Python 一起打包進 App：

```bash
# 需要 uv（https://docs.astral.sh/uv/）。在 desktop 專案目錄執行：
./scripts/build-backend.sh                          # 精簡版：雲端 embedding，約 950MB
WITH_LOCAL_EMBEDDING=1 ./scripts/build-backend.sh   # 含本機 embedding（torch，多 ~2GB）
bun run dist:mac                                     # 打包，內建後端會一併塞進 .dmg
```

`build-backend.sh` 會產生 `resources/pybackend/`（可重定位的獨立 CPython + 所有後端依賴）
與 `resources/appsrc/`（`backend/` 與 `tradingagents/` 原始碼）。`electron-builder.yml` 的
`extraResources` 會把它們放進 App 的 `Resources/`，[`electron/backend.ts`](electron/backend.ts)
啟動時會**自動偵測並優先使用內建執行環境** —— 使用者機器上不需要 git、Python 或任何 `pip install`。

沒有內建執行環境時（例如沒跑 `build-backend.sh` 就打包），App 會退回「auto」模式去找系統
Python + repo，或用「external」模式連你自己起的後端。開發時可用
`TAX_BUNDLE_DIR=$PWD/resources bun run dev` 直接測試內建 bundle。

**精簡版 vs 完整版（embedding）**：
- **精簡版（預設，約 1GB）** 不含 `torch`。本機 embedding 會自動改用 **ChromaDB 內建的 ONNX
  MiniLM** —— 不需 torch、不需 API 金鑰，首次分析會下載約 80MB 的 onnx 模型（存到 `~/.cache/chroma`）
  後即可離線運作。所以精簡版**開箱就能用任何 LLM 供應商跑分析**，不必額外準備 embedding 金鑰。
- **完整版（`WITH_LOCAL_EMBEDDING=1`，多約 2GB）** 額外裝 `sentence-transformers`/`torch`，
  本機 embedding 用品質較高的 `all-mpnet-base-v2`，且完全不需首次下載（適合純離線環境）。

兩種版本都能改選雲端 embedding（`text-embedding-3-small` 等，在「新增分析 → 模型」選）。

## 代號自動完成

輸入股票代號時會即時搜尋並提示。資料來自 web 版的
`frontend/public/data/stocks-us.json`（約 1 萬檔）與 `stocks-tw.json`（約 3 千檔），
由 `scripts/sync-stocks.mjs` 在 `dev` / `build` 前自動複製進 `src/data/`
（打包後是 `file://` origin，無法 fetch 靜態檔，所以資料必須進 bundle）。

- 兩份清單各自切成 lazy chunk，只有開始輸入才載入，不影響啟動速度。
- 排序邏輯與 `frontend/lib/stock-search.ts` 一致：代號完全相同 > 代號前綴 > 名稱前綴 > 包含。
- 台股一次載入上市＋上櫃，選到哪一板就自動幫使用者切換市場。
- 送給後端的是純代號（`2330`）+ `market_type`，不是 `2330.TW`。

`src/data/` 內的清單會進版控（打包需要）。要更新就重跑 `bun run sync-stocks`。

## 架構

```
主行程 (electron/)
├─ main.ts       視窗、生命週期、nativeTheme、外部連結攔截
├─ ipc.ts        所有 IPC handler；分析請求在這裡注入金鑰
├─ backend.ts    找空 port → spawn python -m backend → 輪詢 /api/health
├─ secrets.ts    safeStorage 加密的金鑰儲存
└─ store.ts      settings.json 與報告檔案讀寫

preload.ts       contextBridge 暴露 window.tax（型別定義在 shared/bridge.ts）

渲染行程 (src/)
├─ styles/tokens.css   亮色 / 暗色兩套語意色票
├─ lib/store.tsx       全域狀態、路由、任務輪詢、報告落地
├─ lib/theme.tsx       system / light / dark
└─ pages/              Dashboard、NewAnalysis、Running、Report、Settings
```

### 金鑰為什麼安全

渲染行程沒有 Node 權限（`contextIsolation: true`、`nodeIntegration: false`），
而且**永遠拿不到金鑰明文**：

1. 使用者在設定頁輸入金鑰 → 經 IPC 傳給主行程 → `safeStorage.encryptString` 加密後寫入
   `userData/secrets.json`（權限 600）。
2. 介面只拿得到「有沒有設定」與末四碼。
3. 啟動分析時，渲染行程送出的是不含金鑰的參數；**主行程**依模型挑對應供應商的金鑰，
   解密後注入 `/api/analyze` 的 request body，再送給 127.0.0.1 的本機後端。
4. 所有對外請求都由主行程發出，渲染行程的 CSP 是 `connect-src 'self'`。

若作業系統沒有可用的鑰匙圈（例如未安裝 gnome-keyring 的 Linux），金鑰會以明文存放，
設定頁會明確顯示警告，狀態列的鎖頭圖示也會變成開鎖。

### 後端怎麼啟動

`mode: auto`（預設）會：

1. 從 App 目錄往上找含 `backend/app/main.py` 的資料夾當工作目錄
2. 依序找 `.venv/`、conda 的 `tradingagents` 環境、系統 Python
3. 取一個空 port，`python -m backend --host 127.0.0.1 --port <port> --reload false`
4. 輪詢 `/api/health` 直到就緒（第一次要載入 LangChain 等套件，通常 10–40 秒）

兩者都可以在「設定 → 後端」手動指定。也可以切成 `mode: external`，讓 App 連到你自己
`python -m backend` 起好的服務。

啟動後端時會帶入 `REQUIRE_AUTH_FOR_ANALYZE=false` —— 桌面版沒有多使用者概念，
不需要 JWT。

## 主題

三段偏好存在 `settings.json`：

| 偏好 | 行為 |
|---|---|
| `system` | 主行程設定 `nativeTheme.themeSource = 'system'`，渲染端用 `matchMedia` 解析，切換 macOS/Windows 外觀時即時反映 |
| `light` / `dark` | 主行程鎖定 `themeSource`，`matchMedia` 也隨之回報固定值 |

實際主題以 `<html data-theme="light\|dark">` 套用，所有顏色都走 `tokens.css` 的語意變數，
元件層完全沒有裸色碼。開窗前 `theme-init.js` 會先套上系統偏好避免閃色，
`BrowserWindow.backgroundColor` 也跟著主題走。

兩套色票的文字色都通過 WCAG AA（≥4.5:1）：

| Token | 暗色 | 亮色 |
|---|---|---|
| `--text` | `#E8EDF5` | `#0D1420` |
| `--text-dim` | `#8A97AD` | `#526073` |
| `--text-faint` | `#75849B` | `#66748A` |
| `--accent` | `#3FD68C` | `#0B7C45` |

亮色的語意色都經過壓暗處理 —— 暗色用的螢光綠在白底只有 3.4:1，不夠用。

## 已知限制

- **後端沒有逐一代理人的進度。** `/api/analyze` 只會回報 `pending / running / completed / failed`
  和一句 `progress` 字串。所以「執行中」頁面不會宣稱某位代理人已完成，只顯示真實狀態、
  後端 stdout、以及從輸出解析出的工具呼叫。要做出設計稿裡那種逐項進度，需要後端在
  LangGraph 的節點回呼中呼叫 `task_manager.update_task_progress()`。
- **沒有中止分析的功能。** 後端沒有提供中止 API。「停止追蹤」只是把畫面上的任務清掉，
  後端的執行緒會繼續跑完。
- **未簽章。** macOS 會被 Gatekeeper 擋、Windows 會跳 SmartScreen。要發佈給他人使用
  必須加入 Apple Developer 憑證（含公證）與 Windows 程式碼簽章憑證。
- 觀察清單不顯示即時報價 —— 沒有分析就沒有價格資料來源，寧可留白也不放假數字。

## 疑難排解

**視窗開了但後端一直是「錯誤」**
到「設定 → 後端」看輸出。最常見是 Python 找不到，或找到的 Python 沒裝專案依賴。
手動指定 `~/anaconda3/envs/tradingagents/bin/python` 之類的絕對路徑即可。

**在 VS Code 的整合終端機執行 `electron` 會失敗**
VS Code 會設 `ELECTRON_RUN_AS_NODE=1`，讓 Electron 以純 Node 模式跑，
`require('electron')` 會找不到。用 `env -u ELECTRON_RUN_AS_NODE ...` 或在外部終端機執行。
`bun run dev` 走 vite-plugin-electron，不受影響。

**改了設定沒生效**
後端相關設定要按「套用並重新啟動後端」。其餘設定即時生效。
