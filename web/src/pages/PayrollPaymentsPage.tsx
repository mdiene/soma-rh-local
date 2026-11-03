import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import { ArrowLeft, CheckCircle2, Download, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCompany } from '../lib/queries'
import { date, fcfa, monthLabel } from '../lib/format'
import { Badge, Button, ErrorNote, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { PrintPortal, printPortal } from '../components/PrintPortal'

const db = dataApi as unknown as ApiClient
type Slip = { id: string; employee_id: string; employee_number: string; employee_name: string; payment_mode: string | null; net_pay: number; employee: { phone_personal: string | null; phone_work: string | null } | null }
type Pay = { slip_id: string; payment_mode: string; status: 'À payer' | 'Payé'; paid_at: string | null; reference: string | null }

const today = () => new Date().toISOString().slice(0, 10)

/** Suivi du paiement des salaires validés : par mode (espèces, chèque, mobile money), états à imprimer. */
export default function PayrollPaymentsPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const qc = useQueryClient()
  const company = useCompany()
  const [mode, setMode] = useState<string>('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ paid_at: today(), reference: '' })
  const [printMode, setPrintMode] = useState<string | null>(null)

  const entry = useQuery({
    queryKey: ['payroll_entry', id],
    queryFn: async () => unwrap(await dataApi.from('payroll_entries').select('*').eq('id', id!).single()),
  })
  const slips = useQuery({
    queryKey: ['pay_slips', id],
    queryFn: async () => unwrap(await dataApi.from('salary_slips')
      .select('id, employee_id, employee_number, employee_name, payment_mode, net_pay, employee:employees(phone_personal, phone_work)')
      .eq('payroll_entry_id', id!).eq('status', 'Validé').order('employee_number')) as unknown as Slip[],
  })
  const pays = useQuery({
    queryKey: ['pay_status', id],
    enabled: !!slips.data,
    queryFn: async () => unwrap(await db.from('salary_payments').select('*').in('slip_id', (slips.data ?? []).map((s) => s.id))) as Pay[],
  })
  const payOf = useMemo(() => new Map((pays.data ?? []).map((p) => [p.slip_id, p])), [pays.data])
  const rows = (slips.data ?? []).map((s) => ({ ...s, mode: s.payment_mode || 'espèces', pay: payOf.get(s.id) }))
  const modes = [...new Set(rows.map((r) => r.mode))]
  const shown = rows.filter((r) => !mode || r.mode === mode)
  const total = (l: typeof rows) => l.reduce((s, r) => s + Number(r.net_pay), 0)

  const mark = useMutation({
    mutationFn: async (v: { ids: string[]; paid: boolean }) => {
      const recs = v.ids.map((sid) => {
        const r = rows.find((x) => x.id === sid)!
        return v.paid
          ? { slip_id: sid, payment_mode: r.mode, status: 'Payé', paid_at: f.paid_at, reference: f.reference.trim() || null }
          : { slip_id: sid, payment_mode: r.mode, status: 'À payer', paid_at: null, reference: null }
      })
      return unwrap(await db.from('salary_payments').upsert(recs, { onConflict: 'slip_id' }))
    },
    onSuccess: () => { setOpen(false); setSel(new Set()); qc.invalidateQueries({ queryKey: ['pay_status'] }) },
  })

  const exportCsv = (m: string) => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = rows.filter((r) => r.mode === m).map((r) => [r.employee_number, r.employee_name,
      r.employee?.phone_personal || r.employee?.phone_work || '', Math.round(Number(r.net_pay)), r.pay?.status ?? 'À payer', r.pay?.paid_at ?? '', r.pay?.reference ?? ''].map(esc).join(';'))
    const head = ['Matricule', 'Salarié', 'Téléphone', 'Net à payer (F)', 'État', 'Payé le', 'Référence'].map(esc).join(';')
    const blob = new Blob(['\ufeff' + [head, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `paiements-${m.replace(/\s+/g, '-')}-${e!.period_start.slice(0, 7)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (entry.isLoading || slips.isLoading) return <Spinner />
  const e = entry.data
  if (!e) return <ErrorNote error={entry.error ?? 'Traitement introuvable'} />
  const paid = rows.filter((r) => r.pay?.status === 'Payé')
  const canPay = can('paie')
  const toggle = (sid: string) => setSel((s) => { const n = new Set(s); if (n.has(sid)) n.delete(sid); else n.add(sid); return n })
  const pending = shown.filter((r) => r.pay?.status !== 'Payé')

  return (
    <>
      <Link to={`/paie/${id}`} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Paie de {monthLabel(e.period_start)}</Link>
      <PageHeader title={`Paiement des salaires — ${monthLabel(e.period_start)}`}
        description="Suivi du paiement par le comptable : espèces, chèque ou mobile money. Seuls les bulletins validés apparaissent."
        actions={<>
          {modes.map((m) => <Button key={m} icon={<Printer className="h-4 w-4" />} onClick={() => { setPrintMode(m); setTimeout(printPortal, 50) }}>État {m}</Button>)}
          {modes.map((m) => <Button key={`c${m}`} variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv(m)}>CSV {m}</Button>)}
        </>} />
      <ErrorNote error={slips.error || pays.error || mark.error} />
      {e.status !== 'Validée' && <p className="panel mb-4 px-4 py-3 text-sm text-ink-soft">Ce traitement n’est pas encore validé : les bulletins ne sont payables qu’après validation par l’administrateur.</p>}

      <div className="panel mb-4 grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
        <div><p className="text-xs text-ink-muted">Net à payer</p><p className="text-lg font-semibold tabular-nums">{fcfa(total(rows))} F</p></div>
        <div><p className="text-xs text-ink-muted">Payé</p><p className="text-lg font-semibold tabular-nums">{fcfa(total(paid))} F · {paid.length}/{rows.length}</p></div>
        <div><p className="text-xs text-ink-muted">Reste à payer</p><p className="text-lg font-semibold tabular-nums">{fcfa(total(rows) - total(paid))} F</p></div>
        <div>
          <p className="text-xs text-ink-muted">Par mode</p>
          <p className="text-sm tabular-nums">{modes.map((m) => `${m} : ${fcfa(total(rows.filter((r) => r.mode === m)))} F`).join(' · ')}</p>
        </div>
      </div>

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mode === '' ? 'primary' : 'ghost'} onClick={() => setMode('')}>Tous</Button>
        {modes.map((m) => <Button key={m} size="sm" variant={mode === m ? 'primary' : 'ghost'} onClick={() => setMode(m)}>{m}</Button>)}
        {canPay && (
          <>
            <Button size="sm" className="ml-auto" disabled={pending.length === 0} onClick={() => setSel(new Set(pending.map((r) => r.id)))}>Sélectionner les {pending.length} à payer</Button>
            <Button size="sm" variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} disabled={sel.size === 0} onClick={() => setOpen(true)}>Marquer payé ({sel.size})</Button>
          </>
        )}
      </div>

      <div className="panel overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="table-head">
            {canPay && <th className="w-8 px-3 py-2" />}<th className="px-3 py-2">Matricule</th><th className="px-3 py-2">Salarié</th><th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2 text-right">Net à payer</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Payé le</th><th className="px-3 py-2">Référence</th>
          </tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id} className="border-b border-line/70">
              {canPay && <td className="px-3 py-1.5"><input type="checkbox" className="h-4 w-4 accent-river" aria-label={`Sélectionner ${r.employee_name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>}
              <td className="px-3 py-1.5">{r.employee_number}</td><td className="px-3 py-1.5 font-medium">{r.employee_name}</td><td className="px-3 py-1.5">{r.mode}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fcfa(r.net_pay)}</td>
              <td className="px-3 py-1.5"><Badge value={r.pay?.status ?? 'À payer'} /></td>
              <td className="px-3 py-1.5">{r.pay?.paid_at ? date(r.pay.paid_at) : ''}</td>
              <td className="px-3 py-1.5">{r.pay?.reference ?? ''}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={canPay ? 4 : 3} className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{fcfa(total(shown))}</td><td colSpan={3} /></tr></tfoot>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Marquer ${sel.size} salaire(s) payé(s)`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="primary" loading={mark.isPending} disabled={!f.paid_at} onClick={() => mark.mutate({ ids: [...sel], paid: true })}>Confirmer</Button></>}>
        <TextField label="Date de paiement" type="date" value={f.paid_at} onChange={(ev) => setF({ ...f, paid_at: ev.target.value })} />
        <TextField className="mt-3" label="Référence commune (n° de chèque, lot Wave / Orange Money…)" value={f.reference} onChange={(ev) => setF({ ...f, reference: ev.target.value })} hint="Facultatif. Une référence par salarié se saisit en payant un salarié à la fois." />
        {canPay && sel.size === 1 && paid.some((p) => sel.has(p.id)) && (
          <Button className="mt-3" variant="ghost" onClick={() => mark.mutate({ ids: [...sel], paid: false })}>Remettre « à payer »</Button>
        )}
      </Modal>

      <PrintPortal>
        {printMode && (
          <div className="sheet mx-auto max-w-[190mm] p-4 text-[11px]" style={{ fontFamily: 'Archivo, sans-serif' }}>
            <header className="mb-3 border-b-2 border-[#1D2A33] pb-2">
              <p className="text-base font-bold">{company.data?.name ?? ''}</p>
              <p className="text-lg font-bold">ÉTAT DE PAIEMENT DES SALAIRES — {printMode.toUpperCase()}</p>
              <p>{monthLabel(e.period_start)} · édité le {date(today())}</p>
            </header>
            <table className="w-full border-collapse">
              <thead><tr className="bg-[#F6F7F5] text-left">
                <th className="border border-[#1D2A33] px-2 py-1">N°</th><th className="border border-[#1D2A33] px-2 py-1">Matricule</th><th className="border border-[#1D2A33] px-2 py-1">Nom et prénoms</th>
                {/mobile|wave|orange/i.test(printMode) && <th className="border border-[#1D2A33] px-2 py-1">Téléphone</th>}
                <th className="border border-[#1D2A33] px-2 py-1 text-right">Net à payer</th>
                <th className="border border-[#1D2A33] px-2 py-1">{/chèque|cheque/i.test(printMode) ? 'N° de chèque' : /mobile|wave|orange/i.test(printMode) ? 'Référence' : 'Émargement'}</th>
              </tr></thead>
              <tbody>{rows.filter((r) => r.mode === printMode).map((r, i) => (
                <tr key={r.id} className="h-8">
                  <td className="border border-[#1D2A33] px-2">{i + 1}</td><td className="border border-[#1D2A33] px-2">{r.employee_number}</td><td className="border border-[#1D2A33] px-2">{r.employee_name}</td>
                  {/mobile|wave|orange/i.test(printMode) && <td className="border border-[#1D2A33] px-2">{r.employee?.phone_personal || r.employee?.phone_work || ''}</td>}
                  <td className="border border-[#1D2A33] px-2 text-right tabular-nums">{fcfa(r.net_pay)}</td>
                  <td className="border border-[#1D2A33] px-2">{r.pay?.reference ?? ''}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="font-bold"><td colSpan={/mobile|wave|orange/i.test(printMode) ? 4 : 3} className="border border-[#1D2A33] px-2 py-1">Total</td><td className="border border-[#1D2A33] px-2 py-1 text-right tabular-nums">{fcfa(total(rows.filter((r) => r.mode === printMode)))}</td><td className="border border-[#1D2A33]" /></tr></tfoot>
            </table>
            <div className="mt-10 flex justify-between">
              <div className="w-64 border-t border-[#1D2A33] pt-1 text-center">Le comptable</div>
              <div className="w-64 border-t border-[#1D2A33] pt-1 text-center">Visa de la Direction</div>
            </div>
          </div>
        )}
      </PrintPortal>
    </>
  )
}
