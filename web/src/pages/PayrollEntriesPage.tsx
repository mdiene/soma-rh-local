import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataApi, unwrap, type ApiClient } from '../lib/api'
import { useAuth } from '../lib/auth'
import { selectable, useCompany, usePaymentModes, usePayrollEntries } from '../lib/queries'
import { currentPeriod, date, monthBounds, monthLabel } from '../lib/format'
import { Badge, Button, Empty, ErrorNote, Modal, PageHeader, SelectField, Spinner, TextField } from '../components/ui'

export default function PayrollEntriesPage() {
  const entries = usePayrollEntries()
  const nav = useNavigate()
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  // avancement du paiement par paie (fiche de paiement des salaires)
  const paid = useQuery({
    queryKey: ['entry_payments'],
    queryFn: async () => unwrap(await (dataApi as unknown as ApiClient).from('v_payroll_entry_payments').select('*')) as unknown as { payroll_entry_id: string; slips: number; paid: number }[],
  })
  const progress = new Map((paid.data ?? []).map((p) => [p.payroll_entry_id, { slips: Number(p.slips), paid: Number(p.paid) }]))

  return (
    <>
      <PageHeader
        title="Traitements de paie"
        description="Un traitement par mois : calcul de tous les bulletins, contrôle, puis validation définitive."
        actions={can('paie', 'rh') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nouveau traitement</Button>}
      />
      <ErrorNote error={entries.error} />
      {entries.isLoading ? <Spinner /> : (entries.data ?? []).length === 0 ? (
        <Empty title="Aucun traitement de paie">Créez le traitement du mois, puis lancez le calcul des bulletins.</Empty>
      ) : (
        <ul className="panel divide-y divide-line">
          {entries.data!.map((e) => (
            <li key={e.id}>
              <button onClick={() => nav(`/paie/${e.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-river-light/40 sm:grid-cols-[12rem_1fr_auto]">
                <span className="text-base font-semibold" style={{ fontStretch: '82%' }}>{monthLabel(e.period_start)}</span>
                <span className="hidden text-sm text-ink-soft sm:block">Du {date(e.period_start)} au {date(e.period_end)} · paiement par {e.payment_mode}{e.notes ? ` · ${e.notes}` : ''}</span>
                <span className="flex items-center gap-2">
                  {e.status === 'Validée' && progress.get(e.id) && (
                    <Badge value={progress.get(e.id)!.paid === progress.get(e.id)!.slips ? 'Payé' : 'À payer'} label={`Payé ${progress.get(e.id)!.paid}/${progress.get(e.id)!.slips}`} />
                  )}
                  <Badge value={e.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewEntryModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function NewEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const company = useCompany()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [period, setPeriod] = useState(currentPeriod())
  const [mode, setMode] = useState('espèces')
  const paymentModes = usePaymentModes()
  const create = useMutation({
    mutationFn: async () => {
      const { start, end } = monthBounds(period)
      return unwrap(await dataApi.from('payroll_entries').insert({ company_id: company.data!.id, period_start: start, period_end: end, posting_date: end, payment_mode: mode }).select().single())
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ['payroll_entries'] }); onClose(); nav(`/paie/${row.id}`) },
  })
  return (
    <Modal open={open} onClose={onClose} title="Nouveau traitement de paie"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>Créer le traitement</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Mois de paie" type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} />
        <SelectField label="Mode de paiement" value={mode} onChange={(e) => setMode(e.target.value)}>
          {selectable(paymentModes.data, (m) => m.code === mode).map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
        </SelectField>
      </div>
      <div className="mt-3"><ErrorNote error={create.error} /></div>
    </Modal>
  )
}
