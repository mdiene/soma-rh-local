import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Coins, Download } from 'lucide-react'
import { useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, num } from '../lib/format'
import { Button, ErrorNote, Modal, Section, Spinner } from './ui'

/** Simulation des ordres de paiement (I8), rapprochement par mode, billetage des espèces et export au contrat stable. */

type Summary = {
  ordres: number; total_ordres: number; total_nets: number; ecart_arrondi: number; ecart_max: number; ok: boolean
  par_mode: { mode: string; ordres: number; du: number; paye: number; reste: number }[]
  anomalies: { code: string; matricule: string; message: string }[]
}
type Breakdown = { total_especes: number; coupures: Record<string, number>; salaries: { matricule: string; nom: string; montant: number; coupures: Record<string, number> }[] }

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => unwrap(await dataApi.rpc(fn as never, args as never)) as unknown as T
const byValueDesc = (o: Record<string, number>) => Object.entries(o).sort((a, b) => Number(b[0]) - Number(a[0]))

export function PaymentControls({ entryId, period, canExport }: { entryId: string; period: string; canExport: boolean }) {
  const [open, setOpen] = useState(false)
  const summary = useQuery({ queryKey: ['pay_summary', entryId], queryFn: () => rpc<Summary>('payment_summary', { p_payroll_entry_id: entryId }) })
  const cash = useQuery({ queryKey: ['pay_cash', entryId], enabled: open, queryFn: () => rpc<Breakdown>('cash_breakdown', { p_payroll_entry_id: entryId }) })
  const exportRows = useMutation({
    mutationFn: () => rpc<Record<string, string | number>[]>('payment_export', { p_payroll_entry_id: entryId, p_mode: null }),
    onSuccess: (rows) => {
      const cols = ['ordre', 'matricule', 'nom', 'mode', 'banque', 'compte', 'montant', 'devise', 'reference', 'echeance']
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n')
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = `ordres-paiement-${period.slice(0, 7)}.csv`; a.click(); URL.revokeObjectURL(url)
    },
  })
  if (summary.isLoading) return <Spinner />
  const s = summary.data
  if (!s) return <ErrorNote error={summary.error} />
  if (s.ordres === 0) return null
  return (
    <Section title="Simulation des ordres et rapprochement" className="no-print mb-4"
      actions={<div className="flex gap-2">
        <Button size="sm" icon={<Coins className="h-4 w-4" />} onClick={() => setOpen(true)}>Billetage espèces</Button>
        {canExport && <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} loading={exportRows.isPending} onClick={() => exportRows.mutate()}>Export des ordres (CSV)</Button>}
      </div>}>
      <p className={`flex items-center gap-2 text-sm ${s.ok ? 'text-phosphate' : 'text-signal'}`}>
        {s.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {s.ok ? 'Total des ordres conforme au total des nets' : 'Total des ordres différent du total des nets'} : {s.ordres} ordre(s), {fcfa(s.total_ordres)} F
        {' '}contre {fcfa(s.total_nets)} F de nets (écart d’arrondi {num(s.ecart_arrondi, 2)} F, limite {num(s.ecart_max, 1)} F). Chaque ordre est arrondi au franc.
      </p>
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1">Mode</th><th className="text-right">Ordres</th><th className="text-right">Dû</th><th className="text-right">Payé</th><th className="text-right">Reste</th></tr></thead>
        <tbody>{s.par_mode.map((m) => (
          <tr key={m.mode} className="border-b border-line/60"><td className="py-1.5">{m.mode}</td><td className="text-right">{m.ordres}</td><td className="text-right">{fcfa(m.du)}</td><td className="text-right">{fcfa(m.paye)}</td><td className="text-right">{fcfa(m.reste)}</td></tr>
        ))}</tbody>
      </table>
      {s.anomalies.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-signal">
          {s.anomalies.map((a, i) => <li key={i}><strong>{a.matricule}</strong> · {a.message}</li>)}
        </ul>
      )}
      <ErrorNote error={exportRows.error} />

      <Modal open={open} onClose={() => setOpen(false)} title="Billetage des paiements en espèces" wide
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>}>
        {cash.isLoading ? <Spinner /> : !cash.data ? <ErrorNote error={cash.error} /> : (
          <>
            <p className="mb-2 text-sm">Total à sortir en espèces : <strong className="tabular-nums">{fcfa(cash.data.total_especes)} F</strong></p>
            <table className="mb-4 text-sm tabular-nums">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="pr-6 py-1">Coupure</th><th className="pr-6 text-right">Nombre</th><th className="text-right">Montant</th></tr></thead>
              <tbody>{byValueDesc(cash.data.coupures).map(([d, n]) => (
                <tr key={d} className="border-b border-line/60"><td className="pr-6 py-1">{fcfa(Number(d))}</td><td className="pr-6 text-right">{n}</td><td className="text-right">{fcfa(Number(d) * n)}</td></tr>
              ))}</tbody>
            </table>
            <details><summary className="cursor-pointer text-sm text-ink-soft">Détail par salarié (pour préparer les enveloppes)</summary>
              <table className="mt-2 w-full text-xs tabular-nums">
                <tbody>{cash.data.salaries.map((x) => (
                  <tr key={x.matricule} className="border-b border-line/60 align-top">
                    <td className="py-1 pr-2">{x.matricule}</td><td className="pr-2">{x.nom}</td><td className="pr-2 text-right">{fcfa(x.montant)}</td>
                    <td className="text-ink-soft">{byValueDesc(x.coupures).map(([d, n]) => `${n} × ${fcfa(Number(d))}`).join(' · ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </details>
          </>
        )}
      </Modal>
    </Section>
  )
}
