# SOMA-RH — Synthèse du corpus `docs\`

Version 1.0 — 3 novembre 2026. Produit par `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` (§6.1).

**Résumé**
1. Le corpus compte 31 fichiers ; la direction actuelle est portée par `FEUILLE_DE_ROUTE_NEXTGEN_SOMA_RH.md` (v1.1) et `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` (v0.2).
2. La « porte zéro » (26 bulletins au lieu de 25) n'est pas un défaut isolé : quatre documents donnent quatre définitions de l'oracle de paie, et le script de contrôle actuel ne compare plus à Excel.
3. Le socle (moteur, périodes gouvernées, RLS, demandes, coffre documentaire) existe ; audit chaîné, chiffrement des RIB, prêts et registre de congés par écritures n'existent pas.
4. Deux documents contiennent des erreurs factuelles vérifiées ici : `GAP_ANALYSIS_NEXTGEN_SOMA_RH.md` (le mien) et `ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md`.
5. Aucun chiffre légal n'est validé : tous restent « à confirmer » (§5).

## 0. Hypothèses de travail (session non surveillée)

Le prompt demande d'attendre la validation du diagnostic ; la session étant non interactive, j'applique la règle de repli du §8.1 du prompt.

| # | Hypothèse | Conséquence |
|---|---|---|
| H1 | Le diagnostic n'est pas validé par Moussa Diene | Les quatre autres documents en dépendent ; à relire avant tout développement |
| H2 | Aucune requête sur la base, aucun script exécuté | « Existe » = présent dans les migrations ou le code ; le catalogue PostgreSQL n'est pas vérifié |
| H3 | Le prompt de restructuration locale a déjà été exécuté | Son point 2 interdit de relancer la copie si le dossier existe ; il n'a pas été relancé |
| H4 | Les décisions D1 à D12 sont celles de `FEUILLE_DE_ROUTE_SOMA_RH.md` §10 (lignes 673-694) | Le prompt les nomme « v2.0 » ; le fichier porte « v2.1 » |

## 1. Inventaire du corpus

| Fichier | Date | Objet | Statut |
|---|---|---|---|
| `ANALYSE_EXCEL.md` | 31/10 | Règles du classeur, preuves de non-régression | À jour sur les règles ; ses chiffres « 25 bulletins » ne se rejouent plus (C1) |
| `ARBITRAGES_PAIE.md` | 31/10 | Décision D10 : trois règles Excel corrigées et paramétrées | À jour ; explique en partie la porte zéro (§4) |
| `FEUILLE_DE_ROUTE_SOMA_RH.md` | 02/11 | Analyse, lots 0-8, décisions D1-D12 | Partiellement périmée : « 16 pages », « 0 espace de stockage », « audit sur 5 tables » contredits par le code |
| `AUDIT_COMMERCIALISATION_SOMA_RH.md` | 02/11 | Verdict de commercialisation, risques, tests | À jour ; ses recommandations multi-tenant sont suspendues par sa propre §11 |
| `PLAN_EVOLUTION_SOMA_RH.md` | 02/11 | Canevas d'évolution, modèle de données | Doublon partiel de la feuille de route et de l'audit |
| `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` | 02/11 | Cadre local, gouvernance de paie, définition de « terminé » | À jour ; numérotation de phases propre (C6) |
| `GAP_ANALYSIS_NEXTGEN_SOMA_RH.md` | 02/11 | Écart avec le blueprint, phases 1-5 | Erreurs vérifiées (C5) |
| `ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md` | 02/11 | Vérification statique du précédent | Sérieuse ; deux affirmations contredites (C2, C3) |
| `FEUILLE_DE_ROUTE_NEXTGEN_SOMA_RH.md` | 03/11 | Décision d'architecture, phases 0-6 | **Référence courante** |
| `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` | 03/11 | Sage, Frappe HR, écarts, différenciation, invariants | **Référence courante** ; compte 9 captures, il y en a 10 |
| `LOCAL_PAYROLL_VALIDATION.md` | 03/11 | Validation paie locale | À jour ; contredit `CLAUDE.md` (C1) |
| `LOCAL_PAYROLL_SCOPE_ANALYSIS.md` | 03/11 | Périmètre actif, 26 vs 25 | À jour |
| `LOCAL_TEST_MATRIX.md` | 02/11 | Matrice de tests | PAY-001/003 « obligatoire » mais P2-003 = NO-GO |
| `LOCAL_RESTRUCTURATION_LOG.md` | 02/11 | Journal de restructuration | Lu par les titres seulement |
| `LOCAL_SETUP.md` | 31/10 | Installation locale | À jour ; ne mentionne ni `tests/` ni `.github/` |
| `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` | 03/11 | Prompt exécuté ici | — |
| `PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md` | 03/11 | Prompt de restructuration | Déjà exécuté ; titre « # c » (anomalie) |
| `PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.v1.md` | 03/11 | Version précédente | **Doublon** : seule la ligne de titre diffère (`diff`) |
| `captures-frappe-hr/` (10 images + README) | 03/11 | Gabarits d'écran Frappe HR | À jour ; captures de la documentation en ligne, données de démonstration en roupies |
| `video-captures/sage-paie-rh-1/` (2 images) | 03/11 | Captures d'une vidéo YouTube Sage | Champs illisibles ; contiennent l'interface YouTube du compte du propriétaire |

