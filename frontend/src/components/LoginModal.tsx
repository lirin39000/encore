import { useState } from 'react'
import { theme, fontSerif, fontSans } from '../theme/theme'
import { apiPost } from '../api/client'
import { useAuthStore } from '../store/auth'

interface LoginModalProps {
  onClose: () => void
}

const PHONE_RE = /^1[3-9]\d{9}$/

export default function LoginModal({ onClose }: LoginModalProps) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const login = useAuthStore((s) => s.login)

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    setError('')
    if (!PHONE_RE.test(phone)) {
      setError('请输入正确的手机号')
      return
    }
    setSending(true)
    try {
      await apiPost('/auth/send-code', { phone })
      setCodeSent(true)
      startCountdown()
    } catch (e) {
      // fetch() 本身失败(网络断了/超时)会抛 TypeError，跟后端明确返回的错误(比如手机号格式不对)不是一回事——
      // 网络问题时请求很可能已经到达后端、短信也真发出去了，只是响应没传回来，这种情况也让用户能进到输验证码那一步，
      // 不然短信收到了却卡在这里进不去
      if (e instanceof TypeError) {
        setError('网络不稳定，请求可能已经发送成功——如果收到了验证码短信，可以直接输入')
        setCodeSent(true)
        startCountdown()
      } else {
        setError(e instanceof Error ? e.message : '发送失败')
      }
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async () => {
    setError('')
    if (code.length < 4) {
      setError('请输入验证码')
      return
    }
    setVerifying(true)
    try {
      const res = await apiPost<{ token: string }>('/auth/verify-code', { phone, code })
      const me = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${res.token}` },
      }).then((r) => r.json())
      login(res.token, me)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败')
    } finally {
      setVerifying(false)
    }
  }

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.subtle,
    // iOS Safari 有个特性：输入框文字小于16px时，点击输入框会把整个页面自动放大，
    // 16px 是不触发这个行为的最小值
    fontSize: 16,
    color: theme.text,
    outline: 'none',
    fontFamily: fontSans,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ fontFamily: fontSerif, fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#FFFFFF' }}>登录 Encore</div>

        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={codeSent}
            style={inputStyle}
          />
        </div>

        {codeSent && (
          <div style={{ marginBottom: 12 }}>
            <input
              placeholder="验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {error && <div style={{ color: theme.accent, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {!codeSent ? (
          <button
            onClick={handleSendCode}
            disabled={sending}
            style={{
              width: '100%', background: theme.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? '发送中...' : '获取验证码'}
          </button>
        ) : (
          <>
            <button
              onClick={handleVerify}
              disabled={verifying}
              style={{
                width: '100%', background: theme.accent, color: '#FFFFFF', border: 'none',
                borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                opacity: verifying ? 0.6 : 1, marginBottom: 8,
              }}
            >
              {verifying ? '验证中...' : '登录'}
            </button>
            <button
              onClick={handleSendCode}
              disabled={countdown > 0 || sending}
              style={{
                width: '100%', background: 'transparent', color: countdown > 0 ? theme.textSec : theme.accent,
                border: 'none', padding: 6, fontSize: 12, cursor: countdown > 0 ? 'default' : 'pointer',
              }}
            >
              {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
