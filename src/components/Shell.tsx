import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import logo from '@/assets/logo.svg'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { tax } from '@/lib/bridge'
import { useStore } from '@/lib/store'
import type { RouteName } from '@/lib/store'
import { formatDuration } from '@/lib/format'
import { useI18n } from '@/lib/i18n'

/* ---------------------------------------------------------------- 標題列 */

function Titlebar({ isMac, context }: { isMac: boolean; context?: string }) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void tax.window.isMaximized().then(setMaximized)
    return tax.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className={`titlebar ${isMac ? 'mac' : ''}`}>
      <img className="tb-logo" src={logo} alt="TradingAgentsX Desktop" />
      <div className="tb-title">
        <b>TradingAgentsX Desktop</b>
        {context ? ` — ${context}` : ''}
      </div>

      {!isMac && (
        <div className="win-controls mla">
          <button
            className="win-btn"
            type="button"
            aria-label="最小化"
            onClick={() => void tax.window.minimize()}
          >
            <Icon name="minus" size="sm" />
          </button>
          <button
            className="win-btn"
            type="button"
            aria-label={maximized ? '還原' : '最大化'}
            onClick={() => void tax.window.toggleMaximize()}
          >
            <Icon name={maximized ? 'restore' : 'square'} size="sm" />
          </button>
          <button
            className="win-btn close"
            type="button"
            aria-label="關閉"
            onClick={() => void tax.window.close()}
          >
            <Icon name="x" size="sm" />
          </button>
        </div>
      )}
    </header>
  )
}

/* ----------------------------------------------------------------- 側邊欄 */

interface NavItem {
  id: RouteName
  label: string
  icon: IconName
}

function Sidebar() {
  const { route, navigate, task, reports } = useStore()
  const { t } = useI18n()

  const main: NavItem[] = [
    { id: 'dashboard', label: t('總覽', 'Overview'), icon: 'dashboard' },
    { id: 'new', label: t('新增分析', 'New analysis'), icon: 'plus' },
    { id: 'running', label: t('執行中', 'Running'), icon: 'activity' },
    { id: 'report', label: t('報告', 'Reports'), icon: 'file' },
  ]
  const local: NavItem[] = [{ id: 'settings', label: t('設定', 'Settings'), icon: 'sliders' }]

  const item = (n: NavItem) => {
    const badge =
      n.id === 'running' && task && task.status?.status !== 'completed' && task.status?.status !== 'failed'
        ? t('執行中', 'Running')
        : n.id === 'report' && reports.length
          ? String(reports.length)
          : null

    return (
      <button
        key={n.id}
        type="button"
        className="nav-item"
        aria-current={route.name === n.id ? 'page' : undefined}
        onClick={() => navigate({ name: n.id })}
      >
        <Icon name={n.icon} />
        <span>{n.label}</span>
        {badge && (
          <span className={`badge ${n.id === 'running' ? 'badge-buy' : 'badge-muted'}`}>{badge}</span>
        )}
      </button>
    )
  }

  return (
    <nav className="sidebar" aria-label={t('主導覽', 'Primary navigation')}>
      <div className="nav-label">{t('工作區', 'Workspace')}</div>
      {main.map(item)}
      <div className="nav-label">{t('本機', 'Local')}</div>
      {local.map(item)}
    </nav>
  )
}

/* ----------------------------------------------------------------- 狀態列 */

function Statusbar() {
  const { backend, secrets, appInfo, task, navigate } = useStore()
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  const phaseText: Record<string, string> = {
    idle: t('尚未啟動', 'Not started'),
    starting: t('啟動中…', 'Starting…'),
    ready: t('就緒', 'Ready'),
    error: t('錯誤', 'Error'),
    stopped: t('已停止', 'Stopped'),
  }

  const running =
    task && task.status?.status !== 'completed' && task.status?.status !== 'failed' ? task : null
  const startedAt = running?.startedAt ?? null

  useEffect(() => {
    if (startedAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const dotClass =
    backend.phase === 'ready'
      ? 'dot live'
      : backend.phase === 'starting'
        ? 'dot warn pulse'
        : backend.phase === 'error'
          ? 'dot err'
          : 'dot'

  const setKeys = secrets.items.filter((i) => i.isSet).length

  return (
    <footer className="statusbar" role="status">
      <button
        type="button"
        className="sb-item sb-btn"
        onClick={() => navigate({ name: 'settings' })}
        title={backend.message ?? undefined}
      >
        <span className={dotClass} aria-hidden="true" />
        {t('本機後端', 'Backend')}{' '}
        {backend.url ? backend.url.replace(/^https?:\/\//, '') : phaseText[backend.phase]}
      </button>

      <span className="sb-item">
        <Icon name={secrets.encryptionAvailable ? 'lock' : 'unlock'} size="sm" />
        {secrets.encryptionAvailable
          ? t(`金鑰存於系統鑰匙圈（${setKeys}）`, `Keys in system keychain (${setKeys})`)
          : t(`金鑰未加密（${setKeys}）`, `Keys unencrypted (${setKeys})`)}
      </span>

      <span className="sb-item">
        <Icon name="wifi" size="sm" />
        {t('僅連線至 LLM 供應商', 'Connects only to LLM providers')}
      </span>

      {running && (
        <button
          type="button"
          className="sb-item sb-btn"
          onClick={() => navigate({ name: 'running' })}
        >
          <span className="dot live pulse" aria-hidden="true" />
          {running.input.ticker} {t('分析中', 'analyzing')} {formatDuration(now - running.startedAt)}
        </button>
      )}

      <span className="sb-item right">v{appInfo?.appVersion ?? '—'}</span>
    </footer>
  )
}

/* ------------------------------------------------------------------ Shell */

export function Shell({ context, children }: { context?: string; children: ReactNode }) {
  const { appInfo } = useStore()
  const isMac = appInfo?.platform === 'darwin'

  return (
    <div className="app">
      <Titlebar isMac={isMac} context={context} />
      <div className="body">
        <Sidebar />
        {children}
      </div>
      <Statusbar />
    </div>
  )
}
