import { useEffect, useState } from 'react'

interface VisualViewportMetrics {
  /** 视觉视口相对布局视口的上移量（px）。iOS 键盘弹起时布局视口不缩，页面被整体上移到这里 */
  offsetTop: number
  /** 视觉视口可见高度（px），键盘弹起后会变小 */
  height: number
  /** 布局视口高度（px），键盘弹起时不变，用于换算百分比高度 */
  layoutHeight: number
}

function read(): VisualViewportMetrics {
  const layoutHeight = window.innerHeight
  const vv = window.visualViewport
  if (!vv) return { offsetTop: 0, height: layoutHeight, layoutHeight }
  return {
    offsetTop: Math.max(0, Math.round(vv.offsetTop)),
    height: Math.round(vv.height),
    layoutHeight,
  }
}

/**
 * 跟踪 visualViewport 尺寸变化。顶部弹层用 offsetTop 锚定到可见区顶部，
 * 否则键盘弹起把页面整体上移时，position: fixed 的面板会被顶出屏幕。
 */
export function useVisualViewport(enabled: boolean): VisualViewportMetrics {
  const [metrics, setMetrics] = useState(read)

  useEffect(() => {
    if (!enabled) return
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => setMetrics(read())
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    sync()
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [enabled])

  return metrics
}
