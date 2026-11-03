# SOMA-RH — consignes pour Claude Code

Application RH et paie de la Société Minière Africaine (Sénégal). Interface et données en **français**.

## Structure
- `web/` : React 18 + Vite + TypeScript + Tailwind + TanStack Query/Table. Pages dans `web/src/pages`, composants partagés dans `web/src/components`.
- `db/migrations/` : schéma, RLS, moteur de paie PL/pgSQL, vues d'états. Base PostgreSQL locale (Docker), sans service externe : on reste en local.
- `docs/ANALYSE_EXCEL.md` : règles de paie issues du classeur Excel (référence fonctionnelle).

## Règles
- Le classeur Excel n'est plus la référence de la paie (la base de test évolue en permanence). Le garde-fou est la non-régression interne : après toute modification de `compute_salary_slip`, lancer `scripts/verify-payroll.ps1` (échec = empreinte différente de la référence enregistrée) ; après une évolution voulue, `scripts/verify-payroll.ps1 -Save`. Les anciens chiffres (25 bulletins, brut 4 929 179,09, net 4 662 739,89) et l'écart 26≠25 ne sont plus à prendre en compte.
- Toujours passer par une migration (`db/migrations/AAAAMMJJHHMMSS_nom.sql`) puis l'appliquer sur la base locale (psql dans le conteneur `soma-rh-local-postgres-1`) ; régénérer `web/src/lib/database.types.ts` ensuite.
- Toute nouvelle table : RLS activée + politiques par rôle (`has_role(array['rh'|'paie'])`), index sur les clés étrangères.
- Montants en pleine précision (`numeric`) en base ; arrondi uniquement à l'affichage (`fcfa()` de `web/src/lib/format.ts`).
- Design : palette `ink / paper / river / phosphate / signal` (voir `web/tailwind.config.js`), police Archivo, chiffres tabulaires.
- Données personnelles des salariés : ne jamais les copier dans des fichiers suivis par Git.

## Skills utiles
- `supabase-postgres-best-practices` : schéma, RLS, performances (bonnes pratiques PostgreSQL).
- `frontend-design`, `ui-ux-pro-max`, `ui-styling`, `web-design-guidelines` : interface.
- `vercel-react-best-practices`, `vercel-composition-patterns` : code React.
- `graphify` : carte du code (`/graphify .`, résultat dans `graphify-out/`).
- `xlsx` : lecture des classeurs Excel de paie.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
