import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { useCompany } from '../lib/queries'
import { monthLabel } from '../lib/format'
import { SalarySlipDocument } from '../components/SalarySlipDocument'
import { Button, ErrorNote, Spinner } from '../components/ui'

/**
 * Bulletins imprimables, un par page A4 (remplace la macro Export_BulletinSalaire) :
 * - /paie/:id/imprimer : tous les bulletins d'un traitement ;
 * - /bulletins/imprimer?ids=a,b,c : une sélection (page « Mes bulletins »).
 */
export default function PrintSlipsPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const selectedIds = (params.get('ids') ?? '').split(',').filter(Boolean)
  const company = useCompany()
  const q = useQuery({
    queryKey: ['print-slips', id ?? selectedIds.join(',')],
    queryFn: async () => {
      const base = dataApi.from('salary_slips').select('*').neq('status', 'Annulé')
      const slips = unwrap(await (id ? base.eq('payroll_entry_id', id) : base.in('id', selectedIds))
        .order('employee_number').order('period_start'))
      const ids = slips.map((s) => s.id)
      const [details, ytd] = await Promise.all([
        dataApi.from('salary_slip_details').select('*').in('salary_slip_id', ids),
        dataApi.from('v_salary_slip_ytd').select('*').in('salary_slip_id', ids),
      ])
      return { slips, details: unwrap(details), ytd: unwrap(ytd) }
    },
  })
  if (q.isLoading) return <Spinner label="Préparation des bulletins…" />
  if (!q.data) return <ErrorNote error={q.error} />
  const { slips, details, ytd } = q.data
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={id ? `/paie/${id}` : '/mes-bulletins'} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river">
          <ArrowLeft className="h-4 w-4" /> {id ? 'Retour au traitement' : 'Retour aux bulletins'}
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-soft">{slips.length} bulletin(s){id && slips[0] ? ` — ${monthLabel(slips[0].period_start)}` : ''}</p>
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer ou enregistrer en PDF</Button>
        </div>
      </div>
      <div className="space-y-8 print:space-y-0">
        {slips.map((s) => (
          <SalarySlipDocument key={s.id} slip={s} details={details.filter((d) => d.salary_slip_id === s.id)} ytd={ytd.find((y) => y.salary_slip_id === s.id)} company={company.data} />
        ))}
      </div>
    </>
  )
}
