#!/usr/bin/env bash
#
# 產生「隨 App 打包」的 Python 後端執行環境，讓使用者不需 clone repo、不需自備 git/Python。
# 產物：
#   resources/pybackend/  —— 可重定位的獨立 CPython（含所有後端依賴）
#   resources/appsrc/     —— backend/ 原始碼（tradingagents 已安裝進 pybackend 的 site-packages）
# electron-builder 會把這兩個資料夾放進 App 的 Resources；backend.ts 會自動偵測並使用。
#
# 後端原始碼（backend/、tradingagents/）不在這個 repo 裡，會自動取得：本機有並列的
# TradingAgentsX 就用它，沒有就從 GitHub 下載 .tax-version 指定的 commit。詳見下方尋找順序。
#
# 需求：uv（https://docs.astral.sh/uv/）；本機沒有 TradingAgentsX 時另需 curl。
# 在 desktop 專案目錄執行：
#   ./scripts/build-backend.sh                        # 精簡版（約 1GB）；本機 embedding 走
#                                                     # ChromaDB 內建 ONNX（無 torch、無金鑰，首次下載 ~80MB）
#   WITH_LOCAL_EMBEDDING=1 ./scripts/build-backend.sh # 完整版（+torch ~2GB）：本機 embedding 用
#                                                     # 品質較高的 all-mpnet，且完全免下載（純離線）
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"     # desktop 專案目錄
OUT="$HERE/resources"
PYVER="${PYVER:-3.12}"
CACHE="$HERE/.cache"

command -v uv >/dev/null || { echo "✗ 需要 uv：https://docs.astral.sh/uv/"; exit 1; }

# ── Python 後端原始碼的來源 ──────────────────────────────────────────────
# 這個 repo 不內含 backend/ 與 tradingagents/（它們在 TradingAgentsX，另一個 repo，
# 且更新頻繁 —— 複製一份進來只會導致兩邊漂移）。取得順序：
#   1. $TAX_REPO                     明確指定
#   2. $HERE/..                      desktop 巢狀在 repo 內的擺法
#   3. $HERE/../TradingAgentsX       兩個 repo 並列的擺法
#   4. ${HERE%_Desktop}              Foo_Desktop 與 Foo 並列
#   5. $CACHE/TradingAgentsX-<ref>   先前下載的快取
#   6. 從 GitHub 下載 tarball（pin 在 .tax-version）
# 開發者把兩個 repo 並列放，改 Python 立刻生效；只想建置的人什麼都不用準備。
TAX_SLUG="${TAX_SLUG:-MarkLo127/TradingAgentsX}"
TAX_REF="${TAX_REF:-$(tr -d ' \t\r\n' < "$HERE/.tax-version" 2>/dev/null || echo main)}"

find_repo() {
  local cand
  for cand in "${TAX_REPO:-}" "$HERE/.." "$HERE/../TradingAgentsX" "${HERE%_Desktop}" \
              "$CACHE/TradingAgentsX-$TAX_REF"; do
    # backend/ 會 import tradingagents/，兩者必須成對存在才算可用
    [ -n "$cand" ] && [ -f "$cand/backend/__main__.py" ] && [ -d "$cand/tradingagents" ] || continue
    (cd "$cand" && pwd)
    return 0
  done
  return 1
}

fetch_repo() {
  command -v curl >/dev/null || { echo "✗ 需要 curl 才能下載後端原始碼"; exit 1; }
  local url="https://github.com/$TAX_SLUG/archive/$TAX_REF.tar.gz"
  local dest="$CACHE/TradingAgentsX-$TAX_REF"
  local tmp; tmp="$(mktemp -d)"
  # 注意：全形字元緊接 $VAR 會被 bash 3.2（macOS 內建）吃進變數名，故一律加大括號
  echo "==> 本機找不到 TradingAgentsX，改從 GitHub 取得（ref: ${TAX_REF}）"
  echo "    $url"
  curl -fsSL "$url" -o "$tmp/src.tar.gz" || {
    rm -rf "$tmp"
    echo "✗ 下載失敗：$url"
    echo "  若 .tax-version 指向的 commit 已不存在，請更新它；或用 TAX_REF=main 取最新"
    exit 1
  }
  rm -rf "$dest"; mkdir -p "$dest"
  # GitHub tarball 頂層是 <repo>-<ref>/，strip 掉才會直接攤成 backend/、tradingagents/
  tar -xzf "$tmp/src.tar.gz" -C "$dest" --strip-components=1
  rm -rf "$tmp"
}

