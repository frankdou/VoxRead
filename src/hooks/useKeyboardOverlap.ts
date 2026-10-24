import { useEffect, useState } from 'react'

/**
 * 键盘遮挡高度（px，无键盘为 0）。基于 visualViewport 计算：
 * iOS 键盘不改变 window.innerHeight，只压缩视觉视口；overlap 即底部被键盘占住的部分。
 * 底部弹层把它设为 body 的 bottom 偏移即可停在键盘上方。
 */
export function useKeyboardOverlap(enabled: boolean): number {
  const [overlap, setOverlap] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      setOverlap(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    sync()
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [enabled])

  return overlap
}
