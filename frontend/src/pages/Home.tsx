import { useEffect, useRef, useState } from 'react'
import { useInfiniteShows } from '../queries/shows'
import ShowCard from '../components/ShowCard'
import FilterPanel from '../components/FilterPanel'
import SortDropdown from '../components/SortDropdown'
import { theme, fontSans, fontSerif } from '../theme/theme'
import { useFiltersStore, MAX_PRICE_CEILING } from '../store/filters'
import { useAuthStore } from '../store/auth'
import { useClickOutside } from '../hooks/useClickOutside'
import { useIsMobile } from '../hooks/useIsMobile'

export default function Home() {
  const isMobile = useIsMobile()
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const { scope, setScope, cityNames, removeCity, freeWeekdays, maxPrice } = useFiltersStore()
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteShows(searchQuery)
  const { user, openLoginModal } = useAuthStore()
  const filterPanelRef = useRef<HTMLDivElement>(null)
  useClickOutside(filterPanelRef, () => setFilterPanelOpen(false), filterPanelOpen)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const shows = data?.pages.flatMap((p) => p.results) ?? []
  const total = data?.pages[0]?.total ?? 0

  const activeFilterCount =
    (cityNames.length > 0 ? 1 : 0) + (freeWeekdays.length > 0 ? 1 : 0) + (maxPrice < MAX_PRICE_CEILING ? 1 : 0)

  return (
    <div style={{ paddingTop: 16, paddingBottom: 40 }}>
      <div style={{ padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontFamily: fontSerif, fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>LiveFlow</div>
        {user ? (
          <div style={{ fontSize: 13, color: theme.textSec }}>{user.phone}</div>
        ) : (
          <button
            onClick={openLoginModal}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 100, border: `1px solid ${theme.border}`,
              background: theme.panel, color: theme.text, cursor: 'pointer', fontFamily: fontSans,
            }}
          >
            登录
          </button>
        )}
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索艺人、场馆或演出"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '13px 18px', borderRadius: 12,
            border: `1px solid ${theme.border}`, background: theme.panel, fontSize: 16, color: theme.text,
            outline: 'none', fontFamily: fontSans,
          }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <button
          onClick={() => (user ? setScope(scope === 'followed' ? 'all' : 'followed') : openLoginModal())}
          style={{
            fontSize: 13, padding: '9px 14px', borderRadius: 100, flexShrink: 0,
            border: `1px solid ${scope === 'followed' ? theme.accent : theme.border}`,
            background: scope === 'followed' ? theme.accent : theme.panel,
            color: scope === 'followed' ? '#FFFFFF' : theme.text,
            cursor: 'pointer', fontFamily: fontSans, whiteSpace: 'nowrap',
          }}
        >
          我关注的艺人
        </button>

        <div ref={filterPanelRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setFilterPanelOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '9px 16px', borderRadius: 100,
              border: `1px solid ${filterPanelOpen ? theme.accent : theme.border}`,
              background: filterPanelOpen ? theme.accent : theme.panel,
              color: filterPanelOpen ? '#FFFFFF' : theme.text,
              cursor: 'pointer', fontFamily: fontSans, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            ☰ 筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          {filterPanelOpen && <FilterPanel onClose={() => setFilterPanelOpen(false)} />}
        </div>

        <SortDropdown />
      </div>

      {isLoading && <div style={{ color: theme.textSec }}>加载中...</div>}
      {isError && <div style={{ color: theme.accent }}>加载失败，请确认后端服务是否已启动</div>}

      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: theme.textSec }}>共 {total} 场演出</div>
          {cityNames.map((name) => (
            <div
              key={name}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.accent,
                background: theme.subtle, border: `1px solid ${theme.border}`, borderRadius: 100,
                padding: '3px 6px 3px 10px',
              }}
            >
              <span>{name}</span>
              <span
                onClick={() => removeCity(name)}
                title="移除这个城市"
                style={{ cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}
      </div>

      {data && (
        <>
          {/* 手机版是贴边的连续列表(跟最初设计一样，靠卡片自己的分隔线分开，不留 padding/gap)；
              桌面版还是带边距+间隙的 grid */}
          <div
            style={
              isMobile
                ? { display: 'flex', flexDirection: 'column' }
                : { padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }
            }
          >
            {shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
          <div ref={sentinelRef} style={{ height: 1 }} />
          <div style={{ padding: '0 24px' }}>
            {isFetchingNextPage && (
              <div style={{ textAlign: 'center', color: theme.textSec, fontSize: 13, padding: '20px 0' }}>加载中...</div>
            )}
            {!isFetchingNextPage && hasNextPage && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button
                  onClick={() => fetchNextPage()}
                  style={{
                    fontSize: 13, padding: '9px 20px', borderRadius: 100, border: `1px solid ${theme.border}`,
                    background: theme.panel, color: theme.text, cursor: 'pointer', fontFamily: fontSans,
                  }}
                >
                  加载更多
                </button>
              </div>
            )}
            {!hasNextPage && shows.length > 0 && (
              <div style={{ textAlign: 'center', color: theme.textSec, fontSize: 12, padding: '20px 0' }}>没有更多了</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