## 2. État réel par domaine

**C** confirmé dans le code (relu) · **C\*** confirmé par un document qui cite le code, non relu ligne à ligne · **NC** non confirmé · **X** contredit.

| Domaine | Ce que disent les documents | Verdict | Preuve |
|---|---|---|---|
| Calcul | `compute_salary_slip` fidèle à Excel, paramètres datés | **C\*** existence ; **X** « fidèle à Excel aujourd'hui » | `20261028170300_payroll_engine.sql` ; D10 change trois règles par défaut |
| Périodes | Statuts, transitions, garde-fous | **C** | `payroll_periods`, `payroll_entries_transition_guard`, `guard_payroll_validation`, `transition_payroll_entry` |
| Snapshots | « snapshot hashé » | **C** avec réserve | `payroll_snapshots.payload_hash = md5(...)` (`20261031190000…sql:227`) : MD5, pas SHA-256 |
| Présences | Grille, planning gardiens | **C** | `attendance`, `work_posts` |
| Congés | Demandes, soldes | **C** demandes ; registre par écritures **NC** | `leave_applications` ; aucune table de registre |
| Prêts | Échéancier (Frappe HR) | **NC** | aucune table `loans` |
| Acomptes | « Par demande » | **NC** | via `employee_requests` selon `ANALYSE_SAGE`, non relu |
| Règlement | Espèces, chèque, mobile money | **C** | `salary_payments` (déclarée deux fois, C9) |
| Comptabilité | Journal équilibré | **C\*** | `v_accounting_journal` ; équilibre non rejoué |
| Audit | Avant/après ; hash | **C** existence ; hash **NC** | `audit_log` et `audit_events` ; `business_audit()` |
| Sécurité | RLS, 4 rôles | **C\*** | `20261028170200_security_rls.sql` ; aucun `FORCE ROW LEVEL SECURITY` |
| Portail salarié | Demandes, notifications, manager, documents | **C** | `employee_requests`, `employee_notifications`, `employee_manager_assignments`, `employee_documents` |
| États | Livre de paie, cotisations, journal, cumuls | **X** pour « 0 vue » | 5 vues dans `20261028170500_reports.sql` |
| CI | Régression paie en CI | **X** | `ci.yml` : `npm ci`, `lint`, `build` seulement |

## 3. Contradictions et zones d'ombre (par risque décroissant)

