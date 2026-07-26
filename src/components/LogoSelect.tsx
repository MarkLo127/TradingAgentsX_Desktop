import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface LogoOption {
  value: string
  label: string
  /** 品牌 logo 的 URL（Vite 匯入的 SVG）；沒有就留白 */
  logo?: string
  /** 選項右側的次要說明，如「本機」 */
  hint?: string
}

export interface LogoGroup {
  label?: string
  options: LogoOption[]
}

interface PopRect {
  left: number
  top: number
  width: number
  maxHeight: number
  drop: 'down' | 'up'
}

/**
 * 帶品牌 logo 的下拉選單。
 *
 * 原生 <option> 無法放圖片，所以自繪一個 listbox。清單以 portal 掛到 <body>
 * 並用 fixed 定位，避免被 .main-scroll 的 overflow 裁切（否則靠近頁面底部的選單
 * 會看不到後面的供應商）。空間不足時自動向上展開。
 * 可存取性：鍵盤可操作（上下鍵、Enter、Esc）、點擊外部關閉、aria-activedescendant。
 */
export function LogoSelect({
  value,
  groups,
  onChange,
  id,
  ariaLabel,
  describedBy,
}: {
  value: string
  groups: LogoGroup[]
  onChange: (v: string) => void
  id?: string
  ariaLabel?: string
  describedBy?: string
}) {
  const listId = useId()
  const fallbackId = useId()
  const btnId = id ?? fallbackId

  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<PopRect | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups])
  const selected = flat.find((o) => o.value === value) ?? null
  const selectedIndex = Math.max(0, flat.findIndex((o) => o.value === value))
  const [cursor, setCursor] = useState(selectedIndex)

  const reposition = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const drop: 'down' | 'up' = spaceBelow < 240 && spaceAbove > spaceBelow ? 'up' : 'down'
    const maxHeight = Math.min(340, (drop === 'down' ? spaceBelow : spaceAbove) - 12)
    setRect({
      left: r.left,
      top: drop === 'down' ? r.bottom + 4 : r.top - 4,
      width: r.width,
      maxHeight: Math.max(140, maxHeight),
      drop,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const onScroll = () => reposition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  const openList = () => {
    setCursor(selectedIndex)
    setOpen(true)
  }

  const commit = (o: LogoOption) => {
    onChange(o.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (flat[cursor]) commit(flat[cursor])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const pop =
    open && rect
      ? createPortal(
          <ul
            className="lsel-pop"
            id={listId}
            role="listbox"
            ref={listRef}
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
              ...(rect.drop === 'down'
                ? { top: rect.top }
                : { top: rect.top, transform: 'translateY(-100%)' }),
            }}
          >
            {groups.map((g, gi) => (
              <li key={g.label ?? gi} role="presentation">
                {g.label && <div className="lsel-group">{g.label}</div>}
                <ul role="presentation">
                  {g.options.map((o) => {
                    const flatIndex = flat.findIndex((f) => f.value === o.value)
                    const active = flatIndex === cursor
                    const isSel = o.value === value
                    return (
                      <li
                        key={o.value}
                        id={`${listId}-opt-${flatIndex}`}
                        role="option"
                        aria-selected={isSel}
                        data-active={active}
                        className={`lsel-opt ${active ? 'active' : ''}`}
                        onMouseEnter={() => setCursor(flatIndex)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          commit(o)
                        }}
                      >
                        {o.logo ? (
                          <img className="lsel-logo" src={o.logo} alt="" aria-hidden="true" />
                        ) : (
                          <span className="lsel-logo lsel-logo-empty" />
                        )}
                        <span className="lsel-value truncate">{o.label}</span>
                        {o.hint && <span className="lsel-hint">{o.hint}</span>}
                        {isSel && <Icon name="check" size="sm" className="lsel-check" />}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null

  return (
    <div className="lsel" ref={boxRef}>
      <button
        id={btnId}
        ref={btnRef}
        type="button"
        className="lsel-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-opt-${cursor}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {selected?.logo && <img className="lsel-logo" src={selected.logo} alt="" aria-hidden="true" />}
        <span className="lsel-value truncate">{selected?.label ?? value}</span>
        {selected?.hint && <span className="lsel-hint">{selected.hint}</span>}
        <Icon name="chevronDown" size="sm" className="lsel-caret" />
      </button>
      {pop}
    </div>
  )
}
