import { useRef, useState } from 'react'
import { theme, fontSans } from '../theme/theme'
import { useFiltersStore, type SortBy } from '../store/filters'
import { useClickOutside } from '../hooks/useClickOutside'

const OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'time', label: '时间' },
  { key: 'price', label: '价格' },
]

export default function SortDropdown() {
  const [open, setOpen] = useState(false)
  const { sortBy, setSortBy } = useFiltersStore()
  const currentLabel = OPTIONS.find((o) => o.key === sortBy)?.label
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false), open)

  return (
    <div ref={containerRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 13, padding: '9px 14px', borderRadius: 100, border: `1px solid ${theme.border}`,
          background: theme.panel, color: theme.text, cursor: 'pointer', fontFamily: fontSans, whiteSpace: 'nowrap',
        }}
      >
        排序：{currentLabel} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 44, right: 0, width: 140, background: theme.panel,
            border: `1px solid ${theme.border}`, borderRadius: 14, boxShadow: '0 14px 30px rgba(42,35,32,0.18)',
            padding: 10, zIndex: 40, display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                setSortBy(o.key)
                setOpen(false)
              }}
              style={{
                textAlign: 'left', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: 'none',
                background: sortBy === o.key ? theme.subtle : 'transparent',
                color: sortBy === o.key ? theme.accent : theme.text,
                fontWeight: sortBy === o.key ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
