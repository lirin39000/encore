import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 有些浮层(比如城市选择的全屏页)会用 portal 挂到 document.body 上，
      // DOM 结构上不再是 ref 的子节点，但逻辑上属于"里面"，用这个标记豁免掉
      if (target.closest('[data-click-outside-ignore]')) return
      if (ref.current && !ref.current.contains(target)) {
        onOutside()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [active, ref, onOutside])
}
