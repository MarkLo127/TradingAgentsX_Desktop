import { useEffect, useMemo, useState } from 'react'
import type { AnalysisReports, StoredReport } from '@shared/types'
import { Icon } from '@/components/Icon'
import { Banner, Bar, Btn, Empty, Kv, Markdown, Panel } from '@/components/ui'
import { tax } from '@/lib/bridge'
import { formatDateTime, formatDuration, formatRelative } from '@/lib/format'
import { VERDICT_CLASS, verdictLabel, verdictStyle } from '@/lib/report'
import { useStore } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function Report() {
  const { route, navigate, reports, refreshReports } = useStore()
  const { t, zh } = useI18n()

  const SECTIONS: { id: keyof AnalysisReports; label: string }[] = [
    { id: 'trader_investment_plan', label: t('交易員結論', 'Trader verdict') },
    { id: 'final_trade_decision', label: t('風險決策', 'Risk decision') },
    { id: 'investment_plan', label: t('投資計畫', 'Investment plan') },
    { id: 'market_report', label: t('技術面', 'Technicals') },
    { id: 'fundamentals_report', label: t('基本面', 'Fundamentals') },
    { id: 'news_report', label: t('新聞', 'News') },
    { id: 'sentiment_report', label: t('社群情緒', 'Sentiment') },
  ]

  // 把「哪個檔案的結果」一起存進 state，這樣載入中／已載入都能從渲染推導出來，
  // 不需要在 effect 裡同步 setState，切換報告時也不會短暫顯示上一份的內容。
  const [loaded, setLoaded] = useState<{ file: string; report: StoredReport | null } | null>(null)
  const [active, setActive] = useState<{ file: string; id: keyof AnalysisReports } | null>(null)

  const fileName = route.fileName

  useEffect(() => {
    if (!fileName) return
    let cancelled = false
    void tax.reports.get(fileName).then((r) => {
      if (!cancelled) setLoaded({ file: fileName, report: r })
    })
    return () => {
      cancelled = true
    }
  }, [fileName])

  const settled = Boolean(fileName) && loaded?.file === fileName
  const report = settled ? (loaded?.report ?? null) : null
  const loading = Boolean(fileName) && !settled

  const available = useMemo(() => {
    if (!report) return []
    return SECTIONS.filter((s) => text(report.result.reports?.[s.id]).length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, zh])

  const current = (active && active.file === fileName ? active.id : null) ?? available[0]?.id ?? null

  /* ------------------------------------------------------------ 報告清單 */

  if (!fileName) {
    return (
      <main className="main">
        <div className="main-head">
          <div>
            <h1>{t('報告', 'Reports')}</h1>
            <div className="sub">{t(`${reports.length} 份存於本機`, `${reports.length} saved locally`)}</div>
          </div>
          <div className="row gap-8 mla">
            <Btn small icon="folder" onClick={() => void tax.reports.reveal()}>
              {t('開啟資料夾', 'Open folder')}
            </Btn>
          </div>
        </div>
        <div className="main-scroll">
          {reports.length === 0 ? (
            <Empty
              icon="file"
              title={t('還沒有任何報告', 'No reports yet')}
              action={
                <Btn small variant="primary" icon="play" onClick={() => navigate({ name: 'new' })}>
                  {t('開始分析', 'Start analysis')}
                </Btn>
              }
            >
              {t('完成的分析會以 JSON 檔存在報告資料夾，離線也能開啟。', 'Finished analyses are saved as JSON in the reports folder — openable offline.')}
            </Empty>
          ) : (
            <Panel bodyless>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>{t('代號', 'Ticker')}</th>
                    <th style={{ width: 96 }}>{t('分析日', 'Date')}</th>
                    <th>{t('模型', 'Models')}</th>
                    <th className="r" style={{ width: 100 }}>
                      {t('判斷', 'Verdict')}
                    </th>
                    <th className="r" style={{ width: 72 }}>
                      {t('信心', 'Conf.')}
                    </th>
                    <th className="r" style={{ width: 120 }}>
                      {t('完成', 'Done')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr
                      key={r.fileName}
                      className="clickable"
                      onClick={() => navigate({ name: 'report', fileName: r.fileName })}
                    >
                      <td className="tk">{r.ticker}</td>
                      <td className="dim mono" style={{ fontSize: 11.5 }}>
                        {r.analysisDate}
                      </td>
                      <td className="dim mono truncate" style={{ fontSize: 11.5, maxWidth: 280 }}>
                        {r.deepThinkLlm} + {r.quickThinkLlm}
                      </td>
                      <td className="r">
                        <span className={`badge ${VERDICT_CLASS[r.verdict]}`}>
                          {verdictLabel(r.verdict, zh)}
                        </span>
                      </td>
                      <td className="r num">{r.confidence != null ? `${r.confidence}%` : '—'}</td>
                      <td className="r faint" style={{ fontSize: 11.5 }}>
                        {formatRelative(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </main>
    )
  }

  /* ------------------------------------------------------------ 單份報告 */

  if (loading) {
    return (
      <main className="main">
        <div className="main-head">
          <h1>{t('載入中…', 'Loading…')}</h1>
        </div>
        <div className="main-scroll">
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      </main>
    )
  }

  if (!report) {
    return (
      <main className="main">
        <div className="main-head">
          <div className="row gap-8">
            <Btn small variant="ghost" icon="chevronLeft" onClick={() => navigate({ name: 'report' })}>
              {t('返回', 'Back')}
            </Btn>
            <h1>{t('找不到報告', 'Report not found')}</h1>
          </div>
        </div>
        <div className="main-scroll">
          <Banner tone="err" title={t('無法讀取報告檔案', 'Could not read the report file')}>
            {t(`${fileName} 不存在或格式不正確。可能已被移動或刪除。`, `${fileName} is missing or malformed — it may have been moved or deleted.`)}
          </Banner>
        </div>
      </main>
    )
  }

  const debate = report.result.reports?.investment_debate_state
  const risk = report.result.reports?.risk_debate_state
  const bull = text(debate?.bull_history)
  const bear = text(debate?.bear_history)
  const risky = text(risk?.risky_history)
  const safe = text(risk?.safe_history)
  const neutral = text(risk?.neutral_history)

  return (
    <>
      <main className="main">
        <div className="main-head">
          <Btn small variant="ghost" icon="chevronLeft" iconOnly aria-label={t('返回報告列表', 'Back to reports')} onClick={() => navigate({ name: 'report' })} />
          <div>
            <h1>
              <span className="mono">{report.ticker}</span>
              <span className="dim" style={{ fontWeight: 400 }}>
                {report.analysisDate}
              </span>
            </h1>
            <div className="sub">
              {report.deepThinkLlm} + {report.quickThinkLlm} · {formatDateTime(report.createdAt)}{' '}
              {t('完成', 'done')}
              {report.durationMs ? ` · ${t('耗時', 'took')} ${formatDuration(report.durationMs)}` : ''}
            </div>
          </div>
          <div className="row gap-8 mla">
            <Btn small icon="folder" onClick={() => void tax.reports.reveal(report.fileName)}>
              {t('顯示檔案', 'Show file')}
            </Btn>
            <Btn
              small
              variant="danger"
              icon="trash"
              onClick={async () => {
                await tax.reports.remove(report.fileName)
                await refreshReports()
                navigate({ name: 'report' })
              }}
            >
              {t('刪除', 'Delete')}
            </Btn>
          </div>
        </div>

        <div className="main-scroll">
          <section className="verdict" style={verdictStyle(report.verdict)} aria-label={t('最終判斷', 'Final verdict')}>
            <div>
              <div className="call">{verdictLabel(report.verdict, zh)}</div>
              <div className="call-sub">{t('最終判斷', 'Final verdict')}</div>
            </div>
            <div className="stack gap-10">
              {report.confidence != null ? (
                <div className="gauge">
                  <span className="faint" style={{ fontSize: 11.5, width: 52 }}>
                    {t('信心度', 'Confidence')}
                  </span>
                  <Bar value={report.confidence} width={150} color="var(--verdict-color)" />
                  <span className="pct" style={{ color: 'var(--verdict-color)' }}>
                    {report.confidence}%
                  </span>
                </div>
              ) : (
                <div className="faint" style={{ fontSize: 12 }}>
                  {t('報告中沒有可解析的信心度數值', 'No confidence value could be parsed from the report')}
                </div>
              )}
              <div className="row gap-20 faint" style={{ fontSize: 12 }}>
                <span>{t(`分析師 ${report.analystCount} 位`, `${report.analystCount} analysts`)}</span>
                {report.result.price_stats && (
                  <span>
                    {t('區間漲跌', 'Period change')}{' '}
                    <span
                      className={`mono ${report.result.price_stats.growth_rate >= 0 ? 'up' : 'down'}`}
                    >
                      {report.result.price_stats.growth_rate >= 0 ? '+' : ''}
                      {report.result.price_stats.growth_rate.toFixed(2)}%
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="stack gap-6" style={{ textAlign: 'right' }}>
              <span className="badge badge-muted" style={{ marginLeft: 'auto' }}>
                {report.marketType === 'us' ? t('美股', 'US') : t('台股', 'TW')}
              </span>
              <span className="faint mono" style={{ fontSize: 10.5 }}>
                {report.fileName}
              </span>
            </div>
          </section>

          {(bull || bear) && (
            <section aria-label={t('多空辯論', 'Bull/Bear debate')}>
              <div className="sec-title" style={{ marginBottom: 8 }}>
                {t('多空辯論', 'Bull / Bear debate')}
              </div>
              <div className="debate">
                {bull && (
                  <div className="side bull">
                    <div className="side-head">
                      <Icon name="trendUp" size="sm" />
                      {t('多方研究員', 'Bull Researcher')}
                    </div>
                    <div className="side-body">{bull}</div>
                  </div>
                )}
                {bear && (
                  <div className="side bear">
                    <div className="side-head">
                      <Icon name="trendDown" size="sm" />
                      {t('空方研究員', 'Bear Researcher')}
                    </div>
                    <div className="side-body">{bear}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {(risky || safe || neutral) && (
            <section aria-label={t('風險辯論', 'Risk debate')}>
              <div className="sec-title" style={{ marginBottom: 8 }}>
                {t('風險辯論', 'Risk debate')}
              </div>
              <div className="debate" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {risky && (
                  <div className="side bear">
                    <div className="side-head">
                      <Icon name="zap" size="sm" />
                      {t('激進派', 'Aggressive')}
                    </div>
                    <div className="side-body">{risky}</div>
                  </div>
                )}
                {safe && (
                  <div className="side bull">
                    <div className="side-head">
                      <Icon name="shield" size="sm" />
                      {t('保守派', 'Conservative')}
                    </div>
                    <div className="side-body">{safe}</div>
                  </div>
                )}
                {neutral && (
                  <div className="side neutral">
                    <div className="side-head">
                      <Icon name="scale" size="sm" />
                      {t('中立派', 'Neutral')}
                    </div>
                    <div className="side-body">{neutral}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          <Panel
            icon="file"
            title={t('完整報告', 'Full report')}
            actions={
              available.length > 0 && (
                <div className="seg" role="tablist" aria-label={t('報告章節', 'Report sections')}>
                  {available.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={current === s.id}
                      onClick={() => setActive({ file: report.fileName, id: s.id })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )
            }
          >
            {current ? (
              <Markdown>{text(report.result.reports?.[current])}</Markdown>
            ) : (
              <Empty icon="file" title={t('這份報告沒有文字內容', 'This report has no text content')}>
                {t('後端回傳的 reports 欄位是空的。可能是分析中途出錯，請查看原始 JSON。', 'The backend returned empty report fields — the analysis may have errored midway. Check the raw JSON.')}
              </Empty>
            )}
          </Panel>
        </div>
      </main>

      <aside className="aside" aria-label={t('報告資訊', 'Report info')}>
        <div className="aside-head">
          <Icon name="info" size="sm" />
          {t('報告資訊', 'Report info')}
        </div>
        <div className="aside-scroll">
          <div className="stack gap-8">
            <div className="sec-title">{t('執行參數', 'Run parameters')}</div>
            <div className="stack">
              <Kv k={t('代號', 'Ticker')} v={<span className="mono">{report.ticker}</span>} />
              <Kv k={t('分析日', 'Date')} v={<span className="mono">{report.analysisDate}</span>} />
              <Kv
                k={t('深度模型', 'Deep model')}
                v={<span className="mono" style={{ fontSize: 11 }}>{report.deepThinkLlm}</span>}
              />
              <Kv
                k={t('快速模型', 'Quick model')}
                v={<span className="mono" style={{ fontSize: 11 }}>{report.quickThinkLlm}</span>}
              />
              <Kv k={t('分析師', 'Analysts')} v={t(`${report.analystCount} 位`, `${report.analystCount}`)} />
              <Kv k={t('耗時', 'Duration')} v={report.durationMs ? formatDuration(report.durationMs) : '—'} />
            </div>
          </div>

          {report.result.price_stats && (
            <div className="stack gap-8">
              <div className="sec-title">{t('價格區間', 'Price range')}</div>
              <div className="stack">
                <Kv k={t('起始', 'Start')} v={<span className="num">{report.result.price_stats.start_price}</span>} />
                <Kv k={t('結束', 'End')} v={<span className="num">{report.result.price_stats.end_price}</span>} />
                <Kv k={t('天數', 'Days')} v={<span className="num">{report.result.price_stats.duration_days}</span>} />
                <Kv
                  k={t('漲跌', 'Change')}
                  v={
                    <span
                      className={`num ${report.result.price_stats.growth_rate >= 0 ? 'up' : 'down'}`}
                    >
                      {report.result.price_stats.growth_rate.toFixed(2)}%
                    </span>
                  }
                />
              </div>
            </div>
          )}

          <div className="stack gap-8">
            <div className="sec-title">{t('章節產出', 'Sections produced')}</div>
            <div className="stack gap-2">
              {SECTIONS.map((s) => {
                const has = text(report.result.reports?.[s.id]).length > 0
                return (
                  <div key={s.id} className="row gap-8" style={{ height: 24, fontSize: 11.5 }}>
                    <span className={has ? 'dot live' : 'dot'} />
                    <span className={has ? '' : 'faint'}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="stack gap-8">
            <div className="sec-title">{t('本機檔案', 'Local file')}</div>
            <div className="mono faint" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>
              {report.fileName}
            </div>
            <Btn small icon="folder" onClick={() => void tax.reports.reveal(report.fileName)}>
              {t('顯示於檔案總管', 'Show in file manager')}
            </Btn>
          </div>

          <p
            className="faint"
            style={{
              fontSize: 11,
              lineHeight: 1.55,
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
            }}
          >
            {t('本報告由 LLM 代理人生成，僅供研究參考，不構成投資建議。', 'Generated by LLM agents for research only — not investment advice.')}
          </p>
        </div>
      </aside>
    </>
  )
}
