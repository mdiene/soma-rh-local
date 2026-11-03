import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { dataApi, unwrap, type Tables } from '../lib/api'
import { useAgreements, useCompany, useDesignations, useGrades } from '../lib/queries'
import { date, fcfa, monthLabel, num } from '../lib/format'
import { Button } from './ui'
import { PrintPortal, printPortal } from './PrintPortal'

type Emp = Tables<'employees'>

const GENDER: Record<string, string> = { M: 'Masculin', F: 'Féminin' }
const STATUS: Record<string, string> = { Active: 'Actif', Left: 'Sorti', Inactive: 'Inactif', Suspended: 'Suspendu' }

/** Bouton « Imprimer la fiche » + document complet (hors écran) imprimé à la demande. */
export function EmployeeFicheButton({ employee }: { employee: Emp }) {
  return (
    <>
      <Button icon={<Printer className="h-4 w-4" />} onClick={printPortal}>Imprimer la fiche</Button>
      <PrintPortal><EmployeeFicheDocument employee={employee} /></PrintPortal>
    </>
  )
}

function Block({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="mb-1 border-b border-[#1D2A33] pb-0.5 text-[13px] font-bold uppercase tracking-wide">{title}</h2>
      <dl className="grid grid-cols-[38mm_1fr_38mm_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#52606B]">{k}</dt>
            <dd className="font-medium">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function EmployeeFicheDocument({ employee: e }: { employee: Emp }) {
  const company = useCompany()
  const designations = useDesignations()
  const agreements = useAgreements()
  const grades = useGrades(e.agreement_code)
  const assignments = useQuery({
    queryKey: ['assignment', e.id],
    queryFn: async () => unwrap(await dataApi.from('salary_structure_assignments').select('*').eq('employee_id', e.id).order('from_date', { ascending: false })),
  })
  const structures = useQuery({
    queryKey: ['structures'],
    queryFn: async () => unwrap(await dataApi.from('salary_structures').select('*').eq('is_active', true)),
  })
  const balances = useQuery({
    queryKey: ['fiche-balances', e.id],
    queryFn: async () => unwrap(await dataApi.from('v_leave_balances').select('*').eq('employee_number', e.employee_number)),
  })
  const slips = useQuery({
    queryKey: ['slips-of', e.id],
    queryFn: async () => unwrap(await dataApi.from('salary_slips').select('id, period_start, status, gross_pay, net_pay').eq('employee_id', e.id).neq('status', 'Annulé').order('period_start', { ascending: false })),
  })

  const designation = designations.data?.find((d) => d.id === e.designation_id)?.name
  const agreement = agreements.data?.find((a) => a.code === e.agreement_code)?.name
  const grade = grades.data?.find((g) => g.id === e.grade_id)
  const a = assignments.data?.[0]
  const structure = structures.data?.find((s) => s.id === a?.structure_id)?.name
  const today = date(new Date().toISOString().slice(0, 10))
  const recent = (slips.data ?? []).slice(0, 6)

  return (
    <div className="sheet mx-auto max-w-[190mm] p-4 text-[11px]" style={{ fontFamily: 'Archivo, sans-serif' }}>
      <header className="mb-4 flex items-start justify-between border-b-2 border-[#1D2A33] pb-2">
        <div>
          <p className="text-base font-bold">{company.data?.name ?? ''}</p>
          <p>{company.data?.address ?? ''}</p>
          <p>{company.data?.ninea ? `NINEA ${company.data.ninea}` : ''}{company.data?.rccm ? ` · RCCM ${company.data.rccm}` : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">FICHE DU SALARIÉ</p>
          <p>Éditée le {today}</p>
          <p className="text-[10px] text-[#52606B]">Document confidentiel</p>
        </div>
      </header>

      <div className="mb-4 flex items-baseline justify-between rounded border border-[#1D2A33] bg-[#F6F7F5] px-3 py-2">
        <p className="text-base font-bold">{e.first_name} {e.last_name}</p>
        <p>Matricule <strong>{e.employee_number}</strong> · {STATUS[e.status] ?? e.status}</p>
      </div>

      <Block title="Identité" rows={[
        ['Sexe', e.gender ? GENDER[e.gender] ?? e.gender : ''],
        ['Nationalité', e.nationality ?? ''],
        ['Date de naissance', e.date_of_birth ? date(e.date_of_birth) : ''],
        ['Lieu de naissance', e.place_of_birth ?? ''],
        ['CNI / passeport', e.id_document_number ?? ''],
        ['Délivrée le', e.id_issue_date ? date(e.id_issue_date) : ''],
        ['Expire le', e.id_expiry_date ? date(e.id_expiry_date) : ''],
        ['', ''],
        ['Père', e.father_name ?? ''],
        ['Mère', e.mother_name ?? ''],
      ]} />

      <Block title="Coordonnées" rows={[
        ['Adresse', e.address ?? ''],
        ['', ''],
        ['Téléphone personnel', e.phone_personal ?? ''],
        ['Téléphone professionnel', e.phone_work ?? ''],
        ['E-mail personnel', e.email_personal ?? ''],
        ['E-mail professionnel', e.email_work ?? ''],
        ['Personne à prévenir', e.emergency_contact_name ?? ''],
        ['Téléphone d’urgence', e.emergency_contact_phone ?? ''],
        ['N° IPRES', e.ipres_number ?? ''],
        ['N° CSS', e.css_number ?? ''],
      ]} />

      <Block title="Famille et fiscalité" rows={[
        ['Situation de famille', e.marital_status ?? ''],
        ['Conjoint(e)s', String(e.spouses_count ?? 0)],
        ['Enfants à charge', String(e.children_count ?? 0)],
        ['Parts IR', String(e.ir_parts ?? 1)],
        ['Parts TRIMF', String(e.trimf_parts ?? 1)],
        ['', ''],
      ]} />

      <Block title="Contrat et classification" rows={[
        ['Emploi', designation ?? ''],
        ['Type de contrat', e.employment_type],
        ['Convention collective', agreement ?? ''],
        ['Catégorie', grade ? `${grade.code} — ${grade.staff_status}` : ''],
        ['Date d’entrée', date(e.date_of_joining)],
        ['Retour de congé', e.leave_return_date ? date(e.leave_return_date) : ''],
        ['Début du contrat', e.contract_start ? date(e.contract_start) : ''],
        ['Fin du contrat', e.contract_end ? date(e.contract_end) : ''],
        ['Date de sortie', e.relieving_date ? date(e.relieving_date) : ''],
        ['Motif de sortie', e.exit_reason ?? ''],
      ]} />

      <Block title="Rémunération" rows={[
        ['Structure salariale', structure ?? ''],
        ['En vigueur depuis', a ? date(a.from_date) : ''],
        ['Salaire de base', a?.base_salary != null ? `${fcfa(a.base_salary)} F` : grade ? `${fcfa(grade.base_salary)} F (minimum de la catégorie)` : ''],
        ['Sursalaire', a ? `${fcfa(a.sursalaire ?? 0)} F` : ''],
        ['Honoraires', a ? `${fcfa(a.fees ?? 0)} F` : ''],
        ['Autre élément fixe', a ? `${fcfa(a.other_fixed ?? 0)} F` : ''],
        ['Transport', a?.transport_mode ?? ''],
        ['Congé payé mensuel', a ? (a.leave_paid_monthly ? 'Oui' : 'Non (provision)') : ''],
        ['Mode de paiement', e.payment_mode ?? ''],
        ['Banque', e.bank_name ?? ''],
        ['RIB', e.bank_account ?? ''],
        ['', ''],
      ]} />

      {(balances.data ?? []).length > 0 && (
        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-[#1D2A33] pb-0.5 text-[13px] font-bold uppercase tracking-wide">Soldes de congés</h2>
          <table className="w-full border-collapse">
            <thead><tr className="text-left"><th className="py-0.5">Type</th><th className="text-right">Acquis</th><th className="text-right">Pris</th><th className="text-right">Solde</th></tr></thead>
            <tbody>
              {balances.data!.map((b) => (
                <tr key={b.leave_type_name} className="border-t border-[#D5DBE0]">
                  <td className="py-0.5">{b.leave_type_name}</td>
                  <td className="text-right tabular-nums">{num(b.allocated, 1)}</td>
                  <td className="text-right tabular-nums">{num(b.taken, 1)}</td>
                  <td className="text-right font-semibold tabular-nums">{num(b.balance, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-[#1D2A33] pb-0.5 text-[13px] font-bold uppercase tracking-wide">Derniers bulletins</h2>
          <table className="w-full border-collapse">
            <thead><tr className="text-left"><th className="py-0.5">Mois</th><th className="text-right">Brut</th><th className="text-right">Net à payer</th><th className="pl-4">État</th></tr></thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-t border-[#D5DBE0]">
                  <td className="py-0.5">{monthLabel(s.period_start)}</td>
                  <td className="text-right tabular-nums">{fcfa(s.gross_pay)}</td>
                  <td className="text-right font-semibold tabular-nums">{fcfa(s.net_pay)}</td>
                  <td className="pl-4">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-10 grid grid-cols-2 gap-10">
        {['Le responsable RH', 'Le salarié'].map((who) => (
          <div key={who}>
            <p className="font-semibold">{who}</p>
            <div className="mt-1 h-20 border border-[#1D2A33]" />
          </div>
        ))}
      </div>
    </div>
  )
}
