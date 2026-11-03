# SOMA-RH — Feuille de route v3 (lots, tâches, étapes de réalisation)

Version 1.0 — 3 novembre 2026. Produit par `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` (§6.4, 6.5, 6.6).
S'appuie sur [SYNTHESE_CORPUS_DOCS.md](./SYNTHESE_CORPUS_DOCS.md) et [ARCHITECTURE_CIBLE_SOMA_RH.md](./ARCHITECTURE_CIBLE_SOMA_RH.md). Hypothèse H1 : le diagnostic n'est pas encore validé par le propriétaire.

**Résumé**
1. Dix lots **L0 à L9**, numérotés « lot » pour ne pas reprendre les « phases » des autres documents (C6). L0 = porte zéro.
2. Priorités actées respectées : gardiens 24 h/24 en L3, PWA dans les gabarits et L6 ; en attente : coffre documentaire (lot 4), déclarations IPRES/CSS, virements bancaires, SaaS multi-entreprise.
3. Estimation totale : **109 à 196 jours-personne** (un développeur + Claude Code), soit environ 6 à 10 mois ouvrés. Aucune donnée de vélocité n'existe dans le dépôt : ce sont des ordres de grandeur.
4. Une remise en cause de décision est proposée : **D4** (chiffrement des RIB, L4).
5. Chemin critique : L0 → L1 → L2 → L5 → L9 (L3 et L4 sont parallélisables avec L2/L5 si une seconde personne intervient).

## 1. Fonctionnalités : retenues, différées, écartées

Verdict pour chacune des 12 fonctionnalités de différenciation et des 8 idées propres de `ANALYSE_SAGE` §4 et §4.1, plus 3 suggestions justifiées par le corpus. **Valeur** : ★ gagne un client · ◦ confort. Effort S/M/L. Source de chaque ligne : `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` sauf mention.

| # | Fonctionnalité | Verdict | Valeur | Effort | Dépend de | Risque légal | Lot |
|---|---|---|:-:|:-:|---|---|---|
| 1 | Déclaration CSS + IPRES | **Différée** (D8) | ★ | L | formats officiels | Élevé | hors plan |
| 2 | IR + TRIMF avec explication du calcul | **Retenue** (explication) | ★ | M | L2 | Faible (règles déjà dans le moteur) | L5 |
| 3 | Paiement mobile money par API | **Différée** (suivi manuel conservé) | ★ | L | contrat opérateur | Moyen | L8 (simulation seule) |
| 4a | Planning 24 h/24 et bordereau d'heures | **Retenue** (D11) | ★ | M | L2 | Faible | L3 |
| 4b | Majorations de nuit des gardiens | **Différée** : décision du 30/10 « laissées telles quelles » | ★ | M | texte légal, décision | Élevé | remise en cause R3 |
| 5 | Multi-conventions | **Différée** (convention minière d'abord) | ★ | L | L9 | Élevé | après L9 |
| 6 | Portail mobile salarié (PWA) | **Retenue** | ★ | M | L1, gabarits | Faible | L6 |
| 7 | Congés légaux et majorations | **Différée** (textes à spécifier) | ◦ | M | registre L7 | Élevé | L7 (registre seul) |
| 8 | Contrôle CFCE | **Retenue** | ◦ | S | checklist L1 | Moyen | L1 |
| 9 | Solde de tout compte et certificat | **Retenue** | ★ | L | L2, L7 | Élevé (indemnités) | L7 |
| 10 | Écrêtement des plafonds sociaux | **Retenue** (paramètres) | ★ | S | L9 | Élevé (plafonds non vérifiés) | L9 |
| 11 | Dossier du personnel réglementaire | **Différée** (lot 4 en attente ; un coffre existe déjà, X3) | ◦ | M | décision documentaire | Moyen | hors plan |
| 12 | Registre de paie scellé + émargement | **Différée** | ◦ | M | L1 (audit chaîné) | Moyen | après L1 |
| 13 | Explication d'un montant (formule, base, taux) | **Retenue** | ★ | M | L9 partiel | Faible | L5 |
| 14 | Paie à blanc comparée à l'Excel | **Retenue** (processus) | ★ | S | L0 | Faible | L0, L1 |
| 15 | Régularisation par écritures | **Retenue** | ★ | L | L2 | Moyen | L2 |
| 16 | Registre de congés par écritures | **Retenue** | ★ | M | — | Moyen | L7 |
| 17 | Erreurs de clôture explicites | **Retenue** | ★ | S | L1 | Faible | L1 |
| 18 | Simulation avant génération des ordres de paiement | **Retenue** | ★ | M | L5 | Faible | L8 |
| 19 | Contribution employeur et coût total | **Retenue** | ◦ | S | L5 | Faible | L5 |
| 20 | Base de connaissances légale datée et sourcée | **Retenue** | ★ | L | sources légales | Élevé | L9 |
| S1 | Script d'oracle qui **compare réellement** aux valeurs attendues (origine : C2) | **Retenue** | ★ | S | — | Faible | L0 |
| S2 | Snapshots et audit en SHA-256 (origine : C11) | **Retenue** | ★ | S | — | Faible | L1 |
| S3 | Scan automatique de données personnelles en CI (origine : règle de `CLAUDE.md`) | **Retenue** | ★ | S | — | Faible | L0 |

**Écartées** : Kafka, Temporal, OPA, schéma par tenant, moteur Rust/Go (décisions d'architecture de `FEUILLE_DE_ROUTE_NEXTGEN` §1). Aucune IA n'est retenue pour décider ; l'explication d'un montant (13) est une formule affichée, sans IA.

## 2. Lots

Convention d'estimation : jours-personne, fourchette (basse = rien d'inattendu ; haute = un retour en arrière). Hypothèses : un développeur avec Claude Code, journées de 6 h productives, contrôle métier du propriétaire sous 3 jours.

### L0 — Porte zéro : fiabiliser la référence (5-10 j)

> **Révision du 3/11/2026 (Q1 tranchée)** : plus d'oracle Excel ni de 26≠25. L0-01 et L0-02 sont abandonnées ; L0-03 = `scripts/verify-payroll.ps1` (empreinte de non-régression, référence locale dans `backups/`) ; L0-05 = `scripts/scan-pii.sh` + job CI `pii-scan`. Restent : exécuter L0-03 base démarrée (`-Save` puis contrôle), L0-04 (CI avec base jetable, nécessite un seed synthétique car `supabase/seed/` n'est pas suivi), L0-06, commit de base.

