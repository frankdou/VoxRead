import { normalizeCjkCompat, splitSentences } from './sentences'

export interface SearchHit {
  seq: number
  /** 命中段落在该块内的序号（split('\n') 下标），供精确定位，不依赖文字比对 */
  paraIdx: number
  /** 命中在段落内的句子序号（决定闪亮落在具体哪一句，而非段落第一句） */
  sentInPara: number
  before: string
  match: string
  after: string
}

/** 查询词各字符之间允许出现少量空白/标点（"第一章前言" 可命中 "第一章 前言"） */
const SEP = '[\\s\\u3000，。：:、；！？…,.:;!?·“”‘’"\'（）()]{0,3}'

function escapeRe(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildFuzzyRegex(query: string): RegExp | null {
  const chars = [...normalizeCjkCompat(query).trim()].filter(c => !/\s/.test(c))
  if (!chars.length) return null
  return new RegExp(chars.map(escapeRe).join(SEP), 'gi')
}

/** 全文模糊搜索：逐段落匹配，返回带上下文的命中片段 */
export function searchChunks(
  chunks: { seq: number; text: string }[],
  query: string,
  limit = 200,
): SearchHit[] {
  const re = buildFuzzyRegex(query)
  if (!re) return []
  const out: SearchHit[] = []
  for (const c of chunks) {
    const paras = c.text.split('\n')
    for (let paraIdx = 0; paraIdx < paras.length; paraIdx++) {
      // 已入库的书可能含兼容字符（康熙部首"⾎"≠"血"），匹配前归一
      const para = normalizeCjkCompat(paras[paraIdx])
      re.lastIndex = 0
      const m = re.exec(para)
      if (!m) continue
      // 找出命中位置落在段落内的第几句（句子长度累加还原偏移；归一化在这些区间是 1:1，不影响偏移）
      const sentences = splitSentences(para)
      let acc = 0
      let sentInPara = 0
      for (let i = 0; i < sentences.length; i++) {
        if (m.index < acc + sentences[i].length) {
          sentInPara = i
          break
        }
        acc += sentences[i].length
      }
      const end = m.index + m[0].length
      const start = Math.max(0, m.index - 16)
      out.push({
        seq: c.seq,
        paraIdx,
        sentInPara,
        before: (start > 0 ? '…' : '') + para.slice(start, m.index),
        match: m[0],
        after: para.slice(end, end + 48) + (end + 48 < para.length ? '…' : ''),
      })
      if (out.length >= limit) return out
    }
  }
  return out
}
