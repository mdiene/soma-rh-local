import http from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import pg from 'pg'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createDocumentThumbnail } from './thumbnail.mjs'

const { Pool } = pg
const port = Number(process.env.PORT ?? 8000)
const postgrestUrl = process.env.POSTGREST_URL ?? 'http://postgrest:3000'
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) throw new Error('JWT_SECRET is required')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const secret = new TextEncoder().encode(jwtSecret)
const documentRoot = process.env.DOCUMENT_ROOT ?? '/data/documents'
const maxDocumentBytes = 10 * 1024 * 1024

await mkdir(documentRoot, { recursive: true })

async function issueToken(user) {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated', email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret)
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  const contentType = request.headers['content-type'] ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  return JSON.parse(raw)
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function binaryBody(request, limit = maxDocumentBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new Error('Fichier trop volumineux (10 Mo maximum)')
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

function safeFileName(value) {
  const normalized = value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return normalized || 'document'
}

function sendPdf(response, bytes, fileName) {
  response.writeHead(200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${safeFileName(fileName)}"`,
    'content-length': bytes.length,
    'cache-control': 'private, no-store',
  })
  response.end(Buffer.from(bytes))
}

async function documentRoute(request, response, url) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return json(response, 401, { message: 'Authentification requise' }), true
  const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' })
  const userId = String(payload.sub ?? '')
  if (!userId) return json(response, 401, { message: 'Session invalide' }), true

  const bundleMatch = url.pathname.match(/^\/api\/v1\/employees\/([0-9a-f-]{36})\/documents\/bundle$/i)
  if (request.method === 'GET' && bundleMatch) {
    const employeeId = bundleMatch[1]
    const access = await pool.query(
      `select e.first_name, e.last_name, e.employee_number,
              exists(select 1 from public.user_roles where user_id = $1 and role in ('admin','rh')) as can_manage,
              e.user_id = $1 as is_owner
         from public.employees e
        where e.id = $2`,
      [userId, employeeId],
    )
    const employee = access.rows[0]
    if (!employee) return json(response, 404, { message: 'Salarié introuvable' }), true
    if (!employee.can_manage && !employee.is_owner) return json(response, 403, { message: 'Accès interdit à ce dossier' }), true

    const documents = await pool.query(
      `select d.title, d.file_name, d.mime_type, d.storage_path, d.thumbnail_path, d.document_slot,
              coalesce(r.sort_order, 9999) as sort_order
         from public.employee_documents d
         left join public.document_requirements r on r.code = d.requirement_code
        where d.employee_id = $1 and d.archived_at is null
        order by coalesce(r.sort_order, 9999), d.document_slot, d.created_at`,
      [employeeId],
    )
    const bundle = await PDFDocument.create()
    const font = await bundle.embedFont(StandardFonts.Helvetica)
    const boldFont = await bundle.embedFont(StandardFonts.HelveticaBold)
    const cover = bundle.addPage()
    const { width, height } = cover.getSize()
    cover.drawText('Dossier administratif salarié', { x: 54, y: height - 90, size: 22, font: boldFont, color: rgb(0.08, 0.16, 0.2) })
    cover.drawText(`${employee.first_name} ${employee.last_name}`, { x: 54, y: height - 130, size: 16, font: boldFont })
    cover.drawText(`Matricule : ${employee.employee_number}`, { x: 54, y: height - 155, size: 11, font })
    cover.drawText(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`, { x: 54, y: height - 175, size: 11, font, color: rgb(0.3, 0.35, 0.38) })
    cover.drawText(`${documents.rows.length} document(s) intégré(s)`, { x: 54, y: height - 220, size: 13, font: boldFont, color: rgb(0.08, 0.35, 0.45) })

    for (const document of documents.rows) {
      const source = await readFile(path.join(documentRoot, document.storage_path))
      if (document.mime_type === 'application/pdf') {
        const sourcePdf = await PDFDocument.load(source)
        const pages = await bundle.copyPages(sourcePdf, sourcePdf.getPageIndices())
        pages.forEach((page) => bundle.addPage(page))
        continue
      }
      const page = bundle.addPage()
      const image = document.mime_type === 'image/png' ? await bundle.embedPng(source) : document.mime_type === 'image/jpeg' ? await bundle.embedJpg(source) : await bundle.embedJpg(await readFile(path.join(documentRoot, document.thumbnail_path)))
      const scale = Math.min((width - 72) / image.width, (height - 150) / image.height, 1)
      const imageWidth = image.width * scale
      const imageHeight = image.height * scale
      page.drawText(document.title + (document.document_slot > 1 ? ` n°${document.document_slot}` : ''), { x: 36, y: height - 42, size: 12, font: boldFont })
      page.drawImage(image, { x: (width - imageWidth) / 2, y: (height - imageHeight - 55) / 2, width: imageWidth, height: imageHeight })
      page.drawText(document.file_name, { x: 36, y: 24, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
    }
    return sendPdf(response, await bundle.save(), `dossier-${safeFileName(employee.employee_number)}.pdf`), true
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/documents/upload') {
    const employeeId = String(request.headers['x-employee-id'] ?? '')
    const requirementCode = String(request.headers['x-requirement-code'] ?? '')
    const documentSlot = Math.max(1, Number(request.headers['x-document-slot'] ?? 1))
    const mimeType = String(request.headers['x-file-mime'] ?? request.headers['content-type'] ?? '')
    const encodedName = String(request.headers['x-file-name'] ?? '')
    const fileName = encodedName ? Buffer.from(encodedName, 'base64').toString('utf8') : 'document'
    if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^[a-z0-9_]+$/.test(requirementCode)) {
      return json(response, 400, { message: 'Référence de document invalide' }), true
    }
    const allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedMime.includes(mimeType)) return json(response, 415, { message: 'Format accepté : PDF, Word, JPEG ou PNG' }), true

    const access = await pool.query(
      `select exists(select 1 from public.user_roles where user_id = $1 and role in ('admin','rh')) as can_manage,
              exists(select 1 from public.employees where id = $2 and user_id = $1) as is_owner`,
      [userId, employeeId],
    )
    const actor = access.rows[0]
    if (!actor?.can_manage && !actor?.is_owner) return json(response, 403, { message: 'Accès interdit à ce dossier' }), true

    const requirement = await pool.query(
      'select code, title, allowed_mime_types, max_size_bytes from public.document_requirements where code = $1 and active',
      [requirementCode],
    )
    const definition = requirement.rows[0]
    if (!definition) return json(response, 422, { message: 'Type de document inconnu' }), true
    if (!definition.allowed_mime_types.includes(mimeType)) return json(response, 415, { message: 'Format non autorisé pour ce document' }), true

    const file = await binaryBody(request, Math.min(Number(definition.max_size_bytes), maxDocumentBytes))
    if (!file.length) return json(response, 400, { message: 'Le fichier est vide' }), true
    const checksum = createHash('sha256').update(file).digest('hex')
    const storagePath = path.join(employeeId, `${requirementCode}-${randomUUID()}-${safeFileName(fileName)}`)
    const thumbnailPath = path.join(employeeId, `thumbnail-${randomUUID()}.jpg`)
    const absolutePath = path.join(documentRoot, storagePath)
    const absoluteThumbnailPath = path.join(documentRoot, thumbnailPath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file, { flag: 'wx' })
    await writeFile(absoluteThumbnailPath, await createDocumentThumbnail(file, fileName, mimeType), { flag: 'wx' })

    const client = await pool.connect()
    try {
      await client.query('begin')
        const current = await client.query(
          'select id, current_version from public.employee_documents where employee_id = $1 and requirement_code = $2 and document_slot = $3 and archived_at is null for update',
          [employeeId, requirementCode, documentSlot],
      )
      let document
      let version
      if (current.rows[0]) {
        version = Number(current.rows[0].current_version) + 1
        document = await client.query(
          `update public.employee_documents
           set file_name = $1, storage_path = $2, mime_type = $3, size_bytes = $4, checksum = $5,
               thumbnail_path = $6,
               status = 'en_attente', rejection_reason = null, validated_by = null, validated_at = null,
               current_version = $7, submitted_at = now(), archived_at = null, archived_by = null
           where id = $8 returning *`,
          [fileName, storagePath, mimeType, file.length, checksum, thumbnailPath, version, current.rows[0].id],
        )
      } else {
        version = 1
        document = await client.query(
          `insert into public.employee_documents
             (employee_id, document_type, requirement_code, document_slot, title, file_name, storage_path, thumbnail_path, mime_type, size_bytes, checksum, created_by, status, current_version, submitted_at)
           values ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'en_attente', 1, now()) returning *`,
          [employeeId, requirementCode, requirementCode === 'situation_matrimoniale' || requirementCode === 'actes_enfants' ? documentSlot : 1, definition.title, fileName, storagePath, thumbnailPath, mimeType, file.length, checksum, userId],
        )
      }
      await client.query(
        `insert into public.document_versions
          (document_id, version_number, storage_path, file_name, mime_type, size_bytes, checksum, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [document.rows[0].id, version, storagePath, fileName, mimeType, file.length, checksum, userId],
      )
      await client.query('commit')
      return json(response, 201, { document: document.rows[0] }), true
    } catch (error) {
      await client.query('rollback')
      await unlink(absolutePath).catch(() => {})
      await unlink(absoluteThumbnailPath).catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/v1/documents/')) {
    const isThumbnail = url.pathname.endsWith('/thumbnail')
    const documentId = url.pathname.split('/').slice(-1 - (isThumbnail ? 1 : 0))[0]
    if (!/^[0-9a-f-]{36}$/i.test(documentId ?? '')) return json(response, 400, { message: 'Document invalide' }), true
    const result = await pool.query(
      `select d.storage_path, d.thumbnail_path, d.file_name, d.mime_type
       from public.employee_documents d
       where d.id = $1 and (
         exists(select 1 from public.user_roles where user_id = $2 and role in ('admin','rh'))
         or exists(select 1 from public.employees e where e.id = d.employee_id and e.user_id = $2)
       )`,
      [documentId, userId],
    )
    if (!result.rows[0]) return json(response, 404, { message: 'Document introuvable ou non autorisé' }), true
    const item = result.rows[0]
    const file = await readFile(path.join(documentRoot, isThumbnail ? item.thumbnail_path : item.storage_path))
    await pool.query(
      'insert into public.employee_document_access_log(document_id, user_id) values ($1, $2)',
      [documentId, userId],
    )
    response.writeHead(200, { 'content-type': isThumbnail ? 'image/jpeg' : item.mime_type, 'content-disposition': `inline; filename="${safeFileName(item.file_name)}"`, 'cache-control': 'private, no-store' })
    response.end(file)
    return true
  }
  if (request.method === 'DELETE' && url.pathname.startsWith('/api/v1/documents/')) {
    const documentId = url.pathname.split('/').pop()
    if (!/^[0-9a-f-]{36}$/i.test(documentId ?? '')) return json(response, 400, { message: 'Document invalide' }), true
    const access = await pool.query(
      `select d.storage_path, d.thumbnail_path
       from public.employee_documents d
       where d.id = $1
         and exists(select 1 from public.user_roles where user_id = $2 and role in ('admin','rh'))`,
      [documentId, userId],
    )
    if (!access.rows[0]) return json(response, 404, { message: 'Document introuvable ou non autorisé' }), true
    await pool.query('delete from public.employee_documents where id = $1', [documentId])
    await unlink(path.join(documentRoot, access.rows[0].storage_path)).catch(() => {})
    if (access.rows[0].thumbnail_path) await unlink(path.join(documentRoot, access.rows[0].thumbnail_path)).catch(() => {})
    return json(response, 200, { deleted: true }), true
  }
  return false
}

