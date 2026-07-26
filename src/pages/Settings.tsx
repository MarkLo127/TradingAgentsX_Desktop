import { useEffect, useState } from 'react'
import type { Language, SecretId, ThemePreference } from '@shared/types'
import { DATA_PROVIDERS, LLM_PROVIDERS, PROVIDERS } from '@shared/providers'
import { Icon } from '@/components/Icon'
import { Badge, Banner, Btn, Empty, Field, Kv, Panel, Seg } from '@/components/ui'
import { tax } from '@/lib/bridge'
import { formatBytes, formatClock, formatRelative } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useTheme } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'

type Tab = 'appearance' | 'keys' | 'backend' | 'storage' | 'about'

export function Settings() {
  const [tab, setTab] = useState<Tab>('appearance')
  const { settings } = useStore()
  const { t } = useI18n()

  if (!settings) return <main className="main" />

  const tabs: { value: Tab; label: string }[] = [
    { value: 'appearance', label: t('外觀', 'Appearance') },
    { value: 'keys', label: t('API 金鑰', 'API keys') },
    { value: 'backend', label: t('後端', 'Backend') },
    { value: 'storage', label: t('資料與儲存', 'Data & storage') },
    { value: 'about', label: t('關於', 'About') },
  ]

  return (
    <main className="main">
      <div className="main-head">
        <div>
          <h1>{t('設定', 'Settings')}</h1>
          <div className="sub">{t('所有設定存在本機，不會上傳任何伺服器', 'All settings stay local — nothing is uploaded')}</div>
        </div>
        <div className="mla">
          <Seg<Tab> label={t('設定分類', 'Settings tabs')} value={tab} options={tabs} onChange={setTab} />
        </div>
      </div>

      <div className="main-scroll narrow">
        {tab === 'appearance' && <Appearance />}
        {tab === 'keys' && <Keys />}
        {tab === 'backend' && <Backend />}
        {tab === 'storage' && <Storage />}
        {tab === 'about' && <About />}
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ 外觀 */

function Appearance() {
  const { preference, resolved, setPreference } = useTheme()
  const { settings, updateSettings } = useStore()
  const { t } = useI18n()

  const themeOptions: {
    value: ThemePreference
    label: string
    icon: 'monitor' | 'sun' | 'moon'
    desc: string
  }[] = [
    { value: 'system', label: t('跟隨系統', 'System'), icon: 'monitor', desc: t('依作業系統的外觀設定自動切換', 'Follows the OS appearance setting') },
    { value: 'light', label: t('亮色', 'Light'), icon: 'sun', desc: t('固定使用亮色主題', 'Always use the light theme') },
    { value: 'dark', label: t('暗色', 'Dark'), icon: 'moon', desc: t('固定使用暗色主題', 'Always use the dark theme') },
  ]

  const langOptions: { value: Language; label: string; desc: string }[] = [
    { value: 'zh-TW', label: t('繁體中文', 'Traditional Chinese'), desc: t('介面與報告皆為中文', 'UI and reports in Chinese') },
    { value: 'en', label: 'English', desc: t('介面與報告皆為英文', 'UI and reports in English') },
  ]

  return (
    <>
      <Panel icon="chat" title={t('語言', 'Language')}>
        <div className="stack gap-12">
          <div className="row gap-10 wrap">
            {langOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                className="radio-card"
                data-checked={settings?.language === o.value}
                aria-pressed={settings?.language === o.value}
                style={{ flex: '1 1 220px', textAlign: 'left' }}
                onClick={() => void updateSettings({ language: o.value })}
              >
                <Icon
                  name="chat"
                  style={{ color: settings?.language === o.value ? 'var(--accent)' : 'var(--text-faint)' }}
                />
                <div className="stack gap-4 flex1">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</span>
                  <div className="help">{o.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="help">
            {t(
              '介面語言與報告語言是同一個設定：選中文就輸出中文報告，選英文就輸出英文報告。',
              'The UI language and report language are the same setting: Chinese UI produces Chinese reports, English UI produces English reports.',
            )}
          </div>
        </div>
      </Panel>

      <Panel icon="sun" title={t('主題', 'Theme')}>
        <div className="stack gap-12">
          <div className="row gap-10 wrap">
            {themeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                className="radio-card"
                data-checked={preference === o.value}
                aria-pressed={preference === o.value}
                style={{ flex: '1 1 200px', textAlign: 'left' }}
                onClick={() => setPreference(o.value)}
              >
                <Icon
                  name={o.icon}
                  style={{ color: preference === o.value ? 'var(--accent)' : 'var(--text-faint)' }}
                />
                <div className="stack gap-4 flex1">
                  <div className="row gap-8">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</span>
                    {o.value === 'system' && (
                      <Badge tone="muted">
                        {t(`目前 ${resolved === 'dark' ? '暗色' : '亮色'}`, `now ${resolved === 'dark' ? 'dark' : 'light'}`)}
                      </Badge>
                    )}
                  </div>
                  <div className="help">{o.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="help">
            {t(
              '主題偏好會存進 settings.json，重開 App 後保留。選「跟隨系統」時，切換 macOS 或 Windows 的外觀設定會立即反映，不需重啟。',
              'The theme preference is saved to settings.json and kept across restarts. With "System", changing the macOS/Windows appearance reflects instantly — no restart needed.',
            )}
          </div>
        </div>
      </Panel>

      <Panel icon="eye" title={t('預覽', 'Preview')}>
        <div className="stack gap-12">
          <div className="row gap-8 wrap">
            <Badge tone="buy">BUY</Badge>
            <Badge tone="sell">SELL</Badge>
            <Badge tone="hold">HOLD</Badge>
            <Badge tone="info">{t('深度模式', 'Deep')}</Badge>
            <Badge tone="violet">{t('12 位代理人', '12 agents')}</Badge>
            <Badge tone="muted">{t('未設定', 'Not set')}</Badge>
          </div>
          <div className="row gap-8 wrap">
            <Btn variant="primary">{t('主要動作', 'Primary')}</Btn>
            <Btn>{t('次要動作', 'Secondary')}</Btn>
            <Btn variant="ghost">{t('幽靈按鈕', 'Ghost')}</Btn>
            <Btn variant="danger">{t('危險動作', 'Danger')}</Btn>
            <Btn disabled>{t('已停用', 'Disabled')}</Btn>
          </div>
          <div className="row gap-16 wrap" style={{ fontSize: 12 }}>
            <span className="row gap-6">
              <span className="dot live" />
              {t('連線中', 'Online')}
            </span>
            <span className="row gap-6">
              <span className="dot warn" />
              {t('受限', 'Limited')}
            </span>
            <span className="row gap-6">
              <span className="dot err" />
              {t('錯誤', 'Error')}
            </span>
            <span className="mono">NVDA 184.32 +2.41%</span>
          </div>
        </div>
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------------ 金鑰 */

function KeyRow({
  id,
  value,
  onChange,
}: {
  id: SecretId
  value: string
  onChange: (v: string) => void
}) {
  const { secrets, refreshSecrets, settings, updateSettings } = useStore()
  const { t } = useI18n()
  const info = PROVIDERS[id]
  const state = secrets.items.find((i) => i.id === id)

  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const save = async () => {
    if (!value.trim()) return
    setBusy(true)
    setResult(null)
    await tax.secrets.set(id, value.trim())
    onChange('')
    setReveal(false)
    await refreshSecrets()
    setBusy(false)
  }

  const verify = async () => {
    setBusy(true)
    setResult(null)
    setResult(await tax.secrets.verify(id))
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    setResult(null)
    await tax.secrets.remove(id)
    await refreshSecrets()
    setBusy(false)
  }

  return (
    <Field
      label={info.label}
      htmlFor={`key-${id}`}
      error={result && !result.ok ? result.message : null}
      success={result?.ok ? result.message : null}
      help={
        state?.isSet ? (
          <>
            {t('已設定（末四碼 ', 'Set (last 4: ')}
            <span className="mono">{state.hint}</span>
            {t('）', ')')}
            {state.updatedAt ? ` · ${formatRelative(state.updatedAt)}${t('更新', ' updated')}` : ''}
          </>
        ) : (
          <>
            {t('未設定。', 'Not set. ')}
            <a
              href={info.docsUrl}
              onClick={(e) => {
                e.preventDefault()
                void tax.openExternal(info.docsUrl)
              }}
            >
              {t('取得金鑰', 'Get a key')}
            </a>
          </>
        )
      }
    >
      <div className="row gap-8">
        <div className="input-group flex1">
          <input
            id={`key-${id}`}
            className="input mono"
            type={reveal ? 'text' : 'password'}
            value={value}
            autoComplete="off"
            spellCheck={false}
            placeholder={state?.isSet ? t('輸入新金鑰以取代…', 'Enter a new key to replace…') : (info.prefix ?? 'API key')}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
          <div className="adorn">
            <Btn
              small
              variant="ghost"
              iconOnly
              icon={reveal ? 'eyeOff' : 'eye'}
              aria-label={reveal ? t('隱藏輸入', 'Hide input') : t('顯示輸入', 'Show input')}
              onClick={() => setReveal((v) => !v)}
            />
          </div>
        </div>
        <Btn small disabled={!value.trim()} loading={busy && Boolean(value)} onClick={() => void save()}>
          {t('儲存', 'Save')}
        </Btn>
        {state?.isSet && (
          <>
            <Btn small icon="checkCircle" onClick={() => void verify()}>
              {t('驗證', 'Verify')}
            </Btn>
            <Btn small variant="ghost" iconOnly icon="trash" aria-label={t(`移除 ${info.label} 金鑰`, `Remove ${info.label} key`)} onClick={() => void remove()} />
          </>
        )}
      </div>

      {/* 自訂供應商：base URL 與金鑰一起維護，供「新增分析」選到自訂模型時使用 */}
      {id === 'custom' && settings && (
        <div className="stack gap-4" style={{ marginTop: 10 }}>
          <label
            htmlFor="custom-base-url"
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}
          >
            {t('Base URL（OpenAI 相容端點）', 'Base URL (OpenAI-compatible)')}
          </label>
          <input
            id="custom-base-url"
            className="input mono"
            placeholder="https://your-endpoint/v1"
            value={settings.customBaseUrl}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => void updateSettings({ customBaseUrl: e.target.value })}
          />
          <div className="help">
            {t(
              '所有選為「自訂」的深度／快速／Embedding 模型都會用這個端點與上方金鑰。',
              'Every model set to “custom” (deep / quick / embedding) uses this endpoint and the key above.',
            )}
          </div>
        </div>
      )}
    </Field>
  )
}

function Keys() {
  const { secrets, refreshSecrets } = useStore()
  const { t } = useI18n()

  // 所有金鑰的暫存輸入集中在這裡，才能「一鍵儲存」全部變更
  const [values, setValues] = useState<Partial<Record<SecretId, string>>>({})
  const [savingAll, setSavingAll] = useState(false)
  const setVal = (id: SecretId, v: string) => setValues((s) => ({ ...s, [id]: v }))
  const pendingIds = (Object.keys(values) as SecretId[]).filter((id) => (values[id] ?? '').trim())

  const saveAll = async () => {
    if (!pendingIds.length) return
    setSavingAll(true)
    for (const id of pendingIds) {
      await tax.secrets.set(id, (values[id] ?? '').trim())
    }
    setValues({})
    await refreshSecrets()
    setSavingAll(false)
  }

  return (
    <>
      {secrets.encryptionAvailable ? (
        <Banner tone="ok" icon="shield" title={t('金鑰儲存在作業系統的加密儲存區', 'Keys are stored in the OS encrypted store')}>
          {t(
            '金鑰以 macOS 鑰匙圈 / Windows DPAPI / Linux libsecret 加密後寫入本機檔案。只有主行程能解密，而且只在送出請求的那一刻解 —— 介面本身永遠拿不到明文，也不會經過任何中繼伺服器。',
            'Keys are encrypted with macOS Keychain / Windows DPAPI / Linux libsecret and written to a local file. Only the main process can decrypt them, and only at the moment a request is sent — the UI never sees plaintext and nothing goes through a relay server.',
          )}
        </Banner>
      ) : (
        <Banner tone="warn" icon="unlock" title={t('這台機器沒有可用的系統加密儲存', 'No system encrypted store is available here')}>
          {t(
            '金鑰目前會以明文寫入 secrets.json（權限 600）。建議先設定系統金鑰服務（Linux 需安裝 gnome-keyring 或 kwallet）後重新啟動 App。',
            'Keys are currently written to secrets.json in plaintext (mode 600). Set up a system key service (Linux needs gnome-keyring or kwallet) and restart the app.',
          )}
        </Banner>
      )}

      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <Btn
          variant="primary"
          icon="checkCircle"
          disabled={pendingIds.length === 0}
          loading={savingAll}
          onClick={() => void saveAll()}
        >
          {pendingIds.length
            ? t(`儲存全部變更（${pendingIds.length}）`, `Save all changes (${pendingIds.length})`)
            : t('儲存全部變更', 'Save all changes')}
        </Btn>
        <span className="help">
          {t(
            '在下方任意欄位輸入金鑰後，按這裡一次全部儲存（也可用各列的「儲存」單獨存）。',
            'Enter keys in any fields below, then save them all at once (or use each row’s Save).',
          )}
        </span>
      </div>

      <Panel icon="key" title={t('LLM 供應商', 'LLM providers')}>
        <div className="stack gap-16">
          {LLM_PROVIDERS.map((id) => (
            <KeyRow key={id} id={id} value={values[id] ?? ''} onChange={(v) => setVal(id, v)} />
          ))}
        </div>
      </Panel>

      <Panel icon="database" title={t('資料來源', 'Data sources')}>
        <div className="stack gap-16">
          {DATA_PROVIDERS.map((id) => (
            <KeyRow key={id} id={id} value={values[id] ?? ''} onChange={(v) => setVal(id, v)} />
          ))}
          <div className="help">
            {t(
              'Alpha Vantage 用於美股基本面；FinMind 用於台股。未設定時對應的分析師會退回較簡略的資料來源。',
              'Alpha Vantage is for US fundamentals; FinMind is for Taiwan stocks. Without them the matching analyst falls back to a simpler data source.',
            )}
          </div>
        </div>
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------------ 後端 */

function Backend() {
  const { settings, updateSettings, backend, logs, restartBackend } = useStore()
  const { t } = useI18n()
  const [detected, setDetected] = useState<{ repoRoot: string | null; python: string | null } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyLogs = () => {
    const text = logs.map((l) => `${formatClock(l.at)}\t${l.text}`).join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  useEffect(() => {
    void tax.settings.detect().then(setDetected)
  }, [])

  if (!settings) return null
  const b = settings.backend

  const restart = async () => {
    setBusy(true)
    await restartBackend()
    setBusy(false)
  }

  return (
    <>
      {backend.phase === 'error' && (
        <Banner tone="err" title={t('後端未就緒', 'Backend not ready')}>
          {backend.message ?? t('請檢查下方設定。', 'Check the settings below.')}
        </Banner>
      )}

      <Panel icon="cpu" title={t('執行方式', 'How it runs')}>
        <div className="stack gap-16">
          <Seg
            label={t('後端模式', 'Backend mode')}
            value={b.mode}
            onChange={(v) => void updateSettings({ backend: { ...b, mode: v } })}
            options={[
              { value: 'auto' as const, label: t('由 App 啟動', 'Launched by app') },
              { value: 'external' as const, label: t('連到既有後端', 'Connect to existing') },
            ]}
          />

          {b.mode === 'auto' ? (
            <>
              <Field
                label={t('專案目錄', 'Project directory')}
                help={
                  detected?.repoRoot
                    ? t(`留空則自動偵測：${detected.repoRoot}`, `Leave blank to auto-detect: ${detected.repoRoot}`)
                    : t('自動偵測失敗，請手動指定含有 backend/app/main.py 的資料夾', 'Auto-detect failed — pick the folder containing backend/app/main.py')
                }
              >
                <div className="row gap-8">
                  <input
                    className="input mono"
                    value={b.cwd}
                    placeholder={detected?.repoRoot ?? '/path/to/TradingAgentsX'}
                    onChange={(e) => void updateSettings({ backend: { ...b, cwd: e.target.value } })}
                  />
                  <Btn
                    onClick={async () => {
                      const dir = await tax.settings.selectDir(b.cwd || undefined)
                      if (dir) void updateSettings({ backend: { ...b, cwd: dir } })
                    }}
                  >
                    {t('選擇…', 'Choose…')}
                  </Btn>
                </div>
              </Field>

              <Field
                label={t('Python 直譯器', 'Python interpreter')}
                help={
                  detected?.python
                    ? t(`留空則自動偵測：${detected.python}`, `Leave blank to auto-detect: ${detected.python}`)
                    : t('找不到可用的 Python，請手動指定（需已安裝專案依賴）', 'No usable Python found — pick one manually (deps must be installed)')
                }
              >
                <div className="row gap-8">
                  <input
                    className="input mono"
                    value={b.command}
                    placeholder={detected?.python ?? '/usr/bin/python3'}
                    onChange={(e) => void updateSettings({ backend: { ...b, command: e.target.value } })}
                  />
                  <Btn
                    onClick={async () => {
                      const file = await tax.settings.selectFile(b.command || undefined)
                      if (file) void updateSettings({ backend: { ...b, command: file } })
                    }}
                  >
                    {t('選擇…', 'Choose…')}
                  </Btn>
                </div>
              </Field>
            </>
          ) : (
            <Field label={t('後端網址', 'Backend URL')} help={t('例如自己用 python -m backend 啟動在 8000 埠。', 'e.g. one you started yourself with python -m backend on port 8000.')}>
              <input
                className="input mono"
                value={b.url}
                onChange={(e) => void updateSettings({ backend: { ...b, url: e.target.value } })}
                placeholder="http://127.0.0.1:8000"
              />
            </Field>
          )}

          <div className="row gap-8">
            <Btn icon="refresh" loading={busy} onClick={() => void restart()}>
              {t('套用並重新啟動後端', 'Apply & restart backend')}
            </Btn>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {t('變更設定後需要重新啟動才會生效', 'Changes take effect after a restart')}
            </span>
          </div>
        </div>
      </Panel>

      <Panel icon="info" title={t('目前狀態', 'Current status')}>
        <div className="stack">
          <Kv k={t('階段', 'Phase')} v={backend.phase} />
          <Kv k={t('位址', 'Address')} v={<span className="mono">{backend.url ?? '—'}</span>} />
          <Kv k="PID" v={<span className="mono">{backend.pid ?? '—'}</span>} />
          <Kv k={t('API 版本', 'API version')} v={<span className="mono">{backend.version ?? '—'}</span>} />
          <Kv k="Redis" v={backend.redisConnected ? t('已連線', 'Connected') : t('未使用', 'Unused')} />
          <Kv
            k={t('啟動於', 'Started at')}
            v={<span className="mono">{backend.startedAt ? formatClock(backend.startedAt) : '—'}</span>}
          />
        </div>
      </Panel>

      <Panel
        icon="terminal"
        title={t('後端輸出', 'Backend output')}
        bodyless
        actions={
          <Btn
            small
            variant="ghost"
            icon={copied ? 'check' : 'copy'}
            disabled={logs.length === 0}
            onClick={copyLogs}
          >
            {copied ? t('已複製', 'Copied') : t('複製', 'Copy')}
          </Btn>
        }
      >
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '10px 12px' }}>
          {logs.length === 0 ? (
            <Empty icon="terminal" title={t('尚無輸出', 'No output yet')} />
          ) : (
            <ul className="log">
              {logs.map((l, i) => (
                <li key={i} className={l.stream}>
                  <span className="t">{formatClock(l.at)}</span>
                  <span className="m">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------ 資料與儲存 */

function Storage() {
  const { settings, updateSettings, refreshReports, reports } = useStore()
  const { t } = useI18n()
  const [usage, setUsage] = useState<{ reportCount: number; bytes: number } | null>(null)

  useEffect(() => {
    void tax.reports.usage().then(setUsage)
  }, [reports])

  if (!settings) return null

  return (
    <>
      <Panel icon="folder" title={t('報告存放位置', 'Reports location')}>
        <div className="stack gap-16">
          <Field
            label={t('資料夾', 'Folder')}
            help={
              usage
                ? t(`目前 ${usage.reportCount} 份報告 · 占用 ${formatBytes(usage.bytes)}`, `${usage.reportCount} reports · ${formatBytes(usage.bytes)} used`)
                : t('計算中…', 'Calculating…')
            }
          >
            <div className="row gap-8">
              <input className="input mono" value={settings.reportsDir} readOnly />
              <Btn
                onClick={async () => {
                  const dir = await tax.settings.selectDir(settings.reportsDir)
                  if (dir) {
                    await updateSettings({ reportsDir: dir })
                    await refreshReports()
                  }
                }}
              >
                {t('變更…', 'Change…')}
              </Btn>
              <Btn icon="folder" onClick={() => void tax.reports.reveal()}>
                {t('開啟', 'Open')}
              </Btn>
            </div>
          </Field>
          <div className="help">
            {t(
              '變更資料夾不會搬移既有檔案。舊報告仍留在原本的位置，改回去就能再看到。',
              'Changing the folder does not move existing files. Old reports stay where they were — switch back to see them again.',
            )}
          </div>
        </div>
      </Panel>

      <Panel icon="alert" title={t('危險區域', 'Danger zone')}>
        <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
          <div className="stack gap-4 flex1">
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--danger)' }}>
              {t('清除所有本機資料', 'Clear all local data')}
            </div>
            <div className="help">
              {t(
                '刪除全部報告、觀察清單與已儲存的金鑰。此操作無法復原，會先跳出確認視窗。',
                'Deletes all reports, the watchlist and saved keys. This cannot be undone — a confirmation dialog appears first.',
              )}
            </div>
          </div>
          <Btn
            variant="danger"
            onClick={async () => {
              const ok = await tax.data.clearAll()
              if (ok) {
                await refreshReports()
                window.location.reload()
              }
            }}
          >
            {t('清除…', 'Clear…')}
          </Btn>
        </div>
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------------ 關於 */

function About() {
  const { appInfo, backend } = useStore()
  const { t } = useI18n()

  return (
    <>
      <Panel icon="package" title={t('版本', 'Versions')}>
        <div className="stack">
          <Kv k="App" v={<span className="mono">{appInfo?.appVersion ?? '—'}</span>} />
          <Kv k="Electron" v={<span className="mono">{appInfo?.electron ?? '—'}</span>} />
          <Kv k="Chromium" v={<span className="mono">{appInfo?.chrome ?? '—'}</span>} />
          <Kv k="Node" v={<span className="mono">{appInfo?.node ?? '—'}</span>} />
          <Kv k={t('平台', 'Platform')} v={<span className="mono">{appInfo?.platform ?? '—'}</span>} />
          <Kv k={t('後端 API', 'Backend API')} v={<span className="mono">{backend.version ?? '—'}</span>} />
        </div>
      </Panel>

      <Panel icon="folder" title={t('路徑', 'Paths')}>
        <div className="stack gap-8">
          <div className="stack gap-2">
            <span className="sec-title">{t('設定與金鑰', 'Settings & keys')}</span>
            <span className="mono faint" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {appInfo?.userDataPath ?? '—'}
            </span>
          </div>
          <div className="stack gap-2">
            <span className="sec-title">{t('報告', 'Reports')}</span>
            <span className="mono faint" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {appInfo?.reportsDir ?? '—'}
            </span>
          </div>
        </div>
      </Panel>

      <Panel icon="wifi" title={t('出站連線', 'Outbound connections')}>
        <div className="stack gap-8">
          <p className="help">
            {t('這個 App 只會連向下列網域，其餘皆由本機處理。你可以用防火牆驗證。', 'This app only reaches the domains below — everything else is handled locally. Verify it with a firewall.')}
          </p>
          <ul className="log stack gap-2">
            {[
              'api.anthropic.com',
              'api.openai.com',
              'generativelanguage.googleapis.com',
              'api.x.ai',
              'api.deepseek.com',
              'dashscope-intl.aliyuncs.com',
              'query1.finance.yahoo.com',
              'www.alphavantage.co',
              'api.finmindtrade.com',
              'news.google.com',
              'fonts.googleapis.com',
            ].map((d) => (
              <li key={d}>
                <span className="m">{d}</span>
              </li>
            ))}
          </ul>
          <p className="help">
            {t(
              '只有你實際使用的供應商會被連線。字體網域僅用於載入介面字體，離線時會自動退回系統字體。',
              'Only the providers you actually use are contacted. The font domains just load the UI font — offline, it falls back to system fonts.',
            )}
          </p>
        </div>
      </Panel>
    </>
  )
}
