import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { createDocumentThumbnail } from './thumbnail.mjs'

const { Pool } = pg
const root = process.env.DOCUMENT_ROOT ?? '/data/documents'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const result = await pool.query(`
  select id, storage_path, file_name, mime_type
  from public.employee_documents
`)

for (const document of result.rows) {
  const thumbnailPath = path.join(path.dirname(document.storage_path), `thumbnail-${document.id}.jpg`)
  const thumbnail = await createDocumentThumbnail(
    await readFile(path.join(root, document.storage_path)),
    document.file_name,
    document.mime_type,
  )
  await mkdir(path.dirname(path.join(root, thumbnailPath)), { recursive: true })
  await writeFile(path.join(root, thumbnailPath), thumbnail)
  await pool.query('update public.employee_documents set thumbnail_path = $1 where id = $2', [thumbnailPath, document.id])
}

console.log(`Miniatures créées : ${result.rows.length}`)
await pool.end()
