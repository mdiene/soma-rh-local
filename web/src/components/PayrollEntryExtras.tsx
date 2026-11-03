import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, monthLabel } from '../lib/format'
import { Button, ErrorNote, Modal, TextField } from './ui'

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
export function ReopenModal({ entryId, open, onClose, onDone }: { entryId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const m = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('reopen_payroll_entry' as never, { p_payroll_entry_id: entryId, p_reason: reason } as never)),
    onSuccess: () => { setReason(''); onDone() },
  })
  return (
    <Modal open={open} onClose={onClose} title="Rouvrir la paie validée"
      footer={<><Button variant="ghost" onClick={onClose}>Revenir</Button><Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 5} onClick={() => m.mutate()}>Rouvrir</Button></>}>
      <p className="mb-3 text-sm">Les bulletins repassent en brouillon et deviennent invisibles pour les salariés jusqu’à la prochaine validation. L’opération et le motif sont enregistrés dans le journal.</p>
      <TextField label="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
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
