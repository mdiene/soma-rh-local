// Tests de la logique de disposition de l'organigramme (lib/org.ts) — Node, sans navigateur.
// Usage : node tests/unit/org.layout.test.mjs   (compile lib/org.ts avec esbuild, déjà présent via Vite)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'org-'))
const out = join(dir, 'org.mjs')
execFileSync(process.execPath, [join(root, 'web/node_modules/esbuild/bin/esbuild'), join(root, 'web/src/lib/org.ts'), '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' })
const org = await import(pathToFileURL(out).href)
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

const person = (i) => ({ id: `p${i}`, matricule: `M${i}`, prenom: `Prénom${i}`, nom: `Fictif${i}`, poste: 'Poste', departement: null, email: null, statut: 'actif', sortie: null, subordonnes: 0, equipes: 0 })
const direct = (parent, child) => ({ id: `d-${parent}-${child}`, type: 'direct', source: parent, target: child, debut: '2024-01-01', fin: null })
/** Arbre régulier : n salariés, chacun avec `fan` subordonnés ; les `unattached` derniers restent non rattachés. */
function dataset(n, fan = 5, unattached = 0) {
  const noeuds = Array.from({ length: n }, (_, i) => person(i))
  const liens = []
  for (let i = 1; i < n - unattached; i++) liens.push(direct(`p${Math.floor((i - 1) / fan)}`, `p${i}`))
  return { date: '2026-11-03', noeuds, liens, equipes: [], anomalies: [] }
}

test('têtes de branche sous la société, non rattachés regroupés', () => {
  const { nodes, unattached } = org.buildTree(dataset(12, 3, 4))
  assert.equal(unattached.length, 4)
  assert.equal(nodes.get(org.ROOT_ID).children.includes(org.GROUP_ID), true)
  assert.equal(nodes.get('p0').parent, org.ROOT_ID)
  assert.equal(nodes.get('p1').parent, 'p0')
})

test('repli et dépli : les bons nœuds sont visibles', () => {
  const { nodes } = org.buildTree(dataset(31, 2))
  const all = org.visibleIds(nodes, new Set())
  assert.equal(all.size, 31 + 1) // + société
  const closed = org.visibleIds(nodes, new Set(['p1']))
  assert.equal(closed.has('p1'), true)
  assert.equal(closed.has('p3'), false) // enfant de p1 masqué
  assert.equal(org.descendantsCount(nodes, 'p1'), 14)
  assert.equal(org.visibleIds(nodes, new Set([org.ROOT_ID])).size, 1)
})

test('les liens hors hiérarchie ne modifient pas les positions', () => {
  const base = dataset(20, 3)
  const withLinks = { ...base, liens: [...base.liens,
    { id: 'x1', type: 'dotted', source: 'p5', target: 'p9', debut: '2025-01-01', fin: null, quote_part: 30 },
    { id: 'x2', type: 'interim', source: 'p2', target: 'p17', debut: '2025-01-01', fin: null },
    { id: 'x3', type: 'functional', source: 'p0', target: 'p13', debut: '2025-01-01', fin: null }] }
  const a = org.buildTree(base), b = org.buildTree(withLinks)
  const pa = org.layout(a.nodes, org.visibleIds(a.nodes, new Set())), pb = org.layout(b.nodes, org.visibleIds(b.nodes, new Set()))
  assert.deepEqual([...pa.entries()], [...pb.entries()])
})

test('chaîne hiérarchique : ancêtres + descendants', () => {
  const { nodes } = org.buildTree(dataset(15, 2))
  const chain = org.chainOf(nodes, 'p1')
  for (const id of ['p1', 'p0', org.ROOT_ID, 'p3', 'p4', 'p7']) assert.equal(chain.has(id), true, id)
  assert.equal(chain.has('p2'), false)
})

test('performance : 500 salariés (construction, disposition, dépliage de 100 nœuds)', () => {
  const d = dataset(500, 6)
  let t = performance.now()
  const { nodes } = org.buildTree(d)
  const tBuild = performance.now() - t
  t = performance.now()
  const vis = org.visibleIds(nodes, new Set())
  const pos = org.layout(nodes, vis)
  const tLayout = performance.now() - t
  assert.equal(pos.size, 501)
  // dépliage d'environ 100 nœuds : tout replier puis rouvrir et recalculer
  const closed = new Set([...nodes.values()].filter((v) => v.children.length && v.id !== org.ROOT_ID).map((v) => v.id))
  t = performance.now()
  org.layout(nodes, org.visibleIds(nodes, closed))
  org.layout(nodes, org.visibleIds(nodes, new Set([...closed].slice(100))))
  const tExpand = performance.now() - t
  console.log(`  mesures : construction ${tBuild.toFixed(1)} ms · disposition de 501 nœuds ${tLayout.toFixed(1)} ms · dépliage de 100 nœuds ${tExpand.toFixed(1)} ms`)
  assert.ok(tLayout < 1500, `disposition trop lente : ${tLayout} ms`)
})
