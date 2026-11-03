import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { date, fcfa, monthLabel } from '../lib/format'
import { Badge, Button, ErrorNote, Spinner } from '../components/ui'

/** Rapport de clôture : totaux, contrôles, historique d'audit et empreinte du snapshot. Imprimable (PDF via l'impression). */

type Report = {
  entry: { id: string; period_start: string; period_end: string; status: string; closed_at: string | null }
  totals: { slips: number; gross_pay: number; net_pay: number; employer_charges: number; payroll_cost: number }
  checks: { niveau: string; code: string; salarie?: string; message: string }[]
  history: { at: string; action: string; result: string; actor: string | null; from: string | null; to: string | null; reason: string | null }[]
  snapshot: { hash: string; algo: string; at: string } | null
  audit_chain_breaks: number | null
}

const ACTION: Record<string, string> = {
  transition: 'Transition',
  transition_refusee: 'Transition refusée',
  derogation_separation: 'Dérogation à la séparation des tâches',
}

export default function PayrollClosingReportPage() {
  const { id } = useParams()
  const report = useQuery({
    queryKey: ['closing-report', id],
    queryFn: async () => unwrap(await dataApi.rpc('payroll_closing_report', { p_payroll_entry_id: id! })) as unknown as Report,
  })
  if (report.isLoading) return <Spinner />
  const r = report.data
  if (!r) return <ErrorNote error={report.error ?? 'Rapport introuvable'} />
  const blocking = r.checks.filter((c) => c.niveau === 'erreur').length
  const warnings = r.checks.filter((c) => c.niveau === 'alerte').length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/paie/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Retour à la paie</Link>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer / enregistrer en PDF</Button>
      </div>

      <h1 className="text-xl font-semibold">Rapport de clôture — {monthLabel(r.entry.period_start)}</h1>
      <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
        Du {date(r.entry.period_start)} au {date(r.entry.period_end)} <Badge value={r.entry.status} />
        {r.entry.closed_at && <span>· clôturée le {date(r.entry.closed_at)}</span>}
      </p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Totaux</h2>
      <table className="mt-2 w-full text-sm tabular-nums">
        <tbody>
          {([['Bulletins', String(r.totals.slips)], ['Brut', fcfa(r.totals.gross_pay)], ['Net à payer', fcfa(r.totals.net_pay)],
            ['Charges patronales', fcfa(r.totals.employer_charges)], ['Coût total employeur', fcfa(r.totals.payroll_cost)]] as const).map(([label, value]) => (
            <tr key={label} className="border-b border-line"><td className="py-1.5">{label}</td><td className="py-1.5 text-right font-medium">{value}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Contrôles de période</h2>
      <p className="mt-1 text-sm">{blocking} erreur(s) bloquante(s), {warnings} alerte(s).</p>
      {r.checks.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {r.checks.map((c, i) => <li key={i} className={c.niveau === 'erreur' ? 'text-signal' : 'text-ink-soft'}><strong>{c.salarie ?? c.code}</strong> · {c.message}</li>)}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Historique</h2>
      {r.history.length === 0 ? <p className="mt-1 text-sm text-ink-muted">Aucun événement enregistré pour ce traitement.</p> : (
        <table className="mt-2 w-full text-xs">
          <thead><tr className="border-b border-line text-left text-ink-muted"><th className="py-1">Date</th><th>Événement</th><th>Statut</th><th>Par</th><th>Motif</th></tr></thead>
          <tbody>
            {r.history.map((h, i) => (
              <tr key={i} className={`border-b border-line/60 align-top ${h.result === 'denied' ? 'text-signal' : ''}`}>
                <td className="py-1 pr-2">{new Date(h.at).toLocaleString('fr-FR')}</td>
                <td className="pr-2">{ACTION[h.action] ?? h.action}</td>
                <td className="pr-2">{h.from ? `${h.from} → ` : ''}{h.to ?? ''}</td>
                <td className="pr-2">{h.actor ?? '—'}</td>
                <td>{h.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Intégrité</h2>
      <dl className="mt-2 space-y-1 text-xs">
        <div><dt className="inline text-ink-muted">Snapshot figé : </dt><dd className="inline">{r.snapshot ? `${new Date(r.snapshot.at).toLocaleString('fr-FR')} (${r.snapshot.algo})` : 'non figé (la période n’est pas clôturée)'}</dd></div>
        {r.snapshot && <div className="break-all"><dt className="inline text-ink-muted">Empreinte : </dt><dd className="inline font-mono">{r.snapshot.hash}</dd></div>}
        <div><dt className="inline text-ink-muted">Journal d'audit : </dt><dd className="inline">{r.audit_chain_breaks === null ? 'vérification réservée aux rôles admin et rh' : r.audit_chain_breaks === 0 ? 'chaîne intacte' : `${r.audit_chain_breaks} rupture(s) détectée(s)`}</dd></div>
      </dl>
    </div>
  )
}
