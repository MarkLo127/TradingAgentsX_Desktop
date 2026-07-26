import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Badge, Banner, Bar, Btn, Empty, Panel, Switch } from '@/components/ui'
import { formatClock, formatDuration } from '@/lib/format'
import {
  PIPELINE,
  agentName,
  agentProduced,
  agentRole,
  extractToolActivity,
  phaseTitle,
  plannedAgents,
  researchModeLabel,
  researchModeTone,
} from '@/lib/report'
import { useStore } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

export function Running() {
  const { task, logs, navigate, dismissTask, backend } = useStore()
  const { t, zh } = useI18n()
  // 用「現在時刻」當 state、渲染時再相減，避免在 effect 裡同步 setState 或在渲染中呼叫 Date.now()
  const [now, setNow] = useState(() => Date.now())
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)

  const copyLogs = () => {
    const text = logs.map((l) => `${formatClock(l.at)}\t${l.text}`).join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const status = task?.status?.status ?? 'pending'
  const finished = status === 'completed' || status === 'failed'
  const startedAt = task?.startedAt ?? null

  useEffect(() => {
    if (startedAt === null || finished) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt, finished])

  useEffect(() => {
    if (autoScroll) logEnd.current?.scrollIntoView({ block: 'end' })
  }, [logs, autoScroll])

  /** 從後端 stdout 擷取到的工具呼叫 —— 這是唯一可靠的活動訊號 */
  const toolActivity = useMemo(() => {
    const seen: { name: string; at: string }[] = []
    for (const l of logs) {
      const name = extractToolActivity(l.text)
      if (name && seen[seen.length - 1]?.name !== name) seen.push({ name, at: l.at })
    }
    return seen.slice(-8)
  }, [logs])

  if (!task) {
    return (
      <main className="main">
        <div className="main-head">
          <div>
            <h1>{t('執行中', 'Running')}</h1>
            <div className="sub">{t('分析啟動後會在這裡即時追蹤', 'A running analysis is tracked here in real time')}</div>
          </div>
        </div>
        <div className="main-scroll">
          <Empty
            icon="activity"
            title={t('沒有進行中的分析', 'No analysis in progress')}
            action={
              <Btn small variant="primary" icon="play" onClick={() => navigate({ name: 'new' })}>
                {t('新增分析', 'New analysis')}
              </Btn>
            }
          >
            {t('啟動分析後，這裡會顯示即時狀態與後端輸出。', 'Once you start an analysis, live status and backend output appear here.')}
          </Empty>
        </div>
      </main>
    )
  }

  const planned = plannedAgents(task.input.analysts, task.input.researchDepth)
  const result = task.status?.result ?? null
  const completedAt = task.status?.completed_at
  const totalMs =
    finished && completedAt
      ? new Date(completedAt).getTime() - task.startedAt
      : now - task.startedAt

  return (
    <>
      <main className="main">
        <div className="main-head">
          <div className="row gap-10">
            {status === 'running' || status === 'pending' ? (
              <span className="dot live pulse" aria-hidden="true" />
            ) : status === 'completed' ? (
              <Icon name="checkCircle" style={{ color: 'var(--accent)' }} />
            ) : (
              <Icon name="alert" style={{ color: 'var(--danger)' }} />
            )}
            <div>
              <h1>
                <span className="mono">{task.input.ticker}</span>
                <Badge tone={researchModeTone(task.input.researchDepth)}>
                  {researchModeLabel(task.input.researchDepth, zh)} ·{' '}
                  {t(`${planned.length} 位代理人`, `${planned.length} agents`)}
                </Badge>
              </h1>
              <div className="sub">
                {task.input.analysisDate} · {t('已執行', 'elapsed')}{' '}
                <span className="num">{formatDuration(totalMs)}</span>
                {task.status?.progress ? ` · ${task.status.progress}` : ''}
              </div>
            </div>
          </div>

          <div className="row gap-8 mla">
            {finished ? (
              <>
                <Btn small icon="refresh" onClick={() => navigate({ name: 'new' })}>
                  {t('再跑一次', 'Run again')}
                </Btn>
                {task.savedFileName && (
                  <Btn
                    small
                    variant="primary"
                    icon="file"
                    onClick={() => navigate({ name: 'report', fileName: task.savedFileName! })}
                  >
                    {t('查看報告', 'View report')}
                  </Btn>
                )}
              </>
            ) : (
              <Btn small onClick={dismissTask}>
                {t('停止追蹤', 'Stop tracking')}
              </Btn>
            )}
          </div>
        </div>

        <div className="main-scroll">
          {status === 'failed' && (
            <Banner tone="err" title={t('分析失敗', 'Analysis failed')}>
              {task.status?.error ?? t('後端沒有回傳錯誤訊息，請查看右側日誌。', 'The backend returned no error message — check the log on the right.')}
            </Banner>
          )}

          {task.error && status !== 'failed' && (
            <Banner tone="warn" title={t('無法取得任務狀態', 'Could not fetch task status')}>
              {task.error}
              {t(`（${backend.phase === 'ready' ? '將持續重試' : '後端未就緒'}）`, ` (${backend.phase === 'ready' ? 'will keep retrying' : 'backend not ready'})`)}
            </Banner>
          )}

          {status === 'completed' && (
            <Banner tone="ok" title={t('分析完成', 'Analysis complete')}>
              {task.savedFileName
                ? t(`結果已存成 ${task.savedFileName}`, `Saved as ${task.savedFileName}`)
                : t('結果已取得，但寫入本機檔案失敗，請檢查報告資料夾權限。', 'Got the result but failed to write the local file — check reports-folder permissions.')}
            </Banner>
          )}

          {!finished && (
            <Panel bodyless>
              <div style={{ padding: '12px 14px' }}>
                <div className="row gap-12">
                  <Bar value={100} />
                  <span className="num faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {status === 'pending' ? t('排入佇列', 'Queued') : t('執行中', 'Running')}
                  </span>
                </div>
                <p className="faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
                  {t(
                    '後端目前只回報整體狀態，不提供逐一代理人的進度。下方列出這次會執行的代理人，完成後會依實際產出的報告標記。',
                    'The backend only reports overall status, not per-agent progress. The agents below are marked by their actual output once finished.',
                  )}
                </p>
              </div>
            </Panel>
          )}

          <Panel
            icon="branch"
            title={t('代理人流程', 'Agent pipeline')}
            bodyless
            actions={
              <span className="faint mono" style={{ fontSize: 11 }}>
                LangGraph · research_depth={task.input.researchDepth}
              </span>
            }
          >
            {PIPELINE.map((phase, i) => {
              const agents = phase.agents.filter((a) => planned.some((p) => p.id === a.id))
              if (!agents.length) return null
              const allDone = finished && agents.every((a) => agentProduced(a, result))
              return (
                <div key={phase.id} className={`phase ${allDone ? 'done' : ''}`}>
                  <div className="phase-head">
                    <span className="n">{i + 1}</span>
                    {phaseTitle(phase, zh)}
                  </div>
                  {agents.map((a) => {
                    const produced = agentProduced(a, result)
                    const cls = finished ? (produced ? 'done' : 'pending') : 'running'
                    return (
                      <div key={a.id} className={`agent ${cls}`}>
                        <span className="st">
                          {finished ? (
                            produced ? (
                              <Icon name="checkCircle" size="sm" />
                            ) : (
                              <Icon name="circle" size="sm" />
                            )
                          ) : (
                            <Icon name="spinner" size="sm" spin />
                          )}
                        </span>
                        <div>
                          <div className="nm">{agentName(a, zh)}</div>
                          <div className="role">{agentRole(a, zh)}</div>
                        </div>
                        <div className="meta">
                          {finished
                            ? produced
                              ? t('有產出', 'produced')
                              : a.reportKey
                                ? t('無產出', 'no output')
                                : '—'
                            : t('進行中', 'running')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </Panel>

          {toolActivity.length > 0 && (
            <Panel icon="terminal" title={t('觀察到的工具呼叫', 'Observed tool calls')} bodyless>
              <div style={{ padding: '10px 14px' }}>
                <ul className="log">
                  {toolActivity.map((act, i) => (
                    <li key={`${act.name}-${i}`}>
                      <span className="t">{formatClock(act.at)}</span>
                      <span className="m">{act.name}</span>
                    </li>
                  ))}
                </ul>
                <p className="faint" style={{ fontSize: 11, marginTop: 8 }}>
                  {t(
                    '由後端輸出解析而來，僅代表資料工具被呼叫，不等同某位代理人已完成。',
                    'Parsed from backend output — it only means a data tool was called, not that an agent finished.',
                  )}
                </p>
              </div>
            </Panel>
          )}
        </div>
      </main>

      <aside className="aside" aria-label={t('後端輸出', 'Backend output')}>
        <div className="aside-head">
          <Icon name="terminal" size="sm" />
          {t('後端輸出', 'Backend output')}
          <span className="row gap-8 mla" style={{ alignItems: 'center' }}>
            <Btn
              small
              variant="ghost"
              iconOnly
              icon={copied ? 'check' : 'copy'}
              disabled={logs.length === 0}
              aria-label={copied ? t('已複製', 'Copied') : t('複製後端輸出', 'Copy backend output')}
              onClick={copyLogs}
            />
            <span className={backend.phase === 'ready' ? 'dot live' : 'dot warn'} />
          </span>
        </div>
        <div className="aside-scroll" style={{ gap: 0 }}>
          {logs.length === 0 ? (
            <p className="faint" style={{ fontSize: 11.5, padding: 8 }}>
              {t('尚無輸出。', 'No output yet.')}
            </p>
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
          <div ref={logEnd} />
        </div>
        <div
          className="row gap-8"
          style={{ borderTop: '1px solid var(--border)', padding: '9px 12px' }}
        >
          <span className="faint mono" style={{ fontSize: 10.5 }}>
            {t('自動捲動', 'Auto-scroll')}
          </span>
          <span className="mla">
            <Switch label={t('自動捲動', 'Auto-scroll')} checked={autoScroll} onChange={setAutoScroll} />
          </span>
        </div>
      </aside>
    </>
  )
}
