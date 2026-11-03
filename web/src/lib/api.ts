import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Seul fichier qui connaît la bibliothèque cliente (PostgREST + authentification locale).
export type ApiClient = SupabaseClient
export type ApiSession = Session

const url = import.meta.env.VITE_API_URL as string
const key = import.meta.env.VITE_API_PUBLIC_KEY as string

if (!url || !key) {
  throw new Error('Configuration manquante : renseignez VITE_API_URL et VITE_API_PUBLIC_KEY dans web/.env.local')
}

export const dataApi = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export async function uploadEmployeeDocument(employeeId: string, requirementCode: string, file: File, documentSlot = 1) {
  const { data } = await dataApi.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expirée, reconnectez-vous.')
  const fileName = btoa(unescape(encodeURIComponent(file.name)))
  const response = await fetch(`${url}/api/v1/documents/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-employee-id': employeeId,
      'x-requirement-code': requirementCode,
      'x-document-slot': String(documentSlot),
      'x-file-name': fileName,
      'x-file-mime': file.type,
      'content-type': 'application/octet-stream',
    },
    body: file,
  })
  const result = await response.json() as { message?: string; document?: unknown }
  if (!response.ok) throw new Error(result.message ?? 'Le dépôt du document a échoué.')
  return result.document
}

export async function openEmployeeDocument(documentId: string) {
  const blobUrl = await getEmployeeDocumentBlobUrl(documentId)
  window.open(blobUrl, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}

export function getEmployeeDocumentUrl(documentId: string) {
  return `${url}/api/v1/documents/${documentId}`
}

export function getEmployeeDocumentThumbnailUrl(documentId: string) {
  return `${url}/api/v1/documents/${documentId}/thumbnail`
}

export async function getEmployeeDocumentBlobUrl(documentId: string) {
  return getPrivateBlobUrl(getEmployeeDocumentUrl(documentId), 'Le document est indisponible.')
}

export async function getEmployeeDocumentThumbnailBlobUrl(documentId: string) {
  return getPrivateBlobUrl(getEmployeeDocumentThumbnailUrl(documentId), 'La miniature est indisponible.')
}

export async function openEmployeeDocumentsBundle(employeeId: string) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Autorisez les fenêtres contextuelles pour ouvrir le dossier PDF.')
  popup.opener = null
  try {
    const { data } = await dataApi.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Session expirée, reconnectez-vous.')
    const response = await fetch(`${url}/api/v1/employees/${employeeId}/documents/bundle`, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) {
      const result = await response.json() as { message?: string }
      throw new Error(result.message ?? 'Le dossier PDF est indisponible.')
    }
    const blobUrl = URL.createObjectURL(await response.blob())
    popup.location.href = blobUrl
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch (error) {
    popup.close()
    throw error
  }
}

async function getPrivateBlobUrl(resourceUrl: string, fallbackMessage: string) {
  const { data } = await dataApi.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expirée, reconnectez-vous.')
  const response = await fetch(resourceUrl, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const result = await response.json() as { message?: string }
    throw new Error(result.message ?? fallbackMessage)
  }
  return URL.createObjectURL(await response.blob())
}

export async function reviewEmployeeDocument(documentId: string, status: 'valide' | 'refuse', reason?: string) {
  const { data, error } = await dataApi.rpc('review_employee_document', {
    p_document_id: documentId,
    p_status: status,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function archiveEmployeeDocument(documentId: string) {
  const { data, error } = await dataApi.rpc('archive_employee_document', { p_document_id: documentId })
  if (error) throw new Error(error.message)
  return data
}

export async function deleteEmployeeDocument(documentId: string) {
  const { data } = await dataApi.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expirée, reconnectez-vous.')
  const response = await fetch(getEmployeeDocumentUrl(documentId), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const result = await response.json() as { message?: string }
  if (!response.ok) throw new Error(result.message ?? 'La suppression du document a échoué.')
  return result
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row']

/** Copie d'un objet sans certaines clés (ex. colonnes gérées par la base). */
export function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...obj }
  for (const k of keys) delete copy[k]
  return copy
}

/** Lève une erreur lisible si la requête échoue. */
export function unwrap<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<R['data']>
}