function setCors(request, response) {
  const origin = request.headers.origin
  if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('access-control-allow-credentials', 'true')
  }
  response.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, accept, accept-profile, content-profile, prefer, range, x-client-info, x-supabase-api-version, x-employee-id, x-requirement-code, x-document-slot, x-file-name, x-file-mime')
  response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
}

async function auth(request, response, pathname) {
  if (request.method === 'POST' && pathname === '/auth/v1/signup') {
    const input = await body(request)
    if (!input.email || !input.password || input.password.length < 8) {
      return json(response, 400, { error: 'email et mot de passe de 8 caractères minimum requis' })
    }
    const password = await bcrypt.hash(input.password, 12)
    const id = randomUUID()
    const result = await pool.query(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at)
       values ($1, lower($2), $3, now())
       returning id, email, created_at, updated_at`,
      [id, input.email, password],
    )
    const user = result.rows[0]
    return json(response, 200, { user, access_token: await issueToken(user), refresh_token: await issueToken(user), token_type: 'bearer', expires_in: 28800 })
  }

  if (request.method === 'POST' && pathname === '/auth/v1/token') {
    const input = await body(request)
    const result = await pool.query('select id, email, encrypted_password, created_at, updated_at from auth.users where email = lower($1)', [input.email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(input.password ?? '', user.encrypted_password))) {
      return json(response, 400, { error: 'invalid_credentials', error_description: 'Adresse ou mot de passe invalide' })
    }
    return json(response, 200, { user: { id: user.id, email: user.email, created_at: user.created_at, updated_at: user.updated_at }, access_token: await issueToken(user), refresh_token: await issueToken(user), token_type: 'bearer', expires_in: 28800 })
  }

  if (request.method === 'GET' && pathname === '/auth/v1/user') {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return json(response, 401, { message: 'Missing authorization' })
    const { payload: claims } = await jwtVerify(token, secret, { audience: 'authenticated' })
    const result = await pool.query('select id, email, created_at, updated_at from auth.users where id = $1', [claims.sub])
    return result.rows[0] ? json(response, 200, result.rows[0]) : json(response, 401, { message: 'User not found' })
  }

  if (request.method === 'POST' && pathname === '/auth/v1/logout') return json(response, 204, {})
  return false
}

const server = http.createServer(async (request, response) => {
  try {
    setCors(request, response)
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }
    const url = new URL(request.url, `http://${request.headers.host}`)
    if (url.pathname.startsWith('/auth/v1/')) {
      const handled = await auth(request, response, url.pathname)
      if (handled !== false) return
    }
    if (url.pathname.startsWith('/api/v1/documents/') || url.pathname.startsWith('/api/v1/employees/')) {
      if (await documentRoute(request, response, url)) return
    }

    const postgrestPath = url.pathname.startsWith('/rest/v1/')
      ? url.pathname.slice('/rest/v1'.length)
      : url.pathname
    const target = new URL(postgrestPath + url.search, postgrestUrl)
    const headers = {}
    for (const name of ['authorization', 'accept', 'accept-profile', 'content-profile', 'content-type', 'prefer', 'range', 'apikey']) {
      if (request.headers[name]) headers[name] = request.headers[name]
    }
    const hasBody = !['GET', 'HEAD'].includes(request.method)
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request : undefined,
      duplex: hasBody ? 'half' : undefined,
    })
    const responseHeaders = Object.fromEntries(upstream.headers)
    delete responseHeaders['access-control-allow-origin']
    delete responseHeaders['access-control-allow-credentials']
    response.writeHead(upstream.status, responseHeaders)
    response.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (error) {
    console.error(error)
    json(response, 500, { message: 'Erreur interne de la passerelle' })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`SOMA-RH gateway listening on ${port}`))