| | |
|---|---|
| **Objectif** | Rendre toute modification du moteur mesurable. Résoudre 26 ≠ 25 (SYNTHESE §4). |
| **Inclus / exclus** | Inclus : oracle, CI, restauration. Exclus : tout nouveau développement. |
| **Prérequis** | Décision Q1 (quel roster) ; baseline Git propre (le dépôt a un état de travail non commité très large : à figer avant L0). |
| **Tâches** | L0-01 expérience d'isolation des 4 causes (transaction annulée). L0-02 fixture de 25 cas anonymisée avec empreinte des résultats. L0-03 script `verify-payroll` qui compare à des valeurs attendues (S1). L0-04 étape CI : base PostgreSQL jetable, migrations, seed synthétique, script. L0-05 CI : scan de données personnelles (S3) et de dépendances. L0-06 test de restauration rejoué en CI. L0-07 mise à jour de `CLAUDE.md`, `LOCAL_TEST_MATRIX.md`, `LOCAL_PAYROLL_VALIDATION.md` après décision. |
| **Livrables** | Fixture versionnée ; script ; workflow CI ; rapport sans données personnelles. |
| **Entrée** | Q1 répondue. |
| **Sortie** | Le script passe sur base neuve **et** base restaurée avec les mêmes résultats ; écart ≤ 1e-6 F sur la fixture ; toute divergence inexpliquée = NO-GO. |
| **Risques / repli** | La fixture ne reproduit pas les 17 montants : redéfinir la référence par décision écrite (D10 : « décision écrite et test de référence par point »). |

### L1 — Gouvernance renforcée et audit unique (10-18 j)

> **Avancement (3/11/2026)** : faits — L1-01 (contrôles de période restaurés et complétés), L1-02 (refus explicites et journalisés), L1-03 (séparation préparateur/approbateur + dérogation admin motivée), L1-04 (audit unique chaîné, snapshots en SHA-256), L1-05 (`scripts/export-audit.ps1`), L1-06 (page « Rapport de clôture »). L1-07 : le composant `Badge` existant tient lieu de StatusBadge ; aucun `ActionBar` créé (un seul consommateur). Non fait : contrôle CFCE (aucune colonne dédiée trouvée), PDF généré côté serveur (impression navigateur), snapshots chiffrés.

