import { useEffect, useRef, useState } from 'react'
import { theme, fontSans } from '../theme/theme'
import { useAuthStore } from '../store/auth'
import {
  useFollowedArtists, useAddFollowedArtist, useRemoveFollowedArtist,
  useFavorites, useEmailSubscription, useSetEmailSubscription,
  useResendVerifyEmail, useDeleteEmailSubscription,
} from '../queries/me'
import { useSearchArtists } from '../queries/shows'
import { useClickOutside } from '../hooks/useClickOutside'
import ShowCard from '../components/ShowCard'

type Tab = 'artists' | 'favorites' | 'email'

export default function Mine() {
  const [tab, setTab] = useState<Tab>('artists')
  const [addInput, setAddInput] = useState('')
  const [debouncedInput, setDebouncedInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { user, logout } = useAuthStore()
  const searchBoxRef = useRef<HTMLDivElement>(null)
  useClickOutside(searchBoxRef, () => setShowSuggestions(false), showSuggestions)

  const loggedIn = !!user
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const { data: artistsData } = useFollowedArtists(loggedIn && tab === 'artists')
  const { data: favoritesData } = useFavorites(loggedIn && tab === 'favorites')
  const addArtist = useAddFollowedArtist()
  const removeArtist = useRemoveFollowedArtist()
  const { data: suggestData } = useSearchArtists(debouncedInput)
  const suggestions = suggestData?.results ?? []

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(addInput), 250)
    return () => clearTimeout(timer)
  }, [addInput])

  const handleAdd = (name: string) => {
    if (!loggedIn) {
      openLoginModal()
      return
    }
    const trimmed = name.trim()
    if (!trimmed) return
    setAddInput('')
    setShowSuggestions(false)
    addArtist.mutate(trimmed)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'artists', label: '关注艺人' },
    { key: 'favorites', label: '收藏的演出' },
    { key: 'email', label: '邮箱订阅' },
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
          <div ref={searchBoxRef} style={{ position: 'relative', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                placeholder="搜索艺人名添加关注"
                style={{
                  flex: 1, minWidth: 0, padding: '10px 14px', border: `1px solid ${theme.border}`, borderRadius: 10,
                  fontSize: 16, outline: 'none', background: theme.subtle, color: theme.text, fontFamily: fontSans,
                }}
              />
              <button
                onClick={() => handleAdd(addInput)}
                style={{
                  flexShrink: 0, background: theme.gold, color: '#FFFFFF', border: 'none', borderRadius: 10,
                  padding: '10px 18px', fontSize: 13, cursor: 'pointer',
                }}
              >
                添加
              </button>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 10,
                  background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 10,
                  boxShadow: '0 14px 30px rgba(42,35,32,0.25)', maxHeight: 260, overflowY: 'auto',
                }}
              >
                {suggestions.map((name) => (
                  <div
                    key={name}
                    onClick={() => handleAdd(name)}
                    style={{
                      padding: '10px 14px', fontSize: 14, color: theme.text, cursor: 'pointer',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.textSec }}>
            输入后等待几秒输入框下方可能检索到相关乐队/艺人，也可以直接手动输入完整乐队/艺人名称添加（注意用官方名称，比如 Chinese Football 不能添加成"国足"，否则可能查找不成功）
          </div>

          <div style={{ marginTop: 16 }}>
            {loggedIn && !artistsData && (
              <div style={{ fontSize: 13, color: theme.textSec, padding: '20px 0' }}>加载中...</div>
            )}
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

      {tab === 'email' && (
        <EmailSubscriptionCard loggedIn={loggedIn} onLogin={openLoginModal} />
      )}

      {tab === 'favorites' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {loggedIn && !favoritesData && (
            <div style={{ fontSize: 13, color: theme.textSec, gridColumn: '1 / -1', padding: '20px 0' }}>加载中...</div>
          )}
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

      <div style={{ textAlign: 'center', fontSize: 12, color: theme.textSec, marginTop: 32 }}>
        有问题或建议欢迎反馈至 lirin3900@gmail.com ╮(╯▽╰)╭
      </div>
    </div>
  )
}

function EmailSubscriptionCard({ loggedIn, onLogin }: { loggedIn: boolean; onLogin: () => void }) {
  // 未登录时卡片照样渲染，只是把表单换成登录引导——整块藏起来的话，
  // 没登录的人点进这个 tab 会看到一片空白，不知道这里本来有什么
  const { data } = useEmailSubscription(loggedIn)
  const sub = data?.subscription ?? null
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')

  const setSub = useSetEmailSubscription()
  const resend = useResendVerifyEmail()
  const remove = useDeleteEmailSubscription()

  // 还没填过邮箱的人直接进输入态，不用先点一下"添加"
  const showForm = editing || !sub

  const submit = () => {
    const email = input.trim()
    if (!email) return
    setNotice('')
    setSub.mutate(email, {
      onSuccess: () => {
        setEditing(false)
        setInput('')
        setNotice('验证邮件已发出，去邮箱点一下链接就生效了')
      },
      onError: (e: Error) => setNotice(e.message),
    })
  }

  const label = { fontSize: 13, color: theme.textSec, lineHeight: 1.7 } as const

  return (
    <div
      style={{
        background: theme.panel, border: `1px solid ${theme.border}`,
        borderRadius: 14, padding: '18px 18px 20px',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700 }}>演出上新邮件提醒</div>

      <div style={{ ...label, marginTop: 8, marginBottom: 14 }}>
        「关注艺人」里的艺人有新演出时，给你发一封邮件。每天最多一封，随时可以退订。
      </div>

      {!loggedIn ? (
        <div style={label}>
          <span onClick={onLogin} style={{ color: theme.accent, cursor: 'pointer', fontWeight: 600 }}>
            去登录
          </span>
          {' '}后可以填写邮箱开启提醒
        </div>
      ) : showForm ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            type="email"
            placeholder="你的邮箱地址"
            style={{
              flex: 1, minWidth: 0, padding: '10px 14px', border: `1px solid ${theme.border}`,
              borderRadius: 10, fontSize: 16, outline: 'none', background: theme.subtle,
              color: theme.text, fontFamily: fontSans,
            }}
          />
          <button
            onClick={submit}
            disabled={setSub.isPending}
            style={{
              flexShrink: 0, background: theme.accent, color: '#FFFFFF', border: 'none', borderRadius: 10,
              padding: '10px 18px', fontSize: 13, fontWeight: 700, fontFamily: fontSans,
              cursor: setSub.isPending ? 'default' : 'pointer', opacity: setSub.isPending ? 0.6 : 1,
            }}
          >
            {setSub.isPending ? '发送中' : '订阅'}
          </button>
          {sub && (
            <button
              onClick={() => { setEditing(false); setInput(''); setNotice('') }}
              style={{
                flexShrink: 0, background: 'transparent', color: theme.textSec,
                border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 14px',
                fontSize: 13, cursor: 'pointer', fontFamily: fontSans,
              }}
            >
              取消
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, minWidth: 0, wordBreak: 'break-all' }}>
            {sub.email}
            {!sub.verified && (
              <span style={{ fontSize: 12, color: theme.gold, marginLeft: 8 }}>待验证</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!sub.verified && (
              <button
                onClick={() => {
                  setNotice('')
                  resend.mutate(undefined, {
                    onSuccess: () => setNotice('验证邮件已重新发出'),
                    onError: (e: Error) => setNotice(e.message),
                  })
                }}
                disabled={resend.isPending}
                style={{
                  fontSize: 12, color: theme.text, background: theme.subtle,
                  border: `1px solid ${theme.border}`, borderRadius: 100, padding: '5px 12px',
                  cursor: 'pointer', fontFamily: fontSans,
                }}
              >
                重发验证邮件
              </button>
            )}
            <button
              onClick={() => { setEditing(true); setInput(sub.email); setNotice('') }}
              style={{
                fontSize: 12, color: theme.textSec, background: 'transparent',
                border: `1px solid ${theme.border}`, borderRadius: 100, padding: '5px 12px',
                cursor: 'pointer', fontFamily: fontSans,
              }}
            >
              换邮箱
            </button>
            <button
              onClick={() => { setNotice(''); remove.mutate() }}
              style={{
                fontSize: 12, color: theme.textSec, background: 'transparent',
                border: `1px solid ${theme.border}`, borderRadius: 100, padding: '5px 12px',
                cursor: 'pointer', fontFamily: fontSans,
              }}
            >
              取消订阅
            </button>
          </div>
        </div>
      )}

      {!sub?.verified && sub && !editing && (
        <div style={{ ...label, marginTop: 12 }}>
          验证邮件已发到 {sub.email}，点开里面的链接才会开始收到提醒。没收到的话看一下垃圾邮件。
        </div>
      )}

      {notice && (
        <div style={{ ...label, marginTop: 12, color: theme.gold }}>{notice}</div>
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
