import { useEffect, useMemo, useState } from 'react'
import type { DiskUsage, MarketType, WatchItem } from '@shared/types'
import { Icon } from '@/components/Icon'
import { Badge, Banner, Btn, Empty, Kv, Panel } from '@/components/ui'
import { tax } from '@/lib/bridge'
import { formatBytes, formatDuration, formatRelative } from '@/lib/format'
import { VERDICT_CLASS, verdictLabel } from '@/lib/report'
import { useStore } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

export function Dashboard() {
  const { settings, reports, backend, secrets, navigate, updateSettings, refreshReports } = useStore()
  const { t, zh } = useI18n()
  const [usage, setUsage] = useState<DiskUsage | null>(null)
  const [newSymbol, setNewSymbol] = useState('')

  const MARKET_LABEL: Record<MarketType, string> = {
    us: t('美股', 'US'),
    twse: t('台股上市', 'TW · TWSE'),
    tpex: t('台股上櫃', 'TW · TPEx'),
  }

  useEffect(() => {
    void tax.reports.usage().then(setUsage)
  }, [reports])

  /** 每檔代號最近一次的分析結果 */
  const latestByTicker = useMemo(() => {
    const map = new Map<string, (typeof reports)[number]>()
    for (const r of reports) {
      if (!map.has(r.ticker)) map.set(r.ticker, r)
    }
    return map
  }, [reports])

  const avgDuration = useMemo(() => {
    const withDuration = reports.filter((r) => r.durationMs && r.durationMs > 0)
    if (!withDuration.length) return null
    return withDuration.reduce((s, r) => s + (r.durationMs ?? 0), 0) / withDuration.length
  }, [reports])

  const watchlist = settings?.watchlist ?? []
  const setKeys = secrets.items.filter((i) => i.isSet).length

  const addWatch = async () => {
    const symbol = newSymbol.trim().toUpperCase()
    if (!symbol || !settings) return
    if (watchlist.some((w) => w.symbol === symbol)) {
      setNewSymbol('')
      return
    }
    const market: MarketType = /^\d{4,6}$/.test(symbol) ? 'twse' : 'us'
    const next: WatchItem[] = [...watchlist, { symbol, name: '', market }]
    await updateSettings({ watchlist: next })
    setNewSymbol('')
  }

  const removeWatch = async (symbol: string) => {
    if (!settings) return
    await updateSettings({ watchlist: watchlist.filter((w) => w.symbol !== symbol) })
  }

  return (
    <>
      <main className="main">
        <div className="main-head">
          <div>
            <h1>{t('總覽', 'Overview')}</h1>
            <div className="sub">
              {t('全部運算在本機執行 · 報告存於你自己的磁碟', 'Everything runs locally · reports live on your own disk')}
            </div>
          </div>
          <div className="row gap-8 mla">
            <Btn small icon="refresh" onClick={() => void refreshReports()}>
              {t('重新整理', 'Refresh')}
            </Btn>
            <Btn small variant="primary" icon="play" onClick={() => navigate({ name: 'new' })}>
              {t('新增分析', 'New analysis')}
            </Btn>
          </div>
        </div>

        <div className="main-scroll">
          {backend.phase === 'error' && (
            <Banner
              tone="err"
              title={t('本機後端未就緒', 'Local backend not ready')}
              action={
                <Btn small onClick={() => navigate({ name: 'settings' })}>
                  {t('前往設定', 'Open settings')}
                </Btn>
              }
            >
              {backend.message ??
                t('請到「設定 → 後端」檢查 Python 路徑與專案目錄。', 'Check the Python path and project directory under Settings → Backend.')}
            </Banner>
          )}

          {setKeys === 0 && (
            <Banner
              tone="warn"
              icon="key"
              title={t('尚未設定任何 API 金鑰', 'No API keys configured yet')}
              action={
                <Btn small onClick={() => navigate({ name: 'settings' })}>
                  {t('新增金鑰', 'Add keys')}
                </Btn>
              }
            >
              {t(
                '分析需要至少一組 LLM 供應商金鑰。金鑰會存進系統鑰匙圈，不會離開這台電腦。',
                'Analysis needs at least one LLM provider key. Keys go into the system keychain and never leave this machine.',
              )}
            </Banner>
          )}

          <section aria-label={t('本機統計', 'Local stats')}>
            <div className="tiles">
              <div className="tile">
                <div className="k">
                  <Icon name="file" size="sm" />
                  {t('本機報告', 'Reports')}
                </div>
                <div className="v">{reports.length}</div>
                <div className="d">
                  {usage ? t(`占用 ${formatBytes(usage.bytes)}`, `${formatBytes(usage.bytes)} used`) : t('計算中…', 'Calculating…')}
                </div>
              </div>

              <div className="tile">
                <div className="k">
                  <Icon name="clock" size="sm" />
                  {t('平均耗時', 'Avg. duration')}
                </div>
                <div className="v">{avgDuration ? formatDuration(avgDuration) : '—'}</div>
                <div className="d">
                  {avgDuration ? t(`取樣 ${reports.length} 份報告`, `over ${reports.length} reports`) : t('尚無資料', 'No data yet')}
                </div>
              </div>

              <div className="tile">
                <div className="k">
                  <Icon name="key" size="sm" />
                  {t('已設定金鑰', 'Keys set')}
                </div>
                <div className="v">
                  {setKeys}
                  <span className="faint" style={{ fontSize: 14 }}>
                    /{secrets.items.length}
                  </span>
                </div>
                <div className="d">
                  {secrets.encryptionAvailable ? t('由系統鑰匙圈加密', 'Encrypted by keychain') : t('系統加密不可用', 'System encryption N/A')}
                </div>
              </div>

              <div className="tile">
                <div className="k">
                  <Icon name="cpu" size="sm" />
                  {t('後端', 'Backend')}
                </div>
                <div className="v" style={{ fontSize: 16, marginTop: 12 }}>
                  {backend.phase === 'ready'
                    ? t('就緒', 'Ready')
                    : backend.phase === 'starting'
                      ? t('啟動中', 'Starting')
                      : backend.phase === 'error'
                        ? t('錯誤', 'Error')
                        : t('停止', 'Stopped')}
                </div>
                <div className="d">
                  {backend.url ? backend.url.replace(/^https?:\/\//, '') : '—'}
                </div>
              </div>
            </div>
          </section>

          <Panel
            icon="eye"
            title={t('觀察清單', 'Watchlist')}
            bodyless
            actions={
              <div className="row gap-6">
                <input
                  className="input mono"
                  style={{ width: 130, height: 24, fontSize: 12 }}
                  placeholder={t('新增代號…', 'Add ticker…')}
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addWatch()
                  }}
                  aria-label={t('新增代號到觀察清單', 'Add ticker to watchlist')}
                />
                <Btn small icon="plus" iconOnly aria-label={t('加入觀察清單', 'Add to watchlist')} onClick={() => void addWatch()} />
              </div>
            }
          >
            {watchlist.length === 0 ? (
              <Empty icon="eye" title={t('觀察清單是空的', 'Your watchlist is empty')}>
                {t('在上方輸入股票代號（例如 ', 'Add a ticker above (e.g. ')}
                <code>NVDA</code>
                {t(' 或 ', ' or ')}
                <code>2330</code>
                {t('）加入追蹤。加入後這裡會顯示該檔最近一次的分析結果。', ') to track it. Its latest verdict will show here.')}
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>{t('代號', 'Ticker')}</th>
                    <th style={{ width: 110 }}>{t('市場', 'Market')}</th>
                    <th className="r" style={{ width: 110 }}>
                      {t('最新判斷', 'Latest verdict')}
                    </th>
                    <th className="r" style={{ width: 120 }}>
                      {t('最近分析', 'Last analysis')}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((w) => {
                    const latest = latestByTicker.get(w.symbol)
                    return (
                      <tr key={w.symbol}>
                        <td className="tk">{w.symbol}</td>
                        <td className="dim">{MARKET_LABEL[w.market]}</td>
                        <td className="r">
                          {latest ? (
                            <span className={`badge ${VERDICT_CLASS[latest.verdict]}`}>
                              {verdictLabel(latest.verdict, zh)}
                            </span>
                          ) : (
                            <span className="faint">{t('尚未分析', 'Not analyzed')}</span>
                          )}
                        </td>
                        <td className="r faint" style={{ fontSize: 11.5 }}>
                          {latest ? formatRelative(latest.createdAt) : '—'}
                        </td>
                        <td className="r">
                          <div className="row gap-4" style={{ justifyContent: 'flex-end' }}>
                            {latest && (
                              <Btn
                                small
                                variant="ghost"
                                icon="file"
                                iconOnly
                                aria-label={t(`開啟 ${w.symbol} 報告`, `Open ${w.symbol} report`)}
                                onClick={() =>
                                  navigate({ name: 'report', fileName: latest.fileName })
                                }
                              />
                            )}
                            <Btn
                              small
                              variant="ghost"
                              icon="trash"
                              iconOnly
                              aria-label={t(`從觀察清單移除 ${w.symbol}`, `Remove ${w.symbol} from watchlist`)}
                              onClick={() => void removeWatch(w.symbol)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            icon="file"
            title={t('最近報告', 'Recent reports')}
            bodyless
            actions={
              <div className="row gap-8">
                <span className="faint mono" style={{ fontSize: 11 }}>
                  {settings?.reportsDir ?? ''}
                </span>
                <Btn small icon="folder" onClick={() => void tax.reports.reveal()}>
                  {t('開啟資料夾', 'Open folder')}
                </Btn>
              </div>
            }
          >
            {reports.length === 0 ? (
              <Empty
                icon="file"
                title={t('還沒有任何報告', 'No reports yet')}
                action={
                  <Btn small variant="primary" icon="play" onClick={() => navigate({ name: 'new' })}>
                    {t('開始第一次分析', 'Run your first analysis')}
                  </Btn>
                }
              >
                {t('完成的分析會以 JSON 存在你的報告資料夾，離線也能查看。', 'Finished analyses are saved as JSON in your reports folder — viewable offline.')}
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>{t('代號', 'Ticker')}</th>
                    <th style={{ width: 92 }}>{t('分析日', 'Date')}</th>
                    <th>{t('使用模型', 'Models')}</th>
                    <th className="r" style={{ width: 100 }}>
                      {t('判斷', 'Verdict')}
                    </th>
                    <th className="r" style={{ width: 72 }}>
                      {t('信心', 'Conf.')}
                    </th>
                    <th className="r" style={{ width: 78 }}>
                      {t('耗時', 'Time')}
                    </th>
                    <th className="r" style={{ width: 110 }}>
                      {t('完成', 'Done')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.slice(0, 12).map((r) => (
                    <tr
                      key={r.fileName}
                      className="clickable"
                      onClick={() => navigate({ name: 'report', fileName: r.fileName })}
                    >
                      <td className="tk">{r.ticker}</td>
                      <td className="dim mono" style={{ fontSize: 11.5 }}>
                        {r.analysisDate}
                      </td>
                      <td className="dim mono truncate" style={{ fontSize: 11.5, maxWidth: 260 }}>
                        {r.deepThinkLlm} + {r.quickThinkLlm}
                      </td>
                      <td className="r">
                        <span className={`badge ${VERDICT_CLASS[r.verdict]}`}>
                          {verdictLabel(r.verdict, zh)}
                        </span>
                      </td>
                      <td className="r num">{r.confidence != null ? `${r.confidence}%` : '—'}</td>
                      <td className="r num faint">
                        {r.durationMs ? formatDuration(r.durationMs) : '—'}
                      </td>
                      <td className="r faint" style={{ fontSize: 11.5 }}>
                        {formatRelative(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </main>

      <aside className="aside" aria-label={t('本機環境', 'Local environment')}>
        <div className="aside-head">
          <Icon name="cpu" size="sm" />
          {t('本機環境', 'Local environment')}
        </div>
        <div className="aside-scroll">
          <div className="stack gap-8">
            <div className="sec-title">{t('後端', 'Backend')}</div>
            <div className="stack">
              <Kv
                k={t('狀態', 'Status')}
                v={
                  <span className="row gap-6" style={{ justifyContent: 'flex-end' }}>
                    <span
                      className={
                        backend.phase === 'ready'
                          ? 'dot live'
                          : backend.phase === 'starting'
                            ? 'dot warn'
                            : backend.phase === 'error'
                              ? 'dot err'
                              : 'dot'
                      }
                    />
                    {backend.phase === 'ready' ? t('執行中', 'Running') : backend.phase}
                  </span>
                }
              />
              <Kv
                k={t('位址', 'Address')}
                v={<span className="mono" style={{ fontSize: 11 }}>{backend.url ?? '—'}</span>}
              />
              <Kv k="PID" v={<span className="mono" style={{ fontSize: 11 }}>{backend.pid ?? '—'}</span>} />
              <Kv k={t('版本', 'Version')} v={<span className="mono" style={{ fontSize: 11 }}>{backend.version ?? '—'}</span>} />
              <Kv k="Redis" v={backend.redisConnected ? t('已連線', 'Connected') : t('未使用', 'Unused')} />
            </div>
          </div>

          <div className="stack gap-8">
            <div className="sec-title">{t('儲存', 'Storage')}</div>
            <div className="stack">
              <Kv k={t('報告數', 'Reports')} v={<span className="num">{usage?.reportCount ?? 0}</span>} />
              <Kv k={t('占用空間', 'Disk used')} v={<span className="num">{usage ? formatBytes(usage.bytes) : '—'}</span>} />
            </div>
            <div className="mono faint" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>
              {settings?.reportsDir}
            </div>
          </div>

          <Panel style={{ background: 'var(--surface-2)' }}>
            <div className="stack gap-6">
              <div className="row gap-8">
                <Icon name="shield" size="sm" style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t('金鑰不離開本機', 'Keys never leave this machine')}</span>
              </div>
              <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                {secrets.encryptionAvailable
                  ? t(
                      '金鑰由作業系統的加密儲存保管，只在送出請求前於主行程解密，介面本身拿不到明文。',
                      'Keys are held by the OS encrypted store and decrypted in the main process only when sending a request — the UI never sees plaintext.',
                    )
                  : t(
                      '這台機器沒有可用的系統鑰匙圈，金鑰目前以明文存放。建議先設定系統金鑰服務。',
                      'No system keychain is available here, so keys are stored in plaintext. Set up a system key service first.',
                    )}
              </p>
              <Btn small onClick={() => navigate({ name: 'settings' })}>
                {t('管理金鑰', 'Manage keys')}
              </Btn>
            </div>
          </Panel>

          <div className="stack gap-8">
            <div className="sec-title">{t('判斷分布', 'Verdict spread')}</div>
            {reports.length === 0 ? (
              <p className="faint" style={{ fontSize: 11.5 }}>
                {t('尚無報告。', 'No reports yet.')}
              </p>
            ) : (
              <div className="stack gap-6">
                {(['BUY', 'HOLD', 'SELL', 'UNKNOWN'] as const).map((v) => {
                  const n = reports.filter((r) => r.verdict === v).length
                  if (!n) return null
                  return (
                    <div key={v} className="row gap-8" style={{ fontSize: 12 }}>
                      <Badge
                        tone={
                          v === 'BUY' ? 'buy' : v === 'SELL' ? 'sell' : v === 'HOLD' ? 'hold' : 'muted'
                        }
                      >
                        {verdictLabel(v, zh)}
                      </Badge>
                      <span className="mla num faint">{n}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