| | |
|---|---|
| **Objectif** | Empêcher une clôture incorrecte et expliquer chaque décision. |
| **Prérequis** | L0 ; Q2 (journal unique). |
| **Tâches** | L1-01 checklist de période (salariés, structures, variables, présences, congés, totaux, CFCE). L1-02 messages d'erreur explicites sur **tous** les refus de transition. L1-03 séparation préparateur ≠ approbateur (I4). L1-04 audit unique avec hash précédent et empreinte SHA-256 (I16, I18) ; `payroll_snapshots` en SHA-256. L1-05 `audit_verify()` + export de l'audit hors base. L1-06 rapport de clôture PDF. L1-07 composants `StatusBadge` et `ActionBar` (gabarits 1-2). |
| **Sortie** | Cycle à blanc complet : préparé, approuvé, validé, payé, clôturé, rouvert avec motif ; chaîne d'audit vérifiée ; aucun refus sans message. |
| **Risques / repli** | Migration du journal secondaire : Expand seul (garder l'ancien en lecture) ; contract après un cycle validé. |

### L2 — Salaire additionnel unifié, régularisation, prêts et acomptes (12-20 j)

> **Avancement (3/11/2026)** : fait — migration `20261103130000_l2_ajustements_paie.sql`. `compute_salary_slip` est inchangé ; `apply_period_adjustments` dépose avant chaque calcul les lignes dérivées dans `additional_salaries` (colonnes `kind`, `source_id`), de façon idempotente et sans bruit d'audit : éléments récurrents (`recurring_pay_items`), échéances de prêt (`loans`, `loan_installments`, rubrique `RET_PRET`) et régularisations après clôture (`payroll_corrections`, rubriques `REGUL_BRUT` / `RET_REGUL`). Une saisie manuelle prime sur une ligne dérivée. Écran « Prêts et régularisations » (`/paie/ajustements`). Test de propriété `tests/sql/l2_adjustments.sql` (T-I6, T-I7, T-I19, T-I20). L2-04 : aucun acompte à migrer (0 ligne `RET_AVANCE_*`, 1 demande d'acompte encore « Ouverte ») ; un prêt peut référencer une demande (`request_id`). Non fait : « remplacement de structure » par un élément récurrent ; un retard de retenue (mois annulé ou ignoré) est reporté en bloc sur la période suivante ; pas de plafond de retenue par rapport au net.

| | |
|---|---|
| **Objectif** | Un seul chemin vers le bulletin (I6, I7). |
| **Prérequis** | L0, L1. |
| **Tâches** | L2-01 étendre `additional_salaries` (`kind`, récurrence, dates, remplacement de structure). L2-02 `payroll_corrections` + RPC d'application sur période ultérieure. L2-03 `loans` et `loan_installments`, retenue automatique via L2-01 (I20). L2-04 migration des acomptes existants. L2-05 écran « salaire additionnel ». L2-06 tests de propriété (somme des échéances, idempotence). |
| **Sortie** | Une correction après clôture passe sans toucher le mois clos ; fixture L0 inchangée. |
| **Risques / repli** | Le moteur lit déjà `additional_salaries` : modifier le moteur le moins possible, ajouter des colonnes, pas de renommage. |

### L3 — Gardiens 24 h/24 : planning et bordereau d'heures (8-15 j) — priorité actée

> **REPORTÉ (3/11/2026, décision du propriétaire)** : les gardiens auront plus tard un système spécifique. L3 sort du plan courant ; aucun autre lot n'en dépend. Les majorations de nuit (R3 / Q10) restent hors périmètre.

| | |
|---|---|
| **Objectif** | Rotation et affectation par poste (D11), heures supplémentaires approuvées. |
| **Prérequis** | L2. |
| **Tâches** | L3-01 profils horaires et types de poste. L3-02 `overtime_sheets` approuvé par la RH → `additional_salaries`. L3-03 contrôle de repos entre vacations (alerte, pas blocage) tant que la règle légale n'est pas confirmée. L3-04 import de pointage par fichier. L3-05 état « présences par poste ». |
| **Exclus** | **Majorations de nuit** tant que la décision du 30/10 n'est pas rouverte (R3). |
| **Sortie** | Un mois de gardiens simulé de bout en bout, sans changer les totaux de la fixture L0. |

### L4 — Sécurité des données personnelles (12-20 j) — remet en cause D4

| | |
|---|---|
| **Objectif** | RIB et identifiants sensibles protégés ; RLS prouvée par rôle. |
| **Prérequis** | L0 ; décisions Q4 (gestion de la clé) et R1 (levée du report D4). |
| **Tâches** | L4-01 chiffrement `pgcrypto` des RIB avec clé hors dépôt (Expand puis backfill, comparaison des lectures par rôle). L4-02 vue de lecture masquée. L4-03 tests RLS exhaustifs : un cas par case de la matrice rôles × actions. L4-04 `FORCE ROW LEVEL SECURITY` après preuve. L4-05 alertes RIB avant clôture, branchées au garde-fou. |
| **Sortie** | RIB illisible sans clé ; tous les tests RLS verts ; restauration puis lecture OK. |
| **Risques / repli** | Perte de la clé = perte des RIB : procédure de sauvegarde de clé **avant** le backfill. |

