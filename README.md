# SOMA-RH — Gestion du personnel et de la paie

Application web de gestion RH et de paie de la **Société Minière Africaine (SOMA)**, construite à partir du
classeur Excel « GESTION DE LA PAIE DES CONGES » et sur le modèle fonctionnel de
[Frappe HR](https://github.com/frappe/hrms).

* **Frontend** : React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query / Table + Lucide (`web/`)
* **Backend cible** : PostgreSQL 17 + PostgREST + authentification JWT (`db/`, `postgres/`, `docker-compose.yml`)
* **Moteur de paie** : fonctions PL/pgSQL qui reproduisent les formules Excel au centime près
  (25 bulletins d'août 2026 identiques, voir [docs/ANALYSE_EXCEL.md](docs/ANALYSE_EXCEL.md))

## Démarrer (Windows)

```powershell
cd C:\IT-Mozaic\SOMA-RH\web
npm install
npm run dev                    # http://localhost:5173
```

Pour démarrer la nouvelle base locale :

```powershell
Copy-Item .env.docker.example .env
docker compose up -d postgres postgrest api
```

Services locaux : frontend `http://localhost:5173`, passerelle/API `http://localhost:8000`,
PostgREST direct `http://localhost:3001`, PostgreSQL `localhost:5432`, pgAdmin `http://localhost:5051`.

pgAdmin est préconfiguré avec le serveur **SOMA-RH local**. Depuis pgAdmin, utilisez `postgres`
comme hôte, `5432` comme port, `soma_rh` comme base, `soma` comme utilisateur et la valeur
`POSTGRES_PASSWORD` du fichier `.env` comme mot de passe. Depuis Windows, n’utilisez pas `localhost`
dans pgAdmin lancé dans Docker : les conteneurs communiquent via le nom de service `postgres`.

Le volume PostgreSQL est initialisé une seule fois, dans l’ordre des migrations de
[`db/migrations/`](C:/IT-Mozaic/SOMA-RH-local/db/migrations). Les secrets du fichier `.env` ne doivent jamais être commités.

La migration des données de l’base source nécessite une chaîne PostgreSQL directe complète
dans `SOURCE_DATABASE_URL` et une chaîne cible dans `TARGET_DATABASE_URL`. Le script
[`scripts/migrate-postgres.ps1`](C:/IT-Mozaic/SOMA-RH-local/scripts/migrate-postgres.ps1) exécute l’export/import
avec `pg_dump` et `pg_restore`, sans copier de données personnelles dans Git.
Le seed de développement charge actuellement les référentiels et 26 salariés ; les bulletins ne seront
présents qu’après l’import des données source.

1. Copiez [`web/.env.example`](C:/IT-Mozaic/SOMA-RH-local/web/.env.example) vers `web/.env.local` :
   l’URL doit être `http://localhost:8000`, celle de la passerelle PostgreSQL/JWT.
2. Ouvrez l’application, créez un compte puis allez dans **Paramètres › Accès** et cliquez sur
   **Me déclarer administrateur** (possible uniquement tant qu'aucun administrateur n'existe).
3. Créez les comptes des autres utilisateurs, puis attribuez-leur les rôles **RH**, **Paie** ou **Salarié**.
   Reliez un compte à une fiche pour que le salarié consulte ses bulletins.

La paie d'**août 2026** est déjà chargée et calculée (statut « Calculée ») : ouvrez **Traitements de paie**.

## Mise en ligne sur Vercel

Le dépôt est prêt : `vercel.json` (racine) construit l'application de `web/` et redirige toutes les routes vers
`index.html` ; `web/.env.production` fournit l'URL de la passerelle PostgreSQL et sa clé publique au build.

1. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt GitHub `mdiene/soma-rh`.
   Laissez **Root Directory** à la racine (`./`) : `vercel.json` fixe les commandes et le dossier `web/dist`.
2. Cliquez sur **Deploy** et définissez `VITE_API_URL` et `VITE_API_PUBLIC_KEY` vers la passerelle PostgreSQL
   déployée ; PostgreSQL ne doit jamais être exposé directement au navigateur.

Chaque `git push` sur `main` redéploie automatiquement. Dans Claude Code, le plugin officiel **Vercel**
(activé dans `.claude/settings.json`) ajoute les commandes `/deploy`, `/env` et `/status`.

## Modules

| Écran | Rôle | Feuille Excel d'origine |
|---|---|---|
| Tableau de bord | vue mensuelle (masse salariale, IPRES, CSS, CFCE, TRIMF, provisions, alertes) et vue annuelle ; « Synthèse annuelle » des traitements validés | TDB |
| Salariés | fiche complète, matricule attribué automatiquement (S0027…) et verrouillé, classification conventionnelle, structure salariale, solveur « net à simuler » | FICHE DE PERSONNEL |
| Congés | demandes, validation, attribution et soldes | — |
| Présences | grille journalière (un salarié par ligne, enregistrement groupé sans doublon) : heures travaillées, absence, maladie, HS par taux ; report dans les variables de paie | — |
| Mes bulletins | bulletins validés filtrés par salarié, matricule et période, regroupés par salarié ; impression et export | BULLETIN |
| Variables du mois | saisie en grille des heures, primes et retenues | élements de salaires (colonnes de saisie) |
| Traitements de paie | calcul par lot, contrôle, validation, impression de tous les bulletins | BULLETIN + macros VBA |
| Bulletin | maquette fidèle, cumuls période/année, montant en lettres, impression / PDF | BULLETIN |
| Simulateur net / brut | simulation sans enregistrement, recherche du sursalaire pour un net cible | macro Valeur_Cible |
| États et déclarations | livre de paie en 7 blocs avec cumuls annuels validés (TRIMF, IPRES RG/RC, provisions congé et précarité), cotisations, charges patronales, écritures comptables ; en-têtes figés, sous-totaux, contrôles de cohérence, export CSV, impression paysage | livre de paie, états, compta |
| Paramètres | rôles, taux et plafonds, barèmes IR/TRIMF, rubriques, grilles conventionnelles, société ; référentiels RH (emploi, type de contrat, convention, catégorie, mode de paiement) avec activation et journal | PARAMETRES |

## Base de données

Migrations dans `db/migrations/` (appliquées sur la base locale) :

| Fichier | Contenu |
|---|---|
| `…170000_core_hr.sql` | sociétés, départements, emplois, conventions, grilles, salariés, congés, présences |
| `…170100_payroll_schema.sql` | paramètres, barèmes IR/TRIMF, rubriques, structures, affectations, variables, traitements, bulletins |
| `…170200_security_rls.sql` | rôles `admin / rh / paie / salarie`, RLS sur toutes les tables |
| `…170300_payroll_engine.sql` | `compute_salary_slip`, `calculate_salary_slip`, `run_payroll_entry`, `solve_sursalaire_for_net`, IR, TRIMF, indemnités |
| `…170400_reference_data.sql` | taux, barèmes, 39 rubriques, 11 conventions et 254 catégories issus de PARAMETRES |
| `…170500_reports.sql` | vues livre de paie, cotisations, journal comptable, cumuls, soldes de congés ; `hr_dashboard` |
| `…170600_service_context.sql` | traitements serveur (clé service / console SQL) |
| `…170700_admin_users.sql` | gestion des comptes par l'administrateur |
| `…180000_delete_payroll_entry.sql` | suppression d'une paie mensuelle (validée : administrateur uniquement) |
| `…29090000_lot1_provisions_cumuls.sql` | provision précarité du mois ; cumuls annuels validés dans `v_payroll_register` et `v_salary_slip_ytd` |
| `…29120000_lot2_dashboard_annuel.sql` | `hr_dashboard` enrichi ; `hr_dashboard_year` (traitements validés, 12 mois) |
| `…29140000_lot3_presences.sql` | heures de maladie, contrôle 24 h par jour, traçabilité, report dans la paie |
| `…29160000_lot6_matricule.sql` | séquence et déclencheurs du matricule, `preview_employee_number`, `admin_change_employee_number`, `audit_log` |
| `…29180000_lot7_referentiels.sql` | `contract_types`, `payment_modes`, activation / journal des référentiels ; le moteur lit la nature du contrat dans le référentiel |
| `…30100000_durcissement_triggers.sql` | fonctions de déclencheur retirées de l'API |
| `…30110000_presences_dans_paie.sql` | `run_payroll_entry` reprend d'abord les présences (absences, maladie, heures sup.) dans les variables du mois |

**Impressions** : bon de congé (fenêtre de la demande), fiche salarié complète, livre de paie mensuel au modèle Sage (`/paie/:id/livre`, 7 salariés par page A4 + colonne Total).

Après chaque modification du moteur, le contrôle de non-régression recalcule les 25 bulletins d'août 2026
avec les valeurs du classeur (voir [l'analyse](docs/ANALYSE_EXCEL.md#3-validation-du-moteur-soma-rh)).

`db/seed/` contient la reprise des 26 salariés et des variables d'août 2026 (données personnelles :
exclu de Git par `.gitignore`).

### Correspondance avec Frappe HR

| Frappe HR (DocType) | SOMA-RH (table) |
|---|---|
| Company, Department, Designation | `companies`, `departments`, `designations` |
| Employee Grade | `employee_grades` (+ `collective_agreements`) |
| Employee | `employees` |
| Leave Type, Leave Allocation, Leave Application | `leave_types`, `leave_allocations`, `leave_applications` |
| Attendance | `attendance` |
| Salary Component | `salary_components` |
| Salary Structure, Salary Structure Assignment | `salary_structures`, `salary_structure_components`, `salary_structure_assignments` |
| Income Tax Slab | `tax_slabs`, `tax_slab_brackets`, `ir_family_reductions`, `trimf_brackets` |
| Additional Salary | `additional_salaries` (+ `payroll_inputs` pour les heures) |
| Payroll Entry | `payroll_entries` |
| Salary Slip (+ Salary Detail) | `salary_slips`, `salary_slip_details` |

## Outils pour Claude Code

* `.claude/skills/` : skills installés pour ce projet — `supabase-postgres-best-practices`,
  `graphify`, `frontend-design`, `ui-ux-pro-max`, `ui-styling`, `design-system`, `web-design-guidelines`,
  `vercel-react-best-practices`, `vercel-composition-patterns`, `deploy-to-vercel`, `vercel-cli-with-tokens`,
  `webapp-testing`, `xlsx`.
* `.claude/settings.json` : active le plugin officiel `vercel@claude-plugins-official` (Claude Code propose de
  l'installer à l'ouverture du projet ; sinon `/plugin install vercel@claude-plugins-official`).
* Graphify a besoin de son outil en ligne de commande sous Windows : `scripts\setup-skills.ps1`, puis
  `/graphify .` dans Claude Code pour générer la carte du code (`graphify-out/`).

## Documentation

* [Analyse du classeur Excel](docs/ANALYSE_EXCEL.md) : feuilles, formules, barèmes, macros, validation, anomalies.
* [Arbitrages des règles de paie](docs/ARBITRAGES_PAIE.md) : transport, IPM prestataires, indemnité de licenciement, arrondis (D10).
* [Feuille de route](docs/FEUILLE_DE_ROUTE_SOMA_RH.md) : état réel, benchmark (Frappe HR, OrangeHRM, Odoo, Sage), angles morts, architecture cible, lots 0 à 8, décisions à valider.
