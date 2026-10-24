// legacy 构建：自带 core-js polyfill（Promise.withResolvers 等），兼容旧版手机浏览器（iOS < 17.4 / 旧安卓内核）
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import './readableStreamPolyfill'
import PdfWorker from './pdfWorkerShim?worker'
import { stripRepeatedLines } from './headers'
import { assembleParagraphs, type RawLine } from './chunker'
import { detectDoubleColumn, garbledRatio } from './quality'

// 用 Vite 的 ?worker 拿 Worker 实例：dev 下用 ?url 引 worker 文件会被 Vite 转换注入 /@vite/client，worker 加载失败会让 getDocument 永远挂起
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

export interface ExtractResult {
  paragraphs: string[]
  pageCount: number
  garbled: boolean
  doubleColumn: boolean
  title: string | null
  coverBlob: Blob | null
}

function errInfo(e: unknown): string {
  if (e instanceof Error) {
    const frame = (e.stack ?? '')
      .split('\n')
      .slice(1, 2)
      .map(s => s.trim())
      .join('')
    return `${e.name}: ${e.message}${frame ? ` @ ${frame.slice(0, 100)}` : ''}`
  }
  return String(e)
}

export async function extractBook(
  data: ArrayBuffer,
  onProgress?: (pct: number) => void,
): Promise<ExtractResult> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
  })
  const doc = await loadingTask.promise.catch(e => {
    throw new Error(`加载文档失败：${errInfo(e)}`)
  })
  try {
    const pageCount = doc.numPages
    const pages: RawLine[][] = []
    let allText = ''
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i).catch(e => {
        throw new Error(`读取第 ${i} 页失败：${errInfo(e)}`)
      })
      const tc = await page.getTextContent().catch(e => {
        throw new Error(`第 ${i} 页文本提取失败：${errInfo(e)}`)
      })
      const lines = buildLines(tc.items)
      pages.push(lines)
      allText += lines.map(l => l.text).join('') + '\n'
      page.cleanup()
      onProgress?.(Math.round((i / pageCount) * 88))
    }
    const cleaned = stripRepeatedLines(pages)
    const paragraphs = assembleParagraphs(cleaned)
    const doubleColumn = detectDoubleColumn(
      pages.map(p => p.map(l => ({ x0: l.x0, width: l.width }))),
    )
    const coverBlob = await renderCover(doc)
    const title = await readTitle(doc)
    onProgress?.(96)
    return {
      paragraphs,
      pageCount,
      garbled: garbledRatio(allText) > 0.01,
      doubleColumn,
      title,
      coverBlob,
    }
  } finally {
    await loadingTask.destroy()
  }
}

interface Frag {
  x: number
  y: number
  w: number
  h: number
  str: string
}

function buildLines(items: unknown[]): RawLine[] {
  const frags: Frag[] = []
  for (const it of items as Array<Record<string, unknown>>) {
    if (typeof it.str !== 'string' || !Array.isArray(it.transform)) continue
    const transform = it.transform as number[]
    const h = typeof it.height === 'number' && it.height > 0 ? it.height : 12
    frags.push({
      x: transform[4],
      y: transform[5],
      w: typeof it.width === 'number' ? it.width : 0,
      h,
      str: it.str,
    })
  }
  frags.sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: RawLine[] = []
  let cur: { y: number; parts: Frag[] } | null = null
  for (const f of frags) {
    if (cur && Math.abs(cur.y - f.y) <= Math.max(2, f.h * 0.5)) {
      cur.parts.push(f)
    } else {
      if (cur) lines.push(finishLine(cur))
      cur = { y: f.y, parts: [f] }
    }
  }
  if (cur) lines.push(finishLine(cur))
  return lines.filter(l => l.text)
}

function finishLine(cur: { y: number; parts: Frag[] }): RawLine {
  const parts = [...cur.parts].sort((a, b) => a.x - b.x)
  const text = parts
    .map(p => p.str)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  const x0 = Math.min(...parts.map(p => p.x))
  const x1 = Math.max(...parts.map(p => p.x + p.w))
  const fontSize = Math.max(...parts.map(p => p.h))
  return { text, x0, y: cur.y, width: Math.max(x1 - x0, 0), fontSize }
}

async function renderCover(doc: pdfjs.PDFDocumentProxy): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(3, 256 / base.width)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // print intent 不走 requestAnimationFrame（display intent 在 rAF 被节流的页面里会永久挂起）
    await page.render({ canvas, viewport, intent: 'print' }).promise
    page.cleanup()
    return await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.75))
  } catch {
    return null
  }
}

async function readTitle(doc: pdfjs.PDFDocumentProxy): Promise<string | null> {
  try {
    const { info } = await doc.getMetadata()
    const t = (info as { Title?: unknown } | undefined)?.Title
    if (typeof t !== 'string') return null
    const s = t.trim()
    if (!s || /^untitled$/i.test(s) || /^[\d\s.]+$/.test(s) || /[\uFFFD\uE000-\uF8FF]/.test(s)) {
      return null
    }
    return s.slice(0, 80)
  } catch {
    return null
  }
}
