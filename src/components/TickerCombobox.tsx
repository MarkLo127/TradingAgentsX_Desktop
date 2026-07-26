import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MarketType } from '@shared/types'
import { Icon } from './Icon'
import { displayName, loadAllTw, loadStocks, rankStocks } from '@/lib/stocks'
import type { StockItem, StockMatch } from '@/lib/stocks'

const MARKET_LABEL: Record<MarketType, string> = {
  us: '美股',
  twse: '上市',
  tpex: '上櫃',
}

interface Props {
  value: string
  onChange: (v: string) => void
  market: MarketType
  /** 選到的台股若屬於另一個板別，直接幫使用者切過去 */
  onMarketChange: (m: MarketType) => void
  locale: string
  invalid?: boolean
  onBlur?: () => void
  id?: string
  describedBy?: string
}

export function TickerCombobox({
  value,
  onChange,
  market,
  onMarketChange,
  locale,
  invalid,
  onBlur,
  id,
  describedBy,
}: Props) {
  // useId 一定要無條件呼叫，不能寫成 id ?? useId()
  const listId = useId()
  const fallbackId = useId()
  const inputId = id ?? fallbackId

  // 台股一次載入上市＋上櫃，這樣打了上櫃代號也找得到，選取時再自動切板別
  const scope: 'us' | 'tw' = market === 'us' ? 'us' : 'tw'

  // 把「哪個 scope 的結果」一起存進 state，載入中／失敗都能從渲染推導，
  // 不需要在 effect 裡同步 setState。
  const [loaded, setLoaded] = useState<{ scope: string; rows: StockItem[] } | null>(null)
  const [failedScope, setFailedScope] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState<{ q: string; i: number }>({ q: '', i: 0 })

  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = scope === 'us' ? loadStocks('us') : loadAllTw()
    void load
      .then((rows) => {
        if (!cancelled) setLoaded({ scope, rows })
      })
      .catch(() => {
        if (!cancelled) setFailedScope(scope)
      })
    return () => {
      cancelled = true
    }
  }, [scope])

  const items = loaded?.scope === scope ? loaded.rows : null
  const loadFailed = failedScope === scope
  const loading = items === null && !loadFailed

  const matches = useMemo(
    () => (items ? rankStocks(items, value, locale, 8) : []),
    [items, value, locale],
  )

  // 換了查詢字串就從第一項開始；不用 effect 重設，直接在渲染時推導
  const active = cursor.q === value ? Math.min(cursor.i, Math.max(0, matches.length - 1)) : 0

  /** 輸入框已是一個有效代號時，在右側顯示公司名 */
  const resolved = useMemo(() => {
    const q = value.trim().toUpperCase()
    if (!q || !items) return null
    return items.find((x) => x.symbol.toUpperCase() === q) ?? null
  }, [items, value])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  // 鍵盤移動時把選中項捲進視野
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const showList = open && value.trim().length > 0 && matches.length > 0

  const move = (delta: number) => {
    setCursor({ q: value, i: Math.max(0, Math.min(active + delta, matches.length - 1)) })
  }

  const select = (m: StockMatch) => {
    onChange(m.symbol)
    if (m.market !== market) onMarketChange(m.market)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'ArrowDown' && matches.length > 0) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      if (matches[active]) {
        e.preventDefault()
        select(matches[active])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="combo" ref={boxRef}>
      <div className="input-group">
        <input
          id={inputId}
          className="input mono"
          style={{ fontWeight: 600, paddingRight: resolved ? 178 : 40 }}
          value={value}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={market === 'us' ? 'NVDA' : '2330'}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase())
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        <div className="adorn">
          {resolved && (
            <span className="combo-resolved truncate" title={displayName(resolved, locale)}>
              {displayName(resolved, locale)}
            </span>
          )}
          {loading ? (
            <Icon name="spinner" size="sm" spin className="faint" />
          ) : resolved ? (
            <span className="dot live" role="img" aria-label="代號有效" />
          ) : null}
        </div>
      </div>

      {showList && (
        <ul className="combo-list" id={listId} role="listbox" ref={listRef}>
          {matches.map((m, i) => (
            <li
              key={`${m.market}-${m.symbol}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`combo-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setCursor({ q: value, i })}
              onMouseDown={(e) => {
                // 用 mousedown 才不會先觸發 input 的 blur 把清單關掉
                e.preventDefault()
                select(m)
              }}
            >
              <span className="sym mono">{m.symbol}</span>
              <span className="nm truncate">{m.name}</span>
              {m.market !== 'us' && (
                <span className="badge badge-muted">{MARKET_LABEL[m.market]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {loadFailed && (
        <div className="help" style={{ color: 'var(--warn)', marginTop: 4 }}>
          代號清單載入失敗，仍可直接輸入代號。
        </div>
      )}
    </div>
  )
}
