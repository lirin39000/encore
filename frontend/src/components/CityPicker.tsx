import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme, fontSans } from '../theme/theme'
import cityData from '../data/cities.json'
import { useFiltersStore } from '../store/filters'

interface City {
  code: string
  name: string
}

interface CityPickerProps {
  onClose: () => void
}

export default function CityPicker({ onClose }: CityPickerProps) {
  const [query, setQuery] = useState('')
  const { cityNames, addCity, removeCity } = useFiltersStore()

  const toggle = (name: string) => (cityNames.includes(name) ? removeCity(name) : addCity(name))

  const groups = useMemo(() => {
    const q = query.trim()
    return (cityData.cityDirectory as { letter: string; cities: City[] }[])
      .map((g) => ({ letter: g.letter, cities: q ? g.cities.filter((c) => c.name.includes(q)) : g.cities }))
      .filter((g) => g.cities.length > 0)
  }, [query])

  const plusButtonStyle = (selected: boolean) => ({
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: 'none',
    background: selected ? theme.accent : theme.panel,
    color: selected ? '#FFFFFF' : theme.textSec,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: '22px',
    textAlign: 'center' as const,
    padding: 0,
    flexShrink: 0,
  })

  // FilterPanel 那个盒子有 backdrop-filter，会给里面的 position:fixed 元素重新建立一个包含块，
  // 导致"全屏"变成"只在那个筛选面板小盒子里全屏"。用 portal 直接挂到 body 上绕开这个限制
  return createPortal(
    <div
      data-click-outside-ignore
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, flexShrink: 0 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索城市"
          style={{
            flex: 1,
            boxSizing: 'border-box',
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: theme.subtle,
            fontSize: 14,
            color: theme.text,
            outline: 'none',
            fontFamily: fontSans,
          }}
        />
        <span onClick={onClose} style={{ fontSize: 14, color: theme.textSec, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          取消
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: theme.textSec }}>我的城市</div>
          <span
            onClick={onClose}
            style={{
              background: theme.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 700,
              padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
            }}
          >
            完成
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {cityNames.length === 0 && (
            <span style={{ fontSize: 13, color: theme.textSec }}>还没有选择城市，不限则显示全部</span>
          )}
          {cityNames.map((name) => (
            <span
              key={name}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 10px 6px 14px',
                borderRadius: 8, background: theme.panel, border: `1px solid ${theme.border}`, color: theme.text,
              }}
            >
              {name}
              <span onClick={() => removeCity(name)} style={{ cursor: 'pointer', color: theme.textSec }}>✕</span>
            </span>
          ))}
        </div>

        <div style={{ fontSize: 12, color: theme.textSec, marginBottom: 10 }}>热门城市</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18 }}>
          {(cityData.hotCities as City[]).map((c) => (
            <div
              key={c.code}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ fontSize: 14, color: theme.text }}>{c.name}</span>
              <button onClick={() => toggle(c.name)} style={plusButtonStyle(cityNames.includes(c.name))}>+</button>
            </div>
          ))}
        </div>

        {groups.map((g) => (
          <div key={g.letter}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSec, padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
              {g.letter}
            </div>
            {g.cities.map((c) => (
              <div
                key={c.code}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14,
                  color: theme.text, padding: '12px 0', borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <span>{c.name}</span>
                <button onClick={() => toggle(c.name)} style={plusButtonStyle(cityNames.includes(c.name))}>+</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
