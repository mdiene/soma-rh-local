import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageCircle, Pencil, Printer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dataApi, unwrap, type Tables } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCompany, useLeaveTypes } from '../lib/queries'
import { date, num } from '../lib/format'
import { Badge, Button, ErrorNote, Modal, SelectField, TextField } from './ui'
import { PrintPortal, printPortal } from './PrintPortal'
import { whatsappLink } from '../lib/whatsapp'

export type LeaveApp = Tables<'leave_applications'> & {
  employee: { employee_number: string; first_name: string; last_name: string; designation: { name: string } | null } | null
  type: { name: string } | null
}

const addDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Fenêtre de consultation / modification d'une demande de congé, avec bon imprimable à signer. */
export function LeaveDetailModal({ app, onClose }: { app: LeaveApp | null; onClose: () => void }) {
  const { can, session } = useAuth()
  const qc = useQueryClient()
  const types = useLeaveTypes()
  const company = useCompany()
  const me = useQuery({ queryKey: ['my_employee_id'], queryFn: async () => unwrap(await dataApi.rpc('my_employee_id')) })
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ leave_type: '', from_date: '', to_date: '', half_day: false, reason: '' })

  useEffect(() => {
    if (!app) return
    setEditing(false)
    setF({ leave_type: app.leave_type, from_date: app.from_date, to_date: app.to_date, half_day: app.half_day, reason: app.reason ?? '' })
  }, [app])

  const balance = useQuery({
    queryKey: ['leave_balance_of', app?.employee_id, app?.leave_type],
    enabled: !!app,
    queryFn: async () => {
      const { data } = await dataApi.from('v_leave_balances').select('*').eq('employee_number', app!.employee!.employee_number)
      return data ?? []
    },
  })

  const phone = useQuery({
    queryKey: ['employee_phone', app?.employee_id],
    enabled: !!app && can('rh'),
    queryFn: async () => {
      const { data } = await dataApi.from('employees').select('phone_personal, phone_work').eq('id', app!.employee_id).maybeSingle()
      return data?.phone_personal || data?.phone_work || null
    },
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['leave_applications'] })
    qc.invalidateQueries({ queryKey: ['leave_balances'] })
  }
  const save = useMutation({
    mutationFn: async () => unwrap(await dataApi.from('leave_applications').update({
      leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, half_day: f.half_day, reason: f.reason || null,
    }).eq('id', app!.id).select()),
    onSuccess: () => { refresh(); setEditing(false); onClose() },
  })
  const decide = useMutation({
    mutationFn: async (status: 'Approuvée' | 'Rejetée') =>
      unwrap(await dataApi.from('leave_applications').update({ status, approver_id: session!.user.id, approved_at: new Date().toISOString() }).eq('id', app!.id).select()),
    onSuccess: () => { refresh(); onClose() },
  })

  if (!app) return null
  const isHr = can('rh')
  const canEdit = isHr || (app.employee_id === me.data && app.status === 'Ouverte')
  const typeName = app.type?.name ?? app.leave_type
  const bal = (balance.data ?? []).find((b) => b.leave_type_name === typeName)
  const invalid = !f.from_date || !f.to_date || f.to_date < f.from_date
  const emp = app.employee
  const approved = app.status === 'Approuvée'

  return (
    <>
      <Modal open onClose={onClose} title="Demande de congé"
        footer={editing ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>Annuler les modifications</Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} loading={save.isPending} disabled={invalid} onClick={() => save.mutate()}>Enregistrer</Button>
          </>
        ) : (
          <>
            {isHr && app.status === 'Ouverte' && (
              <>
                <Button icon={<Check className="h-4 w-4" />} loading={decide.isPending} onClick={() => decide.mutate('Approuvée')}>Approuver</Button>
                <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => decide.mutate('Rejetée')}>Rejeter</Button>
              </>
            )}
            {isHr && app.status !== 'Ouverte' && app.status !== 'Annulée' && (() => {
              const txt = app.status === 'Approuvée'
                ? `Bonjour ${emp?.first_name ?? ''}, votre congé du ${date(app.from_date)} au ${date(app.to_date)} est approuvé.`
                : `Bonjour ${emp?.first_name ?? ''}, votre demande de congé du ${date(app.from_date)} au ${date(app.to_date)} n'a pas été retenue. Contactez les RH pour plus de détails.`
              const href = whatsappLink(phone.data, txt)
              return href
                ? <a className="inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink" href={href} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Prévenir par WhatsApp</a>
                : <Button variant="ghost" icon={<MessageCircle className="h-4 w-4" />} disabled title="Aucun numéro valide sur la fiche du salarié">Prévenir par WhatsApp</Button>
            })()}
            {canEdit && <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
            {app.status !== 'Rejetée' && app.status !== 'Annulée' && (
              <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={printPortal}>
                Imprimer le bon de congé
              </Button>
            )}
          </>
        )}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : '—'}</p>
            <p className="text-xs text-ink-muted">{emp?.employee_number} · {emp?.designation?.name ?? ''}</p>
          </div>
          <Badge value={app.status} />
        </div>

        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Type de congé" className="sm:col-span-2" value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
              {(types.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </SelectField>
            <TextField label="Du" type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} />
            <TextField label="Au (inclus)" type="date" value={f.to_date} min={f.from_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.checked })} /> Demi-journée
            </label>
            <TextField label="Motif" className="sm:col-span-2" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            {app.status !== 'Ouverte' && (
              <p className="rounded border border-phosphate/60 bg-phosphate-light px-3 py-2 text-xs sm:col-span-2">
                Cette demande est déjà {app.status.toLowerCase()} : vérifiez ensuite la grille des présences du mois concerné.
              </p>
            )}
            {f.to_date < f.from_date && f.to_date && <p className="text-xs text-signal sm:col-span-2">La date de fin précède la date de début.</p>}
          </div>
        ) : (
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-ink-soft">Type</dt><dd>{typeName}</dd>
            <dt className="text-ink-soft">Période</dt><dd>du {date(app.from_date)} au {date(app.to_date)}{app.half_day && ' (demi-journée)'}</dd>
            <dt className="text-ink-soft">Durée</dt><dd className="tabular-nums">{num(app.total_days ?? 0, 1)} jour(s)</dd>
            <dt className="text-ink-soft">Reprise</dt><dd>{date(addDay(app.to_date))}</dd>
            <dt className="text-ink-soft">Motif</dt><dd>{app.reason || '—'}</dd>
            {bal && (<><dt className="text-ink-soft">Solde {typeName}</dt><dd className="tabular-nums">{num(bal.balance, 1)} jour(s) (acquis {num(bal.allocated, 1)}, pris {num(bal.taken, 1)})</dd></>)}
            {app.approved_at && (<><dt className="text-ink-soft">Décision</dt><dd>{app.status} le {date(app.approved_at.slice(0, 10))}</dd></>)}
          </dl>
        )}
        <div className="mt-3"><ErrorNote error={save.error || decide.error} /></div>
      </Modal>

      {/* Bon remis à l'employé : seul contenu imprimé */}
      <PrintPortal>
        <div className="sheet mx-auto max-w-[180mm] p-6" style={{ fontFamily: 'Archivo, sans-serif' }}>
          <header className="flex items-start justify-between border-b-2 border-[#1D2A33] pb-3">
            <div>
              <p className="text-base font-bold">{company.data?.name ?? ''}</p>
              <p className="text-[11px]">{company.data?.address ?? ''}</p>
              <p className="text-[11px]">{company.data?.ninea ? `NINEA ${company.data.ninea}` : ''}{company.data?.rccm ? ` · RCCM ${company.data.rccm}` : ''}</p>
            </div>
            <div className="text-right text-[11px]">
              <p>Édité le {date(new Date().toISOString().slice(0, 10))}</p>
              <p>Réf. {app.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </header>
          <h1 className="my-8 text-center text-2xl font-bold tracking-wide">BON DE CONGÉ</h1>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {([
                ['Matricule', emp?.employee_number ?? ''],
                ['Nom et prénom', emp ? `${emp.first_name} ${emp.last_name}` : ''],
                ['Emploi', emp?.designation?.name ?? ''],
                ['Nature du congé', typeName],
                ['Du', `${date(app.from_date)}${app.half_day ? ' (demi-journée)' : ''}`],
                ['Au (inclus)', date(app.to_date)],
                ['Nombre de jours', `${num(app.total_days ?? 0, 1)}`],
                ['Date de reprise', date(addDay(app.to_date))],
                ['Motif', app.reason ?? ''],
                ...(bal ? [['Solde après ce congé', `${num(Number(bal.balance) - (approved ? 0 : Number(app.total_days ?? 0)), 1)} jour(s)`]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <tr key={k}>
                  <th className="w-48 border border-[#1D2A33] bg-[#F6F7F5] px-3 py-2 text-left font-semibold">{k}</th>
                  <td className="border border-[#1D2A33] px-3 py-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-16 grid grid-cols-2 gap-10 text-sm">
            {['Le responsable', 'L’employé'].map((who) => (
              <div key={who}>
                <p className="font-semibold">{who}</p>
                <p className="text-[11px]">Nom, date et signature</p>
                <div className="mt-2 h-28 border border-[#1D2A33]" />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[10px]">Bon établi en deux exemplaires : un pour l’employé, un pour le dossier du personnel.</p>
        </div>
      </PrintPortal>
    </>
  )
}
