import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const COLORS = {
  pdf: ['#c94b3c', '#fff4f1'],
  word: ['#2563eb', '#eff6ff'],
  image: ['#16806a', '#effcf7'],
  file: ['#596970', '#f5f7f8'],
}

function kindFor(mimeType, fileName) {
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(fileName)) return 'pdf'
  if (mimeType.includes('word') || /\.(doc|docx)$/i.test(fileName)) return 'word'
  if (mimeType.startsWith('image/')) return 'image'
  return 'file'
}

export async function createDocumentThumbnail(buffer, fileName, mimeType) {
  const kind = kindFor(mimeType, fileName)
  const [accent, background] = COLORS[kind]
  if (kind === 'pdf') {
    const base = path.join('/tmp', `soma-thumbnail-${randomUUID()}`)
    const input = `${base}.pdf`
    const output = `${base}.jpg`
    await writeFile(input, buffer)
    try {
      await execFileAsync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-jpeg', '-scale-to', '640', input, base])
      await access(output)
      return await sharp(output).resize(320, 220, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer()
    } catch {
      // Some malformed or encrypted PDFs cannot be rasterized; keep a usable file-type thumbnail.
    } finally {
      await unlink(input).catch(() => {})
      await unlink(output).catch(() => {})
    }
  }
  if (kind === 'image') {
    return sharp(buffer).rotate().resize(320, 220, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84 }).toBuffer()
  }
  const label = kind === 'pdf' ? 'PDF' : kind === 'word' ? 'WORD' : 'FICHIER'
  const safeName = fileName.replace(/[<>&"]/g, '').slice(0, 34)
  const svg = `<svg width="320" height="220" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="220" rx="14" fill="${background}"/>
    <rect width="320" height="52" rx="14" fill="${accent}"/>
    <rect y="38" width="320" height="14" fill="${accent}"/>
    <text x="20" y="34" font-family="Arial" font-size="21" font-weight="700" fill="#ffffff">${label}</text>
    <rect x="20" y="84" width="280" height="2" fill="${accent}" opacity=".28"/>
    <text x="20" y="124" font-family="Arial" font-size="15" font-weight="700" fill="#24323a">Document administratif</text>
    <text x="20" y="153" font-family="Arial" font-size="12" fill="#596970">${safeName}</text>
    <text x="20" y="194" font-family="Arial" font-size="11" fill="${accent}">Aperçu sécurisé</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer()
}
