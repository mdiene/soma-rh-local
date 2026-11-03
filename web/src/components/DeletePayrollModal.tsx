import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { dataApi, unwrap, type Tables } from '../lib/api'
import { monthLabel } from '../lib/format'
import { Button, ErrorNote, Modal } from './ui'

/** Confirmation puis suppression définitive d'un traitement de paie et de ses bulletins. */
export function DeletePayrollModal({ open, entry, onClose, onDeleted }: {
  open: boolean
  entry: Tables<'payroll_entries'>
  onClose: () => void
  onDeleted: (slipsDeleted: number) => void
}) {
  const qc = useQueryClient()
  const [checked, setChecked] = useState(false)
  const month = monthLabel(entry.period_start)
  const del = useMutation({
    mutationFn: async () => Number(unwrap(await dataApi.rpc('delete_payroll_entry', { p_payroll_entry_id: entry.id }))),
    onSuccess: async (n) => {
      setChecked(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['payroll_entries'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['register'] }),
      ])
      onDeleted(n)
    },
  })
  return (
    <Modal
      open={open}
      onClose={() => { setChecked(false); onClose() }}
      title={`Supprimer la paie de ${month}`}
      footer={<>
        <Button variant="ghost" onClick={() => { setChecked(false); onClose() }}>Garder la paie</Button>
        <Button variant="danger" disabled={!checked} loading={del.isPending} onClick={() => del.mutate()}>Supprimer définitivement</Button>
      </>}
    >
      <div className="space-y-3 text-sm">
        <p>
          Le traitement de {month} ({entry.status.toLowerCase()}) et tous ses bulletins seront supprimés.
          Les variables du mois (heures, primes, retenues) sont conservées : vous pourrez recréer le traitement et relancer le calcul.
        </p>
        {entry.status === 'Validée' && (
          <p className="rounded border border-signal/30 bg-signal-light px-3 py-2 text-signal">
            Cette paie est validée : les bulletins ont pu être remis aux salariés et déclarés.
          </p>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-signal" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Je confirme la suppression de la paie de {month}.</span>
        </label>
        <ErrorNote error={del.error} />
      </div>
    </Modal>
  )
}
