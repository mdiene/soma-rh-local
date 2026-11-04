// Isolation par rôle (T-I11) : chaque table est appelée avec le jeton de chaque rôle.
// Prérequis : stack Docker démarrée, scripts/qa-create-users.ps1 exécuté (tests/.env.qa).
// Lancer : node --test tests/api/isolation.test.mjs
// Aucune donnée personnelle n'est affichée : seuls des noms de tables et des nombres de lignes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => Object.fromEntries(readFileSync(new URL(p, import.meta.url), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const env = read('../.env.qa')
const API = env.QA_API_URL
const APIKEY = read('../../web/.env.local').VITE_API_PUBLIC_KEY

async function login(role) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env[`QA_${role}_EMAIL`], password: env[`QA_${role}_PASSWORD`] }),
  })
  assert.ok(r.ok, `connexion ${role}`)
  return (await r.json()).access_token
}
const get = async (path, token) => {
  const r = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: APIKEY, ...(token ? { authorization: `Bearer ${token}` } : {}) } })
  const body = r.ok ? await r.json() : null
  return { status: r.status, rows: Array.isArray(body) ? body : [] }
}

const admin = await login('ADMIN')
const salarie = await login('SALARIE')
const salarie2 = await login('SALARIE2')

// Liste des tables exposées, lue dans la description OpenAPI de PostgREST.
const spec = await (await fetch(`${API}/rest/v1/`, { headers: { apikey: APIKEY, authorization: `Bearer ${admin}` } })).json()
const tables = Object.keys(spec.definitions ?? {}).sort()

test('le catalogue de tables est lisible', () => assert.ok(tables.length > 40, `tables trouvées : ${tables.length}`))

test('anonyme : aucune ligne lisible dans aucune table', async () => {
  const fuites = []
  for (const t of tables) {
    const { rows } = await get(`${t}?limit=1`, null)
    if (rows.length > 0) fuites.push(t)
  }
  assert.deepEqual(fuites, [], `tables lisibles sans connexion : ${fuites.join(', ')}`)
})

test('salarié : ne voit que son propre dossier salarié', async () => {
  const { rows } = await get('employees?select=id,employee_number', salarie)
  assert.equal(rows.length, 1, `lignes visibles : ${rows.length}`)
  assert.equal(rows[0].employee_number, 'QA0011')
})

test('salarié : toute table avec employee_id ne renvoie que ses lignes', async () => {
  const me = (await get('employees?select=id', salarie)).rows[0].id
  const fuites = []
  let tablesAvecDonneesDAutres = 0 // garde-fou : sans données d'autres salariés, l'absence de fuite ne prouverait rien
  for (const t of tables) {
    const cols = Object.keys(spec.definitions[t]?.properties ?? {})
    if (!cols.includes('employee_id')) continue
    const vueAdmin = (await get(`${t}?select=employee_id&limit=1000`, admin)).rows
    if (vueAdmin.some((r) => r.employee_id !== me)) tablesAvecDonneesDAutres++
    const { rows } = await get(`${t}?select=employee_id&limit=1000`, salarie)
    const autres = rows.filter((r) => r.employee_id !== me).length
    if (autres > 0) fuites.push(`${t}(${autres})`)
  }
  assert.ok(tablesAvecDonneesDAutres >= 5, `test non significatif : ${tablesAvecDonneesDAutres} tables contiennent des données d'autres salariés`)
  assert.deepEqual(fuites, [], `lignes d'autres salariés visibles : ${fuites.join(', ')}`)
})

test('salarié : ne voit que des bulletins validés', async () => {
  const { rows } = await get('salary_slips?select=status', salarie)
  const brouillons = rows.filter((r) => !['Validée', 'Payée', 'Clôturée', 'Approuvée'].includes(r.status))
  assert.equal(brouillons.length, 0, `bulletins non validés visibles : ${brouillons.length}`)
})

test('salarié : ne modifie pas les paramètres de paie ni les rôles', async () => {
  // Écritures inoffensives même si l'isolation échouait : on réécrit la valeur actuelle.
  const cfce = (await get('payroll_settings?select=cfce_rate&limit=1', admin)).rows[0].cfce_rate
  const uid = JSON.parse(Buffer.from(salarie.split('.')[1], 'base64url').toString()).sub
  for (const [table, filtre, patch] of [
    ['payroll_settings', '', { cfce_rate: cfce }],
    ['user_roles', `&user_id=eq.${uid}`, { role: 'salarie' }],
  ]) {
    const r = await fetch(`${API}/rest/v1/${table}?select=*${filtre}`, {
      method: 'PATCH', headers: { apikey: APIKEY, authorization: `Bearer ${salarie}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify(patch),
    })
    const modifiees = r.ok ? (await r.json()).length : 0
    assert.equal(modifiees, 0, `${table} : ${modifiees} ligne(s) modifiée(s) par un salarié`)
  }
})

test('deux salariés distincts ne voient pas les mêmes dossiers', async () => {
  const a = (await get('employees?select=id', salarie)).rows.map((r) => r.id)
  const b = (await get('employees?select=id', salarie2)).rows.map((r) => r.id)
  assert.equal(a.length, 1); assert.equal(b.length, 1); assert.notEqual(a[0], b[0])
})

// --- Droits des rôles de gestion -------------------------------------------------------------
const rh = await login('RH')
const paie = await login('PAIE')
const manager = await login('MANAGER')

// Décision de conception (politiques RLS) : seuls paie et admin modifient taux et barème ; rh ne le peut pas.
for (const [nom, jeton] of [['rh', rh]]) {
  test(`${nom} : ne modifie ni les taux de paie ni le barème IR`, async () => {
    const cfce = (await get('payroll_settings?select=cfce_rate&limit=1', admin)).rows[0].cfce_rate
    const bar = (await get('tax_slab_brackets?select=id,rate&limit=1', admin)).rows[0]
    for (const [table, filtre, patch] of [
      ['payroll_settings', '', { cfce_rate: cfce }],               // valeur réécrite à l'identique
      ['tax_slab_brackets', `&id=eq.${bar.id}`, { rate: bar.rate }],
    ]) {
      const r = await fetch(`${API}/rest/v1/${table}?select=*${filtre}`, {
        method: 'PATCH', headers: { apikey: APIKEY, authorization: `Bearer ${jeton}`, 'content-type': 'application/json', prefer: 'return=representation' },
        body: JSON.stringify(patch),
      })
      const n = r.ok ? (await r.json()).length : 0
      assert.equal(n, 0, `${nom} a pu modifier ${table} (${n} ligne(s))`)
    }
  })
}

test('manager : ne lit aucune rémunération ni aucun bulletin', async () => {
  const fuites = []
  for (const t of ['salary_structure_assignments', 'salary_slips', 'salary_slip_details', 'salary_payments']) {
    const { rows } = await get(`${t}?limit=1`, manager)
    if (rows.length > 0) fuites.push(t)
  }
  assert.deepEqual(fuites, [], `données de paie lisibles par un manager : ${fuites.join(', ')}`)
})

test('paie : peut modifier les taux (droit documenté, voir constat C-006 sur la double validation)', async () => {
  const cfce = (await get('payroll_settings?select=cfce_rate&limit=1', admin)).rows[0].cfce_rate
  const r = await fetch(`${API}/rest/v1/payroll_settings?select=cfce_rate`, {
    method: 'PATCH', headers: { apikey: APIKEY, authorization: `Bearer ${paie}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ cfce_rate: cfce }), // réécriture à l'identique
  })
  assert.ok(r.ok && (await r.json()).length === 1)
})
