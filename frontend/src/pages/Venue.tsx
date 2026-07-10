import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useVenueDetail, useVenueReviews, useSubmitVenueReview } from '../queries/venue'
import ShowCard from '../components/ShowCard'
import { theme, fontSerif, fontSans } from '../theme/theme'
import { useAuthStore } from '../store/auth'

export default function Venue() {
  const { id } = useParams()
  const navigate = useNavigate()
  const venueId = Number(id)
  const { data: venue, isLoading, isError } = useVenueDetail(venueId)
  const { data: reviewsData } = useVenueReviews(venueId)
  const loggedIn = !!useAuthStore((s) => s.user)
  const submitReview = useSubmitVenueReview(venueId)

  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')

  if (isLoading) return <div style={{ padding: 24, color: theme.textSec }}>加载中...</div>
  if (isError || !venue) return <div style={{ padding: 24, color: theme.accent }}>没找到这个场馆</div>

  const ratingLabel = venue.rating_avg != null ? venue.rating_avg.toFixed(1) : '暂无评分'
  const reviews = reviewsData?.results ?? []

  const handleSubmit = () => {
    if (!text.trim()) return
    submitReview.mutate({ rating, text: text.trim() }, { onSuccess: () => setText('') })
  }

  return (
    <div style={{ padding: '14px 24px 40px' }}>
      <div onClick={() => navigate(-1)} style={{ fontSize: 13, color: theme.textSec, cursor: 'pointer', marginBottom: 10 }}>
        ← 返回
      </div>
      <h1 style={{ fontFamily: fontSerif, fontSize: 26, margin: 0 }}>{venue.name}</h1>
      <div style={{ fontSize: 14, color: theme.textSec, margin: '6px 0 18px' }}>{venue.city_name}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: theme.gold }}>
          {venue.rating_avg != null ? ratingLabel : '—'}
        </div>
        <div style={{ fontSize: 13, color: theme.textSec }}>
          综合评分
          <br />
          {venue.review_count} 人评价
        </div>
      </div>

      <div style={{ fontFamily: fontSerif, fontSize: 17, marginBottom: 12 }}>用户评价</div>
      {reviews.length === 0 && (
        <div style={{ fontSize: 13, color: theme.textSec, marginBottom: 20 }}>还没有人评价这个场馆，来写第一条吧</div>
      )}
      {reviews.map((rv) => (
        <div
          key={rv.id}
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{rv.nickname}</span>
            <span style={{ color: theme.gold, fontSize: 13 }}>★ {rv.rating}</span>
          </div>
          <div style={{ fontSize: 13, color: theme.textSec, lineHeight: 1.6 }}>{rv.text}</div>
        </div>
      ))}

      {loggedIn ? (
        <div
          style={{
            background: theme.subtle, border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: '14px 16px', margin: '16px 0 36px', display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ fontSize: 13, color: theme.textSec }}>发布一条新评价</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                onClick={() => setRating(n)}
                style={{ cursor: 'pointer', fontSize: 18, color: n <= rating ? theme.gold : theme.border }}
              >
                ★
              </span>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="分享你的观演体验…"
            style={{
              resize: 'none', height: 60, padding: 10, border: `1px solid ${theme.border}`, borderRadius: 8,
              fontSize: 16, fontFamily: fontSans, outline: 'none', background: theme.panel, color: theme.text,
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              alignSelf: 'flex-start', background: theme.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontFamily: fontSans,
            }}
          >
            提交
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: theme.textSec, margin: '16px 0 36px' }}>登录后可以写评价</div>
      )}

      <div style={{ fontFamily: fontSerif, fontSize: 17, margin: '26px 0 12px' }}>这里即将上演</div>
      {venue.upcoming_shows.length === 0 && (
        <div style={{ fontSize: 13, color: theme.textSec }}>暂时没有排期</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {venue.upcoming_shows.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>
    </div>
  )
}
