import { normalizeText, splitSentences } from './sentences'

/** pdf.js 提取出的单行文本（带坐标，用于段落判定） */
export interface RawLine {
  text: string
  x0: number
  y: number
  width: number
  fontSize: number
}

export const MAX_CHUNK = 1500

const TERMINAL = /[。！？…”』」!?；;]$/

/**
 * 行 → 段落。启发式：行间距显著变大、或行首缩进（中文小说两字缩进）视为段落边界；
 * 页末无终止标点时段落跨页延续。
 */
export function assembleParagraphs(pages: RawLine[][]): string[] {
  const out: string[] = []
  let buf: string[] = []
  let prevLine: RawLine | null = null
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(' '))
      buf = []
    }
  }
  for (const lines of pages) {
    if (!lines.length) continue
    const typicalX0 = median(lines.map(l => l.x0))
    const fontSize = Math.max(6, median(lines.map(l => l.fontSize)))
    const gaps: number[] = []
    for (let i = 1; i < lines.length; i++) gaps.push(Math.abs(lines[i - 1].y - lines[i].y))
    const gap = gaps.length ? median(gaps) : fontSize * 1.3
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (i === 0) {
        const continues =
          prevLine !== null && !TERMINAL.test(prevLine.text) && line.x0 - typicalX0 < fontSize * 0.9
        if (!continues) flush()
      } else {
        const prev = lines[i - 1]
        const bigGap = Math.abs(prev.y - line.y) > gap * 1.55 + 1
        const indented = line.x0 - typicalX0 > fontSize * 0.9
        if (bigGap || indented) flush()
      }
      buf.push(line.text)
      prevLine = line
    }
    if (!prevLine || TERMINAL.test(prevLine.text)) flush()
  }
  flush()
  return out.map(normalizeText).filter(Boolean)
}

/** 段落 → 块：按段落聚合至 ≤1500 字符，段落不跨块；超长段落按句切分 */
export function buildChunks(paragraphs: string[]): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const p of paragraphs) {
    if (!p) continue
    if (p.length > MAX_CHUNK) {
      if (cur) {
        chunks.push(cur)
        cur = ''
      }
      let piece = ''
      for (const s of splitSentences(p)) {
        if (piece && piece.length + s.length > MAX_CHUNK) {
          chunks.push(piece)
          piece = s
        } else {
          piece += s
        }
      }
      if (piece) chunks.push(piece)
      continue
    }
    if (cur && cur.length + 1 + p.length > MAX_CHUNK) {
      chunks.push(cur)
      cur = p
    } else {
      cur = cur ? `${cur}\n${p}` : p
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
