import { useState } from 'react'
import { theme, fontSans } from '../theme/theme'
import { useAuthStore } from '../store/auth'
import {
  useFollowedArtists, useAddFollowedArtist, useRemoveFollowedArtist,
  useFavorites,
} from '../queries/me'
import ShowCard from '../components/ShowCard'

type Tab = 'artists' | 'favorites'

export default function Mine() {
  const [tab, setTab] = useState<Tab>('artists')
  const [addInput, setAddInput] = useState('')
  const { user, logout } = useAuthStore()

  const loggedIn = !!user
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const { data: artistsData } = useFollowedArtists(loggedIn && tab === 'artists')
  const { data: favoritesData } = useFavorites(loggedIn && tab === 'favorites')
  const addArtist = useAddFollowedArtist()
  const removeArtist = useRemoveFollowedArtist()

  const tabs: { key: Tab; label: string }[] = [
    { key: 'artists', label: '关注艺人' },
    { key: 'favorites', label: '收藏的演出' },
  ]

  return (
    <div style={{ padding: '20px 24px 40px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: theme.panel,
          border: `1px solid ${theme.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 22,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {loggedIn ? user!.phone : '登录后可以关注艺人、收藏演出'}
        </div>
        <button
          onClick={loggedIn ? logout : openLoginModal}
          style={{
            fontSize: 13, padding: '7px 16px', borderRadius: 100,
            border: `1px solid ${loggedIn ? theme.border : theme.accent}`,
            background: loggedIn ? theme.subtle : theme.accent,
            color: loggedIn ? theme.textSec : '#FFFFFF',
            cursor: 'pointer', fontFamily: fontSans, fontWeight: loggedIn ? 400 : 700,
          }}
        >
          {loggedIn ? '退出登录' : '登录'}
        </button>
      </div>

      <div
        style={{
          display: 'flex', gap: 4, background: theme.subtle, border: `1px solid ${theme.border}`,
          borderRadius: 100, padding: 3, marginBottom: 22, width: 'fit-content',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontSize: 13, padding: '8px 18px', borderRadius: 100, border: 'none',
              background: tab === t.key ? theme.accent : 'transparent',
              color: tab === t.key ? '#FFFFFF' : theme.text,
              cursor: 'pointer', fontFamily: fontSans, fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'artists' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="输入艺人名添加关注"
              style={{
                flex: 1, minWidth: 0, padding: '10px 14px', border: `1px solid ${theme.border}`, borderRadius: 10,
                fontSize: 16, outline: 'none', background: theme.subtle, color: theme.text, fontFamily: fontSans,
              }}
            />
            <button
              onClick={() => {
                if (!loggedIn) {
                  openLoginModal()
                  return
                }
                if (addInput.trim()) {
                  addArtist.mutate(addInput.trim())
                  setAddInput('')
                }
              }}
              style={{
                flexShrink: 0, background: theme.gold, color: '#FFFFFF', border: 'none', borderRadius: 10,
                padding: '10px 18px', fontSize: 13, cursor: 'pointer',
              }}
            >
              添加
            </button>
          </div>
          <div style={{ fontSize: 12, color: theme.textSec }}>
            请注意输入乐队或艺人在秀动的官方名称（比如 Chinese Football 不能添加成"国足"），不然可能搜不到对应的演出
          </div>

          <div style={{ marginTop: 16 }}>
            {(artistsData?.results ?? []).map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: theme.panel, borderBottom: `1px solid ${theme.border}`, padding: '14px 16px',
                }}
              >
                <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: theme.gold }}>★</span>
                  {a.artist_name}
                </span>
                <span
                  onClick={() => (loggedIn ? removeArtist.mutate(a.artist_name) : openLoginModal())}
                  style={{
                    fontSize: 12, color: theme.textSec, cursor: 'pointer', border: `1px solid ${theme.border}`,
                    padding: '4px 10px', borderRadius: 100,
                  }}
                >
                  移除
                </span>
              </div>
            ))}
            {!loggedIn && (
              <EmptyPrompt text="登录后查看关注的艺人" onLogin={openLoginModal} />
            )}
            {loggedIn && artistsData && artistsData.results.length === 0 && (
              <div style={{ fontSize: 13, color: theme.textSec, padding: '20px 0' }}>还没有关注的艺人</div>
            )}
          </div>
        </div>
      )}

      {tab === 'favorites' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {(favoritesData?.results ?? []).map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
          {!loggedIn && (
            <div style={{ gridColumn: '1 / -1' }}>
              <EmptyPrompt text="登录后查看收藏的演出" onLogin={openLoginModal} />
            </div>
          )}
          {loggedIn && favoritesData && favoritesData.results.length === 0 && (
            <div style={{ fontSize: 13, color: theme.textSec, gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>
              还没有收藏的演出
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyPrompt({ text, onLogin }: { text: string; onLogin: () => void }) {
  return (
    <div style={{ fontSize: 13, color: theme.textSec, textAlign: 'center', padding: '30px 0' }}>
      {text}
      <div>
        <span onClick={onLogin} style={{ color: theme.accent, cursor: 'pointer', fontWeight: 600 }}>
          去登录
        </span>
      </div>
    </div>
  )
}
