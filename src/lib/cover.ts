// 封面小图：导入时把首页渲染结果压成 200px 宽的 JPEG data URL 持久化。
// iOS WebKit 的 IndexedDB Blob 在同一会话里可能失效（首次可读、之后读不出），
// 存字符串可以避免每次挂载都重新读 Blob。
export const COVER_MAX_WIDTH = 200
export const COVER_QUALITY = 0.7

/** 读取 Blob 为 data URL；失败返回 null，绝不抛错 */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    if (!(blob instanceof Blob) || blob.size === 0) {
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    try {
      reader.readAsDataURL(blob)
    } catch {
      resolve(null)
    }
  })
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 把封面 Blob 缩到 maxWidth 并转成 JPEG data URL；任一步失败返回 null */
export async function makeCoverDataUrl(
  blob: Blob,
  maxWidth = COVER_MAX_WIDTH,
): Promise<string | null> {
  const raw = await blobToDataUrl(blob)
  if (!raw) return null
  const img = await loadImage(raw)
  if (!img || !img.naturalWidth) return null
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', COVER_QUALITY)
  } catch {
    return null
  }
}

// 同一会话内的内存缓存：老记录（Blob）首次读取成功后缓存住，
// 即使后续该 Blob 在 iOS 上失效也能继续显示，同时等待写回字符串完成
const CACHE_LIMIT = 200
const coverCache = new Map<string, string>()

export function coverCacheKey(bookId: string, blob?: Blob): string {
  return blob ? `${bookId}:${blob.size}` : bookId
}

export function getCachedCover(key: string): string | null {
  return coverCache.get(key) ?? null
}

export function setCachedCover(key: string, dataUrl: string): void {
  if (coverCache.size >= CACHE_LIMIT) {
    const oldest = coverCache.keys().next().value
    if (oldest !== undefined) coverCache.delete(oldest)
  }
  coverCache.set(key, dataUrl)
}
