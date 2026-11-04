// Test différentiel : moteur SQL (compute_salary_slip) contre l'oracle indépendant, salarié par salarié.
// Prérequis : stack Docker démarrée ; un scénario chargé (scripts/qa-reset-scenario.ps1) pour plus de cas.
// Lancer : node --test tests/oracle/differential.test.mjs   (variable ORACLE_PERIOD=2026-10 par défaut)
// Aucune donnée personnelle affichée : matricules et montants seulement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cotisations, impotRevenu, trimf } from './payroll-oracle.mjs'

const periode = process.env.ORACLE_PERIOD ?? '2026-10'
const [an, mois] = periode.split('-').map(Number)
const debut = `${periode}-01`
const fin = `${periode}-${String(new Date(an, mois, 0).getDate()).padStart(2, '0')}`

const sql = `
select jsonb_build_object(
  'settings', to_jsonb(public.payroll_settings_at('${fin}')),
  'bareme', (select jsonb_agg(to_jsonb(b)) from public.tax_slab_brackets b where b.slab_id = public.tax_slab_at('${fin}')),
  'reductions', (select jsonb_agg(to_jsonb(r)) from public.ir_family_reductions r where r.slab_id = public.tax_slab_at('${fin}')),
  'trimf', (select jsonb_agg(to_jsonb(t)) from public.trimf_brackets t where t.slab_id = public.tax_slab_at('${fin}')),
  'rows', (select jsonb_agg(jsonb_build_object('n', e.employee_number, 'type', e.employment_type,
            'ir_parts', e.ir_parts, 'trimf_parts', e.trimf_parts,
            'cadre', coalesce((select g.staff_status = 'Cadres' from public.employee_grades g where g.id = e.grade_id), false),
            'totals', (public.compute_salary_slip(e.id, date '${debut}', date '${fin}', 0))->'totals',
            'ir', (public.compute_salary_slip(e.id, date '${debut}', date '${fin}', 0))->'income_tax_detail'))
           from public.employees e
           where e.status = 'Active'
             and exists (select 1 from public.salary_structure_assignments a where a.employee_id = e.id and a.from_date <= date '${debut}'))
)::text`
const data = JSON.parse(execFileSync('docker',
  ['exec', 'soma-rh-local-postgres-1', 'psql', '-U', 'soma', '-d', 'soma_rh', '-tA', '-c', sql],
  { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }))
const { settings: s, bareme, reductions, trimf: tb } = data
// Le moteur n'applique ni cotisations ni IR aux stagiaires, apprentis et prestataires : règle à documenter (RL-019, à confirmer).
const rows = data.rows.filter((r) => ['CDI', 'CDD'].includes(r.type))
const TOL = 0.001 // 0,1 centime

// Champs comparés : champ du moteur -> valeur attendue par l'oracle.
function attendu(row) {
  const brut = Number(row.totals.gross_pay)
  const c = cotisations(brut, s, row.cadre)
  const ir = impotRevenu(brut, Number(row.ir_parts), s, bareme, reductions)
  return {
    ipres_rg_base: c.ipres_rg_base, ipres_rc_base: c.ipres_rc_base, css_base: c.css_base,
    ipres_rg_employee: c.ipres_rg_employee, ipres_rg_employer: c.ipres_rg_employer,
    ipres_rc_employee: c.ipres_rc_employee, ipres_rc_employer: c.ipres_rc_employer,
    css_af: c.css_af, css_at: c.css_at, cfce: c.cfce,
    income_tax: ir.monthly_tax, trimf: trimf(brut, Number(row.trimf_parts), tb),
  }
}

const ecarts = {} // champ -> liste { n, type, moteur, oracle }
for (const row of rows) {
  const att = attendu(row)
  for (const [champ, valeur] of Object.entries(att)) {
    const moteur = Number(row.totals[champ])
    if (!Number.isFinite(moteur) || Math.abs(moteur - valeur) > TOL) {
      ;(ecarts[champ] ??= []).push({ n: row.n, type: row.type, moteur, oracle: valeur })
    }
  }
}

test(`la population comparée est significative (${rows.length} salariés, période ${periode})`, () => {
  assert.ok(rows.length >= 20, `trop peu de salariés : ${rows.length}`)
})

for (const champ of ['ipres_rg_base', 'ipres_rc_base', 'css_base', 'ipres_rg_employee', 'ipres_rg_employer',
  'ipres_rc_employee', 'ipres_rc_employer', 'css_af', 'css_at', 'cfce', 'income_tax', 'trimf']) {
  // D-006 : assiette de l'IPRES complémentaire cadres (tranche ou totalité) ; décision du propriétaire en attente.
  const ouvert = champ.startsWith('ipres_rc') ? { todo: 'D-006 : assiette IPRES complémentaire à confirmer' } : {}
  test(`oracle = moteur : ${champ}`, ouvert, () => {
    const liste = ecarts[champ] ?? []
    const par_type = liste.reduce((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {})
    assert.equal(liste.length, 0,
      `${liste.length} écart(s) sur ${rows.length} (par contrat : ${JSON.stringify(par_type)}) ; ex. ${JSON.stringify(liste.slice(0, 3))}`)
  })
}

// Propriétés de l'oracle lui-même (indépendantes du moteur).
test('propriété : l\'IR mensuel ne diminue jamais quand le brut augmente (parts fixes)', () => {
  for (const parts of [1, 2, 3, 4, 5]) {
    let prec = -1
    for (let brut = 0; brut <= 6_000_000; brut += 25_000) {
      const v = impotRevenu(brut, parts, s, bareme, reductions).monthly_tax
      assert.ok(v >= prec - 1e-9, `IR décroît à ${brut} F avec ${parts} parts`)
      prec = v
    }
  }
})
test('propriété : plafonds respectés (bases IPRES et CSS)', () => {
  for (let brut = 0; brut <= 5_000_000; brut += 12_345) {
    const c = cotisations(brut, s)
    assert.ok(c.ipres_rg_base <= s.ipres_rg_ceiling && c.css_base <= s.css_ceiling)
    assert.ok(c.ipres_rc_base <= s.ipres_rc_ceiling - s.ipres_rg_ceiling)
  }
})
