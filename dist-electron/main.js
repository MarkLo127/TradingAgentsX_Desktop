//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let node_fs = require("node:fs");
node_fs = __toESM(node_fs);
let node_path = require("node:path");
node_path = __toESM(node_path);
let node_child_process = require("node:child_process");
let node_events = require("node:events");
let node_net = require("node:net");
node_net = __toESM(node_net);
let node_os = require("node:os");
node_os = __toESM(node_os);
//#region electron/store.ts
var userData = () => electron.app.getPath("userData");
var settingsFile = () => node_path.default.join(userData(), "settings.json");
function defaultReportsDir() {
	return node_path.default.join(electron.app.getPath("documents"), "TradingAgentsX", "reports");
}
function defaults() {
	return {
		theme: "system",
		language: "zh-TW",
		reportsDir: defaultReportsDir(),
		backend: {
			mode: "auto",
			url: "http://127.0.0.1:8000",
			command: "",
			cwd: ""
		},
		deepThinkLlm: "claude-opus-5",
		quickThinkLlm: "claude-haiku-4-5-20251001",
		embeddingModel: "all-mpnet-base-v2",
		customDeepModel: "",
		customQuickModel: "",
		customEmbeddingModel: "",
		customBaseUrl: "",
		marketType: "us",
		researchDepth: 3,
		analysts: [
			"market",
			"social",
			"news",
			"fundamentals"
		],
		useCache: true,
		watchlist: []
	};
}
var cache$1 = null;
function readSettings() {
	if (cache$1) return cache$1;
	const base = defaults();
	try {
		const raw = node_fs.default.readFileSync(settingsFile(), "utf8");
		const parsed = JSON.parse(raw);
		cache$1 = {
			...base,
			...parsed,
			backend: {
				...base.backend,
				...parsed.backend ?? {}
			}
		};
	} catch {
		cache$1 = base;
	}
	return cache$1;
}
function writeSettings(patch) {
	const next = {
		...readSettings(),
		...patch
	};
	if (patch.backend) next.backend = {
		...readSettings().backend,
		...patch.backend
	};
	cache$1 = next;
	node_fs.default.mkdirSync(userData(), { recursive: true });
	node_fs.default.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf8");
	return next;
}
function reportsDir() {
	const dir = readSettings().reportsDir;
	node_fs.default.mkdirSync(dir, { recursive: true });
	return dir;
}
/** 只取詮釋資料，不把整份 result 帶進清單 */
function toMeta(report, fileName = report.fileName) {
	return {
		id: report.id,
		ticker: report.ticker,
		analysisDate: report.analysisDate,
		marketType: report.marketType,
		verdict: report.verdict,
		confidence: report.confidence,
		deepThinkLlm: report.deepThinkLlm,
		quickThinkLlm: report.quickThinkLlm,
		analystCount: report.analystCount,
		durationMs: report.durationMs,
		createdAt: report.createdAt,
		fileName
	};
}
function saveReport(report) {
	const dir = reportsDir();
	node_fs.default.writeFileSync(node_path.default.join(dir, report.fileName), JSON.stringify(report, null, 2), "utf8");
	return toMeta(report);
}
function listReports() {
	const dir = reportsDir();
	let names;
	try {
		names = node_fs.default.readdirSync(dir).filter((n) => n.endsWith(".json"));
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) try {
		const raw = JSON.parse(node_fs.default.readFileSync(node_path.default.join(dir, name), "utf8"));
		out.push(toMeta(raw, name));
	} catch {}
	return out.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
}
function getReport(fileName) {
	const safe = node_path.default.basename(fileName);
	try {
		return JSON.parse(node_fs.default.readFileSync(node_path.default.join(reportsDir(), safe), "utf8"));
	} catch {
		return null;
	}
}
function deleteReport(fileName) {
	const safe = node_path.default.basename(fileName);
	try {
		node_fs.default.unlinkSync(node_path.default.join(reportsDir(), safe));
		return true;
	} catch {
		return false;
	}
}
function diskUsage() {
	const dir = reportsDir();
	let bytes = 0;
	let reportCount = 0;
	try {
		for (const name of node_fs.default.readdirSync(dir)) {
			if (!name.endsWith(".json")) continue;
			bytes += node_fs.default.statSync(node_path.default.join(dir, name)).size;
			reportCount += 1;
		}
	} catch {}
	return {
		reportCount,
		bytes
	};
}
//#endregion
//#region electron/backend.ts
var MAX_LOG_LINES = 400;
var HEALTH_TIMEOUT_MS = 12e4;
var HEALTH_INTERVAL_MS = 700;
async function freePort() {
	return new Promise((resolve, reject) => {
		const srv = node_net.default.createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close(() => resolve(port));
		});
	});
}
/** 往上找 TradingAgentsX repo 根目錄（含 backend/app/main.py 者） */
function detectRepoRoot() {
	const starts = [electron.app.getAppPath(), process.cwd()];
	for (const start of starts) {
		let dir = start;
		for (let i = 0; i < 5; i++) {
			if (node_fs.default.existsSync(node_path.default.join(dir, "backend", "app", "main.py"))) return dir;
			const parent = node_path.default.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return null;
}
/**
* 內建的後端執行環境（隨 App 一起打包，使用者不需要 clone repo 或自備 Python）。
* 由 scripts/build-backend.mjs 產生，透過 electron-builder 的 extraResources 放進：
*   <resources>/pybackend/   —— 可重定位的 Python 執行環境（含所有依賴）
*   <resources>/appsrc/      —— backend/ 與 tradingagents/ 原始碼
* 開發時可用環境變數 TAX_BUNDLE_DIR 指向本機建好的 bundle 來測試。
*/
function detectBundledBackend() {
	const base = electron.app.isPackaged ? process.resourcesPath : process.env.TAX_BUNDLE_DIR;
	if (!base) return null;
	const python = process.platform === "win32" ? node_path.default.join(base, "pybackend", "python.exe") : node_path.default.join(base, "pybackend", "bin", "python3");
	const appsrc = node_path.default.join(base, "appsrc");
	if (node_fs.default.existsSync(python) && node_fs.default.existsSync(node_path.default.join(appsrc, "backend", "__main__.py"))) return {
		python,
		appsrc
	};
	return null;
}
/** 依序嘗試常見的 Python 位置，回傳第一個存在的 */
function detectPython(repoRoot) {
	const home = node_os.default.homedir();
	const exe = process.platform === "win32" ? "python.exe" : "python";
	const candidates = [
		node_path.default.join(repoRoot, ".venv", process.platform === "win32" ? "Scripts" : "bin", exe),
		node_path.default.join(home, "anaconda3", "envs", "tradingagents", "bin", "python"),
		node_path.default.join(home, "miniconda3", "envs", "tradingagents", "bin", "python"),
		node_path.default.join(home, "miniforge3", "envs", "tradingagents", "bin", "python"),
		node_path.default.join(home, ".conda", "envs", "tradingagents", "bin", "python"),
		"/opt/homebrew/bin/python3",
		"/usr/local/bin/python3",
		"/usr/bin/python3"
	];
	for (const c of candidates) if (node_fs.default.existsSync(c)) return c;
	return null;
}
var BackendController = class extends node_events.EventEmitter {
	proc = null;
	logs = [];
	stopping = false;
	status = {
		phase: "idle",
		url: null,
		port: null,
		pid: null,
		message: null,
		version: null,
		redisConnected: false,
		startedAt: null
	};
	getStatus() {
		return this.status;
	}
	getLogs() {
		return this.logs;
	}
	setStatus(patch) {
		this.status = {
			...this.status,
			...patch
		};
		this.emit("status", this.status);
	}
	log(stream, text) {
		for (const line of text.split(/\r?\n/)) {
			const t = line.trimEnd();
			if (!t) continue;
			const entry = {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				stream,
				text: t
			};
			this.logs.push(entry);
			if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
			this.emit("log", entry);
		}
	}
	async start() {
		await this.stop();
		this.stopping = false;
		this.logs = [];
		const settings = readSettings();
		if (settings.backend.mode === "external") {
			const url = settings.backend.url.replace(/\/+$/, "");
			this.setStatus({
				phase: "starting",
				url,
				port: null,
				pid: null,
				message: "連線至外部後端…"
			});
			this.log("app", `外部後端模式：${url}`);
			if (!await this.waitForHealth(url, 15e3)) this.setStatus({
				phase: "error",
				message: `無法連線到 ${url}`
			});
			return this.status;
		}
		const bundled = settings.backend.command ? null : detectBundledBackend();
		let python;
		let cwd;
		const extraEnv = {};
		if (bundled) {
			python = bundled.python;
			const runDir = node_path.default.join(electron.app.getPath("userData"), "backend-run");
			const dataDir = node_path.default.join(electron.app.getPath("userData"), "data");
			const cacheDir = node_path.default.join(electron.app.getPath("userData"), "data-cache");
			for (const d of [
				runDir,
				dataDir,
				cacheDir
			]) node_fs.default.mkdirSync(d, { recursive: true });
			cwd = runDir;
			extraEnv.PYTHONPATH = bundled.appsrc;
			extraEnv.TRADINGAGENTS_DATA_DIR = dataDir;
			extraEnv.TRADINGAGENTS_DATA_CACHE_DIR = cacheDir;
			this.log("app", "使用內建後端執行環境（隨 App 打包）");
		} else {
			const repoRoot = settings.backend.cwd || detectRepoRoot();
			if (!repoRoot) {
				const msg = "找不到 TradingAgentsX 專案目錄，請到「設定 → 後端」手動指定";
				this.log("app", msg);
				this.setStatus({
					phase: "error",
					message: msg,
					url: null,
					port: null,
					pid: null
				});
				return this.status;
			}
			const found = settings.backend.command || detectPython(repoRoot);
			if (!found) {
				const msg = "找不到可用的 Python，請到「設定 → 後端」手動指定直譯器路徑";
				this.log("app", msg);
				this.setStatus({
					phase: "error",
					message: msg,
					url: null,
					port: null,
					pid: null
				});
				return this.status;
			}
			python = found;
			cwd = repoRoot;
		}
		const port = await freePort();
		const url = `http://127.0.0.1:${port}`;
		this.setStatus({
			phase: "starting",
			url,
			port,
			pid: null,
			message: "正在啟動本機後端…",
			startedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		this.log("app", `${python} -m backend --port ${port}`);
		this.log("app", `工作目錄 ${cwd}`);
		const child = (0, node_child_process.spawn)(python, [
			"-m",
			"backend",
			"--host",
			"127.0.0.1",
			"--port",
			String(port),
			"--reload",
			"false"
		], {
			cwd,
			env: {
				...process.env,
				PYTHONUNBUFFERED: "1",
				PYTHONIOENCODING: "utf-8",
				BACKEND_HOST: "127.0.0.1",
				BACKEND_PORT: String(port),
				PORT: String(port),
				BACKEND_RELOAD: "false",
				REQUIRE_AUTH_FOR_ANALYZE: "false",
				CORS_ORIGINS: "http://localhost:5173",
				RESULTS_DIR: settings.reportsDir,
				TRADINGAGENTS_RESULTS_DIR: settings.reportsDir,
				...extraEnv
			},
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		this.proc = child;
		this.setStatus({ pid: child.pid ?? null });
		child.stdout?.on("data", (b) => this.log("stdout", b.toString()));
		child.stderr?.on("data", (b) => this.log("stderr", b.toString()));
		child.on("error", (err) => {
			this.log("app", `啟動失敗：${err.message}`);
			this.setStatus({
				phase: "error",
				message: err.message
			});
		});
		child.on("exit", (code, signal) => {
			this.proc = null;
			if (this.stopping) {
				this.setStatus({
					phase: "stopped",
					message: null,
					pid: null
				});
				return;
			}
			const msg = `後端行程結束（code=${code ?? "-"} signal=${signal ?? "-"}）`;
			this.log("app", msg);
			this.setStatus({
				phase: "error",
				message: msg,
				pid: null
			});
		});
		if (!await this.waitForHealth(url, HEALTH_TIMEOUT_MS) && this.status.phase !== "error") this.setStatus({
			phase: "error",
			message: "後端啟動逾時，請查看日誌"
		});
		return this.status;
	}
	async waitForHealth(url, timeoutMs) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (this.stopping) return false;
			if (this.status.phase === "error" && !this.proc && readSettings().backend.mode === "auto") return false;
			try {
				const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2500) });
				if (res.ok) {
					const body = await res.json();
					this.log("app", "後端就緒");
					this.setStatus({
						phase: "ready",
						url,
						message: null,
						version: body.version ?? null,
						redisConnected: Boolean(body.redis_connected)
					});
					return true;
				}
			} catch {}
			await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
		}
		return false;
	}
	async stop() {
		this.stopping = true;
		const child = this.proc;
		if (!child) {
			if (this.status.phase !== "idle") this.setStatus({
				phase: "stopped",
				pid: null
			});
			return;
		}
		this.proc = null;
		await new Promise((resolve) => {
			const done = () => resolve();
			child.once("exit", done);
			child.kill("SIGTERM");
			setTimeout(() => {
				if (!child.killed) child.kill("SIGKILL");
				resolve();
			}, 5e3);
		});
		this.setStatus({
			phase: "stopped",
			pid: null
		});
	}
	/** 對後端發請求；未就緒時直接失敗，不做隱式等待 */
	async request(method, apiPath, body) {
		const base = this.status.url;
		if (!base || this.status.phase !== "ready") return {
			ok: false,
			status: 0,
			message: "本機後端尚未就緒"
		};
		try {
			const res = await fetch(`${base}${apiPath}`, {
				method,
				headers: body ? { "Content-Type": "application/json" } : void 0,
				body: body ? JSON.stringify(body) : void 0,
				signal: AbortSignal.timeout(3e5)
			});
			const text = await res.text();
			let parsed = null;
			try {
				parsed = text ? JSON.parse(text) : null;
			} catch {
				parsed = text;
			}
			if (!res.ok) {
				const detail = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : String(text || res.statusText);
				return {
					ok: false,
					status: res.status,
					message: detail
				};
			}
			return {
				ok: true,
				data: parsed
			};
		} catch (err) {
			return {
				ok: false,
				status: 0,
				message: err instanceof Error ? err.message : String(err)
			};
		}
	}
};
var backend = new BackendController();
//#endregion
//#region shared/providers.ts
var PROVIDERS = {
	anthropic: {
		id: "anthropic",
		label: "Anthropic",
		baseUrl: "https://api.anthropic.com/v1",
		docsUrl: "https://console.anthropic.com/settings/keys",
		prefix: "sk-ant-"
	},
	openai: {
		id: "openai",
		label: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		docsUrl: "https://platform.openai.com/api-keys",
		prefix: "sk-"
	},
	google: {
		id: "google",
		label: "Google Gemini",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		docsUrl: "https://aistudio.google.com/apikey",
		prefix: "AIza"
	},
	xai: {
		id: "xai",
		label: "xAI Grok",
		baseUrl: "https://api.x.ai/v1",
		docsUrl: "https://console.x.ai",
		prefix: "xai-"
	},
	deepseek: {
		id: "deepseek",
		label: "DeepSeek",
		baseUrl: "https://api.deepseek.com/v1",
		docsUrl: "https://platform.deepseek.com/api_keys",
		prefix: "sk-"
	},
	qwen: {
		id: "qwen",
		label: "Qwen（阿里雲）",
		baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
		docsUrl: "https://dashscope.console.aliyun.com"
	},
	custom: {
		id: "custom",
		label: "自訂（OpenAI 相容）",
		baseUrl: "",
		docsUrl: ""
	},
	alphavantage: {
		id: "alphavantage",
		label: "Alpha Vantage",
		baseUrl: "",
		docsUrl: "https://www.alphavantage.co/support/#api-key"
	},
	finmind: {
		id: "finmind",
		label: "FinMind",
		baseUrl: "",
		docsUrl: "https://finmindtrade.com/analysis/#/account/login"
	}
};
function providerForModel(model) {
	if (model === "custom") return "custom";
	if (model.startsWith("claude-")) return "anthropic";
	if (model.startsWith("gpt-")) return "openai";
	if (model.startsWith("gemini-")) return "google";
	if (model.startsWith("grok-")) return "xai";
	if (model.startsWith("deepseek-")) return "deepseek";
	if (model.startsWith("qwen")) return "qwen";
	return "openai";
}
function baseUrlForModel(model) {
	return PROVIDERS[providerForModel(model)].baseUrl;
}
/**
* Embedding 模型。與雲端版一致。
* - local: 本機模型，不需金鑰
* - provider: 需要哪家的金鑰與 base URL（gemini embedding 走 google）
*/
var EMBEDDING_MODELS = [
	{
		id: "all-mpnet-base-v2",
		label: "all-mpnet-base-v2",
		local: true
	},
	{
		id: "text-embedding-3-small",
		label: "text-embedding-3-small",
		local: false,
		provider: "openai"
	},
	{
		id: "text-embedding-3-large",
		label: "text-embedding-3-large",
		local: false,
		provider: "openai"
	},
	{
		id: "gemini-embedding-2",
		label: "gemini-embedding-2",
		local: false,
		provider: "google"
	},
	{
		id: "gemini-embedding-001",
		label: "gemini-embedding-001",
		local: false,
		provider: "google"
	},
	{
		id: "custom",
		label: "自訂 embedding…",
		local: false,
		provider: "custom"
	}
];
/** 判斷 embedding 模型該用哪家金鑰；本機模型回 null */
function embeddingProvider(modelId) {
	const m = EMBEDDING_MODELS.find((e) => e.id === modelId);
	if (!m || m.local) return null;
	return m.provider ?? "openai";
}
//#endregion
//#region electron/secrets.ts
var file = () => node_path.default.join(electron.app.getPath("userData"), "secrets.json");
var cache = null;
function read() {
	if (cache) return cache;
	try {
		cache = JSON.parse(node_fs.default.readFileSync(file(), "utf8"));
	} catch {
		cache = {};
	}
	return cache;
}
function write(data) {
	cache = data;
	node_fs.default.mkdirSync(node_path.default.dirname(file()), { recursive: true });
	node_fs.default.writeFileSync(file(), JSON.stringify(data, null, 2), {
		encoding: "utf8",
		mode: 384
	});
}
function encryptionAvailable() {
	try {
		return electron.safeStorage.isEncryptionAvailable();
	} catch {
		return false;
	}
}
function setSecret(id, value) {
	const data = read();
	const trimmed = value.trim();
	if (!trimmed) {
		delete data[id];
		write(data);
		return;
	}
	const hint = trimmed.slice(-4);
	const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	if (encryptionAvailable()) data[id] = {
		cipher: electron.safeStorage.encryptString(trimmed).toString("base64"),
		hint,
		updatedAt
	};
	else data[id] = {
		cipher: null,
		plain: trimmed,
		hint,
		updatedAt
	};
	write(data);
}
function removeSecret(id) {
	const data = read();
	delete data[id];
	write(data);
}
/** 僅供主行程內部使用，絕不經由 IPC 回傳 */
function getSecret(id) {
	const rec = read()[id];
	if (!rec) return "";
	if (rec.cipher) try {
		return electron.safeStorage.decryptString(Buffer.from(rec.cipher, "base64"));
	} catch {
		return "";
	}
	return rec.plain ?? "";
}
function secretsState() {
	const data = read();
	const items = Object.keys(PROVIDERS).map((id) => {
		const rec = data[id];
		return {
			id,
			isSet: Boolean(rec),
			hint: rec?.hint ?? "",
			updatedAt: rec?.updatedAt ?? null
		};
	});
	return {
		encryptionAvailable: encryptionAvailable(),
		items
	};
}
function clearAllSecrets() {
	write({});
}
//#endregion
//#region electron/ipc.ts
function win() {
	return electron.BrowserWindow.getAllWindows()[0] ?? null;
}
function broadcast(channel, payload) {
	for (const w of electron.BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
function applyTheme(pref) {
	electron.nativeTheme.themeSource = pref;
}
function registerIpc() {
	electron.ipcMain.handle("app:info", () => {
		return {
			appVersion: electron.app.getVersion(),
			electron: process.versions.electron,
			chrome: process.versions.chrome,
			node: process.versions.node,
			platform: process.platform,
			userDataPath: electron.app.getPath("userData"),
			reportsDir: readSettings().reportsDir,
			isPackaged: electron.app.isPackaged
		};
	});
	electron.ipcMain.handle("win:minimize", () => win()?.minimize());
	electron.ipcMain.handle("win:toggleMaximize", () => {
		const w = win();
		if (!w) return false;
		if (w.isMaximized()) w.unmaximize();
		else w.maximize();
		return w.isMaximized();
	});
	electron.ipcMain.handle("win:close", () => win()?.close());
	electron.ipcMain.handle("win:isMaximized", () => win()?.isMaximized() ?? false);
	electron.ipcMain.handle("settings:get", () => readSettings());
	electron.ipcMain.handle("settings:set", (_e, patch) => {
		const next = writeSettings(patch);
		if (patch.theme) applyTheme(patch.theme);
		return next;
	});
	electron.ipcMain.handle("settings:selectDir", async (_e, current) => {
		const w = win();
		if (!w) return null;
		const res = await electron.dialog.showOpenDialog(w, {
			properties: ["openDirectory", "createDirectory"],
			defaultPath: current
		});
		return res.canceled ? null : res.filePaths[0];
	});
	electron.ipcMain.handle("settings:selectFile", async (_e, current) => {
		const w = win();
		if (!w) return null;
		const res = await electron.dialog.showOpenDialog(w, {
			properties: ["openFile"],
			defaultPath: current
		});
		return res.canceled ? null : res.filePaths[0];
	});
	electron.ipcMain.handle("settings:detect", () => {
		const repoRoot = detectRepoRoot();
		return {
			repoRoot,
			python: repoRoot ? detectPython(repoRoot) : null
		};
	});
	electron.ipcMain.handle("secrets:state", () => secretsState());
	electron.ipcMain.handle("secrets:set", (_e, id, value) => {
		setSecret(id, value);
		return secretsState();
	});
	electron.ipcMain.handle("secrets:remove", (_e, id) => {
		removeSecret(id);
		return secretsState();
	});
	/**
	* 直接向供應商發一次最小成本的請求來驗證金鑰。
	* 金鑰不會離開主行程 —— 渲染行程只拿得到成功／失敗。
	*/
	electron.ipcMain.handle("secrets:verify", async (_e, id) => {
		const key = getSecret(id);
		if (!key) return {
			ok: false,
			message: "尚未設定金鑰"
		};
		try {
			if (id === "custom") return {
				ok: true,
				message: "已儲存（自訂端點於分析時連線，無法預先驗證）"
			};
			if (id === "anthropic") {
				const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
					headers: {
						"x-api-key": key,
						"anthropic-version": "2023-06-01"
					},
					signal: AbortSignal.timeout(12e3)
				});
				return res.ok ? {
					ok: true,
					message: "驗證成功"
				} : {
					ok: false,
					message: `驗證失敗（HTTP ${res.status}）`
				};
			}
			if (id === "alphavantage") {
				const body = await (await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12e3) })).json();
				if ("Error Message" in body || "Information" in body) return {
					ok: false,
					message: String(body["Error Message"] ?? body["Information"])
				};
				return {
					ok: true,
					message: "驗證成功"
				};
			}
			if (id === "finmind") {
				const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12e3) });
				return res.ok ? {
					ok: true,
					message: "驗證成功"
				} : {
					ok: false,
					message: `驗證失敗（HTTP ${res.status}）`
				};
			}
			const base = PROVIDERS[id].baseUrl;
			const res = await fetch(`${base}/models`, {
				headers: { Authorization: `Bearer ${key}` },
				signal: AbortSignal.timeout(12e3)
			});
			return res.ok ? {
				ok: true,
				message: "驗證成功"
			} : {
				ok: false,
				message: `驗證失敗（HTTP ${res.status}）`
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : String(err)
			};
		}
	});
	electron.ipcMain.handle("backend:status", () => backend.getStatus());
	electron.ipcMain.handle("backend:logs", () => backend.getLogs());
	electron.ipcMain.handle("backend:restart", () => backend.start());
	electron.ipcMain.handle("backend:stop", () => backend.stop());
	electron.ipcMain.handle("backend:get", (_e, apiPath) => backend.request("GET", apiPath));
	electron.ipcMain.handle("backend:delete", (_e, apiPath) => backend.request("DELETE", apiPath));
	backend.on("status", (s) => broadcast("backend:status", s));
	backend.on("log", (l) => broadcast("backend:log", l));
	/**
	* 啟動分析。金鑰由主行程在此注入 —— 渲染行程從頭到尾拿不到明文。
	*/
	electron.ipcMain.handle("analysis:start", async (_e, input) => {
		const isDeepCustom = input.deepThinkLlm === "custom";
		const isQuickCustom = input.quickThinkLlm === "custom";
		const isEmbedCustom = input.embeddingModel === "custom";
		const deepModel = isDeepCustom ? (input.customDeepModel ?? "").trim() : input.deepThinkLlm;
		const quickModel = isQuickCustom ? (input.customQuickModel ?? "").trim() : input.quickThinkLlm;
		const embedModel = isEmbedCustom ? (input.customEmbeddingModel ?? "").trim() : input.embeddingModel;
		const customBaseUrl = (input.customBaseUrl ?? "").trim();
		const deepProvider = providerForModel(input.deepThinkLlm);
		const quickProvider = providerForModel(input.quickThinkLlm);
		const deepKey = getSecret(deepProvider);
		const quickKey = getSecret(quickProvider);
		const missing = [];
		if (!deepKey) missing.push(PROVIDERS[deepProvider].label);
		if (!quickKey && quickProvider !== deepProvider) missing.push(PROVIDERS[quickProvider].label);
		const usingCustom = isDeepCustom || isQuickCustom || isEmbedCustom;
		const missingModel = [];
		if (isDeepCustom && !deepModel) missingModel.push("深度思考");
		if (isQuickCustom && !quickModel) missingModel.push("快速思考");
		if (isEmbedCustom && !embedModel) missingModel.push("Embedding");
		const embProvider = embeddingProvider(input.embeddingModel);
		const embeddingKey = embProvider ? getSecret(embProvider) : "";
		const embeddingBaseUrl = isEmbedCustom ? customBaseUrl : embProvider ? PROVIDERS[embProvider].baseUrl : PROVIDERS.openai.baseUrl;
		if (embProvider && !embeddingKey) missing.push(`${PROVIDERS[embProvider].label}（embedding 用）`);
		if (missingModel.length) return {
			ok: false,
			status: 0,
			message: `自訂模型需要填寫模型名稱：${missingModel.join("、")}。`
		};
		if (usingCustom && !customBaseUrl) return {
			ok: false,
			status: 0,
			message: "使用自訂模型前，請先到「設定 → 自訂（OpenAI 相容）」填寫 base URL。"
		};
		if (missing.length) return {
			ok: false,
			status: 0,
			message: `缺少 API 金鑰：${[...new Set(missing)].join("、")}。請先到「設定」新增。`
		};
		const payload = {
			ticker: input.ticker,
			analysis_date: input.analysisDate,
			analysts: input.analysts,
			research_depth: input.researchDepth,
			market_type: input.marketType,
			language: input.language,
			deep_think_llm: deepModel,
			quick_think_llm: quickModel,
			deep_think_api_key: deepKey,
			quick_think_api_key: quickKey || deepKey,
			deep_think_base_url: isDeepCustom ? customBaseUrl : baseUrlForModel(input.deepThinkLlm),
			quick_think_base_url: isQuickCustom ? customBaseUrl : baseUrlForModel(input.quickThinkLlm),
			embedding_model: embedModel,
			embedding_api_key: embeddingKey,
			embedding_base_url: embeddingBaseUrl,
			openai_api_key: getSecret("openai"),
			openai_base_url: PROVIDERS.openai.baseUrl,
			alpha_vantage_api_key: getSecret("alphavantage"),
			finmind_api_key: getSecret("finmind")
		};
		return backend.request("POST", "/api/analyze", payload);
	});
	electron.ipcMain.handle("analysis:status", (_e, taskId) => backend.request(`GET`, `/api/task/${encodeURIComponent(taskId)}`));
	electron.ipcMain.handle("analysis:cleanup", (_e, taskId) => backend.request("DELETE", `/api/task/${encodeURIComponent(taskId)}/cleanup`));
	electron.ipcMain.handle("reports:list", () => listReports());
	electron.ipcMain.handle("reports:get", (_e, fileName) => getReport(fileName));
	electron.ipcMain.handle("reports:save", (_e, report) => saveReport(report));
	electron.ipcMain.handle("reports:delete", (_e, fileName) => deleteReport(fileName));
	electron.ipcMain.handle("reports:usage", () => diskUsage());
	electron.ipcMain.handle("reports:reveal", (_e, fileName) => {
		const dir = readSettings().reportsDir;
		node_fs.default.mkdirSync(dir, { recursive: true });
		if (fileName) electron.shell.showItemInFolder(node_path.default.join(dir, node_path.default.basename(fileName)));
		else electron.shell.openPath(dir);
	});
	electron.ipcMain.handle("shell:openExternal", (_e, url) => {
		if (/^https?:\/\//i.test(url)) electron.shell.openExternal(url);
	});
	electron.ipcMain.handle("data:clearAll", async () => {
		const w = win();
		if ((await electron.dialog.showMessageBox(w, {
			type: "warning",
			buttons: ["取消", "全部清除"],
			defaultId: 0,
			cancelId: 0,
			title: "清除所有本機資料",
			message: "確定要清除所有報告、設定與已儲存的金鑰嗎？",
			detail: "此操作無法復原。"
		})).response !== 1) return false;
		clearAllSecrets();
		for (const r of listReports()) deleteReport(r.fileName);
		writeSettings({ watchlist: [] });
		return true;
	});
}
//#endregion
//#region electron/main.ts
var DEV_URL = process.env.VITE_DEV_SERVER_URL;
var RENDERER_DIST = node_path.default.join(__dirname, "..", "dist");
var isMac = process.platform === "darwin";
/** App 圖示：打包後在 dist/，開發時退回 public/ */
function appIcon() {
	for (const p of [node_path.default.join(RENDERER_DIST, "logo.png"), node_path.default.join(__dirname, "..", "public", "logo.png")]) try {
		const img = electron.nativeImage.createFromPath(p);
		if (!img.isEmpty()) return img;
	} catch {}
}
var windowStateFile = () => node_path.default.join(electron.app.getPath("userData"), "window.json");
function readWindowState() {
	try {
		const s = JSON.parse(node_fs.default.readFileSync(windowStateFile(), "utf8"));
		if (s.width > 400 && s.height > 300) return s;
	} catch {}
	return {
		width: 1440,
		height: 920
	};
}
function saveWindowState(win) {
	if (win.isDestroyed()) return;
	const state = {
		...win.getNormalBounds(),
		maximized: win.isMaximized()
	};
	try {
		node_fs.default.writeFileSync(windowStateFile(), JSON.stringify(state), "utf8");
	} catch {}
}
/**
* 以 response header 注入 CSP，而不是寫在 index.html 的 meta，
* 因為開發模式要放行 Vite 的 HMR（React Refresh 會注入內聯 script、
* 並用 WebSocket 連回 dev server），正式版則不需要也不應該放行。
*
* connect-src 一律只給 'self'：所有對外請求都由主行程發出，
* 渲染行程連 fetch 到供應商 API 的能力都沒有。
*/
function installCsp() {
	const policy = DEV_URL ? [
		`default-src 'self' ${DEV_URL}`,
		`script-src 'self' 'unsafe-inline' ${DEV_URL}`,
		`style-src 'self' 'unsafe-inline' ${DEV_URL} https://fonts.googleapis.com`,
		`font-src 'self' data: ${DEV_URL} https://fonts.gstatic.com`,
		`img-src 'self' data: blob: ${DEV_URL}`,
		`connect-src 'self' ${DEV_URL} ${DEV_URL.replace(/^http/, "ws")}`
	] : [
		"default-src 'self'",
		"script-src 'self'",
		`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
		`font-src 'self' data: https://fonts.gstatic.com`,
		"img-src 'self' data:",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'"
	];
	electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({ responseHeaders: {
			...details.responseHeaders,
			"Content-Security-Policy": [policy.join("; ")]
		} });
	});
}
function backgroundFor(dark) {
	return dark ? "#05070E" : "#EEF1F5";
}
function createWindow() {
	const state = readWindowState();
	const win = new electron.BrowserWindow({
		width: state.width,
		height: state.height,
		x: state.x,
		y: state.y,
		minWidth: 900,
		minHeight: 620,
		show: false,
		icon: appIcon(),
		backgroundColor: backgroundFor(electron.nativeTheme.shouldUseDarkColors),
		titleBarStyle: isMac ? "hiddenInset" : "default",
		trafficLightPosition: isMac ? {
			x: 14,
			y: 12
		} : void 0,
		frame: isMac,
		webPreferences: {
			preload: node_path.default.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			spellcheck: false
		}
	});
	if (state.maximized) win.maximize();
	let shown = false;
	const show = () => {
		if (shown || win.isDestroyed()) return;
		shown = true;
		win.show();
	};
	win.once("ready-to-show", show);
	setTimeout(show, 4e3);
	win.webContents.on("did-fail-load", (_e, code, desc, url) => {
		console.error(`[renderer] 載入失敗 ${code} ${desc} ${url}`);
		show();
	});
	win.webContents.on("render-process-gone", (_e, details) => {
		console.error(`[renderer] 程序結束：${details.reason}`);
	});
	win.webContents.on("console-message", (details) => {
		if (details.level === "error") console.error(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`);
	});
	const persist = () => saveWindowState(win);
	win.on("resized", persist);
	win.on("moved", persist);
	win.on("close", persist);
	const sendMaximized = () => win.webContents.send("win:maximized", win.isMaximized());
	win.on("maximize", sendMaximized);
	win.on("unmaximize", sendMaximized);
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) electron.shell.openExternal(url);
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (e, url) => {
		if (!(DEV_URL && url.startsWith(DEV_URL))) {
			e.preventDefault();
			if (/^https?:\/\//i.test(url)) electron.shell.openExternal(url);
		}
	});
	if (DEV_URL) win.loadURL(DEV_URL);
	else win.loadFile(node_path.default.join(RENDERER_DIST, "index.html"));
	return win;
}
if (!electron.app.requestSingleInstanceLock()) electron.app.quit();
else {
	electron.app.on("second-instance", () => {
		const win = electron.BrowserWindow.getAllWindows()[0];
		if (win) {
			if (win.isMinimized()) win.restore();
			win.focus();
		}
	});
	electron.app.whenReady().then(() => {
		installCsp();
		registerIpc();
		applyTheme(readSettings().theme);
		if (isMac) {
			const icon = appIcon();
			if (icon) electron.app.dock?.setIcon(icon);
		}
		electron.nativeTheme.on("updated", () => {
			const dark = electron.nativeTheme.shouldUseDarkColors;
			for (const w of electron.BrowserWindow.getAllWindows()) {
				if (w.isDestroyed()) continue;
				w.setBackgroundColor(backgroundFor(dark));
				w.webContents.send("theme:resolved", dark ? "dark" : "light");
			}
		});
		createWindow();
		backend.start();
		electron.app.on("activate", () => {
			if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});
	electron.app.on("window-all-closed", () => {
		if (!isMac) electron.app.quit();
	});
	electron.app.on("before-quit", () => {
		backend.stop();
	});
}
//#endregion

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsIm5hbWVzIjpbXSwic291cmNlcyI6WyIuLi9lbGVjdHJvbi9zdG9yZS50cyIsIi4uL2VsZWN0cm9uL2JhY2tlbmQudHMiLCIuLi9zaGFyZWQvcHJvdmlkZXJzLnRzIiwiLi4vZWxlY3Ryb24vc2VjcmV0cy50cyIsIi4uL2VsZWN0cm9uL2lwYy50cyIsIi4uL2VsZWN0cm9uL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB0eXBlIHsgU2V0dGluZ3MsIFN0b3JlZFJlcG9ydCwgUmVwb3J0TWV0YSwgRGlza1VzYWdlIH0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJ1xuXG5jb25zdCB1c2VyRGF0YSA9ICgpID0+IGFwcC5nZXRQYXRoKCd1c2VyRGF0YScpXG5jb25zdCBzZXR0aW5nc0ZpbGUgPSAoKSA9PiBwYXRoLmpvaW4odXNlckRhdGEoKSwgJ3NldHRpbmdzLmpzb24nKVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdFJlcG9ydHNEaXIoKTogc3RyaW5nIHtcbiAgcmV0dXJuIHBhdGguam9pbihhcHAuZ2V0UGF0aCgnZG9jdW1lbnRzJyksICdUcmFkaW5nQWdlbnRzWCcsICdyZXBvcnRzJylcbn1cblxuZnVuY3Rpb24gZGVmYXVsdHMoKTogU2V0dGluZ3Mge1xuICByZXR1cm4ge1xuICAgIHRoZW1lOiAnc3lzdGVtJyxcbiAgICBsYW5ndWFnZTogJ3poLVRXJyxcbiAgICByZXBvcnRzRGlyOiBkZWZhdWx0UmVwb3J0c0RpcigpLFxuICAgIGJhY2tlbmQ6IHsgbW9kZTogJ2F1dG8nLCB1cmw6ICdodHRwOi8vMTI3LjAuMC4xOjgwMDAnLCBjb21tYW5kOiAnJywgY3dkOiAnJyB9LFxuICAgIGRlZXBUaGlua0xsbTogJ2NsYXVkZS1vcHVzLTUnLFxuICAgIHF1aWNrVGhpbmtMbG06ICdjbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxJyxcbiAgICBlbWJlZGRpbmdNb2RlbDogJ2FsbC1tcG5ldC1iYXNlLXYyJyxcbiAgICBjdXN0b21EZWVwTW9kZWw6ICcnLFxuICAgIGN1c3RvbVF1aWNrTW9kZWw6ICcnLFxuICAgIGN1c3RvbUVtYmVkZGluZ01vZGVsOiAnJyxcbiAgICBjdXN0b21CYXNlVXJsOiAnJyxcbiAgICBtYXJrZXRUeXBlOiAndXMnLFxuICAgIHJlc2VhcmNoRGVwdGg6IDMsIC8vIOW5s+ihoeaooeW8j++8iOWwjem9iumbsuerr+eJiOmgkOiore+8iVxuICAgIGFuYWx5c3RzOiBbJ21hcmtldCcsICdzb2NpYWwnLCAnbmV3cycsICdmdW5kYW1lbnRhbHMnXSxcbiAgICB1c2VDYWNoZTogdHJ1ZSxcbiAgICB3YXRjaGxpc3Q6IFtdLFxuICB9XG59XG5cbmxldCBjYWNoZTogU2V0dGluZ3MgfCBudWxsID0gbnVsbFxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNldHRpbmdzKCk6IFNldHRpbmdzIHtcbiAgaWYgKGNhY2hlKSByZXR1cm4gY2FjaGVcbiAgY29uc3QgYmFzZSA9IGRlZmF1bHRzKClcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoc2V0dGluZ3NGaWxlKCksICd1dGY4JylcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgUGFydGlhbDxTZXR0aW5ncz5cbiAgICAvLyDmt7rlsaTlkIjkvbXljbPlj6/vvJrlt6Lni4Dlj6rmnIkgYmFja2VuZCDkuIDlsaTvvIzllq7njajomZXnkIZcbiAgICBjYWNoZSA9IHtcbiAgICAgIC4uLmJhc2UsXG4gICAgICAuLi5wYXJzZWQsXG4gICAgICBiYWNrZW5kOiB7IC4uLmJhc2UuYmFja2VuZCwgLi4uKHBhcnNlZC5iYWNrZW5kID8/IHt9KSB9LFxuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgY2FjaGUgPSBiYXNlXG4gIH1cbiAgcmV0dXJuIGNhY2hlXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3cml0ZVNldHRpbmdzKHBhdGNoOiBQYXJ0aWFsPFNldHRpbmdzPik6IFNldHRpbmdzIHtcbiAgY29uc3QgbmV4dCA9IHsgLi4ucmVhZFNldHRpbmdzKCksIC4uLnBhdGNoIH1cbiAgaWYgKHBhdGNoLmJhY2tlbmQpIG5leHQuYmFja2VuZCA9IHsgLi4ucmVhZFNldHRpbmdzKCkuYmFja2VuZCwgLi4ucGF0Y2guYmFja2VuZCB9XG4gIGNhY2hlID0gbmV4dFxuICBmcy5ta2RpclN5bmModXNlckRhdGEoKSwgeyByZWN1cnNpdmU6IHRydWUgfSlcbiAgZnMud3JpdGVGaWxlU3luYyhzZXR0aW5nc0ZpbGUoKSwgSlNPTi5zdHJpbmdpZnkobmV4dCwgbnVsbCwgMiksICd1dGY4JylcbiAgcmV0dXJuIG5leHRcbn1cblxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g5aCx5ZGK5a2Y5qqUICovXG5cbmZ1bmN0aW9uIHJlcG9ydHNEaXIoKTogc3RyaW5nIHtcbiAgY29uc3QgZGlyID0gcmVhZFNldHRpbmdzKCkucmVwb3J0c0RpclxuICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICByZXR1cm4gZGlyXG59XG5cbi8qKiDlj6rlj5boqa7ph4vos4fmlpnvvIzkuI3miormlbTku70gcmVzdWx0IOW4tumAsua4heWWriAqL1xuZnVuY3Rpb24gdG9NZXRhKHJlcG9ydDogU3RvcmVkUmVwb3J0LCBmaWxlTmFtZSA9IHJlcG9ydC5maWxlTmFtZSk6IFJlcG9ydE1ldGEge1xuICByZXR1cm4ge1xuICAgIGlkOiByZXBvcnQuaWQsXG4gICAgdGlja2VyOiByZXBvcnQudGlja2VyLFxuICAgIGFuYWx5c2lzRGF0ZTogcmVwb3J0LmFuYWx5c2lzRGF0ZSxcbiAgICBtYXJrZXRUeXBlOiByZXBvcnQubWFya2V0VHlwZSxcbiAgICB2ZXJkaWN0OiByZXBvcnQudmVyZGljdCxcbiAgICBjb25maWRlbmNlOiByZXBvcnQuY29uZmlkZW5jZSxcbiAgICBkZWVwVGhpbmtMbG06IHJlcG9ydC5kZWVwVGhpbmtMbG0sXG4gICAgcXVpY2tUaGlua0xsbTogcmVwb3J0LnF1aWNrVGhpbmtMbG0sXG4gICAgYW5hbHlzdENvdW50OiByZXBvcnQuYW5hbHlzdENvdW50LFxuICAgIGR1cmF0aW9uTXM6IHJlcG9ydC5kdXJhdGlvbk1zLFxuICAgIGNyZWF0ZWRBdDogcmVwb3J0LmNyZWF0ZWRBdCxcbiAgICBmaWxlTmFtZSxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVJlcG9ydChyZXBvcnQ6IFN0b3JlZFJlcG9ydCk6IFJlcG9ydE1ldGEge1xuICBjb25zdCBkaXIgPSByZXBvcnRzRGlyKClcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZGlyLCByZXBvcnQuZmlsZU5hbWUpLCBKU09OLnN0cmluZ2lmeShyZXBvcnQsIG51bGwsIDIpLCAndXRmOCcpXG4gIHJldHVybiB0b01ldGEocmVwb3J0KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdFJlcG9ydHMoKTogUmVwb3J0TWV0YVtdIHtcbiAgY29uc3QgZGlyID0gcmVwb3J0c0RpcigpXG4gIGxldCBuYW1lczogc3RyaW5nW11cbiAgdHJ5IHtcbiAgICBuYW1lcyA9IGZzLnJlYWRkaXJTeW5jKGRpcikuZmlsdGVyKChuKSA9PiBuLmVuZHNXaXRoKCcuanNvbicpKVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW11cbiAgfVxuICBjb25zdCBvdXQ6IFJlcG9ydE1ldGFbXSA9IFtdXG4gIGZvciAoY29uc3QgbmFtZSBvZiBuYW1lcykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByYXcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4oZGlyLCBuYW1lKSwgJ3V0ZjgnKSkgYXMgU3RvcmVkUmVwb3J0XG4gICAgICAvLyDmqpTmoYjlj6/og73ooqvmlLnlkI3vvIzkuIDlvovku6Xlr6bpmpvmqpTlkI3ngrrmupZcbiAgICAgIG91dC5wdXNoKHRvTWV0YShyYXcsIG5hbWUpKVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8g5aOe5o6J55qE5qqU5qGI55Wl6YGO77yM5LiN6K6T5pW05Lu95riF5Zau5o6b5o6JXG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQuc29ydCgoYSwgYikgPT4gKGEuY3JlYXRlZEF0IDwgYi5jcmVhdGVkQXQgPyAxIDogLTEpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVwb3J0KGZpbGVOYW1lOiBzdHJpbmcpOiBTdG9yZWRSZXBvcnQgfCBudWxsIHtcbiAgY29uc3Qgc2FmZSA9IHBhdGguYmFzZW5hbWUoZmlsZU5hbWUpXG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihyZXBvcnRzRGlyKCksIHNhZmUpLCAndXRmOCcpKSBhcyBTdG9yZWRSZXBvcnRcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlUmVwb3J0KGZpbGVOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3Qgc2FmZSA9IHBhdGguYmFzZW5hbWUoZmlsZU5hbWUpXG4gIHRyeSB7XG4gICAgZnMudW5saW5rU3luYyhwYXRoLmpvaW4ocmVwb3J0c0RpcigpLCBzYWZlKSlcbiAgICByZXR1cm4gdHJ1ZVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlza1VzYWdlKCk6IERpc2tVc2FnZSB7XG4gIGNvbnN0IGRpciA9IHJlcG9ydHNEaXIoKVxuICBsZXQgYnl0ZXMgPSAwXG4gIGxldCByZXBvcnRDb3VudCA9IDBcbiAgdHJ5IHtcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgZnMucmVhZGRpclN5bmMoZGlyKSkge1xuICAgICAgaWYgKCFuYW1lLmVuZHNXaXRoKCcuanNvbicpKSBjb250aW51ZVxuICAgICAgYnl0ZXMgKz0gZnMuc3RhdFN5bmMocGF0aC5qb2luKGRpciwgbmFtZSkpLnNpemVcbiAgICAgIHJlcG9ydENvdW50ICs9IDFcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIOebrumMhOS4jeWtmOWcqOaZguWbniAwICovXG4gIH1cbiAgcmV0dXJuIHsgcmVwb3J0Q291bnQsIGJ5dGVzIH1cbn1cbiIsImltcG9ydCB7IGFwcCB9IGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IHsgc3Bhd24sIHR5cGUgQ2hpbGRQcm9jZXNzIH0gZnJvbSAnbm9kZTpjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnbm9kZTpldmVudHMnXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcydcbmltcG9ydCBuZXQgZnJvbSAnbm9kZTpuZXQnXG5pbXBvcnQgb3MgZnJvbSAnbm9kZTpvcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB0eXBlIHsgQmFja2VuZExvZ0xpbmUsIEJhY2tlbmRTdGF0dXMgfSBmcm9tICcuLi9zaGFyZWQvdHlwZXMnXG5pbXBvcnQgeyByZWFkU2V0dGluZ3MgfSBmcm9tICcuL3N0b3JlJ1xuXG5jb25zdCBNQVhfTE9HX0xJTkVTID0gNDAwXG5jb25zdCBIRUFMVEhfVElNRU9VVF9NUyA9IDEyMF8wMDBcbmNvbnN0IEhFQUxUSF9JTlRFUlZBTF9NUyA9IDcwMFxuXG5hc3luYyBmdW5jdGlvbiBmcmVlUG9ydCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHNydiA9IG5ldC5jcmVhdGVTZXJ2ZXIoKVxuICAgIHNydi51bnJlZigpXG4gICAgc3J2Lm9uKCdlcnJvcicsIHJlamVjdClcbiAgICBzcnYubGlzdGVuKDAsICcxMjcuMC4wLjEnLCAoKSA9PiB7XG4gICAgICBjb25zdCBhZGRyID0gc3J2LmFkZHJlc3MoKVxuICAgICAgY29uc3QgcG9ydCA9IHR5cGVvZiBhZGRyID09PSAnb2JqZWN0JyAmJiBhZGRyID8gYWRkci5wb3J0IDogMFxuICAgICAgc3J2LmNsb3NlKCgpID0+IHJlc29sdmUocG9ydCkpXG4gICAgfSlcbiAgfSlcbn1cblxuLyoqIOW+gOS4iuaJviBUcmFkaW5nQWdlbnRzWCByZXBvIOagueebrumMhO+8iOWQqyBiYWNrZW5kL2FwcC9tYWluLnB5IOiAhe+8iSAqL1xuZnVuY3Rpb24gZGV0ZWN0UmVwb1Jvb3QoKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHN0YXJ0cyA9IFthcHAuZ2V0QXBwUGF0aCgpLCBwcm9jZXNzLmN3ZCgpXVxuICBmb3IgKGNvbnN0IHN0YXJ0IG9mIHN0YXJ0cykge1xuICAgIGxldCBkaXIgPSBzdGFydFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4oZGlyLCAnYmFja2VuZCcsICdhcHAnLCAnbWFpbi5weScpKSkgcmV0dXJuIGRpclxuICAgICAgY29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGRpcilcbiAgICAgIGlmIChwYXJlbnQgPT09IGRpcikgYnJlYWtcbiAgICAgIGRpciA9IHBhcmVudFxuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbFxufVxuXG4vKipcbiAqIOWFp+W7uueahOW+jOerr+Wft+ihjOeSsOWig++8iOmaqCBBcHAg5LiA6LW35omT5YyF77yM5L2/55So6ICF5LiN6ZyA6KaBIGNsb25lIHJlcG8g5oiW6Ieq5YKZIFB5dGhvbu+8ieOAglxuICog55SxIHNjcmlwdHMvYnVpbGQtYmFja2VuZC5tanMg55Si55Sf77yM6YCP6YGOIGVsZWN0cm9uLWJ1aWxkZXIg55qEIGV4dHJhUmVzb3VyY2VzIOaUvumAsu+8mlxuICogICA8cmVzb3VyY2VzPi9weWJhY2tlbmQvICAg4oCU4oCUIOWPr+mHjeWumuS9jeeahCBQeXRob24g5Z+36KGM55Kw5aKD77yI5ZCr5omA5pyJ5L6d6LO077yJXG4gKiAgIDxyZXNvdXJjZXM+L2FwcHNyYy8gICAgICDigJTigJQgYmFja2VuZC8g6IiHIHRyYWRpbmdhZ2VudHMvIOWOn+Wni+eivFxuICog6ZaL55m85pmC5Y+v55So55Kw5aKD6K6K5pW4IFRBWF9CVU5ETEVfRElSIOaMh+WQkeacrOapn+W7uuWlveeahCBidW5kbGUg5L6G5ris6Kmm44CCXG4gKi9cbmZ1bmN0aW9uIGRldGVjdEJ1bmRsZWRCYWNrZW5kKCk6IHsgcHl0aG9uOiBzdHJpbmc7IGFwcHNyYzogc3RyaW5nIH0gfCBudWxsIHtcbiAgY29uc3QgYmFzZSA9IGFwcC5pc1BhY2thZ2VkID8gcHJvY2Vzcy5yZXNvdXJjZXNQYXRoIDogcHJvY2Vzcy5lbnYuVEFYX0JVTkRMRV9ESVJcbiAgaWYgKCFiYXNlKSByZXR1cm4gbnVsbFxuICBjb25zdCBweXRob24gPVxuICAgIHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcbiAgICAgID8gcGF0aC5qb2luKGJhc2UsICdweWJhY2tlbmQnLCAncHl0aG9uLmV4ZScpXG4gICAgICA6IHBhdGguam9pbihiYXNlLCAncHliYWNrZW5kJywgJ2JpbicsICdweXRob24zJylcbiAgY29uc3QgYXBwc3JjID0gcGF0aC5qb2luKGJhc2UsICdhcHBzcmMnKVxuICBpZiAoZnMuZXhpc3RzU3luYyhweXRob24pICYmIGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGFwcHNyYywgJ2JhY2tlbmQnLCAnX19tYWluX18ucHknKSkpIHtcbiAgICByZXR1cm4geyBweXRob24sIGFwcHNyYyB9XG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuLyoqIOS+neW6j+WYl+ippuW4uOimi+eahCBQeXRob24g5L2N572u77yM5Zue5YKz56ys5LiA5YCL5a2Y5Zyo55qEICovXG5mdW5jdGlvbiBkZXRlY3RQeXRob24ocmVwb1Jvb3Q6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBob21lID0gb3MuaG9tZWRpcigpXG4gIGNvbnN0IGV4ZSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAncHl0aG9uLmV4ZScgOiAncHl0aG9uJ1xuICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgIHBhdGguam9pbihyZXBvUm9vdCwgJy52ZW52JywgcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdTY3JpcHRzJyA6ICdiaW4nLCBleGUpLFxuICAgIHBhdGguam9pbihob21lLCAnYW5hY29uZGEzJywgJ2VudnMnLCAndHJhZGluZ2FnZW50cycsICdiaW4nLCAncHl0aG9uJyksXG4gICAgcGF0aC5qb2luKGhvbWUsICdtaW5pY29uZGEzJywgJ2VudnMnLCAndHJhZGluZ2FnZW50cycsICdiaW4nLCAncHl0aG9uJyksXG4gICAgcGF0aC5qb2luKGhvbWUsICdtaW5pZm9yZ2UzJywgJ2VudnMnLCAndHJhZGluZ2FnZW50cycsICdiaW4nLCAncHl0aG9uJyksXG4gICAgcGF0aC5qb2luKGhvbWUsICcuY29uZGEnLCAnZW52cycsICd0cmFkaW5nYWdlbnRzJywgJ2JpbicsICdweXRob24nKSxcbiAgICAnL29wdC9ob21lYnJldy9iaW4vcHl0aG9uMycsXG4gICAgJy91c3IvbG9jYWwvYmluL3B5dGhvbjMnLFxuICAgICcvdXNyL2Jpbi9weXRob24zJyxcbiAgXVxuICBmb3IgKGNvbnN0IGMgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChmcy5leGlzdHNTeW5jKGMpKSByZXR1cm4gY1xuICB9XG4gIHJldHVybiBudWxsXG59XG5cbmNsYXNzIEJhY2tlbmRDb250cm9sbGVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcbiAgcHJpdmF0ZSBwcm9jOiBDaGlsZFByb2Nlc3MgfCBudWxsID0gbnVsbFxuICBwcml2YXRlIGxvZ3M6IEJhY2tlbmRMb2dMaW5lW10gPSBbXVxuICBwcml2YXRlIHN0b3BwaW5nID0gZmFsc2VcbiAgcHJpdmF0ZSBzdGF0dXM6IEJhY2tlbmRTdGF0dXMgPSB7XG4gICAgcGhhc2U6ICdpZGxlJyxcbiAgICB1cmw6IG51bGwsXG4gICAgcG9ydDogbnVsbCxcbiAgICBwaWQ6IG51bGwsXG4gICAgbWVzc2FnZTogbnVsbCxcbiAgICB2ZXJzaW9uOiBudWxsLFxuICAgIHJlZGlzQ29ubmVjdGVkOiBmYWxzZSxcbiAgICBzdGFydGVkQXQ6IG51bGwsXG4gIH1cblxuICBnZXRTdGF0dXMoKTogQmFja2VuZFN0YXR1cyB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdHVzXG4gIH1cblxuICBnZXRMb2dzKCk6IEJhY2tlbmRMb2dMaW5lW10ge1xuICAgIHJldHVybiB0aGlzLmxvZ3NcbiAgfVxuXG4gIHByaXZhdGUgc2V0U3RhdHVzKHBhdGNoOiBQYXJ0aWFsPEJhY2tlbmRTdGF0dXM+KSB7XG4gICAgdGhpcy5zdGF0dXMgPSB7IC4uLnRoaXMuc3RhdHVzLCAuLi5wYXRjaCB9XG4gICAgdGhpcy5lbWl0KCdzdGF0dXMnLCB0aGlzLnN0YXR1cylcbiAgfVxuXG4gIHByaXZhdGUgbG9nKHN0cmVhbTogQmFja2VuZExvZ0xpbmVbJ3N0cmVhbSddLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgdGV4dC5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCB0ID0gbGluZS50cmltRW5kKClcbiAgICAgIGlmICghdCkgY29udGludWVcbiAgICAgIGNvbnN0IGVudHJ5OiBCYWNrZW5kTG9nTGluZSA9IHsgYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgc3RyZWFtLCB0ZXh0OiB0IH1cbiAgICAgIHRoaXMubG9ncy5wdXNoKGVudHJ5KVxuICAgICAgaWYgKHRoaXMubG9ncy5sZW5ndGggPiBNQVhfTE9HX0xJTkVTKSB0aGlzLmxvZ3Muc2hpZnQoKVxuICAgICAgdGhpcy5lbWl0KCdsb2cnLCBlbnRyeSlcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdGFydCgpOiBQcm9taXNlPEJhY2tlbmRTdGF0dXM+IHtcbiAgICBhd2FpdCB0aGlzLnN0b3AoKVxuICAgIHRoaXMuc3RvcHBpbmcgPSBmYWxzZVxuICAgIHRoaXMubG9ncyA9IFtdXG5cbiAgICBjb25zdCBzZXR0aW5ncyA9IHJlYWRTZXR0aW5ncygpXG5cbiAgICBpZiAoc2V0dGluZ3MuYmFja2VuZC5tb2RlID09PSAnZXh0ZXJuYWwnKSB7XG4gICAgICBjb25zdCB1cmwgPSBzZXR0aW5ncy5iYWNrZW5kLnVybC5yZXBsYWNlKC9cXC8rJC8sICcnKVxuICAgICAgdGhpcy5zZXRTdGF0dXMoeyBwaGFzZTogJ3N0YXJ0aW5nJywgdXJsLCBwb3J0OiBudWxsLCBwaWQ6IG51bGwsIG1lc3NhZ2U6ICfpgKPnt5roh7PlpJbpg6jlvoznq6/igKYnIH0pXG4gICAgICB0aGlzLmxvZygnYXBwJywgYOWklumDqOW+jOerr+aooeW8j++8miR7dXJsfWApXG4gICAgICBjb25zdCBvayA9IGF3YWl0IHRoaXMud2FpdEZvckhlYWx0aCh1cmwsIDE1XzAwMClcbiAgICAgIGlmICghb2spIHtcbiAgICAgICAgdGhpcy5zZXRTdGF0dXMoeyBwaGFzZTogJ2Vycm9yJywgbWVzc2FnZTogYOeEoeazlemAo+e3muWIsCAke3VybH1gIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5zdGF0dXNcbiAgICB9XG5cbiAgICAvLyDlhKrlhYjkvb/nlKjpmqggQXBwIOaJk+WMheeahOWFp+W7uuWft+ihjOeSsOWig++8iOS9v+eUqOiAheeEoemcgCBjbG9uZSByZXBvIC8g5a6J6KOdIFB5dGhvbu+8ieOAglxuICAgIC8vIOWPquacieWcqOS9v+eUqOiAheaykuacieaJi+WLleaMh+WumiBQeXRob24g6Lev5b6R5pmC5omN6Ieq5YuV5o6h55So77yM5L+d55WZ6YCy6ZqO6ICF55qE6KaG5a+r6IO95Yqb44CCXG4gICAgY29uc3QgYnVuZGxlZCA9IHNldHRpbmdzLmJhY2tlbmQuY29tbWFuZCA/IG51bGwgOiBkZXRlY3RCdW5kbGVkQmFja2VuZCgpXG5cbiAgICBsZXQgcHl0aG9uOiBzdHJpbmdcbiAgICBsZXQgY3dkOiBzdHJpbmdcbiAgICAvLyBidW5kbGVkIOaooeW8j+imgemhjeWkluazqOWFpeeahOeSsOWig+iuiuaVuO+8iOaKiuW+jOerr+eahOS4remWk+aqlOWwjumbouWUr+iugOeahCBBcHAgYnVuZGxl77yJXG4gICAgY29uc3QgZXh0cmFFbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fVxuICAgIGlmIChidW5kbGVkKSB7XG4gICAgICBweXRob24gPSBidW5kbGVkLnB5dGhvblxuICAgICAgLy8gQXBwIOeahCBSZXNvdXJjZXMg5piv5ZSv6K6A55qE44CC5b6M56uv5pyJ5Lqb5Lit6ZaT5qqU5piv55u45bCN44CM5bel5L2c55uu6YyE44CN5a+r55qE77yI5L6L5aaCIGV2YWxfcmVzdWx0cy/vvInvvIxcbiAgICAgIC8vIOaJgOS7peeUqOS4gOWAi+WPr+Wvq+eahOW3peS9nOebrumMhO+8jOS4puaKiiBiYWNrZW5kL3RyYWRpbmdhZ2VudHMg55SoIFBZVEhPTlBBVEgg5o6b5LiK77ybXG4gICAgICAvLyDos4fmlpnoiIflv6vlj5bkuZ/kuIDkvbXlsI7liLDlj6/lr6vnmoQgdXNlckRhdGEg5bqV5LiL44CCXG4gICAgICBjb25zdCBydW5EaXIgPSBwYXRoLmpvaW4oYXBwLmdldFBhdGgoJ3VzZXJEYXRhJyksICdiYWNrZW5kLXJ1bicpXG4gICAgICBjb25zdCBkYXRhRGlyID0gcGF0aC5qb2luKGFwcC5nZXRQYXRoKCd1c2VyRGF0YScpLCAnZGF0YScpXG4gICAgICBjb25zdCBjYWNoZURpciA9IHBhdGguam9pbihhcHAuZ2V0UGF0aCgndXNlckRhdGEnKSwgJ2RhdGEtY2FjaGUnKVxuICAgICAgZm9yIChjb25zdCBkIG9mIFtydW5EaXIsIGRhdGFEaXIsIGNhY2hlRGlyXSkgZnMubWtkaXJTeW5jKGQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgICBjd2QgPSBydW5EaXJcbiAgICAgIGV4dHJhRW52LlBZVEhPTlBBVEggPSBidW5kbGVkLmFwcHNyY1xuICAgICAgZXh0cmFFbnYuVFJBRElOR0FHRU5UU19EQVRBX0RJUiA9IGRhdGFEaXJcbiAgICAgIGV4dHJhRW52LlRSQURJTkdBR0VOVFNfREFUQV9DQUNIRV9ESVIgPSBjYWNoZURpclxuICAgICAgdGhpcy5sb2coJ2FwcCcsICfkvb/nlKjlhaflu7rlvoznq6/ln7fooYznkrDlooPvvIjpmqggQXBwIOaJk+WMhe+8iScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHJlcG9Sb290ID0gc2V0dGluZ3MuYmFja2VuZC5jd2QgfHwgZGV0ZWN0UmVwb1Jvb3QoKVxuICAgICAgaWYgKCFyZXBvUm9vdCkge1xuICAgICAgICBjb25zdCBtc2cgPSAn5om+5LiN5YiwIFRyYWRpbmdBZ2VudHNYIOWwiOahiOebrumMhO+8jOiri+WIsOOAjOioreWumiDihpIg5b6M56uv44CN5omL5YuV5oyH5a6aJ1xuICAgICAgICB0aGlzLmxvZygnYXBwJywgbXNnKVxuICAgICAgICB0aGlzLnNldFN0YXR1cyh7IHBoYXNlOiAnZXJyb3InLCBtZXNzYWdlOiBtc2csIHVybDogbnVsbCwgcG9ydDogbnVsbCwgcGlkOiBudWxsIH0pXG4gICAgICAgIHJldHVybiB0aGlzLnN0YXR1c1xuICAgICAgfVxuICAgICAgY29uc3QgZm91bmQgPSBzZXR0aW5ncy5iYWNrZW5kLmNvbW1hbmQgfHwgZGV0ZWN0UHl0aG9uKHJlcG9Sb290KVxuICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICBjb25zdCBtc2cgPSAn5om+5LiN5Yiw5Y+v55So55qEIFB5dGhvbu+8jOiri+WIsOOAjOioreWumiDihpIg5b6M56uv44CN5omL5YuV5oyH5a6a55u06K2v5Zmo6Lev5b6RJ1xuICAgICAgICB0aGlzLmxvZygnYXBwJywgbXNnKVxuICAgICAgICB0aGlzLnNldFN0YXR1cyh7IHBoYXNlOiAnZXJyb3InLCBtZXNzYWdlOiBtc2csIHVybDogbnVsbCwgcG9ydDogbnVsbCwgcGlkOiBudWxsIH0pXG4gICAgICAgIHJldHVybiB0aGlzLnN0YXR1c1xuICAgICAgfVxuICAgICAgcHl0aG9uID0gZm91bmRcbiAgICAgIGN3ZCA9IHJlcG9Sb290XG4gICAgfVxuXG4gICAgY29uc3QgcG9ydCA9IGF3YWl0IGZyZWVQb3J0KClcbiAgICBjb25zdCB1cmwgPSBgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9YFxuICAgIHRoaXMuc2V0U3RhdHVzKHtcbiAgICAgIHBoYXNlOiAnc3RhcnRpbmcnLFxuICAgICAgdXJsLFxuICAgICAgcG9ydCxcbiAgICAgIHBpZDogbnVsbCxcbiAgICAgIG1lc3NhZ2U6ICfmraPlnKjllZ/li5XmnKzmqZ/lvoznq6/igKYnLFxuICAgICAgc3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfSlcbiAgICB0aGlzLmxvZygnYXBwJywgYCR7cHl0aG9ufSAtbSBiYWNrZW5kIC0tcG9ydCAke3BvcnR9YClcbiAgICB0aGlzLmxvZygnYXBwJywgYOW3peS9nOebrumMhCAke2N3ZH1gKVxuXG4gICAgY29uc3QgY2hpbGQgPSBzcGF3bihcbiAgICAgIHB5dGhvbixcbiAgICAgIFsnLW0nLCAnYmFja2VuZCcsICctLWhvc3QnLCAnMTI3LjAuMC4xJywgJy0tcG9ydCcsIFN0cmluZyhwb3J0KSwgJy0tcmVsb2FkJywgJ2ZhbHNlJ10sXG4gICAgICB7XG4gICAgICAgIGN3ZCxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgLi4ucHJvY2Vzcy5lbnYsXG4gICAgICAgICAgUFlUSE9OVU5CVUZGRVJFRDogJzEnLFxuICAgICAgICAgIFBZVEhPTklPRU5DT0RJTkc6ICd1dGYtOCcsXG4gICAgICAgICAgQkFDS0VORF9IT1NUOiAnMTI3LjAuMC4xJyxcbiAgICAgICAgICBCQUNLRU5EX1BPUlQ6IFN0cmluZyhwb3J0KSxcbiAgICAgICAgICBQT1JUOiBTdHJpbmcocG9ydCksXG4gICAgICAgICAgQkFDS0VORF9SRUxPQUQ6ICdmYWxzZScsXG4gICAgICAgICAgLy8g5qGM6Z2i54mI5rKS5pyJ5aSa5L2/55So6ICF5qaC5b+177yM6Zec5o6J5YiG5p6Q56uv6bue55qE55m75YWl6KaB5rGCXG4gICAgICAgICAgUkVRVUlSRV9BVVRIX0ZPUl9BTkFMWVpFOiAnZmFsc2UnLFxuICAgICAgICAgIENPUlNfT1JJR0lOUzogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgICAgICAgLy8g5b6M56uvIHB5ZGFudGljIFNldHRpbmdzIOiugOeahOaYryBSRVNVTFRTX0RJUu+8m+S4gOS9teiorSBUUkFESU5HQUdFTlRTX1JFU1VMVFNfRElS44CCXG4gICAgICAgICAgLy8g6YO95oyH5Yiw5L2/55So6ICF55qE5aCx5ZGK6LOH5paZ5aS+77yI5Y+v5a+r77yJ77yM5LiN5pyD5a+r6YCy5ZSv6K6A55qEIEFwcCBidW5kbGXjgIJcbiAgICAgICAgICBSRVNVTFRTX0RJUjogc2V0dGluZ3MucmVwb3J0c0RpcixcbiAgICAgICAgICBUUkFESU5HQUdFTlRTX1JFU1VMVFNfRElSOiBzZXR0aW5ncy5yZXBvcnRzRGlyLFxuICAgICAgICAgIC4uLmV4dHJhRW52LFxuICAgICAgICB9LFxuICAgICAgICBzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdwaXBlJ10sXG4gICAgICB9LFxuICAgIClcblxuICAgIHRoaXMucHJvYyA9IGNoaWxkXG4gICAgdGhpcy5zZXRTdGF0dXMoeyBwaWQ6IGNoaWxkLnBpZCA/PyBudWxsIH0pXG5cbiAgICBjaGlsZC5zdGRvdXQ/Lm9uKCdkYXRhJywgKGI6IEJ1ZmZlcikgPT4gdGhpcy5sb2coJ3N0ZG91dCcsIGIudG9TdHJpbmcoKSkpXG4gICAgY2hpbGQuc3RkZXJyPy5vbignZGF0YScsIChiOiBCdWZmZXIpID0+IHRoaXMubG9nKCdzdGRlcnInLCBiLnRvU3RyaW5nKCkpKVxuXG4gICAgY2hpbGQub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgdGhpcy5sb2coJ2FwcCcsIGDllZ/li5XlpLHmlZfvvJoke2Vyci5tZXNzYWdlfWApXG4gICAgICB0aGlzLnNldFN0YXR1cyh7IHBoYXNlOiAnZXJyb3InLCBtZXNzYWdlOiBlcnIubWVzc2FnZSB9KVxuICAgIH0pXG5cbiAgICBjaGlsZC5vbignZXhpdCcsIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgIHRoaXMucHJvYyA9IG51bGxcbiAgICAgIGlmICh0aGlzLnN0b3BwaW5nKSB7XG4gICAgICAgIHRoaXMuc2V0U3RhdHVzKHsgcGhhc2U6ICdzdG9wcGVkJywgbWVzc2FnZTogbnVsbCwgcGlkOiBudWxsIH0pXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgY29uc3QgbXNnID0gYOW+jOerr+ihjOeoi+e1kOadn++8iGNvZGU9JHtjb2RlID8/ICctJ30gc2lnbmFsPSR7c2lnbmFsID8/ICctJ33vvIlgXG4gICAgICB0aGlzLmxvZygnYXBwJywgbXNnKVxuICAgICAgdGhpcy5zZXRTdGF0dXMoeyBwaGFzZTogJ2Vycm9yJywgbWVzc2FnZTogbXNnLCBwaWQ6IG51bGwgfSlcbiAgICB9KVxuXG4gICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLndhaXRGb3JIZWFsdGgodXJsLCBIRUFMVEhfVElNRU9VVF9NUylcbiAgICBpZiAoIW9rICYmIHRoaXMuc3RhdHVzLnBoYXNlICE9PSAnZXJyb3InKSB7XG4gICAgICB0aGlzLnNldFN0YXR1cyh7IHBoYXNlOiAnZXJyb3InLCBtZXNzYWdlOiAn5b6M56uv5ZWf5YuV6YC+5pmC77yM6KuL5p+l55yL5pel6KqMJyB9KVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zdGF0dXNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd2FpdEZvckhlYWx0aCh1cmw6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXNcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG4gICAgICBpZiAodGhpcy5zdG9wcGluZykgcmV0dXJuIGZhbHNlXG4gICAgICAvLyDooYznqIvlt7LmrbvlsLHkuI3nlKjlho3nrYnkuoZcbiAgICAgIGlmICh0aGlzLnN0YXR1cy5waGFzZSA9PT0gJ2Vycm9yJyAmJiAhdGhpcy5wcm9jICYmIHJlYWRTZXR0aW5ncygpLmJhY2tlbmQubW9kZSA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7dXJsfS9hcGkvaGVhbHRoYCwgeyBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMjUwMCkgfSlcbiAgICAgICAgaWYgKHJlcy5vaykge1xuICAgICAgICAgIGNvbnN0IGJvZHkgPSAoYXdhaXQgcmVzLmpzb24oKSkgYXMgeyB2ZXJzaW9uPzogc3RyaW5nOyByZWRpc19jb25uZWN0ZWQ/OiBib29sZWFuIH1cbiAgICAgICAgICB0aGlzLmxvZygnYXBwJywgJ+W+jOerr+Wwsee3kicpXG4gICAgICAgICAgdGhpcy5zZXRTdGF0dXMoe1xuICAgICAgICAgICAgcGhhc2U6ICdyZWFkeScsXG4gICAgICAgICAgICB1cmwsXG4gICAgICAgICAgICBtZXNzYWdlOiBudWxsLFxuICAgICAgICAgICAgdmVyc2lvbjogYm9keS52ZXJzaW9uID8/IG51bGwsXG4gICAgICAgICAgICByZWRpc0Nvbm5lY3RlZDogQm9vbGVhbihib2R5LnJlZGlzX2Nvbm5lY3RlZCksXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLyog6YKE5rKS6LW35L6G77yM57m857qM562JICovXG4gICAgICB9XG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCBIRUFMVEhfSU5URVJWQUxfTVMpKVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zdG9wcGluZyA9IHRydWVcbiAgICBjb25zdCBjaGlsZCA9IHRoaXMucHJvY1xuICAgIGlmICghY2hpbGQpIHtcbiAgICAgIGlmICh0aGlzLnN0YXR1cy5waGFzZSAhPT0gJ2lkbGUnKSB0aGlzLnNldFN0YXR1cyh7IHBoYXNlOiAnc3RvcHBlZCcsIHBpZDogbnVsbCB9KVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMucHJvYyA9IG51bGxcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgZG9uZSA9ICgpID0+IHJlc29sdmUoKVxuICAgICAgY2hpbGQub25jZSgnZXhpdCcsIGRvbmUpXG4gICAgICBjaGlsZC5raWxsKCdTSUdURVJNJylcbiAgICAgIC8vIDUg56eS6YKE5rKS6YCA5bCx5by35Yi257WQ5p2f77yM6YG/5YWN6ZecIEFwcCDmmYLljaHkvY9cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAoIWNoaWxkLmtpbGxlZCkgY2hpbGQua2lsbCgnU0lHS0lMTCcpXG4gICAgICAgIHJlc29sdmUoKVxuICAgICAgfSwgNTAwMClcbiAgICB9KVxuICAgIHRoaXMuc2V0U3RhdHVzKHsgcGhhc2U6ICdzdG9wcGVkJywgcGlkOiBudWxsIH0pXG4gIH1cblxuICAvKiog5bCN5b6M56uv55m86KuL5rGC77yb5pyq5bCx57eS5pmC55u05o6l5aSx5pWX77yM5LiN5YGa6Zqx5byP562J5b6FICovXG4gIGFzeW5jIHJlcXVlc3Q8VD4oXG4gICAgbWV0aG9kOiBzdHJpbmcsXG4gICAgYXBpUGF0aDogc3RyaW5nLFxuICAgIGJvZHk/OiB1bmtub3duLFxuICApOiBQcm9taXNlPHsgb2s6IHRydWU7IGRhdGE6IFQgfSB8IHsgb2s6IGZhbHNlOyBzdGF0dXM6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0+IHtcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zdGF0dXMudXJsXG4gICAgaWYgKCFiYXNlIHx8IHRoaXMuc3RhdHVzLnBoYXNlICE9PSAncmVhZHknKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHN0YXR1czogMCwgbWVzc2FnZTogJ+acrOapn+W+jOerr+WwmuacquWwsee3kicgfVxuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7YmFzZX0ke2FwaVBhdGh9YCwge1xuICAgICAgICBtZXRob2QsXG4gICAgICAgIGhlYWRlcnM6IGJvZHkgPyB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSA6IHVuZGVmaW5lZCxcbiAgICAgICAgYm9keTogYm9keSA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogdW5kZWZpbmVkLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwXzAwMCksXG4gICAgICB9KVxuICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IHJlcy50ZXh0KClcbiAgICAgIGxldCBwYXJzZWQ6IHVua25vd24gPSBudWxsXG4gICAgICB0cnkge1xuICAgICAgICBwYXJzZWQgPSB0ZXh0ID8gSlNPTi5wYXJzZSh0ZXh0KSA6IG51bGxcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBwYXJzZWQgPSB0ZXh0XG4gICAgICB9XG4gICAgICBpZiAoIXJlcy5vaykge1xuICAgICAgICBjb25zdCBkZXRhaWwgPVxuICAgICAgICAgIHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0JyAmJiAnZGV0YWlsJyBpbiBwYXJzZWRcbiAgICAgICAgICAgID8gU3RyaW5nKChwYXJzZWQgYXMgeyBkZXRhaWw6IHVua25vd24gfSkuZGV0YWlsKVxuICAgICAgICAgICAgOiBTdHJpbmcodGV4dCB8fCByZXMuc3RhdHVzVGV4dClcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGF0dXM6IHJlcy5zdGF0dXMsIG1lc3NhZ2U6IGRldGFpbCB9XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcGFyc2VkIGFzIFQgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGF0dXM6IDAsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjb25zdCBiYWNrZW5kID0gbmV3IEJhY2tlbmRDb250cm9sbGVyKClcbmV4cG9ydCB7IGRldGVjdFB5dGhvbiwgZGV0ZWN0UmVwb1Jvb3QgfVxuIiwiaW1wb3J0IHR5cGUgeyBTZWNyZXRJZCB9IGZyb20gJy4vdHlwZXMnXG5cbi8qKlxuICog5qih5Z6LIOKGkiDkvpvmh4nllYYgLyBiYXNlIFVSTCDnmoTlsI3mh4njgIJcbiAqIOiIhyBmcm9udGVuZC9saWIvYXBpLWhlbHBlcnMudHMg5L+d5oyB5LiA6Ie077yM6YG/5YWN5YWp6YKK6KGM54K65YiG5q2n44CCXG4gKi9cblxuZXhwb3J0IGludGVyZmFjZSBQcm92aWRlckluZm8ge1xuICBpZDogU2VjcmV0SWRcbiAgbGFiZWw6IHN0cmluZ1xuICBiYXNlVXJsOiBzdHJpbmdcbiAgLyoqIOWPluW+l+mHkemRsOeahOiqquaYjumggSAqL1xuICBkb2NzVXJsOiBzdHJpbmdcbiAgLyoqIOmHkemRsOW4uOimi+WJjee2tO+8jOeUqOaWvOWfuuacrOagvOW8j+aqouafpSAqL1xuICBwcmVmaXg/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGNvbnN0IFBST1ZJREVSUzogUmVjb3JkPFNlY3JldElkLCBQcm92aWRlckluZm8+ID0ge1xuICBhbnRocm9waWM6IHtcbiAgICBpZDogJ2FudGhyb3BpYycsXG4gICAgbGFiZWw6ICdBbnRocm9waWMnLFxuICAgIGJhc2VVcmw6ICdodHRwczovL2FwaS5hbnRocm9waWMuY29tL3YxJyxcbiAgICBkb2NzVXJsOiAnaHR0cHM6Ly9jb25zb2xlLmFudGhyb3BpYy5jb20vc2V0dGluZ3Mva2V5cycsXG4gICAgcHJlZml4OiAnc2stYW50LScsXG4gIH0sXG4gIG9wZW5haToge1xuICAgIGlkOiAnb3BlbmFpJyxcbiAgICBsYWJlbDogJ09wZW5BSScsXG4gICAgYmFzZVVybDogJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEnLFxuICAgIGRvY3NVcmw6ICdodHRwczovL3BsYXRmb3JtLm9wZW5haS5jb20vYXBpLWtleXMnLFxuICAgIHByZWZpeDogJ3NrLScsXG4gIH0sXG4gIGdvb2dsZToge1xuICAgIGlkOiAnZ29vZ2xlJyxcbiAgICBsYWJlbDogJ0dvb2dsZSBHZW1pbmknLFxuICAgIGJhc2VVcmw6ICdodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGEvb3BlbmFpJyxcbiAgICBkb2NzVXJsOiAnaHR0cHM6Ly9haXN0dWRpby5nb29nbGUuY29tL2FwaWtleScsXG4gICAgcHJlZml4OiAnQUl6YScsXG4gIH0sXG4gIHhhaToge1xuICAgIGlkOiAneGFpJyxcbiAgICBsYWJlbDogJ3hBSSBHcm9rJyxcbiAgICBiYXNlVXJsOiAnaHR0cHM6Ly9hcGkueC5haS92MScsXG4gICAgZG9jc1VybDogJ2h0dHBzOi8vY29uc29sZS54LmFpJyxcbiAgICBwcmVmaXg6ICd4YWktJyxcbiAgfSxcbiAgZGVlcHNlZWs6IHtcbiAgICBpZDogJ2RlZXBzZWVrJyxcbiAgICBsYWJlbDogJ0RlZXBTZWVrJyxcbiAgICBiYXNlVXJsOiAnaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tL3YxJyxcbiAgICBkb2NzVXJsOiAnaHR0cHM6Ly9wbGF0Zm9ybS5kZWVwc2Vlay5jb20vYXBpX2tleXMnLFxuICAgIHByZWZpeDogJ3NrLScsXG4gIH0sXG4gIHF3ZW46IHtcbiAgICBpZDogJ3F3ZW4nLFxuICAgIGxhYmVsOiAnUXdlbu+8iOmYv+mHjOmbsu+8iScsXG4gICAgYmFzZVVybDogJ2h0dHBzOi8vZGFzaHNjb3BlLWludGwuYWxpeXVuY3MuY29tL2NvbXBhdGlibGUtbW9kZS92MScsXG4gICAgZG9jc1VybDogJ2h0dHBzOi8vZGFzaHNjb3BlLmNvbnNvbGUuYWxpeXVuLmNvbScsXG4gIH0sXG4gIGN1c3RvbToge1xuICAgIGlkOiAnY3VzdG9tJyxcbiAgICBsYWJlbDogJ+iHquiogu+8iE9wZW5BSSDnm7jlrrnvvIknLFxuICAgIGJhc2VVcmw6ICcnLFxuICAgIGRvY3NVcmw6ICcnLFxuICB9LFxuICBhbHBoYXZhbnRhZ2U6IHtcbiAgICBpZDogJ2FscGhhdmFudGFnZScsXG4gICAgbGFiZWw6ICdBbHBoYSBWYW50YWdlJyxcbiAgICBiYXNlVXJsOiAnJyxcbiAgICBkb2NzVXJsOiAnaHR0cHM6Ly93d3cuYWxwaGF2YW50YWdlLmNvL3N1cHBvcnQvI2FwaS1rZXknLFxuICB9LFxuICBmaW5taW5kOiB7XG4gICAgaWQ6ICdmaW5taW5kJyxcbiAgICBsYWJlbDogJ0Zpbk1pbmQnLFxuICAgIGJhc2VVcmw6ICcnLFxuICAgIGRvY3NVcmw6ICdodHRwczovL2Zpbm1pbmR0cmFkZS5jb20vYW5hbHlzaXMvIy9hY2NvdW50L2xvZ2luJyxcbiAgfSxcbn1cblxuLyoqIExMTSDkvpvmh4nllYbvvIjmnIPlh7rnj77lnKjmqKHlnovpgbjllq7vvInvvIzkuI3lkKvntJTos4fmlpnkvobmupDjgIJjdXN0b20g5pS+5pyA5b6M44CCICovXG5leHBvcnQgY29uc3QgTExNX1BST1ZJREVSUzogU2VjcmV0SWRbXSA9IFtcbiAgJ2FudGhyb3BpYycsXG4gICdvcGVuYWknLFxuICAnZ29vZ2xlJyxcbiAgJ3hhaScsXG4gICdkZWVwc2VlaycsXG4gICdxd2VuJyxcbiAgJ2N1c3RvbScsXG5dXG5leHBvcnQgY29uc3QgREFUQV9QUk9WSURFUlM6IFNlY3JldElkW10gPSBbJ2FscGhhdmFudGFnZScsICdmaW5taW5kJ11cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3ZpZGVyRm9yTW9kZWwobW9kZWw6IHN0cmluZyk6IFNlY3JldElkIHtcbiAgaWYgKG1vZGVsID09PSAnY3VzdG9tJykgcmV0dXJuICdjdXN0b20nXG4gIGlmIChtb2RlbC5zdGFydHNXaXRoKCdjbGF1ZGUtJykpIHJldHVybiAnYW50aHJvcGljJ1xuICBpZiAobW9kZWwuc3RhcnRzV2l0aCgnZ3B0LScpKSByZXR1cm4gJ29wZW5haSdcbiAgaWYgKG1vZGVsLnN0YXJ0c1dpdGgoJ2dlbWluaS0nKSkgcmV0dXJuICdnb29nbGUnXG4gIGlmIChtb2RlbC5zdGFydHNXaXRoKCdncm9rLScpKSByZXR1cm4gJ3hhaSdcbiAgaWYgKG1vZGVsLnN0YXJ0c1dpdGgoJ2RlZXBzZWVrLScpKSByZXR1cm4gJ2RlZXBzZWVrJ1xuICBpZiAobW9kZWwuc3RhcnRzV2l0aCgncXdlbicpKSByZXR1cm4gJ3F3ZW4nXG4gIHJldHVybiAnb3BlbmFpJ1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmFzZVVybEZvck1vZGVsKG1vZGVsOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gUFJPVklERVJTW3Byb3ZpZGVyRm9yTW9kZWwobW9kZWwpXS5iYXNlVXJsXG59XG5cbi8qKlxuICog57Wm5qih5Z6L6YG45Zau55So55qE5YiG57WE5riF5Zau44CCXG4gKiDoiIfpm7Lnq6/niYggZnJvbnRlbmQvbGliL3JlcG9ydC11dGlscy50cyDnmoQgTU9ERUxfRElTUExBWV9OQU1FUyDlrozlhajlsI3pvYrvvIxcbiAqIOmghuW6j+S5n+avlOeFpyBBbmFseXNpc0Zvcm0g55qE5LiL5ouJ44CCXG4gKi9cbmV4cG9ydCBjb25zdCBNT0RFTF9HUk9VUFM6IHsgcHJvdmlkZXI6IFNlY3JldElkOyBtb2RlbHM6IHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9W10gfVtdID0gW1xuICB7XG4gICAgcHJvdmlkZXI6ICdvcGVuYWknLFxuICAgIG1vZGVsczogW1xuICAgICAgeyBpZDogJ2dwdC01LjYtc29sJywgbGFiZWw6ICdHUFQtNS42IFNvbCcgfSxcbiAgICAgIHsgaWQ6ICdncHQtNS42LXRlcnJhJywgbGFiZWw6ICdHUFQtNS42IFRlcnJhJyB9LFxuICAgICAgeyBpZDogJ2dwdC01LjYtbHVuYScsIGxhYmVsOiAnR1BULTUuNiBMdW5hJyB9LFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBwcm92aWRlcjogJ2FudGhyb3BpYycsXG4gICAgbW9kZWxzOiBbXG4gICAgICB7IGlkOiAnY2xhdWRlLWZhYmxlLTUnLCBsYWJlbDogJ0NsYXVkZSBGYWJsZSA1JyB9LFxuICAgICAgeyBpZDogJ2NsYXVkZS1vcHVzLTUnLCBsYWJlbDogJ0NsYXVkZSBPcHVzIDUnIH0sXG4gICAgICB7IGlkOiAnY2xhdWRlLXNvbm5ldC01JywgbGFiZWw6ICdDbGF1ZGUgU29ubmV0IDUnIH0sXG4gICAgICB7IGlkOiAnY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMScsIGxhYmVsOiAnQ2xhdWRlIEhhaWt1IDQuNScgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgcHJvdmlkZXI6ICdnb29nbGUnLFxuICAgIG1vZGVsczogW1xuICAgICAgeyBpZDogJ2dlbWluaS0zLjYtZmxhc2gnLCBsYWJlbDogJ0dlbWluaSAzLjYgRmxhc2gnIH0sXG4gICAgICB7IGlkOiAnZ2VtaW5pLTMuNS1mbGFzaCcsIGxhYmVsOiAnR2VtaW5pIDMuNSBGbGFzaCcgfSxcbiAgICAgIHsgaWQ6ICdnZW1pbmktMy41LWZsYXNoLWxpdGUnLCBsYWJlbDogJ0dlbWluaSAzLjUgRmxhc2gtTGl0ZScgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgcHJvdmlkZXI6ICd4YWknLFxuICAgIG1vZGVsczogW1xuICAgICAgeyBpZDogJ2dyb2stNC41JywgbGFiZWw6ICdHcm9rIDQuNScgfSxcbiAgICAgIHsgaWQ6ICdncm9rLTQuMycsIGxhYmVsOiAnR3JvayA0LjMnIH0sXG4gICAgICB7IGlkOiAnZ3Jvay00LjIwLTAzMDktcmVhc29uaW5nJywgbGFiZWw6ICdHcm9rIDQuMjAnIH0sXG4gICAgICB7IGlkOiAnZ3Jvay00LjIwLTAzMDktbm9uLXJlYXNvbmluZycsIGxhYmVsOiAnR3JvayA0LjIwIChOb24tUmVhc29uaW5nKScgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgcHJvdmlkZXI6ICdkZWVwc2VlaycsXG4gICAgbW9kZWxzOiBbXG4gICAgICB7IGlkOiAnZGVlcHNlZWstdjQtcHJvJywgbGFiZWw6ICdEZWVwc2VlayBWNCBQcm8nIH0sXG4gICAgICB7IGlkOiAnZGVlcHNlZWstdjQtZmxhc2gnLCBsYWJlbDogJ0RlZXBzZWVrIFY0IEZsYXNoJyB9LFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBwcm92aWRlcjogJ3F3ZW4nLFxuICAgIG1vZGVsczogW1xuICAgICAgeyBpZDogJ3F3ZW4zLjctbWF4JywgbGFiZWw6ICdRd2VuMy43LU1heCcgfSxcbiAgICAgIHsgaWQ6ICdxd2VuMy43LXBsdXMnLCBsYWJlbDogJ1F3ZW4zLjctUGx1cycgfSxcbiAgICAgIHsgaWQ6ICdxd2VuMy41LWZsYXNoJywgbGFiZWw6ICdRd2VuMy41LUZsYXNoJyB9LFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBwcm92aWRlcjogJ2N1c3RvbScsXG4gICAgbW9kZWxzOiBbeyBpZDogJ2N1c3RvbScsIGxhYmVsOiAn6Ieq6KiC5qih5Z6L4oCmJyB9XSxcbiAgfSxcbl1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGVsTGFiZWwoaWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGZvciAoY29uc3QgZyBvZiBNT0RFTF9HUk9VUFMpIHtcbiAgICBjb25zdCBtID0gZy5tb2RlbHMuZmluZCgoeCkgPT4geC5pZCA9PT0gaWQpXG4gICAgaWYgKG0pIHJldHVybiBtLmxhYmVsXG4gIH1cbiAgcmV0dXJuIGlkXG59XG5cbi8qKlxuICogRW1iZWRkaW5nIOaooeWei+OAguiIh+mbsuerr+eJiOS4gOiHtOOAglxuICogLSBsb2NhbDog5pys5qmf5qih5Z6L77yM5LiN6ZyA6YeR6ZGwXG4gKiAtIHByb3ZpZGVyOiDpnIDopoHlk6rlrrbnmoTph5HpkbDoiIcgYmFzZSBVUkzvvIhnZW1pbmkgZW1iZWRkaW5nIOi1sCBnb29nbGXvvIlcbiAqL1xuZXhwb3J0IGNvbnN0IEVNQkVERElOR19NT0RFTFM6IHtcbiAgaWQ6IHN0cmluZ1xuICBsYWJlbDogc3RyaW5nXG4gIGxvY2FsOiBib29sZWFuXG4gIHByb3ZpZGVyPzogU2VjcmV0SWRcbn1bXSA9IFtcbiAgeyBpZDogJ2FsbC1tcG5ldC1iYXNlLXYyJywgbGFiZWw6ICdhbGwtbXBuZXQtYmFzZS12MicsIGxvY2FsOiB0cnVlIH0sXG4gIHsgaWQ6ICd0ZXh0LWVtYmVkZGluZy0zLXNtYWxsJywgbGFiZWw6ICd0ZXh0LWVtYmVkZGluZy0zLXNtYWxsJywgbG9jYWw6IGZhbHNlLCBwcm92aWRlcjogJ29wZW5haScgfSxcbiAgeyBpZDogJ3RleHQtZW1iZWRkaW5nLTMtbGFyZ2UnLCBsYWJlbDogJ3RleHQtZW1iZWRkaW5nLTMtbGFyZ2UnLCBsb2NhbDogZmFsc2UsIHByb3ZpZGVyOiAnb3BlbmFpJyB9LFxuICB7IGlkOiAnZ2VtaW5pLWVtYmVkZGluZy0yJywgbGFiZWw6ICdnZW1pbmktZW1iZWRkaW5nLTInLCBsb2NhbDogZmFsc2UsIHByb3ZpZGVyOiAnZ29vZ2xlJyB9LFxuICB7IGlkOiAnZ2VtaW5pLWVtYmVkZGluZy0wMDEnLCBsYWJlbDogJ2dlbWluaS1lbWJlZGRpbmctMDAxJywgbG9jYWw6IGZhbHNlLCBwcm92aWRlcjogJ2dvb2dsZScgfSxcbiAgeyBpZDogJ2N1c3RvbScsIGxhYmVsOiAn6Ieq6KiCIGVtYmVkZGluZ+KApicsIGxvY2FsOiBmYWxzZSwgcHJvdmlkZXI6ICdjdXN0b20nIH0sXG5dXG5cbi8qKiDliKTmlrcgZW1iZWRkaW5nIOaooeWei+ipsueUqOWTquWutumHkemRsO+8m+acrOapn+aooeWei+WbniBudWxsICovXG5leHBvcnQgZnVuY3Rpb24gZW1iZWRkaW5nUHJvdmlkZXIobW9kZWxJZDogc3RyaW5nKTogU2VjcmV0SWQgfCBudWxsIHtcbiAgY29uc3QgbSA9IEVNQkVERElOR19NT0RFTFMuZmluZCgoZSkgPT4gZS5pZCA9PT0gbW9kZWxJZClcbiAgaWYgKCFtIHx8IG0ubG9jYWwpIHJldHVybiBudWxsXG4gIHJldHVybiBtLnByb3ZpZGVyID8/ICdvcGVuYWknXG59XG4iLCJpbXBvcnQgeyBhcHAsIHNhZmVTdG9yYWdlIH0gZnJvbSAnZWxlY3Ryb24nXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcydcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB0eXBlIHsgU2VjcmV0SWQsIFNlY3JldHNTdGF0ZSwgU2VjcmV0U3RhdHVzIH0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJ1xuaW1wb3J0IHsgUFJPVklERVJTIH0gZnJvbSAnLi4vc2hhcmVkL3Byb3ZpZGVycydcblxuLyoqXG4gKiBBUEkg6YeR6ZGw5YSy5a2Y44CCXG4gKlxuICog5L2/55So5L2c5qWt57O757Wx5bGk57Sa55qE5Yqg5a+G77yIbWFjT1Mg6ZGw5YyZ5ZyIIC8gV2luZG93cyBEUEFQSSAvIExpbnV4IGxpYnNlY3JldO+8ie+8jFxuICog5a+G5paH5a+r5ZyoIHVzZXJEYXRhL3NlY3JldHMuanNvbuOAguaYjuaWh+WPquWtmOWcqOaWvOS4u+ihjOeoi+iomOaGtumrlOS4reeahOefreaaq+iuiuaVuO+8jFxuICog5b6e5LiN57aT6YGOIElQQyDlgrPntabmuLLmn5PooYznqIsg4oCU4oCUIOa4suafk+ihjOeoi+WPquaLv+W+l+WIsOOAjOacieaykuacieioreWumuOAjeiIh+acq+Wbm+eivOOAglxuICovXG5cbmludGVyZmFjZSBTZWNyZXRSZWNvcmQge1xuICAvKiogYmFzZTY0IOS5i+W+jOeahOWvhuaWh++8m+iLpeezu+e1seS4jeaUr+aPtOWKoOWvhuWJh+eCuiBudWxsICovXG4gIGNpcGhlcjogc3RyaW5nIHwgbnVsbFxuICAvKiog57O757Wx5LiN5pSv5o+05Yqg5a+G5pmC55qE6YCA6Lev77yM5pyD5ZyoIFVJIOaYjueiuuitpuWRiiAqL1xuICBwbGFpbj86IHN0cmluZ1xuICBoaW50OiBzdHJpbmdcbiAgdXBkYXRlZEF0OiBzdHJpbmdcbn1cblxudHlwZSBTZWNyZXRzRmlsZSA9IFJlY29yZDxzdHJpbmcsIFNlY3JldFJlY29yZD5cblxuY29uc3QgZmlsZSA9ICgpID0+IHBhdGguam9pbihhcHAuZ2V0UGF0aCgndXNlckRhdGEnKSwgJ3NlY3JldHMuanNvbicpXG5cbmxldCBjYWNoZTogU2VjcmV0c0ZpbGUgfCBudWxsID0gbnVsbFxuXG5mdW5jdGlvbiByZWFkKCk6IFNlY3JldHNGaWxlIHtcbiAgaWYgKGNhY2hlKSByZXR1cm4gY2FjaGVcbiAgdHJ5IHtcbiAgICBjYWNoZSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGZpbGUoKSwgJ3V0ZjgnKSkgYXMgU2VjcmV0c0ZpbGVcbiAgfSBjYXRjaCB7XG4gICAgY2FjaGUgPSB7fVxuICB9XG4gIHJldHVybiBjYWNoZVxufVxuXG5mdW5jdGlvbiB3cml0ZShkYXRhOiBTZWNyZXRzRmlsZSkge1xuICBjYWNoZSA9IGRhdGFcbiAgZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShmaWxlKCkpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICBmcy53cml0ZUZpbGVTeW5jKGZpbGUoKSwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMiksIHsgZW5jb2Rpbmc6ICd1dGY4JywgbW9kZTogMG82MDAgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuY3J5cHRpb25BdmFpbGFibGUoKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHNhZmVTdG9yYWdlLmlzRW5jcnlwdGlvbkF2YWlsYWJsZSgpXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRTZWNyZXQoaWQ6IFNlY3JldElkLCB2YWx1ZTogc3RyaW5nKSB7XG4gIGNvbnN0IGRhdGEgPSByZWFkKClcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKVxuICBpZiAoIXRyaW1tZWQpIHtcbiAgICBkZWxldGUgZGF0YVtpZF1cbiAgICB3cml0ZShkYXRhKVxuICAgIHJldHVyblxuICB9XG4gIGNvbnN0IGhpbnQgPSB0cmltbWVkLnNsaWNlKC00KVxuICBjb25zdCB1cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgaWYgKGVuY3J5cHRpb25BdmFpbGFibGUoKSkge1xuICAgIGRhdGFbaWRdID0geyBjaXBoZXI6IHNhZmVTdG9yYWdlLmVuY3J5cHRTdHJpbmcodHJpbW1lZCkudG9TdHJpbmcoJ2Jhc2U2NCcpLCBoaW50LCB1cGRhdGVkQXQgfVxuICB9IGVsc2Uge1xuICAgIC8vIOaykuacieezu+e1semRsOWMmeWciOWPr+eUqOaZguS7jeimgeiDvemBi+S9nO+8jOS9huWcqCBVSSDkuIrmnIPmqJnnpLrngrrmnKrliqDlr4ZcbiAgICBkYXRhW2lkXSA9IHsgY2lwaGVyOiBudWxsLCBwbGFpbjogdHJpbW1lZCwgaGludCwgdXBkYXRlZEF0IH1cbiAgfVxuICB3cml0ZShkYXRhKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlU2VjcmV0KGlkOiBTZWNyZXRJZCkge1xuICBjb25zdCBkYXRhID0gcmVhZCgpXG4gIGRlbGV0ZSBkYXRhW2lkXVxuICB3cml0ZShkYXRhKVxufVxuXG4vKiog5YOF5L6b5Li76KGM56iL5YWn6YOo5L2/55So77yM57WV5LiN57aT55SxIElQQyDlm57lgrMgKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZWNyZXQoaWQ6IFNlY3JldElkKTogc3RyaW5nIHtcbiAgY29uc3QgcmVjID0gcmVhZCgpW2lkXVxuICBpZiAoIXJlYykgcmV0dXJuICcnXG4gIGlmIChyZWMuY2lwaGVyKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBzYWZlU3RvcmFnZS5kZWNyeXB0U3RyaW5nKEJ1ZmZlci5mcm9tKHJlYy5jaXBoZXIsICdiYXNlNjQnKSlcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiAnJ1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVjLnBsYWluID8/ICcnXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZWNyZXRzU3RhdGUoKTogU2VjcmV0c1N0YXRlIHtcbiAgY29uc3QgZGF0YSA9IHJlYWQoKVxuICBjb25zdCBpdGVtczogU2VjcmV0U3RhdHVzW10gPSAoT2JqZWN0LmtleXMoUFJPVklERVJTKSBhcyBTZWNyZXRJZFtdKS5tYXAoKGlkKSA9PiB7XG4gICAgY29uc3QgcmVjID0gZGF0YVtpZF1cbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBpc1NldDogQm9vbGVhbihyZWMpLFxuICAgICAgaGludDogcmVjPy5oaW50ID8/ICcnLFxuICAgICAgdXBkYXRlZEF0OiByZWM/LnVwZGF0ZWRBdCA/PyBudWxsLFxuICAgIH1cbiAgfSlcbiAgcmV0dXJuIHsgZW5jcnlwdGlvbkF2YWlsYWJsZTogZW5jcnlwdGlvbkF2YWlsYWJsZSgpLCBpdGVtcyB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckFsbFNlY3JldHMoKSB7XG4gIHdyaXRlKHt9KVxufVxuIiwiaW1wb3J0IHsgQnJvd3NlcldpbmRvdywgYXBwLCBkaWFsb2csIGlwY01haW4sIG5hdGl2ZVRoZW1lLCBzaGVsbCB9IGZyb20gJ2VsZWN0cm9uJ1xuaW1wb3J0IGZzIGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnXG5pbXBvcnQgdHlwZSB7XG4gIEFwcEluZm8sXG4gIFNlY3JldElkLFxuICBTZXR0aW5ncyxcbiAgU3RhcnRBbmFseXNpc0lucHV0LFxuICBTdG9yZWRSZXBvcnQsXG4gIFRoZW1lUHJlZmVyZW5jZSxcbn0gZnJvbSAnLi4vc2hhcmVkL3R5cGVzJ1xuaW1wb3J0IHsgUFJPVklERVJTLCBiYXNlVXJsRm9yTW9kZWwsIGVtYmVkZGluZ1Byb3ZpZGVyLCBwcm92aWRlckZvck1vZGVsIH0gZnJvbSAnLi4vc2hhcmVkL3Byb3ZpZGVycydcbmltcG9ydCB7IGJhY2tlbmQsIGRldGVjdFB5dGhvbiwgZGV0ZWN0UmVwb1Jvb3QgfSBmcm9tICcuL2JhY2tlbmQnXG5pbXBvcnQgKiBhcyBzdG9yZSBmcm9tICcuL3N0b3JlJ1xuaW1wb3J0ICogYXMgc2VjcmV0cyBmcm9tICcuL3NlY3JldHMnXG5cbmZ1bmN0aW9uIHdpbigpOiBCcm93c2VyV2luZG93IHwgbnVsbCB7XG4gIHJldHVybiBCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKVswXSA/PyBudWxsXG59XG5cbmZ1bmN0aW9uIGJyb2FkY2FzdChjaGFubmVsOiBzdHJpbmcsIHBheWxvYWQ6IHVua25vd24pIHtcbiAgZm9yIChjb25zdCB3IG9mIEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgaWYgKCF3LmlzRGVzdHJveWVkKCkpIHcud2ViQ29udGVudHMuc2VuZChjaGFubmVsLCBwYXlsb2FkKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVRoZW1lKHByZWY6IFRoZW1lUHJlZmVyZW5jZSkge1xuICBuYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9IHByZWZcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVySXBjKCkge1xuICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGFwcCAvIOimlueqlyAqL1xuXG4gIGlwY01haW4uaGFuZGxlKCdhcHA6aW5mbycsICgpOiBBcHBJbmZvID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgYXBwVmVyc2lvbjogYXBwLmdldFZlcnNpb24oKSxcbiAgICAgIGVsZWN0cm9uOiBwcm9jZXNzLnZlcnNpb25zLmVsZWN0cm9uLFxuICAgICAgY2hyb21lOiBwcm9jZXNzLnZlcnNpb25zLmNocm9tZSxcbiAgICAgIG5vZGU6IHByb2Nlc3MudmVyc2lvbnMubm9kZSxcbiAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgdXNlckRhdGFQYXRoOiBhcHAuZ2V0UGF0aCgndXNlckRhdGEnKSxcbiAgICAgIHJlcG9ydHNEaXI6IHN0b3JlLnJlYWRTZXR0aW5ncygpLnJlcG9ydHNEaXIsXG4gICAgICBpc1BhY2thZ2VkOiBhcHAuaXNQYWNrYWdlZCxcbiAgICB9XG4gIH0pXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ3dpbjptaW5pbWl6ZScsICgpID0+IHdpbigpPy5taW5pbWl6ZSgpKVxuICBpcGNNYWluLmhhbmRsZSgnd2luOnRvZ2dsZU1heGltaXplJywgKCkgPT4ge1xuICAgIGNvbnN0IHcgPSB3aW4oKVxuICAgIGlmICghdykgcmV0dXJuIGZhbHNlXG4gICAgaWYgKHcuaXNNYXhpbWl6ZWQoKSkgdy51bm1heGltaXplKClcbiAgICBlbHNlIHcubWF4aW1pemUoKVxuICAgIHJldHVybiB3LmlzTWF4aW1pemVkKClcbiAgfSlcbiAgaXBjTWFpbi5oYW5kbGUoJ3dpbjpjbG9zZScsICgpID0+IHdpbigpPy5jbG9zZSgpKVxuICBpcGNNYWluLmhhbmRsZSgnd2luOmlzTWF4aW1pemVkJywgKCkgPT4gd2luKCk/LmlzTWF4aW1pemVkKCkgPz8gZmFsc2UpXG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIOioreWumiAqL1xuXG4gIGlwY01haW4uaGFuZGxlKCdzZXR0aW5nczpnZXQnLCAoKTogU2V0dGluZ3MgPT4gc3RvcmUucmVhZFNldHRpbmdzKCkpXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ3NldHRpbmdzOnNldCcsIChfZSwgcGF0Y2g6IFBhcnRpYWw8U2V0dGluZ3M+KTogU2V0dGluZ3MgPT4ge1xuICAgIGNvbnN0IG5leHQgPSBzdG9yZS53cml0ZVNldHRpbmdzKHBhdGNoKVxuICAgIGlmIChwYXRjaC50aGVtZSkgYXBwbHlUaGVtZShwYXRjaC50aGVtZSlcbiAgICByZXR1cm4gbmV4dFxuICB9KVxuXG4gIGlwY01haW4uaGFuZGxlKCdzZXR0aW5nczpzZWxlY3REaXInLCBhc3luYyAoX2UsIGN1cnJlbnQ/OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCB3ID0gd2luKClcbiAgICBpZiAoIXcpIHJldHVybiBudWxsXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHcsIHtcbiAgICAgIHByb3BlcnRpZXM6IFsnb3BlbkRpcmVjdG9yeScsICdjcmVhdGVEaXJlY3RvcnknXSxcbiAgICAgIGRlZmF1bHRQYXRoOiBjdXJyZW50LFxuICAgIH0pXG4gICAgcmV0dXJuIHJlcy5jYW5jZWxlZCA/IG51bGwgOiByZXMuZmlsZVBhdGhzWzBdXG4gIH0pXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ3NldHRpbmdzOnNlbGVjdEZpbGUnLCBhc3luYyAoX2UsIGN1cnJlbnQ/OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCB3ID0gd2luKClcbiAgICBpZiAoIXcpIHJldHVybiBudWxsXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHcsIHtcbiAgICAgIHByb3BlcnRpZXM6IFsnb3BlbkZpbGUnXSxcbiAgICAgIGRlZmF1bHRQYXRoOiBjdXJyZW50LFxuICAgIH0pXG4gICAgcmV0dXJuIHJlcy5jYW5jZWxlZCA/IG51bGwgOiByZXMuZmlsZVBhdGhzWzBdXG4gIH0pXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ3NldHRpbmdzOmRldGVjdCcsICgpID0+IHtcbiAgICBjb25zdCByZXBvUm9vdCA9IGRldGVjdFJlcG9Sb290KClcbiAgICByZXR1cm4ge1xuICAgICAgcmVwb1Jvb3QsXG4gICAgICBweXRob246IHJlcG9Sb290ID8gZGV0ZWN0UHl0aG9uKHJlcG9Sb290KSA6IG51bGwsXG4gICAgfVxuICB9KVxuXG4gIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSDph5HpkbAgKi9cblxuICBpcGNNYWluLmhhbmRsZSgnc2VjcmV0czpzdGF0ZScsICgpID0+IHNlY3JldHMuc2VjcmV0c1N0YXRlKCkpXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ3NlY3JldHM6c2V0JywgKF9lLCBpZDogU2VjcmV0SWQsIHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICBzZWNyZXRzLnNldFNlY3JldChpZCwgdmFsdWUpXG4gICAgcmV0dXJuIHNlY3JldHMuc2VjcmV0c1N0YXRlKClcbiAgfSlcblxuICBpcGNNYWluLmhhbmRsZSgnc2VjcmV0czpyZW1vdmUnLCAoX2UsIGlkOiBTZWNyZXRJZCkgPT4ge1xuICAgIHNlY3JldHMucmVtb3ZlU2VjcmV0KGlkKVxuICAgIHJldHVybiBzZWNyZXRzLnNlY3JldHNTdGF0ZSgpXG4gIH0pXG5cbiAgLyoqXG4gICAqIOebtOaOpeWQkeS+m+aHieWVhueZvOS4gOasoeacgOWwj+aIkOacrOeahOiri+axguS+humpl+itiemHkemRsOOAglxuICAgKiDph5HpkbDkuI3mnIPpm6LplovkuLvooYznqIsg4oCU4oCUIOa4suafk+ihjOeoi+WPquaLv+W+l+WIsOaIkOWKn++8j+WkseaVl+OAglxuICAgKi9cbiAgaXBjTWFpbi5oYW5kbGUoJ3NlY3JldHM6dmVyaWZ5JywgYXN5bmMgKF9lLCBpZDogU2VjcmV0SWQpID0+IHtcbiAgICBjb25zdCBrZXkgPSBzZWNyZXRzLmdldFNlY3JldChpZClcbiAgICBpZiAoIWtleSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiAn5bCa5pyq6Kit5a6a6YeR6ZGwJyB9XG4gICAgdHJ5IHtcbiAgICAgIGlmIChpZCA9PT0gJ2N1c3RvbScpIHtcbiAgICAgICAgLy8g6Ieq6KiC56uv6bue55qEIGJhc2UgVVJMIOWcqOWVn+WLleWIhuaekOaZguaJjeefpemBk++8jOmAmeijoeWPqueiuuiqjemHkemRsOW3suWtmFxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgbWVzc2FnZTogJ+W3suWEsuWtmO+8iOiHquioguerr+m7nuaWvOWIhuaekOaZgumAo+e3mu+8jOeEoeazlemgkOWFiOmpl+itie+8iScgfVxuICAgICAgfVxuICAgICAgaWYgKGlkID09PSAnYW50aHJvcGljJykge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbS92MS9tb2RlbHM/bGltaXQ9MScsIHtcbiAgICAgICAgICBoZWFkZXJzOiB7ICd4LWFwaS1rZXknOiBrZXksICdhbnRocm9waWMtdmVyc2lvbic6ICcyMDIzLTA2LTAxJyB9LFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMl8wMDApLFxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gcmVzLm9rXG4gICAgICAgICAgPyB7IG9rOiB0cnVlLCBtZXNzYWdlOiAn6amX6K2J5oiQ5YqfJyB9XG4gICAgICAgICAgOiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogYOmpl+itieWkseaVl++8iEhUVFAgJHtyZXMuc3RhdHVzfe+8iWAgfVxuICAgICAgfVxuICAgICAgaWYgKGlkID09PSAnYWxwaGF2YW50YWdlJykge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcbiAgICAgICAgICBgaHR0cHM6Ly93d3cuYWxwaGF2YW50YWdlLmNvL3F1ZXJ5P2Z1bmN0aW9uPUdMT0JBTF9RVU9URSZzeW1ib2w9SUJNJmFwaWtleT0ke2VuY29kZVVSSUNvbXBvbmVudChrZXkpfWAsXG4gICAgICAgICAgeyBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTJfMDAwKSB9LFxuICAgICAgICApXG4gICAgICAgIGNvbnN0IGJvZHkgPSAoYXdhaXQgcmVzLmpzb24oKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICAgICAgaWYgKCdFcnJvciBNZXNzYWdlJyBpbiBib2R5IHx8ICdJbmZvcm1hdGlvbicgaW4gYm9keSkge1xuICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogU3RyaW5nKGJvZHlbJ0Vycm9yIE1lc3NhZ2UnXSA/PyBib2R5WydJbmZvcm1hdGlvbiddKSB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIG1lc3NhZ2U6ICfpqZforYnmiJDlip8nIH1cbiAgICAgIH1cbiAgICAgIGlmIChpZCA9PT0gJ2Zpbm1pbmQnKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKFxuICAgICAgICAgIGBodHRwczovL2FwaS5maW5taW5kdHJhZGUuY29tL2FwaS92NC9kYXRhP2RhdGFzZXQ9VGFpd2FuU3RvY2tJbmZvJnRva2VuPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGtleSl9YCxcbiAgICAgICAgICB7IHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMl8wMDApIH0sXG4gICAgICAgIClcbiAgICAgICAgcmV0dXJuIHJlcy5va1xuICAgICAgICAgID8geyBvazogdHJ1ZSwgbWVzc2FnZTogJ+mpl+itieaIkOWKnycgfVxuICAgICAgICAgIDogeyBvazogZmFsc2UsIG1lc3NhZ2U6IGDpqZforYnlpLHmlZfvvIhIVFRQICR7cmVzLnN0YXR1c33vvIlgIH1cbiAgICAgIH1cbiAgICAgIC8vIOWFtumkmOS+m+aHieWVhueahuebuOWuuSBPcGVuQUkg55qEIC9tb2RlbHNcbiAgICAgIGNvbnN0IGJhc2UgPSBQUk9WSURFUlNbaWRdLmJhc2VVcmxcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGAke2Jhc2V9L21vZGVsc2AsIHtcbiAgICAgICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7a2V5fWAgfSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEyXzAwMCksXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHJlcy5va1xuICAgICAgICA/IHsgb2s6IHRydWUsIG1lc3NhZ2U6ICfpqZforYnmiJDlip8nIH1cbiAgICAgICAgOiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogYOmpl+itieWkseaVl++8iEhUVFAgJHtyZXMuc3RhdHVzfe+8iWAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikgfVxuICAgIH1cbiAgfSlcblxuICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g5b6M56uvICovXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ2JhY2tlbmQ6c3RhdHVzJywgKCkgPT4gYmFja2VuZC5nZXRTdGF0dXMoKSlcbiAgaXBjTWFpbi5oYW5kbGUoJ2JhY2tlbmQ6bG9ncycsICgpID0+IGJhY2tlbmQuZ2V0TG9ncygpKVxuICBpcGNNYWluLmhhbmRsZSgnYmFja2VuZDpyZXN0YXJ0JywgKCkgPT4gYmFja2VuZC5zdGFydCgpKVxuICBpcGNNYWluLmhhbmRsZSgnYmFja2VuZDpzdG9wJywgKCkgPT4gYmFja2VuZC5zdG9wKCkpXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ2JhY2tlbmQ6Z2V0JywgKF9lLCBhcGlQYXRoOiBzdHJpbmcpID0+IGJhY2tlbmQucmVxdWVzdCgnR0VUJywgYXBpUGF0aCkpXG4gIGlwY01haW4uaGFuZGxlKCdiYWNrZW5kOmRlbGV0ZScsIChfZSwgYXBpUGF0aDogc3RyaW5nKSA9PiBiYWNrZW5kLnJlcXVlc3QoJ0RFTEVURScsIGFwaVBhdGgpKVxuXG4gIGJhY2tlbmQub24oJ3N0YXR1cycsIChzKSA9PiBicm9hZGNhc3QoJ2JhY2tlbmQ6c3RhdHVzJywgcykpXG4gIGJhY2tlbmQub24oJ2xvZycsIChsKSA9PiBicm9hZGNhc3QoJ2JhY2tlbmQ6bG9nJywgbCkpXG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIOWIhuaekCAqL1xuXG4gIC8qKlxuICAgKiDllZ/li5XliIbmnpDjgILph5HpkbDnlLHkuLvooYznqIvlnKjmraTms6jlhaUg4oCU4oCUIOa4suafk+ihjOeoi+W+numgreWIsOWwvuaLv+S4jeWIsOaYjuaWh+OAglxuICAgKi9cbiAgaXBjTWFpbi5oYW5kbGUoJ2FuYWx5c2lzOnN0YXJ0JywgYXN5bmMgKF9lLCBpbnB1dDogU3RhcnRBbmFseXNpc0lucHV0KSA9PiB7XG4gICAgLy8gJ2N1c3RvbScg5qih5Z6L77ya5a+m6Zqb5qih5Z6L5ZCN56ix44CBYmFzZSBVUkwg55Sx6Kit5a6a5bi25YWl77yM6YeR6ZGw55SoICdjdXN0b20nIOmAmeaKilxuICAgIGNvbnN0IGlzRGVlcEN1c3RvbSA9IGlucHV0LmRlZXBUaGlua0xsbSA9PT0gJ2N1c3RvbSdcbiAgICBjb25zdCBpc1F1aWNrQ3VzdG9tID0gaW5wdXQucXVpY2tUaGlua0xsbSA9PT0gJ2N1c3RvbSdcbiAgICBjb25zdCBpc0VtYmVkQ3VzdG9tID0gaW5wdXQuZW1iZWRkaW5nTW9kZWwgPT09ICdjdXN0b20nXG5cbiAgICBjb25zdCBkZWVwTW9kZWwgPSBpc0RlZXBDdXN0b20gPyAoaW5wdXQuY3VzdG9tRGVlcE1vZGVsID8/ICcnKS50cmltKCkgOiBpbnB1dC5kZWVwVGhpbmtMbG1cbiAgICBjb25zdCBxdWlja01vZGVsID0gaXNRdWlja0N1c3RvbSA/IChpbnB1dC5jdXN0b21RdWlja01vZGVsID8/ICcnKS50cmltKCkgOiBpbnB1dC5xdWlja1RoaW5rTGxtXG4gICAgY29uc3QgZW1iZWRNb2RlbCA9IGlzRW1iZWRDdXN0b20gPyAoaW5wdXQuY3VzdG9tRW1iZWRkaW5nTW9kZWwgPz8gJycpLnRyaW0oKSA6IGlucHV0LmVtYmVkZGluZ01vZGVsXG4gICAgY29uc3QgY3VzdG9tQmFzZVVybCA9IChpbnB1dC5jdXN0b21CYXNlVXJsID8/ICcnKS50cmltKClcblxuICAgIGNvbnN0IGRlZXBQcm92aWRlciA9IHByb3ZpZGVyRm9yTW9kZWwoaW5wdXQuZGVlcFRoaW5rTGxtKVxuICAgIGNvbnN0IHF1aWNrUHJvdmlkZXIgPSBwcm92aWRlckZvck1vZGVsKGlucHV0LnF1aWNrVGhpbmtMbG0pXG5cbiAgICBjb25zdCBkZWVwS2V5ID0gc2VjcmV0cy5nZXRTZWNyZXQoZGVlcFByb3ZpZGVyKVxuICAgIGNvbnN0IHF1aWNrS2V5ID0gc2VjcmV0cy5nZXRTZWNyZXQocXVpY2tQcm92aWRlcilcblxuICAgIGNvbnN0IG1pc3Npbmc6IHN0cmluZ1tdID0gW11cbiAgICBpZiAoIWRlZXBLZXkpIG1pc3NpbmcucHVzaChQUk9WSURFUlNbZGVlcFByb3ZpZGVyXS5sYWJlbClcbiAgICBpZiAoIXF1aWNrS2V5ICYmIHF1aWNrUHJvdmlkZXIgIT09IGRlZXBQcm92aWRlcikgbWlzc2luZy5wdXNoKFBST1ZJREVSU1txdWlja1Byb3ZpZGVyXS5sYWJlbClcblxuICAgIC8vIGN1c3RvbSDmqKHlnovvvJrpnIDopoHmqKHlnovlkI3nqLHvvIjmraTpoIHvvInoiIflhbHnlKggYmFzZSBVUkzvvIjoqK3lrprpoIHvvIlcbiAgICBjb25zdCB1c2luZ0N1c3RvbSA9IGlzRGVlcEN1c3RvbSB8fCBpc1F1aWNrQ3VzdG9tIHx8IGlzRW1iZWRDdXN0b21cbiAgICBjb25zdCBtaXNzaW5nTW9kZWw6IHN0cmluZ1tdID0gW11cbiAgICBpZiAoaXNEZWVwQ3VzdG9tICYmICFkZWVwTW9kZWwpIG1pc3NpbmdNb2RlbC5wdXNoKCfmt7HluqbmgJ3ogIMnKVxuICAgIGlmIChpc1F1aWNrQ3VzdG9tICYmICFxdWlja01vZGVsKSBtaXNzaW5nTW9kZWwucHVzaCgn5b+r6YCf5oCd6ICDJylcbiAgICBpZiAoaXNFbWJlZEN1c3RvbSAmJiAhZW1iZWRNb2RlbCkgbWlzc2luZ01vZGVsLnB1c2goJ0VtYmVkZGluZycpXG5cbiAgICAvLyBlbWJlZGRpbmcg5L6d5qih5Z6L5rG65a6a6KaB55So5ZOq5a626YeR6ZGw77yIZ2VtaW5pIGVtYmVkZGluZyDotbAgZ29vZ2xl77yMY3VzdG9tIOi1sCBjdXN0b23vvIzlhbbppJjotbAgb3BlbmFp77yJXG4gICAgY29uc3QgZW1iUHJvdmlkZXIgPSBlbWJlZGRpbmdQcm92aWRlcihpbnB1dC5lbWJlZGRpbmdNb2RlbClcbiAgICBjb25zdCBlbWJlZGRpbmdLZXkgPSBlbWJQcm92aWRlciA/IHNlY3JldHMuZ2V0U2VjcmV0KGVtYlByb3ZpZGVyKSA6ICcnXG4gICAgY29uc3QgZW1iZWRkaW5nQmFzZVVybCA9IGlzRW1iZWRDdXN0b21cbiAgICAgID8gY3VzdG9tQmFzZVVybFxuICAgICAgOiBlbWJQcm92aWRlclxuICAgICAgICA/IFBST1ZJREVSU1tlbWJQcm92aWRlcl0uYmFzZVVybFxuICAgICAgICA6IFBST1ZJREVSUy5vcGVuYWkuYmFzZVVybFxuICAgIGlmIChlbWJQcm92aWRlciAmJiAhZW1iZWRkaW5nS2V5KSB7XG4gICAgICBtaXNzaW5nLnB1c2goYCR7UFJPVklERVJTW2VtYlByb3ZpZGVyXS5sYWJlbH3vvIhlbWJlZGRpbmcg55So77yJYClcbiAgICB9XG5cbiAgICBpZiAobWlzc2luZ01vZGVsLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlIGFzIGNvbnN0LFxuICAgICAgICBzdGF0dXM6IDAsXG4gICAgICAgIG1lc3NhZ2U6IGDoh6roqILmqKHlnovpnIDopoHloavlr6vmqKHlnovlkI3nqLHvvJoke21pc3NpbmdNb2RlbC5qb2luKCfjgIEnKX3jgIJgLFxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodXNpbmdDdXN0b20gJiYgIWN1c3RvbUJhc2VVcmwpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSBhcyBjb25zdCxcbiAgICAgICAgc3RhdHVzOiAwLFxuICAgICAgICBtZXNzYWdlOiAn5L2/55So6Ieq6KiC5qih5Z6L5YmN77yM6KuL5YWI5Yiw44CM6Kit5a6aIOKGkiDoh6roqILvvIhPcGVuQUkg55u45a6577yJ44CN5aGr5a+rIGJhc2UgVVJM44CCJyxcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWlzc2luZy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSBhcyBjb25zdCxcbiAgICAgICAgc3RhdHVzOiAwLFxuICAgICAgICBtZXNzYWdlOiBg57y65bCRIEFQSSDph5HpkbDvvJoke1suLi5uZXcgU2V0KG1pc3NpbmcpXS5qb2luKCfjgIEnKX3jgILoq4vlhYjliLDjgIzoqK3lrprjgI3mlrDlop7jgIJgLFxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICB0aWNrZXI6IGlucHV0LnRpY2tlcixcbiAgICAgIGFuYWx5c2lzX2RhdGU6IGlucHV0LmFuYWx5c2lzRGF0ZSxcbiAgICAgIGFuYWx5c3RzOiBpbnB1dC5hbmFseXN0cyxcbiAgICAgIHJlc2VhcmNoX2RlcHRoOiBpbnB1dC5yZXNlYXJjaERlcHRoLFxuICAgICAgbWFya2V0X3R5cGU6IGlucHV0Lm1hcmtldFR5cGUsXG4gICAgICBsYW5ndWFnZTogaW5wdXQubGFuZ3VhZ2UsXG5cbiAgICAgIGRlZXBfdGhpbmtfbGxtOiBkZWVwTW9kZWwsXG4gICAgICBxdWlja190aGlua19sbG06IHF1aWNrTW9kZWwsXG4gICAgICBkZWVwX3RoaW5rX2FwaV9rZXk6IGRlZXBLZXksXG4gICAgICBxdWlja190aGlua19hcGlfa2V5OiBxdWlja0tleSB8fCBkZWVwS2V5LFxuICAgICAgZGVlcF90aGlua19iYXNlX3VybDogaXNEZWVwQ3VzdG9tID8gY3VzdG9tQmFzZVVybCA6IGJhc2VVcmxGb3JNb2RlbChpbnB1dC5kZWVwVGhpbmtMbG0pLFxuICAgICAgcXVpY2tfdGhpbmtfYmFzZV91cmw6IGlzUXVpY2tDdXN0b20gPyBjdXN0b21CYXNlVXJsIDogYmFzZVVybEZvck1vZGVsKGlucHV0LnF1aWNrVGhpbmtMbG0pLFxuXG4gICAgICBlbWJlZGRpbmdfbW9kZWw6IGVtYmVkTW9kZWwsXG4gICAgICBlbWJlZGRpbmdfYXBpX2tleTogZW1iZWRkaW5nS2V5LFxuICAgICAgZW1iZWRkaW5nX2Jhc2VfdXJsOiBlbWJlZGRpbmdCYXNlVXJsLFxuXG4gICAgICBvcGVuYWlfYXBpX2tleTogc2VjcmV0cy5nZXRTZWNyZXQoJ29wZW5haScpLFxuICAgICAgb3BlbmFpX2Jhc2VfdXJsOiBQUk9WSURFUlMub3BlbmFpLmJhc2VVcmwsXG5cbiAgICAgIGFscGhhX3ZhbnRhZ2VfYXBpX2tleTogc2VjcmV0cy5nZXRTZWNyZXQoJ2FscGhhdmFudGFnZScpLFxuICAgICAgZmlubWluZF9hcGlfa2V5OiBzZWNyZXRzLmdldFNlY3JldCgnZmlubWluZCcpLFxuICAgIH1cblxuICAgIHJldHVybiBiYWNrZW5kLnJlcXVlc3Q8eyB0YXNrX2lkOiBzdHJpbmcgfT4oJ1BPU1QnLCAnL2FwaS9hbmFseXplJywgcGF5bG9hZClcbiAgfSlcblxuICBpcGNNYWluLmhhbmRsZSgnYW5hbHlzaXM6c3RhdHVzJywgKF9lLCB0YXNrSWQ6IHN0cmluZykgPT5cbiAgICBiYWNrZW5kLnJlcXVlc3QoYEdFVGAsIGAvYXBpL3Rhc2svJHtlbmNvZGVVUklDb21wb25lbnQodGFza0lkKX1gKSxcbiAgKVxuXG4gIGlwY01haW4uaGFuZGxlKCdhbmFseXNpczpjbGVhbnVwJywgKF9lLCB0YXNrSWQ6IHN0cmluZykgPT5cbiAgICBiYWNrZW5kLnJlcXVlc3QoJ0RFTEVURScsIGAvYXBpL3Rhc2svJHtlbmNvZGVVUklDb21wb25lbnQodGFza0lkKX0vY2xlYW51cGApLFxuICApXG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIOWgseWRiiAqL1xuXG4gIGlwY01haW4uaGFuZGxlKCdyZXBvcnRzOmxpc3QnLCAoKSA9PiBzdG9yZS5saXN0UmVwb3J0cygpKVxuICBpcGNNYWluLmhhbmRsZSgncmVwb3J0czpnZXQnLCAoX2UsIGZpbGVOYW1lOiBzdHJpbmcpID0+IHN0b3JlLmdldFJlcG9ydChmaWxlTmFtZSkpXG4gIGlwY01haW4uaGFuZGxlKCdyZXBvcnRzOnNhdmUnLCAoX2UsIHJlcG9ydDogU3RvcmVkUmVwb3J0KSA9PiBzdG9yZS5zYXZlUmVwb3J0KHJlcG9ydCkpXG4gIGlwY01haW4uaGFuZGxlKCdyZXBvcnRzOmRlbGV0ZScsIChfZSwgZmlsZU5hbWU6IHN0cmluZykgPT4gc3RvcmUuZGVsZXRlUmVwb3J0KGZpbGVOYW1lKSlcbiAgaXBjTWFpbi5oYW5kbGUoJ3JlcG9ydHM6dXNhZ2UnLCAoKSA9PiBzdG9yZS5kaXNrVXNhZ2UoKSlcblxuICBpcGNNYWluLmhhbmRsZSgncmVwb3J0czpyZXZlYWwnLCAoX2UsIGZpbGVOYW1lPzogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZGlyID0gc3RvcmUucmVhZFNldHRpbmdzKCkucmVwb3J0c0RpclxuICAgIGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgaWYgKGZpbGVOYW1lKSBzaGVsbC5zaG93SXRlbUluRm9sZGVyKHBhdGguam9pbihkaXIsIHBhdGguYmFzZW5hbWUoZmlsZU5hbWUpKSlcbiAgICBlbHNlIHNoZWxsLm9wZW5QYXRoKGRpcilcbiAgfSlcblxuICBpcGNNYWluLmhhbmRsZSgnc2hlbGw6b3BlbkV4dGVybmFsJywgKF9lLCB1cmw6IHN0cmluZykgPT4ge1xuICAgIGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHVybCkpIHNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpXG4gIH0pXG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g5Y2x6Zqq5pON5L2cICovXG5cbiAgaXBjTWFpbi5oYW5kbGUoJ2RhdGE6Y2xlYXJBbGwnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgdyA9IHdpbigpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZGlhbG9nLnNob3dNZXNzYWdlQm94KHchLCB7XG4gICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICBidXR0b25zOiBbJ+WPlua2iCcsICflhajpg6jmuIXpmaQnXSxcbiAgICAgIGRlZmF1bHRJZDogMCxcbiAgICAgIGNhbmNlbElkOiAwLFxuICAgICAgdGl0bGU6ICfmuIXpmaTmiYDmnInmnKzmqZ/os4fmlpknLFxuICAgICAgbWVzc2FnZTogJ+eiuuWumuimgea4hemZpOaJgOacieWgseWRiuOAgeioreWumuiIh+W3suWEsuWtmOeahOmHkemRsOWXju+8nycsXG4gICAgICBkZXRhaWw6ICfmraTmk43kvZznhKHms5Xlvqnljp/jgIInLFxuICAgIH0pXG4gICAgaWYgKHJlcy5yZXNwb25zZSAhPT0gMSkgcmV0dXJuIGZhbHNlXG4gICAgc2VjcmV0cy5jbGVhckFsbFNlY3JldHMoKVxuICAgIGZvciAoY29uc3QgciBvZiBzdG9yZS5saXN0UmVwb3J0cygpKSBzdG9yZS5kZWxldGVSZXBvcnQoci5maWxlTmFtZSlcbiAgICBzdG9yZS53cml0ZVNldHRpbmdzKHsgd2F0Y2hsaXN0OiBbXSB9KVxuICAgIHJldHVybiB0cnVlXG4gIH0pXG59XG4iLCJpbXBvcnQgeyBCcm93c2VyV2luZG93LCBhcHAsIG5hdGl2ZUltYWdlLCBuYXRpdmVUaGVtZSwgc2Vzc2lvbiwgc2hlbGwgfSBmcm9tICdlbGVjdHJvbidcbmltcG9ydCB0eXBlIHsgTmF0aXZlSW1hZ2UgfSBmcm9tICdlbGVjdHJvbidcbmltcG9ydCBmcyBmcm9tICdub2RlOmZzJ1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJ1xuaW1wb3J0IHsgYmFja2VuZCB9IGZyb20gJy4vYmFja2VuZCdcbmltcG9ydCB7IHJlZ2lzdGVySXBjLCBhcHBseVRoZW1lIH0gZnJvbSAnLi9pcGMnXG5pbXBvcnQgeyByZWFkU2V0dGluZ3MgfSBmcm9tICcuL3N0b3JlJ1xuXG5jb25zdCBERVZfVVJMID0gcHJvY2Vzcy5lbnYuVklURV9ERVZfU0VSVkVSX1VSTFxuY29uc3QgUkVOREVSRVJfRElTVCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLicsICdkaXN0JylcblxuY29uc3QgaXNNYWMgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJ1xuXG4vKiogQXBwIOWcluekuu+8muaJk+WMheW+jOWcqCBkaXN0L++8jOmWi+eZvOaZgumAgOWbniBwdWJsaWMvICovXG5mdW5jdGlvbiBhcHBJY29uKCk6IE5hdGl2ZUltYWdlIHwgdW5kZWZpbmVkIHtcbiAgZm9yIChjb25zdCBwIG9mIFtcbiAgICBwYXRoLmpvaW4oUkVOREVSRVJfRElTVCwgJ2xvZ28ucG5nJyksXG4gICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJ3B1YmxpYycsICdsb2dvLnBuZycpLFxuICBdKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGltZyA9IG5hdGl2ZUltYWdlLmNyZWF0ZUZyb21QYXRoKHApXG4gICAgICBpZiAoIWltZy5pc0VtcHR5KCkpIHJldHVybiBpbWdcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIOippuS4i+S4gOWAi+i3r+W+kSAqL1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkXG59XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g6KaW56qX5L2N572u6KiY5oa2ICovXG5cbmludGVyZmFjZSBXaW5kb3dTdGF0ZSB7XG4gIHdpZHRoOiBudW1iZXJcbiAgaGVpZ2h0OiBudW1iZXJcbiAgeD86IG51bWJlclxuICB5PzogbnVtYmVyXG4gIG1heGltaXplZD86IGJvb2xlYW5cbn1cblxuY29uc3Qgd2luZG93U3RhdGVGaWxlID0gKCkgPT4gcGF0aC5qb2luKGFwcC5nZXRQYXRoKCd1c2VyRGF0YScpLCAnd2luZG93Lmpzb24nKVxuXG5mdW5jdGlvbiByZWFkV2luZG93U3RhdGUoKTogV2luZG93U3RhdGUge1xuICB0cnkge1xuICAgIGNvbnN0IHMgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyh3aW5kb3dTdGF0ZUZpbGUoKSwgJ3V0ZjgnKSkgYXMgV2luZG93U3RhdGVcbiAgICBpZiAocy53aWR0aCA+IDQwMCAmJiBzLmhlaWdodCA+IDMwMCkgcmV0dXJuIHNcbiAgfSBjYXRjaCB7XG4gICAgLyog55So6aCQ6Kit5YC8ICovXG4gIH1cbiAgcmV0dXJuIHsgd2lkdGg6IDE0NDAsIGhlaWdodDogOTIwIH1cbn1cblxuZnVuY3Rpb24gc2F2ZVdpbmRvd1N0YXRlKHdpbjogQnJvd3NlcldpbmRvdykge1xuICBpZiAod2luLmlzRGVzdHJveWVkKCkpIHJldHVyblxuICBjb25zdCBib3VuZHMgPSB3aW4uZ2V0Tm9ybWFsQm91bmRzKClcbiAgY29uc3Qgc3RhdGU6IFdpbmRvd1N0YXRlID0geyAuLi5ib3VuZHMsIG1heGltaXplZDogd2luLmlzTWF4aW1pemVkKCkgfVxuICB0cnkge1xuICAgIGZzLndyaXRlRmlsZVN5bmMod2luZG93U3RhdGVGaWxlKCksIEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgJ3V0ZjgnKVxuICB9IGNhdGNoIHtcbiAgICAvKiDlr6vkuI3pgLLljrvlsLHnrpfkuobvvIzkuI3lgLzlvpfmiZPmlrfpl5zplonmtYHnqIsgKi9cbiAgfVxufVxuXG4vKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBDU1AgKi9cblxuLyoqXG4gKiDku6UgcmVzcG9uc2UgaGVhZGVyIOazqOWFpSBDU1DvvIzogIzkuI3mmK/lr6vlnKggaW5kZXguaHRtbCDnmoQgbWV0Ye+8jFxuICog5Zug54K66ZaL55m85qih5byP6KaB5pS+6KGMIFZpdGUg55qEIEhNUu+8iFJlYWN0IFJlZnJlc2gg5pyD5rOo5YWl5YWn6IGvIHNjcmlwdOOAgVxuICog5Lim55SoIFdlYlNvY2tldCDpgKPlm54gZGV2IHNlcnZlcu+8ie+8jOato+W8j+eJiOWJh+S4jemcgOimgeS5n+S4jeaHieipsuaUvuihjOOAglxuICpcbiAqIGNvbm5lY3Qtc3JjIOS4gOW+i+WPque1piAnc2VsZifvvJrmiYDmnInlsI3lpJboq4vmsYLpg73nlLHkuLvooYznqIvnmbzlh7rvvIxcbiAqIOa4suafk+ihjOeoi+mAoyBmZXRjaCDliLDkvpvmh4nllYYgQVBJIOeahOiDveWKm+mDveaykuacieOAglxuICovXG5mdW5jdGlvbiBpbnN0YWxsQ3NwKCkge1xuICBjb25zdCBwb2xpY3kgPSBERVZfVVJMXG4gICAgPyBbXG4gICAgICAgIGBkZWZhdWx0LXNyYyAnc2VsZicgJHtERVZfVVJMfWAsXG4gICAgICAgIGBzY3JpcHQtc3JjICdzZWxmJyAndW5zYWZlLWlubGluZScgJHtERVZfVVJMfWAsXG4gICAgICAgIGBzdHlsZS1zcmMgJ3NlbGYnICd1bnNhZmUtaW5saW5lJyAke0RFVl9VUkx9IGh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb21gLFxuICAgICAgICBgZm9udC1zcmMgJ3NlbGYnIGRhdGE6ICR7REVWX1VSTH0gaHR0cHM6Ly9mb250cy5nc3RhdGljLmNvbWAsXG4gICAgICAgIGBpbWctc3JjICdzZWxmJyBkYXRhOiBibG9iOiAke0RFVl9VUkx9YCxcbiAgICAgICAgYGNvbm5lY3Qtc3JjICdzZWxmJyAke0RFVl9VUkx9ICR7REVWX1VSTC5yZXBsYWNlKC9eaHR0cC8sICd3cycpfWAsXG4gICAgICBdXG4gICAgOiBbXG4gICAgICAgIFwiZGVmYXVsdC1zcmMgJ3NlbGYnXCIsXG4gICAgICAgIFwic2NyaXB0LXNyYyAnc2VsZidcIixcbiAgICAgICAgYHN0eWxlLXNyYyAnc2VsZicgJ3Vuc2FmZS1pbmxpbmUnIGh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb21gLFxuICAgICAgICBgZm9udC1zcmMgJ3NlbGYnIGRhdGE6IGh0dHBzOi8vZm9udHMuZ3N0YXRpYy5jb21gLFxuICAgICAgICBcImltZy1zcmMgJ3NlbGYnIGRhdGE6XCIsXG4gICAgICAgIFwiY29ubmVjdC1zcmMgJ3NlbGYnXCIsXG4gICAgICAgIFwib2JqZWN0LXNyYyAnbm9uZSdcIixcbiAgICAgICAgXCJiYXNlLXVyaSAnbm9uZSdcIixcbiAgICAgICAgXCJmb3JtLWFjdGlvbiAnbm9uZSdcIixcbiAgICAgIF1cblxuICBzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQoKGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG4gICAgY2FsbGJhY2soe1xuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgIC4uLmRldGFpbHMucmVzcG9uc2VIZWFkZXJzLFxuICAgICAgICAnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBbcG9saWN5LmpvaW4oJzsgJyldLFxuICAgICAgfSxcbiAgICB9KVxuICB9KVxufVxuXG4vKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIOW7uueri+imlueqlyAqL1xuXG5mdW5jdGlvbiBiYWNrZ3JvdW5kRm9yKGRhcms6IGJvb2xlYW4pIHtcbiAgLy8g6IiHIHRva2Vucy5jc3Mg55qEIC0tYmcg5LiA6Ie077yM6YG/5YWN6ZaL56qX556s6ZaT6ZaD55m9XG4gIHJldHVybiBkYXJrID8gJyMwNTA3MEUnIDogJyNFRUYxRjUnXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdpbmRvdygpIHtcbiAgY29uc3Qgc3RhdGUgPSByZWFkV2luZG93U3RhdGUoKVxuXG4gIGNvbnN0IHdpbiA9IG5ldyBCcm93c2VyV2luZG93KHtcbiAgICB3aWR0aDogc3RhdGUud2lkdGgsXG4gICAgaGVpZ2h0OiBzdGF0ZS5oZWlnaHQsXG4gICAgeDogc3RhdGUueCxcbiAgICB5OiBzdGF0ZS55LFxuICAgIG1pbldpZHRoOiA5MDAsXG4gICAgbWluSGVpZ2h0OiA2MjAsXG4gICAgc2hvdzogZmFsc2UsXG4gICAgaWNvbjogYXBwSWNvbigpLFxuICAgIGJhY2tncm91bmRDb2xvcjogYmFja2dyb3VuZEZvcihuYXRpdmVUaGVtZS5zaG91bGRVc2VEYXJrQ29sb3JzKSxcbiAgICAvLyBtYWNPUyDnlKjns7vntbHntIXntqDnh4jkuKblhafnuK7vvJvlhbbku5blubPlj7Doh6rnuaroppbnqpfmjqfliLbpoIVcbiAgICB0aXRsZUJhclN0eWxlOiBpc01hYyA/ICdoaWRkZW5JbnNldCcgOiAnZGVmYXVsdCcsXG4gICAgdHJhZmZpY0xpZ2h0UG9zaXRpb246IGlzTWFjID8geyB4OiAxNCwgeTogMTIgfSA6IHVuZGVmaW5lZCxcbiAgICBmcmFtZTogaXNNYWMsXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIHByZWxvYWQ6IHBhdGguam9pbihfX2Rpcm5hbWUsICdwcmVsb2FkLmpzJyksXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcbiAgICAgIC8vIHByZWxvYWQg5LulIENKUyDmiZPljIXvvIzlj6rnlKjliLAgY29udGV4dEJyaWRnZSAvIGlwY1JlbmRlcmVyXG4gICAgICBzYW5kYm94OiBmYWxzZSxcbiAgICAgIHNwZWxsY2hlY2s6IGZhbHNlLFxuICAgIH0sXG4gIH0pXG5cbiAgaWYgKHN0YXRlLm1heGltaXplZCkgd2luLm1heGltaXplKClcblxuICAvLyDmraPluLjmg4Xms4HkuIvnrYnpppbmrKHnuaroo73lho3poa/npLrvvIzpgb/lhY3nnIvliLDnqbrnmb3nqpfjgIJcbiAgLy8g5L2G6Iul5riy5p+T56iL5bqP5Ye65ZWP6aGM77yMcmVhZHktdG8tc2hvdyDlj6/og73msLjpgaDkuI3kvoYg4oCU4oCUIOmCo+aoo+S9v+eUqOiAheWPquacg+eci+WIsFxuICAvLyDkuIDlgIvjgIxBcHAg5pyJ5Zyo6LeR5Y275rKS5pyJ6KaW56qX44CN55qE54uA5oWL77yM5q+U55yL5Yiw6Yyv6Kqk55Wr6Z2i5pu06Zuj6JmV55CG77yM5omA5Lul5Yqg5LiK5L+d6Zqq44CCXG4gIGxldCBzaG93biA9IGZhbHNlXG4gIGNvbnN0IHNob3cgPSAoKSA9PiB7XG4gICAgaWYgKHNob3duIHx8IHdpbi5pc0Rlc3Ryb3llZCgpKSByZXR1cm5cbiAgICBzaG93biA9IHRydWVcbiAgICB3aW4uc2hvdygpXG4gIH1cbiAgd2luLm9uY2UoJ3JlYWR5LXRvLXNob3cnLCBzaG93KVxuICBzZXRUaW1lb3V0KHNob3csIDQwMDApXG5cbiAgd2luLndlYkNvbnRlbnRzLm9uKCdkaWQtZmFpbC1sb2FkJywgKF9lLCBjb2RlLCBkZXNjLCB1cmwpID0+IHtcbiAgICBjb25zb2xlLmVycm9yKGBbcmVuZGVyZXJdIOi8ieWFpeWkseaVlyAke2NvZGV9ICR7ZGVzY30gJHt1cmx9YClcbiAgICBzaG93KClcbiAgfSlcbiAgd2luLndlYkNvbnRlbnRzLm9uKCdyZW5kZXItcHJvY2Vzcy1nb25lJywgKF9lLCBkZXRhaWxzKSA9PiB7XG4gICAgY29uc29sZS5lcnJvcihgW3JlbmRlcmVyXSDnqIvluo/ntZDmnZ/vvJoke2RldGFpbHMucmVhc29ufWApXG4gIH0pXG4gIHdpbi53ZWJDb250ZW50cy5vbignY29uc29sZS1tZXNzYWdlJywgKGRldGFpbHMpID0+IHtcbiAgICBpZiAoZGV0YWlscy5sZXZlbCA9PT0gJ2Vycm9yJykge1xuICAgICAgY29uc29sZS5lcnJvcihgW3JlbmRlcmVyXSAke2RldGFpbHMubWVzc2FnZX0gKCR7ZGV0YWlscy5zb3VyY2VJZH06JHtkZXRhaWxzLmxpbmVOdW1iZXJ9KWApXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IHBlcnNpc3QgPSAoKSA9PiBzYXZlV2luZG93U3RhdGUod2luKVxuICB3aW4ub24oJ3Jlc2l6ZWQnLCBwZXJzaXN0KVxuICB3aW4ub24oJ21vdmVkJywgcGVyc2lzdClcbiAgd2luLm9uKCdjbG9zZScsIHBlcnNpc3QpXG5cbiAgY29uc3Qgc2VuZE1heGltaXplZCA9ICgpID0+IHdpbi53ZWJDb250ZW50cy5zZW5kKCd3aW46bWF4aW1pemVkJywgd2luLmlzTWF4aW1pemVkKCkpXG4gIHdpbi5vbignbWF4aW1pemUnLCBzZW5kTWF4aW1pemVkKVxuICB3aW4ub24oJ3VubWF4aW1pemUnLCBzZW5kTWF4aW1pemVkKVxuXG4gIC8vIOWklumDqOmAo+e1kOS4gOW+i+eUqOezu+e1seeAj+imveWZqOmWi++8jOS4jeWcqCBBcHAg5YWn5bCO6IiqXG4gIHdpbi53ZWJDb250ZW50cy5zZXRXaW5kb3dPcGVuSGFuZGxlcigoeyB1cmwgfSkgPT4ge1xuICAgIGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHVybCkpIHNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpXG4gICAgcmV0dXJuIHsgYWN0aW9uOiAnZGVueScgfVxuICB9KVxuICB3aW4ud2ViQ29udGVudHMub24oJ3dpbGwtbmF2aWdhdGUnLCAoZSwgdXJsKSA9PiB7XG4gICAgY29uc3QgYWxsb3dlZCA9IERFVl9VUkwgJiYgdXJsLnN0YXJ0c1dpdGgoREVWX1VSTClcbiAgICBpZiAoIWFsbG93ZWQpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgICAgaWYgKC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodXJsKSkgc2hlbGwub3BlbkV4dGVybmFsKHVybClcbiAgICB9XG4gIH0pXG5cbiAgaWYgKERFVl9VUkwpIHtcbiAgICB2b2lkIHdpbi5sb2FkVVJMKERFVl9VUkwpXG4gIH0gZWxzZSB7XG4gICAgdm9pZCB3aW4ubG9hZEZpbGUocGF0aC5qb2luKFJFTkRFUkVSX0RJU1QsICdpbmRleC5odG1sJykpXG4gIH1cblxuXG4gIHJldHVybiB3aW5cbn1cblxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSDnlJ/lkb3pgLHmnJ8gKi9cblxuaWYgKCFhcHAucmVxdWVzdFNpbmdsZUluc3RhbmNlTG9jaygpKSB7XG4gIGFwcC5xdWl0KClcbn0gZWxzZSB7XG4gIGFwcC5vbignc2Vjb25kLWluc3RhbmNlJywgKCkgPT4ge1xuICAgIGNvbnN0IHdpbiA9IEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpWzBdXG4gICAgaWYgKHdpbikge1xuICAgICAgaWYgKHdpbi5pc01pbmltaXplZCgpKSB3aW4ucmVzdG9yZSgpXG4gICAgICB3aW4uZm9jdXMoKVxuICAgIH1cbiAgfSlcblxuICB2b2lkIGFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcbiAgICBpbnN0YWxsQ3NwKClcbiAgICByZWdpc3RlcklwYygpXG4gICAgYXBwbHlUaGVtZShyZWFkU2V0dGluZ3MoKS50aGVtZSlcblxuICAgIC8vIG1hY09TIERvY2sg5ZyW56S677yI6ZaL55m85qih5byP55So77yb5omT5YyF54mI55SxIGVsZWN0cm9uLWJ1aWxkZXIg55qEIGljb24g6Kit5a6a6JmV55CG77yJXG4gICAgaWYgKGlzTWFjKSB7XG4gICAgICBjb25zdCBpY29uID0gYXBwSWNvbigpXG4gICAgICBpZiAoaWNvbikgYXBwLmRvY2s/LnNldEljb24oaWNvbilcbiAgICB9XG5cbiAgICBuYXRpdmVUaGVtZS5vbigndXBkYXRlZCcsICgpID0+IHtcbiAgICAgIGNvbnN0IGRhcmsgPSBuYXRpdmVUaGVtZS5zaG91bGRVc2VEYXJrQ29sb3JzXG4gICAgICBmb3IgKGNvbnN0IHcgb2YgQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICAgICAgaWYgKHcuaXNEZXN0cm95ZWQoKSkgY29udGludWVcbiAgICAgICAgdy5zZXRCYWNrZ3JvdW5kQ29sb3IoYmFja2dyb3VuZEZvcihkYXJrKSlcbiAgICAgICAgdy53ZWJDb250ZW50cy5zZW5kKCd0aGVtZTpyZXNvbHZlZCcsIGRhcmsgPyAnZGFyaycgOiAnbGlnaHQnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjcmVhdGVXaW5kb3coKVxuXG4gICAgLy8g5b6M56uv5ZWf5YuV5b6I5oWi77yI6KaB6LyJ5YWlIGxhbmdjaGFpbiDnrYnlpZfku7bvvInvvIzkuI3mk4sgVUnvvIzni4DmhYvpnaDkuovku7bmjqjmkq1cbiAgICB2b2lkIGJhY2tlbmQuc3RhcnQoKVxuXG4gICAgYXBwLm9uKCdhY3RpdmF0ZScsICgpID0+IHtcbiAgICAgIGlmIChCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKS5sZW5ndGggPT09IDApIGNyZWF0ZVdpbmRvdygpXG4gICAgfSlcbiAgfSlcblxuICBhcHAub24oJ3dpbmRvdy1hbGwtY2xvc2VkJywgKCkgPT4ge1xuICAgIGlmICghaXNNYWMpIGFwcC5xdWl0KClcbiAgfSlcblxuICBhcHAub24oJ2JlZm9yZS1xdWl0JywgKCkgPT4ge1xuICAgIHZvaWQgYmFja2VuZC5zdG9wKClcbiAgfSlcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUtBLElBQU0saUJBQWlCLFNBQUEsSUFBSSxRQUFRLFVBQVU7QUFDN0MsSUFBTSxxQkFBcUIsVUFBQSxRQUFLLEtBQUssU0FBUyxHQUFHLGVBQWU7QUFFaEUsU0FBZ0Isb0JBQTRCO0NBQzFDLE9BQU8sVUFBQSxRQUFLLEtBQUssU0FBQSxJQUFJLFFBQVEsV0FBVyxHQUFHLGtCQUFrQixTQUFTO0FBQ3hFO0FBRUEsU0FBUyxXQUFxQjtDQUM1QixPQUFPO0VBQ0wsT0FBTztFQUNQLFVBQVU7RUFDVixZQUFZLGtCQUFrQjtFQUM5QixTQUFTO0dBQUUsTUFBTTtHQUFRLEtBQUs7R0FBeUIsU0FBUztHQUFJLEtBQUs7RUFBRztFQUM1RSxjQUFjO0VBQ2QsZUFB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