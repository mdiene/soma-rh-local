import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { dataApi, transitionPayroll, unwrap } from '../lib/api'
import { fcfa, monthLabel } from '../lib/format'
import { Button, ErrorNote, Modal, SelectField, TextField } from './ui'
import { useEmployees } from '../lib/queries'

type CmpRow = { employee_number: string; name: string; prev_gross: number | null; gross: number | null; prev_net: number | null; net: number | null }
type Cmp = { previous_period: string; rows: CmpRow[] } | null

/** Comparaison du traitement avec le dernier mois validé (écarts de brut et de net par salarié). */
export function ComparisonPanel({ entryId, enabled }: { entryId: string; enabled: boolean }) {
  const q = useQuery({
    queryKey: ['payroll_cmp', entryId], enabled,
    queryFn: async () => unwrap(await dataApi.rpc('payroll_entry_comparison' as never, { p_payroll_entry_id: entryId } as never)) as unknown as Cmp,
  })
  if (!q.data) return <ErrorNote error={q.error} />
  const rows = q.data.rows
  const n = (v: number | null) => Number(v ?? 0)
  const totNet = rows.reduce((s, r) => s + n(r.net), 0)
  const totPrev = rows.reduce((s, r) => s + n(r.prev_net), 0)
  const changed = rows.filter((r) => Math.round(n(r.net)) !== Math.round(n(r.prev_net)))
  return (
    <details className="group mb-4 rounded border border-line bg-white text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        <strong>Comparaison avec {monthLabel(q.data.previous_period)}</strong>
        <span className="text-ink-soft tabular-nums">net {fcfa(totPrev)} → {fcfa(totNet)} F ({totNet - totPrev >= 0 ? '+' : ''}{fcfa(totNet - totPrev)} F) · {changed.length} salarié(s) différent(s)</span>
      </summary>
      <div className="max-h-80 overflow-auto border-t border-line">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-left text-ink-soft"><th className="px-3 py-2">Salarié</th><th className="px-3 py-2 text-right">Net précédent</th><th className="px-3 py-2 text-right">Net actuel</th><th className="px-3 py-2 text-right">Écart</th></tr></thead>
          <tbody>{changed.map((r) => {
            const d = n(r.net) - n(r.prev_net)
            return (
              <tr key={r.employee_number} className="border-t border-line/60">
                <td className="px-3 py-1">{r.employee_number} · {r.name}{r.prev_net === null ? ' (nouveau)' : r.net === null ? ' (absent ce mois)' : ''}</td>
                <td className="px-3 py-1 text-right">{r.prev_net === null ? '—' : fcfa(r.prev_net)}</td>
                <td className="px-3 py-1 text-right">{r.net === null ? '—' : fcfa(r.net)}</td>
                <td className={`px-3 py-1 text-right font-medium ${d < 0 ? 'text-signal' : ''}`}>{d >= 0 ? '+' : ''}{fcfa(d)}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {changed.length === 0 && <p className="px-4 py-3 text-ink-muted">Aucun écart de net.</p>}
      </div>
    </details>
  )
}

/** Réouverture motivée d'une paie validée (administrateur). */

/** Lot de paie : calcule seulement un type de contrat ou des salariés choisis (recalculable sans doublon). */
export function BatchModal({ entryId, open, onClose, onDone }: { entryId: string; open: boolean; onClose: () => void; onDone: (r: unknown) => void }) {
  const employees = useEmployees()
  const [type, setType] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const list = (employees.data ?? []).filter((e) => e.status === 'Active' && (!type || e.employment_type === type))
  const m = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('run_payroll_batch' as never, {
      p_payroll_entry_id: entryId, p_employment_type: type || null, p_employee_ids: picked.length ? picked : null,
    } as never)),
    onSuccess: (r) => { setPicked([]); onDone(r) },
  })
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const target = picked.length ? `${picked.length} salarié(s) choisi(s)` : type ? `tous les ${type} (${list.length})` : `tous les salariés (${list.length})`
  return (
    <Modal open={open} onClose={onClose} title="Calculer un lot de bulletins"
      footer={<><Button variant="ghost" onClick={onClose}>Revenir</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Calculer : {target}</Button></>}>
      <p className="mb-3 text-sm">Seuls les bulletins du lot sont (re)calculés ; les autres restent inchangés. Relancer le même lot ne crée aucun doublon.</p>
      <SelectField label="Type de contrat" value={type} onChange={(e) => { setType(e.target.value); setPicked([]) }}>
        <option value="">Tous</option><option value="CDI">CDI</option><option value="CDD">CDD</option>
      </SelectField>
      <p className="mt-3 text-xs text-ink-muted">Ou cochez des salariés précis (ignore le type de contrat) :</p>
      <div className="mt-1 max-h-56 overflow-auto rounded border border-line p-2 text-sm">
        {list.map((e) => (
          <label key={e.id} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
            {e.employee_number} {e.last_name} {e.first_name}
          </label>
        ))}
      </div>
      <div className="mt-3"><ErrorNote error={m.error} /></div>
    </Modal>
  )
}

/** Remet une paie à l'état « Calculée » (ou la rouvre si elle est clôturée), avec motif, journalisé. */
export function RevertModal({ entryId, status, open, onClose, onDone }: { entryId: string; status: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [cancelPayments, setCancelPayments] = useState(false)
  const closed = status === 'Clôturée'
  const m = useMutation({
    mutationFn: async () => closed
      ? transitionPayroll(entryId, 'Réouverte', reason)
      : unwrap(await dataApi.rpc('revert_payroll_entry' as never, { p_payroll_entry_id: entryId, p_reason: reason, p_cancel_payments: cancelPayments } as never)),
    onSuccess: () => { setReason(''); setCancelPayments(false); onDone() },
  })
  // la base refuse tant que l'on n'a pas confirmé l'annulation des paiements déjà enregistrés
  const needsPaymentConfirm = m.error instanceof Error && /paiement\(s\) déjà enregistré/.test(m.error.message)
  return (
    <Modal open={open} onClose={onClose} title={closed ? 'Rouvrir la paie clôturée' : 'Remettre la paie en état « Calculée »'}
      footer={<><Button variant="ghost" onClick={onClose}>Revenir</Button><Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 5 || (needsPaymentConfirm && !cancelPayments)} onClick={() => m.mutate()}>{closed ? 'Rouvrir' : 'Remettre en Calculée'}</Button></>}>
      <p className="mb-3 text-sm">
        {closed
          ? 'La paie passe à « Réouverte » : elle pourra être recalculée ou supprimée.'
          : 'Les bulletins repassent en brouillon et deviennent invisibles pour les salariés. Vous pourrez ensuite recalculer ou supprimer cette paie.'}
        {' '}L’opération et le motif sont enregistrés dans le journal.
      </p>
      <TextField label="Motif (obligatoire, 5 caractères minimum)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {needsPaymentConfirm && (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={cancelPayments} onChange={(e) => setCancelPayments(e.target.checked)} />
          <span>Annuler aussi les paiements déjà enregistrés sur cette paie (ils seront à saisir à nouveau).</span>
        </label>
      )}
      <div className="mt-3"><ErrorNote error={m.error} /></div>
    </Modal>
  )
}

