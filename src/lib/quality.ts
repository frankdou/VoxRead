/** 乱码比例：替换符 + 私用区字符占全部字符的比例（缺 ToUnicode 映射的字体特征） */
export function garbledRatio(text: string): number {
  if (!text.length) return 0
  const bad = (text.match(/[\uFFFD\uE000-\uF8FF]/g) ?? []).length
  return bad / text.length
}

/** 疑似双栏排版：行中心点明显聚成左右两簇且中间空洞的页面占比高 */
export function detectDoubleColumn(pages: { x0: number; width: number }[][]): boolean {
  if (pages.length < 4) return false
  let columnar = 0
  for (const lines of pages) {
    if (lines.length < 8) continue
    const left = Math.min(...lines.map(l => l.x0))
    const right = Math.max(...lines.map(l => l.x0 + l.width))
    const w = right - left
    if (w <= 0) continue
    const mid = left + w / 2
    let lc = 0
    let rc = 0
    let mc = 0
    for (const l of lines) {
      const c = l.x0 + l.width / 2
      if (c < mid - w * 0.15) lc++
      else if (c > mid + w * 0.15) rc++
      else mc++
    }
    if (lc >= lines.length * 0.3 && rc >= lines.length * 0.3 && mc <= lines.length * 0.2) columnar++
  }
  return columnar >= pages.length * 0.35
}
