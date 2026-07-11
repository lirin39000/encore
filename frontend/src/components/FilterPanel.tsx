import { useLayoutEffect, useRef, useState } from 'react'
import { theme, fontSans } from '../theme/theme'
import { useFiltersStore, MAX_PRICE_CEILING } from '../store/filters'
import CityPicker from './CityPicker'

const WEEKDAYS = [
  { key: 0, label: '一' },
  { key: 1, label: '二' },
  { key: 2, label: '三' },
  { key: 3, label: '四' },
  { key: 4, label: '五' },
  { key: 5, label: '六' },
  { key: 6, label: '日' },
]

type Tab = 'location' | 'schedule' | 'price'

export default function FilterPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('location')
  const [showCityPicker, setShowCityPicker] = useState(false)
  const { cityNames, removeCity, freeWeekdays, maxPrice, toggleWeekday, setMaxPrice } = useFiltersStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const [shiftLeft, setShiftLeft] = useState(0)

  // 面板默认挂在"筛选"胶囊正下方(left:0，相对触发按钮)。窄屏下按钮靠左，420px 宽的面板
  // 会溢出右边缘，量一下实际超出了多少，往左边挪回来，宽屏下量出来是 0 不用挪。
  // 注意：算的时候不能量面板自己的 rect——面板还没纠偏之前自己就可能正处于溢出状态，
  // 量出来的数会被这个"还没修正的溢出"污染。改成量它旁边那个小小的触发按钮容器的位置
  // (这个容器本身不会溢出)，宽度用 CSS 里写死的同一个值直接算，不依赖面板的实际渲染结果
  useLayoutEffect(() => {
    const measure = () => {
      const el = panelRef.current
      const wrapper = el?.parentElement
      if (!el || !wrapper) return
      const wrapperLeft = wrapper.getBoundingClientRect().left
      const panelWidth = Math.min(420, window.innerWidth - 32)
      const overflow = wrapperLeft + panelWidth - (window.innerWidth - 16)
      setShiftLeft(overflow > 0 ? overflow : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'location', label: '位置' },
    { key: 'schedule', label: '档期' },
    { key: 'price', label: '价位' },
  ]

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: 44,
        left: -shiftLeft,
        zIndex: 25,
        display: 'flex',
        background: theme.glassBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${theme.glassBorder}`,
        borderRadius: 16,
        boxShadow: '0 16px 36px rgba(42,35,32,0.2)',
        overflow: 'hidden',
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 72, flexShrink: 0, borderRight: `1px solid ${theme.glassBorder}`, padding: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              textAlign: 'left',
              fontSize: 13,
              padding: '12px 14px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: fontSans,
              fontWeight: 600,
              borderRadius: 10,
              marginBottom: 2,
              background: tab === t.key ? theme.accent : 'transparent',
              color: tab === t.key ? '#FFFFFF' : theme.text,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: '16px 12px', minWidth: 0, position: 'relative' }}>
        {tab === 'location' && (
          <>
            <div style={{ fontSize: 12, color: theme.textSec, marginBottom: 10 }}>我的城市</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
              <button
                onClick={() => setShowCityPicker(true)}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: theme.accent, color: '#FFFFFF', fontSize: 16, cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
            {cityNames.length === 0 && (
              <div style={{ fontSize: 12, color: theme.textSec, marginTop: 10 }}>不限城市，点 + 添加</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, background: theme.accent, color: '#FFFFFF', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                确定
              </button>
            </div>
          </>
        )}

        {tab === 'schedule' && (
          <div>
            <div style={{ fontSize: 13, color: theme.textSec, marginBottom: 12 }}>每周有空的时间</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
              {WEEKDAYS.map((d) => {
                const active = freeWeekdays.includes(d.key)
                return (
                  <button
                    key={d.key}
                    onClick={() => toggleWeekday(d.key)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, padding: 0,
                      border: `1px solid ${active ? theme.accent : theme.border}`,
                      background: active ? theme.accent : theme.panel,
                      color: active ? '#FFFFFF' : theme.text,
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'price' && (
          <div>
            <div style={{ fontSize: 14, color: theme.textSec, marginBottom: 8 }}>预算上限 ¥{maxPrice}</div>
            <input
              type="range"
              min={50}
              max={MAX_PRICE_CEILING}
              step={10}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              style={{ width: '100%', accentColor: theme.accent }}
            />
          </div>
        )}
      </div>

      {showCityPicker && <CityPicker onClose={() => setShowCityPicker(false)} />}
    </div>
  )
}