type Line = { code?: string; label?: string; section?: string; gain?: number; deduction?: number; employer?: number }

/** Fichier de synthèse du journal de paie : totaux par rubrique (CSV, séparateur « ; »). */
export async function downloadPayrollSummary(entryId: string, period: string) {
  const rows = unwrap(await dataApi.from('salary_slips').select('calculation').eq('payroll_entry_id', entryId).neq('status', 'Annulé')) as unknown as { calculation: { lines?: Line[] } | null }[]
  const agg = new Map<string, { section: string; code: string; label: string; n: number; gain: number; ded: number; emp: number }>()
  for (const r of rows) {
    for (const l of r.calculation?.lines ?? []) {
      const k = `${l.section}|${l.code}`
      const a = agg.get(k) ?? { section: l.section ?? '', code: l.code ?? '', label: l.label ?? '', n: 0, gain: 0, ded: 0, emp: 0 }
      a.n += 1; a.gain += Number(l.gain ?? 0); a.ded += Number(l.deduction ?? 0); a.emp += Number(l.employer ?? 0)
      agg.set(k, a)
    }
  }
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['Section', 'Code', 'Rubrique', 'Bulletins', 'Gains', 'Retenues', 'Part patronale']
  const body = [...agg.values()].map((a) => [a.section, a.code, a.label, a.n, a.gain, a.ded, a.emp].map(esc).join(';'))
  const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `synthese-journal-paie-${period.slice(0, 7)}.csv`; a.click()
  URL.revokeObjectURL(url)
}