### L5 — Gabarits d'écran, lot de paie, bulletin expliqué (10-18 j)

> **Avancement (3/11/2026)** : fait — migration `20261103150000_l5_bulletin_explique_lot_filtre.sql` : `salary_slip_explained` (cumul annuel par rubrique, coût employeur, « expliquer ce montant » reconstitué depuis base × quantité × taux), `run_payroll_batch` (lot filtré par type de contrat ou par salariés choisis, idempotent ; `run_payroll_entry` en devient le cas sans filtre). Écrans : bloc « Détail, cumuls annuels et coût employeur » sur le bulletin (paie et RH seulement), bouton « Calculer un lot… ». Test `tests/sql/l5_batch.sql`. L5-04 : l'éditeur de rubriques existe déjà (Paramètres > Rubriques de paie). Non fait : composants génériques `SectionedForm` / `DocumentSheet` / `FilterList` / `EditableTable` (aucun second consommateur), aperçu de structure avant affectation (L5-05), filtre par département (la table est vide).

| | |
|---|---|
| **Tâches** | L5-01 composants `SectionedForm`, `DocumentSheet`, `FilterList`, `EditableTable`. L5-02 lot de paie avec filtres et génération idempotente. L5-03 bulletin avec cumuls par composant, coût employeur et « expliquer ce montant ». L5-04 éditeur de rubriques en lecture d'abord. L5-05 aperçu de structure avant affectation. |
| **Sortie** | Les 9 gabarits de l'architecture ont un écran ; états chargement, vide, erreur, refus, mobile vérifiés. |

### L6 — Portail salarié et manager, workflows (12-22 j) — PWA actée

| | |
|---|---|
| **Tâches** | L6-01 workflow générique au-dessus de `employee_requests` (étapes, approbateur, délégation, délai). L6-02 notifications e-mail Gmail (D5) avec reprise sur erreur, journal. L6-03 calendrier d'équipe, périmètre manager. L6-04 attestations depuis modèles. L6-05 installation PWA et hors-ligne partiel. |
| **Sortie** | Congé à deux niveaux avec délégation ; décision idempotente ; e-mail rejoué sans doublon. |

### L7 — Congés par écritures et sortie (15-25 j)

| | |
|---|---|
| **Tâches** | L7-01 `leave_ledger`. L7-02 `v_leave_balances` lue depuis le registre. L7-03 `employee_exits` et `exit_statement_lines`. L7-04 certificat de travail. L7-05 recoupement avec la règle D10 d'indemnité (moyenne sur 12 mois). |
| **Sortie** | Soldes recalculables ; solde de tout compte validé par le comptable. |
| **Risque** | Élevé : indemnités. **Aucun taux n'est codé avant confirmation du juriste.** |

### L8 — Règlement : simulation et suivi (10-18 j)

> **Avancement (3/11/2026)** : fait — migration `20261103180000_l8_reglement.sql` (lecture seule) : `payment_summary` (ordres simulés au franc, contrôle I8 « total des ordres = total des nets à l'arrondi près », rapprochement par mode, anomalies : mode différent, paiement orphelin, compte bancaire manquant), `cash_breakdown` (billetage 10 000 → 1 F, par salarié et total), `payment_export` (contrat d'export : ordre, matricule, nom, mode, banque, compte, montant, devise XOF, reference, echeance). Panneau « Simulation des ordres et rapprochement » sur la page Paiements. Test `tests/sql/l8_reglement.sql`. Les nets étant décimaux, chaque ordre est arrondi au franc ; l'écart d'arrondi est affiché (limite : 0,5 F par ordre). Non fait : format bancaire officiel (BSIC, BNDE à valider), virements (D3), validation des coupures avec la caisse.

| | |
|---|---|
| **Tâches** | L8-01 simulation des ordres de paiement avant génération (I8). L8-02 billetage pour le paiement en espèces. L8-03 état de rapprochement chèque/espèces/mobile money. L8-04 contrat d'export bancaire abstrait, **sans format officiel** (BSIC, BNDE à valider). |
| **Sortie** | Total des ordres = total des nets, test automatique. |

### L9 — Règles versionnées (15-30 j)

