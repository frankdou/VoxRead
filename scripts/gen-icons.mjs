// 生成 PWA 图标（纯 Node，无图像依赖）：圆角底 + 播放三角
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // 8-bit RGBA
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

function inTri(x, y, [[x1, y1], [x2, y2], [x3, y3]]) {
  const d1 = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
  const d2 = (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2)
  const d3 = (x1 - x3) * (y - y3) - (y1 - y3) * (x - x3)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

const BG = [79, 70, 229] // indigo-600
const FG = [255, 255, 255]

function drawIcon(size, { rounded = true, contentScale = 1 } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = rounded ? size * 0.225 : 0
  const SS = 3
  const half = size / 2
  const tw = size * 0.44 * contentScale
  const th = size * 0.42 * contentScale
  const tri = [
    [cx - tw * 0.36, cy - th / 2],
    [cx - tw * 0.36, cy + th / 2],
    [cx + tw * 0.52, cy],
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHit = 0
      let fgHit = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          const inside = rounded ? sdRoundRect(px, py, cx, cy, half, half, r) <= 0 : true
          if (!inside) continue
          bgHit++
          if (inTri(px, py, tri)) fgHit++
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      const color = fgHit > n / 2 ? FG : BG
      rgba[i] = color[0]
      rgba[i + 1] = color[1]
      rgba[i + 2] = color[2]
      rgba[i + 3] = Math.round((bgHit / n) * 255)
    }
  }
  return png(size, size, rgba)
}

const outDir = path.resolve('public/icons')
mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192))
writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512))
writeFileSync(path.join(outDir, 'maskable-512.png'), drawIcon(512, { rounded: false, contentScale: 0.78 }))
writeFileSync(path.resolve('public/apple-touch-icon.png'), drawIcon(180, { rounded: false }))
console.log('icons written to public/icons + public/apple-touch-icon.png')
