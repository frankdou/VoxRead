const SENTENCE_LIMIT = 200

/** 归一 CJK 兼容字符（康熙部首"⽬"→"目"、兼容表意"車"→"车"）；不动全角标点/数字，避免破坏中文排版 */
export function normalizeCjkCompat(s: string): string {
  return s.replace(/[\u2E80-\u2EFF\u2F00-\u2FDF\uF900-\uFAFF]/g, ch => ch.normalize('NFKC'))
}

/** 清理提取文本：CJK 兼容字符归一、去零宽字符、合并空白、去掉中日韩字符间的多余空格 */
export function normalizeText(t: string): string {
  return normalizeCjkCompat(t)
    .replace(/[\u200b\u200e\u200f\ufeff\u00ad]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?([\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]) ?/g, '$1')
    .trim()
}

/** 切句：按终止标点切分，超长句按逗号类标点二切，仍超长则硬切；\n（段落边界）视为句边界 */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const p = para.trim()
    if (!p) continue
    for (const piece of p.split(/(?<=[。！？…；!?;])/)) {
      const s = piece.trim()
      if (!s) continue
      if (s.length <= SENTENCE_LIMIT) out.push(s)
      else out.push(...splitLong(s))
    }
  }
  return out
}

/** 切句并保留段落归属（阅读页按段落渲染、按句高亮） */
export function splitSentencesRich(text: string): { text: string; para: number }[] {
  return text
    .split('\n')
    .flatMap((para, pi) => splitSentences(para).map(s => ({ text: s, para: pi })))
}

function splitLong(s: string): string[] {
  const parts = s.split(/(?<=[，,、：:；）)”'])/)
  const out: string[] = []
  let buf = ''
  for (const part of parts) {
    if (buf && buf.length + part.length > SENTENCE_LIMIT) {
      out.push(buf)
      buf = part
    } else {
      buf += part
    }
  }
  if (buf) out.push(buf)
  return out.flatMap(x => (x.length <= SENTENCE_LIMIT ? [x] : hardSlice(x)))
}

function hardSlice(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += SENTENCE_LIMIT) out.push(s.slice(i, i + SENTENCE_LIMIT))
  return out
}
