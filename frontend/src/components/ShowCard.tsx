import { useState, type CSSProperties } from 'react'
import type { Show } from '../api/types'
import { theme, fontSerif, fontSans } from '../theme/theme'
import { pickFallbackGradient } from '../theme/fallbackGradients'
import { useAuthStore } from '../store/auth'
import { useFavorites, useToggleFavorite } from '../queries/me'
import { useIsMobile } from '../hooks/useIsMobile'

interface ShowCardProps {
  show: Show
}

// 阵容很长的拼盘演出(几十组艺人用 / 分隔)会把这一张卡片的文字撑得很高，
// 导致 grid 布局里同一行其他卡片下方留出大片空白。只展示前几个名字+"等N组"
function formatPerformers(performers: string | null): string {
  if (!performers) return '艺人待定'
  const names = performers.split('/').map((n) => n.trim()).filter(Boolean)
  if (names.length <= 3) return names.join('/')
  return `${names.slice(0, 3).join('/')} 等${names.length}组`
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function formatShowTime(show: Show): string | null {
  if (!show.show_time) return null
  if (show.weekday === null || show.weekday === undefined) return show.show_time
  return `${show.show_time} 周${WEEKDAY_LABELS[show.weekday]}`
}

export default function ShowCard({ show }: ShowCardProps) {
  const posterImage = show.poster_url
    ? `url(${show.poster_url})`
    : pickFallbackGradient(show.id)

  const loggedIn = !!useAuthStore((s) => s.user)
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const { data: favoritesData } = useFavorites(loggedIn)
  const toggleFavorite = useToggleFavorite()
  const isFavorite = !!favoritesData?.results.some((s) => s.id === show.id)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const isMobile = useIsMobile()

  const handleFavClick = () => {
    if (!loggedIn) {
      openLoginModal()
      return
    }
    toggleFavorite.mutate({ show, isFavorite })
  }

  const venueLine = () => (
    <>
      <span>{show.site_name}</span>
      <span>· {show.city_name}</span>
    </>
  )

  const detailLink = (style: CSSProperties) => (
    <a href={`https://www.showstart.com/event/${show.id}`} target="_blank" rel="noreferrer" style={style}>
      查看详情 →
    </a>
  )

  const lightbox = lightboxOpen && (
    <div
      onClick={() => setLightboxOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(20,15,12,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
        padding: 24,
      }}
    >
      <img
        src={show.poster_url ?? undefined}
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
      />
    </div>
  )

  if (isMobile) {
    // 1:1 移植自设计稿 ShowCard.dc.html 的 row 布局分支(isRowLayout)：没有圆角/边框，
    // 靠模糊放大的海报当局部半透明背景，跟 grid 版本是同一套"海报模糊底"手法
    return (
      <>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid rgba(0,0,0,0.25)',
            minHeight: 118,
          }}
        >
          <div
            style={{
              position: 'absolute', inset: -24, backgroundImage: posterImage, backgroundColor: theme.accent,
              backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(26px)', transform: 'scale(1.05)', zIndex: 0,
            }}
          />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(20,15,12,0.62)' }} />

          <div
            style={{
              position: 'relative', zIndex: 2, flex: 1, minWidth: 0, padding: '14px 10px 14px 16px',
              display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontFamily: fontSerif, fontSize: 15, lineHeight: 1.4, color: '#F2ECE1', fontWeight: 600,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {show.title}
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 12, color: 'rgba(242,236,225,0.75)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: theme.gold, flexShrink: 0 }}>★</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatPerformers(show.performers)}
              </span>
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 12, color: 'rgba(242,236,225,0.75)' }}>{formatShowTime(show)}</div>
            <div style={{ fontFamily: fontSans, fontSize: 12, color: 'rgba(242,236,225,0.75)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {venueLine()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontFamily: fontSans, fontSize: 17, fontWeight: 700, color: '#E0664A' }}>{show.price}</span>
              {detailLink({ fontFamily: fontSans, fontSize: 12, fontWeight: 700, color: theme.gold, textDecoration: 'none', flexShrink: 0 })}
            </div>
          </div>

          <div
            style={{
              position: 'relative', width: 118, flexShrink: 0, zIndex: 2,
              backgroundImage: posterImage, backgroundColor: theme.accent, backgroundSize: 'cover', backgroundPosition: 'center',
              cursor: show.poster_url ? 'zoom-in' : 'default',
            }}
            onClick={() => show.poster_url && setLightboxOpen(true)}
          >
            {show.sold_out === 2 && (
              <div
                style={{
                  position: 'absolute', top: 8, left: 8, background: 'rgba(42,35,32,0.75)', color: '#F2ECE1',
                  fontSize: 10, padding: '2px 7px', borderRadius: 100,
                }}
              >
                已售罄
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleFavClick()
              }}
              style={{
                position: 'absolute', bottom: 6, right: 8, width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  d="M12 6.5C10.5 4 8.3 3 6.2 3 3 3 0.8 5.5 0.8 8.6c0 5.2 6 8.9 11.2 12.9 5.2-4 11.2-7.7 11.2-12.9C23.2 5.5 21 3 17.8 3c-2.1 0-4.3 1-5.8 3.5z"
                  fill={isFavorite ? theme.accent : 'none'}
                  stroke={isFavorite ? theme.accent : '#6B5F55'}
                  strokeWidth="1.4"
                />
              </svg>
            </button>
          </div>
        </div>

        {lightbox}
      </>
    )
  }

  // 1:1 移植自设计稿 ShowCard.dc.html 的 grid 布局分支
  const cardStyle: CSSProperties = {
    background: theme.panel,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  }

  const posterStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: '4/3',
    backgroundImage: posterImage,
    backgroundColor: theme.accent,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    cursor: show.poster_url ? 'zoom-in' : 'default',
  }

  const bodyWrapStyle: CSSProperties = { position: 'relative', overflow: 'hidden' }

  const blurLayerStyle: CSSProperties = {
    position: 'absolute',
    inset: -24,
    backgroundImage: posterImage,
    backgroundColor: theme.accent,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(26px)',
    transform: 'scale(1.05)',
    zIndex: 0,
  }

  const darkOverlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    background: 'rgba(20,15,12,0.72)',
  }

  const contentStyle: CSSProperties = {
    position: 'relative',
    zIndex: 2,
    padding: '14px 14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  }

  const titleStyle: CSSProperties = {
    fontFamily: fontSerif,
    fontSize: 16,
    lineHeight: 1.4,
    color: '#F2ECE1',
    fontWeight: 600,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: '2.8em',
  }

  const subTextStyle: CSSProperties = {
    fontFamily: fontSans,
    fontSize: 13,
    color: 'rgba(242,236,225,0.75)',
  }

  const clampedSubTextStyle: CSSProperties = {
    ...subTextStyle,
    display: '-webkit-box',
    WebkitLineClamp: 1,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }

  return (
    <>
      <div style={cardStyle}>
        <div style={posterStyle} onClick={() => show.poster_url && setLightboxOpen(true)}>
          {show.sold_out === 2 && (
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(20,15,12,0.75)',
                color: '#F2ECE1',
                fontFamily: fontSans,
                fontSize: 12,
                padding: '3px 9px',
                borderRadius: 100,
                letterSpacing: 0.5,
              }}
            >
              已售罄
            </div>
          )}
        </div>
        <div style={bodyWrapStyle}>
          <div style={blurLayerStyle} />
          <div style={darkOverlayStyle} />
          <div style={contentStyle}>
            <div style={titleStyle}>{show.title}</div>
            <div style={clampedSubTextStyle}>{formatPerformers(show.performers)}</div>
            <div style={subTextStyle}>{formatShowTime(show)}</div>
            <div style={{ ...subTextStyle, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {venueLine()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontFamily: fontSans, fontSize: 18, fontWeight: 700, color: '#E0664A' }}>
                {show.price}
              </span>
              <button
                onClick={handleFavClick}
                style={{ background: 'none', border: 'none', cursor: 'pointer', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    d="M12 6.5C10.5 4 8.3 3 6.2 3 3 3 0.8 5.5 0.8 8.6c0 5.2 6 8.9 11.2 12.9 5.2-4 11.2-7.7 11.2-12.9C23.2 5.5 21 3 17.8 3c-2.1 0-4.3 1-5.8 3.5z"
                    fill={isFavorite ? theme.accent : 'none'}
                    stroke={isFavorite ? theme.accent : 'rgba(242,236,225,0.6)'}
                    strokeWidth="1.4"
                  />
                </svg>
              </button>
            </div>
            {detailLink({
              marginTop: 4,
              textAlign: 'center',
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 600,
              color: '#F2ECE1',
              border: '1px solid rgba(242,236,225,0.35)',
              borderRadius: 8,
              padding: '8px 0',
              textDecoration: 'none',
            })}
          </div>
        </div>
      </div>

      {lightbox}
    </>
  )
}
