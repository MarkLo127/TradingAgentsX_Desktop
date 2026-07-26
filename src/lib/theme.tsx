import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResolvedTheme, ThemePreference } from '@shared/types'
import { tax } from './bridge'

interface ThemeContextValue {
  /** 使用者選的偏好：system / light / dark */
  preference: ThemePreference
  /** 實際套用的主題 */
  resolved: ResolvedTheme
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref
}

export function ThemeProvider({
  preference,
  onPreferenceChange,
  children,
}: {
  preference: ThemePreference
  onPreferenceChange: (p: ThemePreference) => void
  children: ReactNode
}) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(preference))

  // 主行程把偏好設進 nativeTheme.themeSource，因此 matchMedia 對三種偏好都會給出正確答案。
  useEffect(() => {
    const apply = () => setResolved(resolve(preference))
    apply()

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    const off = tax.theme.onResolved(apply)
    return () => {
      mq.removeEventListener('change', apply)
      off()
    }
  }, [preference])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setPreference = useCallback(
    (p: ThemePreference) => {
      onPreferenceChange(p)
      // 主行程更新 nativeTheme 需要一個 tick，先樂觀套用避免閃爍
      setResolved(resolve(p))
    },
    [onPreferenceChange],
  )

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme 必須在 ThemeProvider 內使用')
  return ctx
}