| | |
|---|---|
| **Tâches** | L9-01 `rule_sets`, `rule_values` avec source, statut, approbation. L9-02 reproduire les paramètres actuels dans un jeu approuvé **sans changer le calcul**. L9-03 `rule_set_id` figé par bulletin. L9-04 lecture versionnée activée après comparaison avec la fixture. L9-05 écrêtements (#10) et base de connaissances légale (#20). |
| **Sortie** | Un ancien bulletin se recalcule à l'identique après changement de règle. |

### En attente (non planifié)
Coffre documentaire (lot 4 : décision X3), déclarations IPRES/CSS (D8), virements bancaires (D3), SaaS multi-entreprise (aucune décision écrite), équipements (D12, HSQE).

## 3. Calendrier indicatif et chemin critique

Hypothèse : 20 jours ouvrés par mois consacrés au projet.

| Lot | Jours | Cumul bas → haut | Mois indicatif |
|---|---|---|---|
| L0 | 5-10 | 5 → 10 | M1 |
| L1 | 10-18 | 15 → 28 | M1-M2 |
| L2 | 12-20 | 27 → 48 | M2-M3 |
| L3 | 8-15 | 35 → 63 | M3-M4 |
| L4 | 12-20 | 47 → 83 | M3-M5 |
| L5 | 10-18 | 57 → 101 | M4-M6 |
| L6 | 12-22 | 69 → 123 | M5-M7 |
| L7 | 15-25 | 84 → 148 | M6-M8 |
| L8 | 10-18 | 94 → 166 | M7-M9 |
| L9 | 15-30 | 109 → 196 | M8-M10 |

**Chemin critique** : L0 → L1 → L2 → L5 → L9. L3 (gardiens) et L4 (sécurité) peuvent se mener en parallèle de L2/L5 si une seconde personne intervient. **Lot en attente d'une décision de Moussa Diene** : L4 (R1/Q4), L9 (sources légales), L7 (indemnités).

## 4. Étapes de réalisation du code

### 4.1 Séquence type d'un lot
conception (fiche de ticket) → migration SQL → fonction de calcul ou politique RLS → RPC / API Node → composant React → tests (plan de contrôle) → revue → déploiement local → preuve consignée dans `LOCAL_RESTRUCTURATION_LOG.md`.

### 4.2 Conventions
- **Migrations** : `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`, **Expand puis Contract** (jamais de `drop` dans la même livraison), chacune accompagnée d'une procédure de retour arrière (script `down` ou restauration du dump). Nouvelle table : RLS activée, politiques par rôle (`has_role`), index sur chaque clé étrangère.
- **Montants** : `numeric` en base ; arrondi à l'affichage seulement (`fcfa()`).
- **Paramètres légaux** : jamais en dur ; lignes datées dans `payroll_settings` puis `rule_sets` ; chaque valeur porte sa source et son statut.
- **Nommage** : tables et colonnes en anglais `snake_case` (comme l'existant) ; libellés d'interface en français.
- **Types** : régénérer `web/src/lib/database.types.ts` après chaque migration.
- **Graphe** : lancer `graphify update .` après modification (règle de `CLAUDE.md`).

### 4.3 Branches et revue
`main` protégée ; une branche par ticket `lot-N/<ticket>-<slug>` ; une migration par pull request ; la CI (lint, build, **paie**, scan de données personnelles) doit passer ; revue avec la liste : RLS, index, Expand/Contract, test de fixture, absence de donnée personnelle. **Prérequis** : le dépôt a aujourd'hui un grand nombre de fichiers modifiés ou non suivis ; figer un commit de base avant L0.

### 4.4 Ordre de construction de la bibliothèque de gabarits
1) `StatusBadge`, `ActionBar` (L1) → 2) `SectionedForm`, `DocumentSheet` (L2/L5) → 3) `FilterList`, `EditableTable` (L5). Chaque nouvel écran utilise la bibliothèque ; aucun écran n'est refait en bloc.

### 4.5 Règles de non-régression
- Aucun mois clos n'est modifié ; toute correction passe par une régularisation datée (I6, I15).
- Fixture L0 exécutée avant et après chaque migration touchant la paie.
- Pas de renommage de colonne ou de RPC utilisés par le frontend avant le Contract.

## Fichiers sources

`SYNTHESE_CORPUS_DOCS.md` ; `ARCHITECTURE_CIBLE_SOMA_RH.md` ; `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` (§4, 4.1, 6) ; `FEUILLE_DE_ROUTE_NEXTGEN_SOMA_RH.md` (§1, 3, 7, 8) ; `FEUILLE_DE_ROUTE_SOMA_RH.md` (§10, D1-D12) ; `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` (§9) ; `ARBITRAGES_PAIE.md` ; `CLAUDE.md` ; `.github/workflows/ci.yml` ; état Git au démarrage de la session.
