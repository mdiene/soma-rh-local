// Tests de l'arbre « Directions » et des informations d'affectation (lib/org.ts) — Node, sans navigateur.
// Usage : node --test tests/unit/org.structure.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'org-struct-'))
const out = join(dir, 'org.mjs')
execFileSync(process.execPath, [join(root, 'web/node_modules/esbuild/bin/esbuild'), join(root, 'web/src/lib/org.ts'), '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' })
const org = await import(pathToFileURL(out).href)
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

const person = (id, extra = {}) => ({ id, matricule: id, prenom: id, nom: 'Fictif', poste: 'Poste', departement: null, email: null, statut: 'actif', sortie: null, subordonnes: 0, equipes: 0, poste_id: null, unite: null, responsable_de: [], ...extra })
const unit = (id, nom, type, parent = null, responsable = null) => ({ id, nom, type, parent, responsable, membres: 0 })
const base = () => ({
  date: '2026-11-04', liens: [], equipes: [], anomalies: [], postes: [],
  unites: [unit('d1', 'Direction A', 'direction', null, 'a'), unit('s1', 'Secteur A1', 'secteur', 'd1')],
  noeuds: [person('b', { unite: 'd1' }), person('a', { unite: 'd1', responsable_de: ['Direction A'] }), person('c', { unite: 's1' }), person('d')],
})

test('structure : société > direction > secteur ; salariés sous leur unité, responsable en premier', () => {
  const { nodes, unattached } = org.buildStructureTree(base())
  assert.equal(nodes.get('u:d1').parent, org.ROOT_ID)
  assert.equal(nodes.get('u:s1').parent, 'u:d1')
  assert.equal(nodes.get('c').parent, 'u:s1')
  const kids = nodes.get('u:d1').children
  assert.equal(kids.includes('u:s1'), true)
  assert.equal(kids.indexOf('a') < kids.indexOf('b'), true) // le responsable avant les autres, même listé après
  assert.deepEqual(unattached, ['d'])
  assert.equal(nodes.get('d').parent, org.GROUP_ID)
  assert.equal(nodes.get(org.GROUP_ID).label, 'Sans direction')
})

test('structure : une unité au parent inconnu remonte sous la société ; pas de groupe si tous rattachés', () => {
  const d = base()
  d.unites.push(unit('x', 'Orpheline', 'section', 'inconnue'))
  d.noeuds = d.noeuds.filter((p) => p.id !== 'd')
  const { nodes, unattached } = org.buildStructureTree(d)
  assert.equal(nodes.get('u:x').parent, org.ROOT_ID)
  assert.equal(unattached.length, 0)
  assert.equal(nodes.has(org.GROUP_ID), false)
})

test('la disposition de la structure couvre toutes les cartes visibles ; le repli masque le contenu', () => {
  const { nodes } = org.buildStructureTree(base())
  const vis = org.visibleIds(nodes, new Set())
  assert.equal(org.layout(nodes, vis).size, vis.size)
  const closed = org.visibleIds(nodes, new Set(['u:d1']))
  assert.equal(closed.has('c'), false)
  assert.equal(closed.has('u:s1'), false)
})

test('manager : subordonnés directs OU responsable d\'unité / d\'équipe (sans compte requis)', () => {
  assert.equal(org.isManager(person('x', { subordonnes: 2 })), true)
  assert.equal(org.isManager(person('x', { responsable_de: ['Comité'] })), true)
  assert.equal(org.isManager(person('x')), false)
})

test('affectations : manager, équipes et unité de chaque salarié (pour colorer les listes)', () => {
  const d = base()
  d.liens = [{ id: 'l', type: 'direct', source: 'a', target: 'b', debut: '2024-01-01', fin: null }]
  d.equipes = [{ id: 't', nom: 'Projet', type: 'project', responsable: null, debut: '2026-01-01', fin: null, membres: [{ employe: 'c', role: 'membre', quote_part: 10 }] }]
  const info = org.assignmentInfo(d)
  assert.equal(info.get('b').manager, 'a Fictif')
  assert.equal(info.get('a').manager, null)
  assert.deepEqual(info.get('c').teams, ['Projet'])
  assert.equal(info.get('c').unit, 'Secteur A1')
  assert.equal(info.get('d').unit, null)
})