| # | Risque | Contradiction | Résolution proposée |
|---|---|---|---|
| **C1** | Critique | **Quel est l'oracle de paie ?** (a) `CLAUDE.md` et `LOCAL_TEST_MATRIX` PAY-001/003 : l'Excel d'août 2026 est obligatoire. (b) `LOCAL_PAYROLL_VALIDATION` : il « n'est plus l'oracle obligatoire ». (c) `ARBITRAGES_PAIE` : « ne peut plus être rejoué ». (d) `FEUILLE_DE_ROUTE_NEXTGEN` : « à recalibrer ». | Deux niveaux : **fidélité** (paramètres D10 à « excel », fixture de 25 cas, tolérance 1e-6 F) et **cohérence interne** (roster actif courant). Mettre `CLAUDE.md` à jour après décision du propriétaire. |
| **C2** | Élevé | `ANALYSE_COMPARATIVE` §2.5 dit que le script vérifie les totaux Excel et échoue. Le script lu (`local-payroll-validation.ps1`) ne contient ni « 25 », ni « 4929 », ni « 4662 » : il compare bulletins stockés et salariés éligibles (PAY-000, 004, 005, 006). | Le script ne peut pas produire le FAIL cité ; le NO-GO vient de `LOCAL_TEST_MATRIX` P2-003. À faire : un script qui compare réellement. |
| **C3** | Moyen | `ANALYSE_COMPARATIVE` : « 0 vue trouvée ». | Faux : 5 vues. Corriger ce document. |
| **C4** | Élevé | D4 (30/10) : chiffrement des champs sensibles **reporté**. `FEUILLE_DE_ROUTE_NEXTGEN` Phase 2 et `GAP_ANALYSIS` P1-05 l'engagent. | Remise en cause explicite de D4 (document 5). |
| **C5** | Moyen | `GAP_ANALYSIS` (le mien) : « aucun stockage de fichiers » (le coffre existe) ; « audit sur 5 tables » (≥ 10) ; garde-fou nommé `payroll_transition_guard` (réel : `payroll_entries_transition_guard`) ; `employee_assignments` en collision de nom avec `employee_manager_assignments` ; `btree_gist` et `pg_cron` absents de l'image Docker. | Corriger avant de le citer. |
| **C6** | Moyen | Numérotation des phases : `CADRE` 0-7 ; `FEUILLE_NEXTGEN` 0-6 (SaaS = 6) ; `GAP_ANALYSIS` 1-5 (SaaS = 5) ; `FEUILLE_SOMA_RH` lots 0-8 ; `AUDIT` 0-3. | La feuille de route v3 utilise des **lots L0, L1…** sans réutiliser « phase ». |
| **C7** | Moyen | Deux journaux d'audit : `audit_log` et `audit_events`. | Question Q2 ; ne pas créer un troisième journal. |
| **C8** | Faible | `ANALYSE_SAGE` : 9 captures Frappe ; dossier : 10. | Corriger. |
| **C9** | Faible | `employee_requests`, `work_posts`, `salary_payments` déclarées dans la migration d'origine **et** dans `source_schema_compat`. | Vérifier que les définitions sont identiques. |
| **C10** | Faible | `ARBITRAGES_PAIE` (30/10) : « aucun bulletin enregistré » ; 26 bulletins stockés au 03/11. | Probablement chronologique ; à confirmer par requête. |
| **C11** | Faible | `payload_hash` en MD5. | Détecte une erreur, pas une falsification ; SHA-256 au chantier d'audit. |
| **C12** | Faible | `video-captures` contient l'interface YouTube (avatar, notifications) du propriétaire. | Remplacer par des captures sans compte avant tout partage. |

## 4. Porte zéro — 26 bulletins au lieu de 25

**Faits**
- `ANALYSE_EXCEL.md` l. 4 : « 25 salariés payés (**26 fiches**) » ; l. 104 : le matricule S0026 est dans la fiche mais **absent du calcul d'août**.
- Aujourd'hui : 27 fiches, 26 actives, 26 avec structure au 01/08/2026 ; brut 5 017 834,60 F ; net 4 765 432,33 F (`LOCAL_PAYROLL_SCOPE_ANALYSIS.md`).
- Écart brut : 5 017 834,60 − 4 929 179,09 = **88 655,51 F**. Écart net : 4 765 432,33 − 4 662 739,89 = **102 692,44 F**.

**Observation clé** : l'écart de net dépasse l'écart de brut. Un seul bulletin ajouté ne suffit donc pas à l'expliquer (sauf éléments hors brut).

**Hypothèses (non testées)**

