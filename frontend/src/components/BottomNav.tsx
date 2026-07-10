import { useLocation, useNavigate } from 'react-router-dom'
import { theme, fontSans } from '../theme/theme'

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const isMine = location.pathname === '/mine'

  const tabStyle = (active: boolean) => ({
    fontSize: 13,
    padding: '8px 18px',
    borderRadius: 100,
    border: 'none',
    background: active ? theme.accent : 'transparent',
    color: active ? '#FFFFFF' : theme.text,
    cursor: 'pointer',
    fontFamily: fontSans,
    fontWeight: 600,
  })

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        padding: '10px 24px',
        background: theme.bg,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button onClick={() => navigate('/')} style={tabStyle(!isMine)}>
          推荐流
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button onClick={() => navigate('/mine')} style={tabStyle(isMine)}>
          我的
        </button>
      </div>
    </div>
  )
}
