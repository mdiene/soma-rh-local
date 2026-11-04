// Oracle de paie : réimplémentation indépendante des règles du registre légal
// (docs/regles-de-paie/registre-legal.mdx). Fonctions pures, aucune dépendance à la base.
//
// Indépendance : les cotisations (IPRES, CSS, CFCE) sont écrites depuis le registre sans lire le PL/pgSQL.
// L'IR et le TRIMF le sont depuis les principes du CGI ; l'auteur avait toutefois lu compute_income_tax
// avant d'écrire la partie IR : indépendance partielle, à signaler dans les rapports.
//
// Entrées : brut imposable mensuel, parts, paramètres datés (lus dans les tables de données).

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi)

/** Cotisations sociales à partir du brut mensuel (RL-001 à RL-006). */
export function cotisations(brut, s, cadre = false) {
  const rgBase = Math.min(brut, s.ipres_rg_ceiling)
  // RL-003 (à confirmer, D-006) : le registre retient la tranche entre les deux plafonds ; réservé aux cadres.
  const rcBase = cadre ? clamp(brut, s.ipres_rg_ceiling, s.ipres_rc_ceiling) - s.ipres_rg_ceiling : 0
  const cssBase = Math.min(brut, s.css_ceiling)
  const rg = rgBase * s.ipres_rg_rate
  const rc = rcBase * s.ipres_rc_rate
  return {
    ipres_rg_base: rgBase, ipres_rc_base: rcBase, css_base: cssBase,
    ipres_rg_employee: rg * s.ipres_rg_employee_share, ipres_rg_employer: rg * (1 - s.ipres_rg_employee_share),
    ipres_rc_employee: rc * s.ipres_rc_employee_share, ipres_rc_employer: rc * (1 - s.ipres_rc_employee_share),
    css_af: cssBase * s.css_af_rate, css_at: cssBase * s.css_at_rate,
    cfce: brut * s.cfce_rate,
  }
}

/** Impôt sur le revenu (RL-007, RL-008) : abattement, barème cumulatif, réduction pour charges de famille. */
export function impotRevenu(brutMensuel, parts, s, bareme, reductions) {
  const annuel = brutMensuel * 12
  // base imposable arrondie au millier inférieur (usage du CGI)
  const imposable = Math.trunc((annuel - Math.min(annuel * s.ir_abatement_rate, s.ir_abatement_cap)) / 1000) * 1000
  const tranches = [...bareme].sort((a, b) => a.from_amount - b.from_amount)
  let brut = 0
  tranches.forEach((t, i) => {
    const haut = i + 1 < tranches.length ? tranches[i + 1].from_amount : Infinity
    if (imposable > t.from_amount) brut += (Math.min(imposable, haut) - t.from_amount) * t.rate
  })
  const p = Math.min(parts, 5)
  const r = reductions.find((x) => Number(x.parts) === p)
  const reduction = !r || r.rate === 0 ? 0 : clamp(brut * r.rate, r.min_amount, r.max_amount)
  const annuelNet = Math.max(0, brut - reduction)
  return { taxable_income: imposable, gross_tax: brut, family_reduction: reduction, annual_tax: annuelNet, monthly_tax: annuelNet / 12 }
}

/** TRIMF mensuel (RL-009) : montant annuel de la tranche du brut annuel, éventuellement par part. */
export function trimf(brutMensuel, parts, trimfBrackets) {
  const annuel = brutMensuel * 12
  const t = [...trimfBrackets].sort((a, b) => b.min_annual_gross - a.min_annual_gross).find((x) => annuel >= x.min_annual_gross)
  if (!t) return 0
  return (t.annual_amount * (t.per_part ? parts : 1)) / 12
}
