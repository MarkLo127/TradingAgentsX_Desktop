import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/* -------------------------------------------------------------- Panel */

export function Panel({
  icon,
  title,
  actions,
  children,
  bodyless,
  style,
}: {
  icon?: IconName
  title?: string
  actions?: ReactNode
  children?: ReactNode
  /** 內容自己控制 padding（例如表格、pipeline） */
  bodyless?: boolean
  style?: React.CSSProperties
}) {
  return (
    <section className="panel" style={style}>
      {(title || actions) && (
        <div className="panel-head">
          {icon && <Icon name={icon} />}
          {title && <h2>{title}</h2>}
          {actions && (
            <>
              <div className="spacer" />
              {actions}
            </>
          )}
        </div>
      )}
      {bodyless ? children : <div className="panel-body">{children}</div>}
    </section>
  )
}

/* --------------------------------------------------------------- Button */

type BtnVariant = 'default' | 'primary' | 'ghost' | 'danger'

export function Btn({
  variant = 'default',
  small,
  icon,
  iconOnly,
  loading,
  children,
  className = '',
  ...rest
}: {
  variant?: BtnVariant
  small?: boolean
  icon?: IconName
  iconOnly?: boolean
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    variant === 'danger' ? 'btn-danger' : '',
    small ? 'btn-sm' : '',
    iconOnly ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? (
        <Icon name="spinner" size={small ? 'sm' : 'md'} spin />
      ) : (
        icon && <Icon name={icon} size={small ? 'sm' : 'md'} />
      )}
      {!iconOnly && children}
    </button>
  )
}

/* ---------------------------------------------------------------- Badge */

export type BadgeTone = 'buy' | 'sell' | 'hold' | 'info' | 'violet' | 'muted' | 'accent'

export function Badge({
  tone = 'muted',
  icon,
  children,
}: {
  tone?: BadgeTone
  icon?: IconName
  children: ReactNode
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- Field */

export function Field({
  label,
  required,
  help,
  error,
  success,
  htmlFor,
  children,
  style,
}: {
  label: string
  required?: boolean
  help?: ReactNode
  error?: string | null
  success?: string | null
  htmlFor?: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="field" style={style}>
      <label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" size="sm" />
          {error}
        </div>
      ) : success ? (
        <div className="ok">
          <Icon name="checkCircle" size="sm" />
          {success}
        </div>
      ) : help ? (
        <div className="help">{help}</div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- Switch */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

/* ------------------------------------------------------ Segmented control */

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; icon?: IconName }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size="sm" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 其他 */

export function Bar({
  value,
  tone,
  width,
  color,
}: {
  /** 0–100 */
  value: number
  tone?: 'violet' | 'warn' | 'danger'
  width?: number | string
  /** 覆寫填色，例如跟著判斷顏色走的 var(--verdict-color) */
  color?: string
}) {
  return (
    <div className={`bar ${tone ?? ''}`} style={{ width }}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

export function Empty({
  icon = 'package',
  title,
  children,
  action,
}: {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 500 }}>{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: 'err' | 'warn' | 'info' | 'ok'
  icon?: IconName
  title?: string
  children?: ReactNode
  action?: ReactNode
}) {
  const fallback: Record<string, IconName> = {
    err: 'alert',
    warn: 'alert',
    info: 'info',
    ok: 'checkCircle',
  }
  return (
    <div className={`banner banner-${tone}`}>
      <Icon name={icon ?? fallback[tone]} style={{ marginTop: 1 }} />
      <div className="flex1">
        {title && <b>{title}</b>}
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  )
}

export function Kv({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}

/** 迷你走勢線。資料點不足時回傳 null，不畫出誤導性的圖形。 */
export function Sparkline({
  values,
  width = 64,
  height = 20,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / span) * (height - 3) - 1.5
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={up ? 'var(--accent)' : 'var(--danger)'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ------------------------------------------------------------- Markdown */

/**
 * 代理人輸出是 Markdown（# 標題、**粗體**、- 清單），必須渲染而不是當純文字印出來，
 * 否則語法會直接外洩到介面上。compact 用於辯論卡片這類窄欄位。
 * 注意：不啟用 rehype-raw —— LLM 產出的內容不應允許原始 HTML。
 */
export function Markdown({ children, compact }: { children: string; compact?: boolean }) {
  return (
    <div className={compact ? 'prose prose-compact' : 'prose'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
