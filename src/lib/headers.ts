import type { RawLine } from './chunker'

/**
 * 去除页眉/页脚：页面上下各两行范围内，
 * - 纯页码类行（数字 + 少量连接符）直接剔除
 * - 跨页重复的行（数字归一后出现在 ≥ max(3, 40% 页)）剔除
 */
export function stripRepeatedLines(pages: RawLine[][]): RawLine[][] {
  const n = pages.length
  const counts = new Map<string, number>()
  for (const lines of pages) {
    if (!lines.length) continue
    const zoneIdx = zoneIndexes(lines.length)
    const seen = new Set<string>()
    for (const idx of zoneIdx) {
      const key = normalize(lines[idx].text)
      if (!key || seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const threshold = Math.max(3, Math.ceil(n * 0.4))
  const repeated = new Set(
    [...counts.entries()].filter(([, c]) => c >= threshold).map(([k]) => k),
  )
  return pages.map(lines => {
    if (!lines.length) return lines
    const zoneIdx = zoneIndexes(lines.length)
    return lines.filter((l, i) => {
      if (!zoneIdx.has(i)) return true
      if (isPageNumberLike(l.text)) return false
      return !repeated.has(normalize(l.text))
    })
  })
}

function zoneIndexes(len: number): Set<number> {
  const s = new Set<number>()
  for (let k = 0; k < Math.min(2, len); k++) s.add(k)
  for (let k = Math.max(0, len - 2); k < len; k++) s.add(k)
  return s
}

function normalize(t: string): string {
  return t.replace(/\d+/g, '#').replace(/\s+/g, '')
}

export function isPageNumberLike(t: string): boolean {
  if (!/\d/.test(t)) return false
  if (t.replace(/\D/g, '').length > 4) return false
  return /^[\d\s\-—–.。·pP第页共\d]+$/.test(t)
}
