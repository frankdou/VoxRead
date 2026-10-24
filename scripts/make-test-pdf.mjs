// 生成用于端到端冒烟测试的简单 PDF（含重复页眉和页码，顺带验证页眉页脚剔除）
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('test/fixtures', { recursive: true })

const pages = 6
// 含重复页眉（Header）与隐式页码位置，顺带验证页眉页脚剔除
const linesPerPage = [
  'Header',
  'Chapter One',
  'The quick brown fox jumps over the lazy dog near the river bank at dawn.',
  'She opened the small wooden box and found a letter inside it.',
  'Rain fell softly on the roof all through the quiet night.',
  'He walked along the shore and thought about the long journey ahead.',
  'The old clock on the wall struck twelve times before they left.',
  'Mountains rose in the distance under a wide grey sky.',
]

const objects = []
function obj(body) {
  objects.push(body)
  return objects.length
}

const fontId = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const pageIds = []
for (let p = 1; p <= pages; p++) {
  // 本轮将先创建内容流（id = length+1），再创建页对象（id = length+2）
  pageIds.push(objects.length + 2)
  const content = [...linesPerPage, String(p)]
    .map((t, i) => `${i === 0 ? 'BT /F1 12 Tf 72 720 Td' : '0 -16 Td'} (${t.replace(/[()\\]/g, '')}) Tj`)
    .join('\n')
  const streamId = obj(`<< /Length ${content.length} >>\nstream\n${content}\nET\nendstream`)
  obj(
    `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
  )
}
const kids = pageIds.map(id => `${id} 0 R`).join(' ')
const pagesId = obj(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`)
const catalogId = obj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

let out = '%PDF-1.4\n'
const offsets = []
for (let i = 0; i < objects.length; i++) {
  offsets.push(out.length)
  out += `${i + 1} 0 obj\n${objects[i].replace('PAGES_REF', `${pagesId} 0 R`)}\nendobj\n`
}
const xrefStart = out.length
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

writeFileSync('test/fixtures/sample.pdf', out)
console.log(`sample.pdf written: ${pages} pages, ${out.length} bytes`)
