# Module Organigramme — matrice de tests

Version 1.0 — 3 novembre 2026. Décisions : `ORGANIGRAMME_DECISIONS.md`.

| # | Contrôle | Commande | Résultat attendu | Obtenu | Statut |
|---|---|---|---|---|---|
| 1a | Cycle hiérarchique refusé | `psql -f tests/sql/organigramme.sql` | « Cycle hiérarchique refusé » | idem | ✔ |
| 1b | Auto-rattachement refusé | idem | « propre manager » | idem | ✔ |
| 1c | Deux managers directs valides à la même date refusés | idem | refus | idem | ✔ |
| 1d | Lien vers soi-même, dates incohérentes refusés | idem | refus | idem | ✔ |
| 1e | Migration appliquée puis annulée puis réappliquée | `db/migrations/…organigramme.sql`, `db/rollback/…_down.sql`, `db/migrations/…organigramme.sql` | sans erreur | sans erreur | ✔ |
| 2a | Écriture refusée à un salarié ; motif obligatoire | `psql -f tests/sql/organigramme.sql` | refus | idem | ✔ |
| 2b | Aucune lecture anonyme | idem | `permission denied` | idem | ✔ |
| 2c | Salarié : pas d'e-mail, tables de liens illisibles directement | idem | 0 ligne, e-mail absent | idem | ✔ |
| 2d | RH : e-mail visible ; aucun champ hors liste blanche dans un nœud (donc aucune donnée de paie) | idem | clés = id, matricule, prénom, nom, poste, département, e-mail, statut, sortie, subordonnés, équipes | idem | ✔ |
| 2e | « paie » ne peut pas écrire | — | refus | **non testé** : aucun compte `paie` sans `rh` dans la base ; la règle est la même que pour un salarié (`org_require_hr`) | ⚠ |
| 3a | Nombre de subordonnés exact | idem | 2 puis 1 selon la date | idem | ✔ |
| 3b | Statuts calculés : congé, intérim, sorti | idem | `en_conge`, `interim`, absent après sortie | idem | ✔ |
| 3c | Organigramme à une date passée | idem | ancien manager en mars 2025, nouveau en sept. 2025 | idem | ✔ |
| 3d | Changement de manager et export journalisés | idem | lignes `changement_manager` et `export_organigramme` dans `audit_log` | idem | ✔ |
| 3e | Quotes-parts > 100 % : anomalie visible | idem | anomalie `allocation_depassee` | idem | ✔ |
| 4a | Les liens hors hiérarchie ne déplacent aucun nœud | `node --test tests/unit/org.layout.test.mjs` | positions identiques | identiques | ✔ |
| 4b | Repli et dépli donnent les bons nœuds visibles | idem | 32 puis 1, enfant masqué | idem | ✔ |
| 5 | Interface : rendu, fiche, thèmes, vue Équipes, mobile | navigateur connecté en `rh` | affichage correct | corrects (3 défauts trouvés et corrigés) | ✔ |
| 5b | Interface : vue Liste, formulaires d'édition, export PNG, clavier complet, `prefers-reduced-motion` | — | — | **non exécuté** | ✖ |
| 6 | Accessibilité automatisée (axe) | — | — | **non exécuté** : outil absent | ✖ |
| 7 | Performance 500 salariés | `node --test tests/unit/org.layout.test.mjs` | disposition < 1,5 s | 148 ms (seuil de worker 100 ms dépassé) | ⚠ |
| 8a | Build, typage, lint | `npm run build`, `npx tsc -b`, `npm run lint` | 0 erreur | 0 erreur (3 avertissements préexistants) | ✔ |
| 8b | Non-régression paie | `scripts\verify-payroll.ps1` | PASS | PASS | ✔ |
| 8c | Tests SQL existants | voir `docs/LOCAL_SETUP.md` | OK | OK | ✔ |

## Lancer

```powershell
Get-Content tests\sql\organigramme.sql | docker exec -i soma-rh-local-postgres-1 psql -U soma -d soma_rh -v ON_ERROR_STOP=1
node --test tests/unit/org.layout.test.mjs
# données de démonstration (facultatif) et retrait
Get-Content tests\fixtures\organigramme\demo_seed.sql | docker exec -i soma-rh-local-postgres-1 psql -U soma -d soma_rh -v ON_ERROR_STOP=1
Get-Content tests\fixtures\organigramme\demo_cleanup.sql | docker exec -i soma-rh-local-postgres-1 psql -U soma -d soma_rh -v ON_ERROR_STOP=1
# annuler la migration
Get-Content db\rollback\20261103220000_organigramme_down.sql | docker exec -i soma-rh-local-postgres-1 psql -U soma -d soma_rh -v ON_ERROR_STOP=1
```
