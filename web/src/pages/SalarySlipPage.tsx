import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { useCompany } from '../lib/queries'
import { monthLabel } from '../lib/format'
import { SalarySlipDocument } from '../components/SalarySlipDocument'
import { SlipExplain } from '../components/SlipExplain'
import { useAuth } from '../lib/auth'
import { Button, ErrorNote, Spinner } from '../components/ui'

export default function SalarySlipPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const company = useCompany()
  const q = useQuery({
    queryKey: ['slip', id],
    queryFn: async () => {
      const [slip, details, ytd] = await Promise.all([
        dataApi.from('salary_slips').select('*').eq('id', id!).single(),
        dataApi.from('salary_slip_details').select('*').eq('salary_slip_id', id!),
        dataApi.from('v_salary_slip_ytd').select('*').eq('salary_slip_id', id!).maybeSingle(),
      ])
      return { slip: unwrap(slip), details: unwrap(details), ytd: unwrap(ytd) }
    },
  })
  const siblings = useQuery({
    queryKey: ['slip-siblings', q.data?.slip.payroll_entry_id],
    enabled: !!q.data?.slip.payroll_entry_id,
    queryFn: async () => unwrap(await dataApi.from('salary_slips').select('id, employee_number').eq('payroll_entry_id', q.data!.slip.payroll_entry_id!).neq('status', 'Annulé').order('employee_number')),
  })

  if (q.isLoading) return <Spinner />
  if (!q.data) return <ErrorNote error={q.error ?? 'Bulletin introuvable'} />
  const { slip, details, ytd } = q.data
  const list = siblings.data ?? []
  const idx = list.findIndex((s) => s.id === id)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        {slip.payroll_entry_id
          ? <Link to={`/paie/${slip.payroll_entry_id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Paie de {monthLabel(slip.period_start)}</Link>
          : <span />}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && nav(`/bulletins/${prev.id}`)} icon={<ChevronLeft className="h-4 w-4" />}>{prev?.employee_number ?? 'Précédent'}</Button>
          <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && nav(`/bulletins/${next.id}`)}>{next?.employee_number ?? 'Suivant'}<ChevronRight className="h-4 w-4" /></Button>
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer ou enregistrer en PDF</Button>
        </div>
      </div>
      <SalarySlipDocument slip={slip} details={details} ytd={ytd} company={company.data} />
      {can('paie', 'rh') && <SlipExplain slipId={slip.id} />}
    </>
  )
}