REPO="$(find_repo)" || { fetch_repo; REPO="$(find_repo)"; }
[ -n "${REPO:-}" ] || {
  echo "✗ 取得後端原始碼失敗：$CACHE/TradingAgentsX-$TAX_REF 缺少 backend/ 或 tradingagents/"
  exit 1
}

echo "==> repo:   $REPO"
echo "==> output: $OUT"
rm -rf "$OUT/pybackend" "$OUT/appsrc"
mkdir -p "$OUT"

# 1) 取得「uv 託管的獨立 CPython」（python-build-standalone，可重定位）。
#    不能用 `uv python find`：它會優先回傳系統 / conda 的 Python（那些不可重定位）。
uv python install "$PYVER"
SRC_PY="$(uv python list --only-installed \
  | awk -v v="cpython-$PYVER" '$1 ~ v && $2 ~ /\/uv\/python\// {print $2; exit}')"
[ -n "$SRC_PY" ] && [ -x "$SRC_PY" ] || { echo "✗ 找不到 uv 託管的獨立 Python $PYVER"; exit 1; }
SRC_DIR="$(cd "$(dirname "$SRC_PY")/.." && pwd)"   # …/cpython-<ver>-<os>/
echo "==> 複製獨立 Python：$SRC_DIR"
cp -R "$SRC_DIR" "$OUT/pybackend"
# uv 會在託管的 Python 標記 EXTERNALLY-MANAGED 禁止安裝；複製出來後移除它才能裝依賴
find "$OUT/pybackend" -name 'EXTERNALLY-MANAGED' -delete 2>/dev/null || true
PY="$OUT/pybackend/bin/python3"
[ -x "$PY" ] || PY="$OUT/pybackend/bin/python"

# 2) 安裝依賴（預設精簡；WITH_LOCAL_EMBEDDING=1 才含 torch）
REQ="$REPO/backend/requirements.txt"
TMPREQ="$(mktemp)"
if [ "${WITH_LOCAL_EMBEDDING:-0}" = "1" ]; then
  cp "$REQ" "$TMPREQ"
  echo "torch --index-url https://download.pytorch.org/whl/cpu" >> "$TMPREQ"
else
  grep -viE '^(sentence-transformers|torch|transformers)([<>=!~[:space:]]|$)' "$REQ" > "$TMPREQ"
fi
echo "==> 安裝後端依賴到 bundle"
uv pip install --python "$PY" -r "$TMPREQ"
rm -f "$TMPREQ"

# 3) 複製後端原始碼（backend/ 與 tradingagents/ 都放進 appsrc；
#    以 cwd=appsrc 執行 `python -m backend` 時兩者都會在 sys.path 上，
#    不依賴 tradingagents 的 wheel 打包設定，最穩。）
mkdir -p "$OUT/appsrc"
cp -R "$REPO/backend" "$OUT/appsrc/backend"
cp -R "$REPO/tradingagents" "$OUT/appsrc/tradingagents"
# 後端啟動時會 makedirs(project_dir/dataflows/data_cache, exist_ok=True)；
# 預先建好這個資料夾，安裝後即使 bundle 唯讀也不會嘗試寫入（exist_ok=True 直接通過）。
# 實際的資料快取由 TRADINGAGENTS_DATA_CACHE_DIR 導到可寫的 userData。
mkdir -p "$OUT/appsrc/tradingagents/dataflows/data_cache"

# 4) 瘦身
find "$OUT/pybackend" "$OUT/appsrc" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$OUT/pybackend" -name '*.pyc' -delete 2>/dev/null || true
find "$OUT/pybackend" -type d -name 'tests' -prune -exec rm -rf {} + 2>/dev/null || true

echo "==> 大小："; du -sh "$OUT/pybackend" "$OUT/appsrc" 2>/dev/null || true
echo "==> 完成。本機測試："
echo "    TAX_BUNDLE_DIR=\"$OUT\" bun run dev   # 或啟動打包後的 App"
