import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

// 桌面端/手机端用两套真实不同的卡片 DOM(不是靠 CSS 挤压同一套布局)，这个 hook 判断当前该渲染哪一套，
// 监听 matchMedia 变化而不是只读一次，这样调整浏览器窗口大小也能实时切换，不需要用户手动选
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