| # | Hypothèse | Pourquoi plausible |
|---|---|---|
| a | S0026 a reçu une structure et est payé | `ANALYSE_EXCEL` l. 104 ; « 0 actif sans structure » aujourd'hui |
| b | Les corrections D10 sont actives par défaut (`allowance_absence_basis='hours'`, `ipm_on_contractors=false`, `severance_basis='average12'`) | `ARBITRAGES_PAIE` : l'équivalence avec Excel n'est garantie que si les trois valent « excel » |
| c | La date d'entrée de S0021 a été modifiée (ancienneté 5 ans au lieu de 2) | `ANALYSE_EXCEL` l. 78 : le contrôle d'origine la remettait dans une transaction annulée |
| d | Variables d'août (absences, heures) modifiées depuis | Non documenté |

**Vérification (dans une transaction annulée)**
1. Paramètres D10 à « excel », date d'entrée de S0021 comme dans le classeur, S0026 exclu : calculer août et comparer 17 montants.
2. Si l'écart persiste, réintroduire **une hypothèse à la fois** pour isoler la contribution de chacune.
3. Consigner le résultat dans `LOCAL_PAYROLL_VALIDATION.md` (matricules techniques et agrégats seulement).

**Critère de sortie** : une fixture de 25 cas reproduit les 17 montants à moins de 1e-6 F, **ou** le propriétaire redéfinit la référence par écrit ; le script de contrôle compare réellement aux valeurs attendues ; le tout tourne en CI sur base neuve et base restaurée.

## 5. Chiffres légaux — à confirmer

Aucun n'est validé. Le code ne les contient que comme paramètres datés et versionnés.

| Valeur citée | Source citée | À confirmer par | Échéance |
|---|---|---|---|
| IPRES RG : min(brut ; 432 000), 14 % (5,6 % salarié, 8,4 % patronal) | `ANALYSE_EXCEL.md` (classeur) | Comptable / IPRES | Avant tout changement de plafond |
| IPM : min(brut ; 10 000), 50/50 | `ANALYSE_EXCEL.md` | Comptable | Idem |
| Précarité CDD : 7 % | `ANALYSE_EXCEL.md` | Juriste | Avant toute sortie de CDD |
| Licenciement 25/30/40 %, retraite 25/30/45/50 % ; D10 : moyenne sur 12 mois | `ANALYSE_EXCEL.md`, `ARBITRAGES_PAIE.md` | Juriste, convention collective | Avant la première sortie |
| 173,33 h/mois | `ANALYSE_EXCEL.md` | Juriste | — |
| Plafonds, taux CSS, IPRES, CFCE de NotebookLM | `ANALYSE_SAGE` §0, §4 | Comptable | **Non vérifiés : ne pas coder** |
| Déclarations « avant le 15 du mois » | `ANALYSE_SAGE` §4 (NotebookLM) | Organisme | Avant tout export |
| Barèmes IR, TRIMF, abattements | `ANALYSE_EXCEL.md` (720 cas rejoués contre le classeur) | Comptable | Rejoués contre Excel, **pas** contre un texte officiel |

Les valeurs du rapport de cadrage **Niger** collé précédemment ne sont pas applicables et ne figurent pas dans le dépôt.

## 6. Ce qui n'a pas été lu ou vérifié

- Lecture partielle : `LOCAL_RESTRUCTURATION_LOG.md` (titres), `FEUILLE_DE_ROUTE_SOMA_RH.md` (l. 1-230, 670-703), `AUDIT_COMMERCIALISATION` (§1, 4.8, 5.1, 8, 9, 11), `PLAN_EVOLUTION` (§5, 8, 9), `CADRE` (§5, 8, 9), `ANALYSE_EXCEL` (recherches ciblées).
- Aucune requête en base ; aucun script exécuté ; migrations relues par recherche ciblée ; numéros de ligne de `ANALYSE_COMPARATIVE` pris tels quels.
- Extensions réellement installées, comportement de PostgREST sur un schéma `app`, sauvegarde hors dépôt.

## Fichiers sources

`docs\` (31 fichiers, §1) ; `CLAUDE.md` ; `.github/workflows/ci.yml` ; `scripts/local-payroll-validation.ps1` ; `tests/fixtures/payroll/phase2-synthetic-cases.json` (présence) ; `supabase/migrations/*.sql` (48 fichiers, recherches ciblées) ; 12 images (10 Frappe HR, 2 Sage) ouvertes.
