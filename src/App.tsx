import { Shell } from '@/components/Shell'
import { Icon } from '@/components/Icon'
import { Dashboard } from '@/pages/Dashboard'
import { NewAnalysis } from '@/pages/NewAnalysis'
import { Report } from '@/pages/Report'
import { Running } from '@/pages/Running'
import { Settings } from '@/pages/Settings'
import { StoreProvider, useStore } from '@/lib/store'
import { ThemeProvider } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'

function Splash() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-faint)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <Icon name="spinner" spin />
        載入中…
      </div>
    </div>
  )
}

function Routes() {
  const { route } = useStore()
  const { t } = useI18n()

  const context: Record<string, string> = {
    dashboard: t('總覽', 'Overview'),
    new: t('新增分析', 'New analysis'),
    running: t('執行中', 'Running'),
    report: t('報告', 'Reports'),
    settings: t('設定', 'Settings'),
  }

  return (
    <Shell context={context[route.name]}>
      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'new' && <NewAnalysis />}
      {route.name === 'running' && <Running />}
      {route.name === 'report' && <Report />}
      {route.name === 'settings' && <Settings />}
    </Shell>
  )
}

function Themed() {
  const { settings, updateSettings } = useStore()

  if (!settings) return <Splash />

  return (
    <ThemeProvider
      preference={settings.theme}
      onPreferenceChange={(theme) => void updateSettings({ theme })}
    >
      <Routes />
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Themed />
    </StoreProvider>
  )
}
