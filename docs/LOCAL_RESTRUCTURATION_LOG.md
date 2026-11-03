# Journal de restructuration locale

## 2026-10-31 — démarrage de la Phase 0

### Décisions

- périmètre : une entreprise SOMA, Sénégal, environnement local ;
- infrastructure : PostgreSQL Docker + PostgREST + API JWT locale ;
- données personnelles migrées conservées uniquement dans la base locale, jamais dans Git ;
- aucune modification du moteur de paie dans cette phase ;
- priorité : reproductibilité, tests, sauvegarde/restauration et preuves.

### Livrables créés

- `docs/CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` ;
- `docs/LOCAL_SETUP.md` ;
- `docs/LOCAL_TEST_MATRIX.md` ;
- `docs/LOCAL_RESTRUCTURATION_LOG.md` ;
- `scripts/local-health.ps1` ;
- `scripts/local-backup.ps1` ;
- `scripts/local-restore.ps1` ;
- `scripts/local-reset.ps1`.

### Commandes et preuves

| Commande | Résultat |
|---|---|
| `docker compose ps` | services locaux actifs lors de la validation de connexion |
| `Set-Location web; npm run build` | succès validé |
| `.\scripts\local-health.ps1` | PostgreSQL, pgAdmin, frontend et lecture de la base : PASS |
| `Set-Location web; npm run lint` | 0 erreur, 2 avertissements Fast Refresh préexistants |
| `.\scripts\local-backup.ps1` | sauvegarde locale créée dans `backups/`, exclue de Git |
| restauration isolée du dump dans `soma_rh_restore_check` | restauration réussie, 27 salariés lisibles, base temporaire supprimée |
| test navigateur signup/login local | JWT créé, application ouverte, compte de test supprimé |
| `graphify update .` | graphe actualisé après documentation |
| `git diff --check` | avertissements de fin de ligne uniquement, aucune erreur de whitespace |

### Reste à exécuter

- exécuter la matrice P0 complète ;
- tester une restauration sur une base isolée ;
- industrialiser le rejeu de `LOCAL_PAYROLL_VALIDATION.md` ;
- décider GO/NO-GO pour la migration des périodes de paie.

## Règle de suivi

Chaque phase doit ajouter ses commandes, résultats, écarts et décisions dans ce journal. Une phase ne peut pas être déclarée terminée uniquement parce que le code compile.

## 2026-10-31 — démarrage de la Phase 1

### Migration appliquée

- `supabase/migrations/20261031190000_payroll_period_governance.sql`
- `supabase/migrations/20261031191000_payroll_governance_fix.sql`

### Fonctionnalités livrées côté base

- `payroll_periods` avec statuts et verrouillage ;
- `payroll_anomalies` ;
- `payroll_approvals` ;
- `payroll_snapshots` avec empreinte MD5 ;
- `audit_events` ;
- transitions contrôlées `En revue`, `Approuvée`, `Validée`, `Payée`, `Clôturée`, `Réouverte`, `Annulée` ;
- blocage des modifications d'une paie clôturée ;
- réouverture administrateur avec motif obligatoire ;
- suppression interdite après revue/approbation/validation/paiement/clôture.
- garde contre les changements directs de statut vers `Payée`, `Clôturée` ou `Réouverte`.

### Preuves exécutées

| Contrôle | Résultat |
|---|---|
| application de la migration avec `ON_ERROR_STOP=1` | PASS |
| reprise des 5 traitements existants vers `payroll_periods` | PASS |
| chaîne transactionnelle complète jusqu'à `Clôturée` | PASS |
| snapshot créé pendant la clôture | PASS |
| mutation d'une paie clôturée refusée | PASS |
| réouverture avec motif | PASS |
| changement direct vers `Payée` refusé par trigger | PASS |
| rollback des essais | PASS, aucune donnée métier de production modifiée |
| `supabase --version` | outil absent ; génération automatique des types à prévoir avant l'UI Phase 1 |
| `Set-Location web; npm run build` après migration | PASS |
| `docker compose build postgres` | PASS, les migrations Phase 1 sont incluses dans l'image |

### État de phase

**GO conditionnel pour l'interface Phase 1.** Le socle de gouvernance SQL est validé. Il reste à générer les types locaux, construire l'écran de suivi des périodes/anomalies et brancher les actions d'approbation sur l'interface.

## 2026-10-31 — interface Phase 1

### Livraisons

- ajout de l'écran [`PayrollGovernancePage.tsx`](../web/src/pages/PayrollGovernancePage.tsx) ;
- ajout de la route `/paie/gouvernance` et du lien de navigation « Contrôle et clôture » ;
- affichage des traitements, progression des statuts, anomalies et approbations ;
- transitions déclenchées uniquement par `transition_payroll_entry` ;
- blocage visuel d'une clôture lorsqu'une anomalie bloquante reste ouverte ;
- complétion des types locaux des tables et fonctions de gouvernance.

### Preuves

| Contrôle | Résultat |
|---|---|
| `Set-Location web; npm run build` | PASS |
| `Set-Location web; npm run lint` | PASS, 2 avertissements Fast Refresh préexistants |
| `git diff --check` | PASS, uniquement avertissements de conversion de fin de ligne |
| services locaux `5173`, `8000`, `3001`, `5432` | PASS, ports en écoute |

La validation navigateur Playwright n'a pas pu être exécutée dans cet environnement car le module Python `playwright` n'est pas installé. Le build et les contrôles statiques passent ; un test navigateur reste à exécuter dans l'environnement équipé avant le GO final de la phase.

## 2026-10-31 — compatibilité compte administrateur local

### Corrections

- ajout de la migration [`20261031185300_local_auth_compatibility.sql`](../supabase/migrations/20261031185300_local_auth_compatibility.sql) ;
- remplacement de la lecture de `auth.users.last_sign_in_at`, colonne absente de l'auth locale, par une valeur nulle compatible avec l'interface ;
- attribution idempotente des rôles `admin`, `rh`, `paie` et `salarie` au compte `mdiene@gmail.com` ;
- mise à jour du type frontend pour accepter une dernière connexion nulle.

### Preuves

| Contrôle | Résultat |
|---|---|
| migration appliquée sur `soma_rh` | PASS |
| `admin_list_users()` sous le contexte de `mdiene@gmail.com` | PASS, `{admin,paie,rh,salarie}` |
| `python -m pip install playwright` | PASS |
| `python -m playwright install chromium` | PASS |
| smoke test Playwright de la page locale | PASS |
| build frontend | PASS |
| lint frontend | PASS, 2 avertissements Fast Refresh préexistants |

## 2026-10-31 — correction permission `auth` pendant la validation de paie

### Cause

Les RPC `transition_payroll_entry`, `create_payroll_snapshot` et `delete_payroll_entry`
étaient exécutées en droits de l'appelant. Le rôle `authenticated` pouvait donc
atteindre le code qui appelle `auth.uid()` sans avoir de privilège sur le schéma
local `auth`, ce qui provoquait `permission denied for schema auth`.

### Correction

- ajout de [`20261031185900_payroll_rpc_security_definer.sql`](../supabase/migrations/20261031185900_payroll_rpc_security_definer.sql) ;
- passage des trois RPC en `SECURITY DEFINER` ;
- conservation des contrôles métier `has_role(...)` et de l'acteur `auth.uid()` ;
- aucun privilège direct accordé à `authenticated` sur le schéma `auth`.

### Preuves

| Contrôle | Résultat |
|---|---|
| transition `Calculée → En revue` sous rôle `authenticated` avec compte admin | PASS, rollback |
| clôture avec création de snapshot sous rôle `authenticated` | PASS, rollback |
| accès direct `authenticated` au schéma `auth` | reste refusé |

## 2026-10-31 — correction du chemin historique de validation

### Cause complémentaire

Le bouton « Valider la paie » de [`PayrollEntryPage.tsx`](../web/src/pages/PayrollEntryPage.tsx)
appelait encore `submit_payroll_entry`, et non la nouvelle RPC de gouvernance.
Cette ancienne fonction était restée en `SECURITY INVOKER` et appelait `auth.uid()`
dans le contexte `authenticated`, d'où la même erreur de permission.

### Correction

- ajout de [`20261031190200_legacy_payroll_rpc_security.sql`](../supabase/migrations/20261031190200_legacy_payroll_rpc_security.sql) ;
- passage de `submit_payroll_entry` et `cancel_payroll_entry` en `SECURITY DEFINER` ;
- conservation des contrôles de rôle et des droits `EXECUTE` limités à `authenticated`.

### Preuve

| Contrôle | Résultat |
|---|---|
| appel de `submit_payroll_entry` avec rôle `authenticated` et compte administrateur | PASS, rollback |

## 2026-10-31 — réintégration des lots GitHub

### Analyse

La branche GitHub `main` contenait des lots fonctionnels absents de la version locale
initialement utilisée pour la migration :

- portail salarié « Mon espace » et demandes salariés ;
- suivi du paiement des salaires par espèces, chèque et mobile money ;
- page Pilotage RH ;
- planning des postes et rotations ;
- comparaison de paie et prévisions ;
- autorisation du rôle RH pour préparer/calculer une paie.

Les commits et migrations ont été comparés avant intégration. Les adaptations
locales de connexion PostgreSQL, de gouvernance de paie, d'authentification locale
et de sécurité RPC ont été conservées.

### Livraisons intégrées

- routes et pages `MonSpacePage`, `RequestsPage`, `PayrollPaymentsPage`,
  `PilotagePage`, `PlanningPage` et `JournalPage` ;
- composants de paiement, prévision, attestations et extensions du traitement ;
- migrations GitHub des lots 0, 1, 2, 3, 5 et 6 ;
- migration locale [`20261031191500_feature_compatibility.sql`](../supabase/migrations/20261031191500_feature_compatibility.sql)
  pour rendre la génération de rotations compatible avec les tables déjà présentes ;
- maintien de l'écran local de gouvernance `/paie/gouvernance`.

### Compatibilité PostgreSQL local

La base locale possédait déjà certaines tables issues de la migration de
compatibilité. Les migrations ont donc été appliquées sans recréer les données,
et les fonctions manquantes ont été complétées idempotemment. La fonction
`business_audit()` du lot d'audit a été installée avant le déclencheur des
demandes salariés.

### Preuves

| Contrôle | Résultat |
|---|---|
| build frontend | PASS |
| lint frontend | PASS, 3 avertissements Fast Refresh préexistants |
| `employee_requests` | présente |
| `salary_payments` | présente |
| `hr_analytics(integer)` | présente |
| `generate_rotation(...)` | présente |
| données locales | conservées, aucune remise à zéro |

## 2026-10-31 — correctifs comparaison et paiement

### Incidents

- `Could not find the function public.payroll_entry_comparison(p_payroll_entry_id) in the schema cache` :
  la fonction existait en base mais avait été créée après le dernier chargement du
  cache PostgREST ;
- `permission denied for schema auth` lors du marquage payé :
  le trigger `salary_payments_touch()` était encore en `SECURITY INVOKER` et
  appelait `auth.uid()` dans le contexte `authenticated`.

### Correction

- ajout de [`20261031192400_payroll_feature_rpc_security.sql`](../supabase/migrations/20261031192400_payroll_feature_rpc_security.sql) ;
- passage de `payroll_entry_comparison`, `hr_analytics`, `generate_rotation` et
  `salary_payments_touch` en `SECURITY DEFINER` ;
- notification `pgrst, 'reload schema'` envoyée après la migration ;
- aucun privilège direct accordé à `authenticated` sur le schéma `auth`.

### Preuves

| Contrôle | Résultat |
|---|---|
| appel HTTP PostgREST `payroll_entry_comparison` avec JWT admin | HTTP 200 |
| transition `Validée → Payée` sous `authenticated` | PASS, rollback |
| écriture `salary_payments` sous `authenticated` | PASS, rollback |
| Playwright sur les routes paie, gouvernance, paiement et lots RH | PASS, 0 erreur navigateur |

## 2026-10-31 — signalétique visuelle des périodes clôturées

- ajout d'un bandeau contrasté « PÉRIODE CLÔTURÉE — OPÉRATIONS BLOQUÉES » dans la gouvernance ;
- contraste réduit et fond grisé sur la ligne clôturée ;
- bouton « Actions verrouillées » désactivé pour rendre l'absence d'opération immédiatement visible ;
- ajout du même état « PAIE CLÔTURÉE — LECTURE SEULE » sur le détail du traitement ;
- build, lint et smoke test Playwright validés.

### Suite proposée

Passer à la validation métier de bout en bout avec le compte administrateur :
ouvrir une paie calculée, la faire progresser jusqu'à `Clôturée`, vérifier le
bandeau et l'absence d'action, puis tester une réouverture explicitement motivée.

## 2026-11-02 — démarrage Phase 2 : régression paie et RLS

- ajout de `scripts/local-payroll-validation.ps1` ;
- le rejeu est non destructif et ne restitue que des agrégats ;
- RLS validée pour administrateur, anonyme, utilisateur sans rôle et salarié isolé ;
- l'écart de référence Excel est détecté explicitement : 26 bulletins locaux
  contre 25 attendus, brut `5 017 834,60` contre `4 929 179,09`, net
  `4 765 432,33` contre `4 662 739,89` ;
- un salarié n'a pas d'affectation de structure au 01/08/2026 ;
- décision : **NO-GO Phase 2**, investigation des fixtures/données requise avant
  le portail ESS/MSS.

## 2026-11-02 — analyse approfondie du périmètre

- correction du contrôle : la fiche sans structure est inactive et hors
  périmètre ; les 26 actifs ont une structure applicable ;
- l'écart reste 26 actifs locaux contre 25 bulletins Excel ;
- ajout de l'analyse sans données personnelles dans
  `docs/LOCAL_PAYROLL_SCOPE_ANALYSIS.md` ;
- ajout de 25 cas synthétiques dans
  `tests/fixtures/payroll/phase2-synthetic-cases.json` ;
- aucune exclusion automatique n'est appliquée : le roster source anonymisé
  est requis pour identifier la ligne supplémentaire.
- exécution non destructive des 25 fixtures sur `compute_income_tax` et
  `compute_trimf` ajoutée dans `scripts/local-synthetic-fixture-validation.ps1`.

## 2026-11-02 — lancement Phase 3 ESS/MSS, lot workflow des demandes

- ajout de la table `employee_request_history` avec RLS et index ;
- ajout de `decide_employee_request` : décision RH contrôlée, acteur et date ;
- motif obligatoire pour tout rejet ;
- retrait des mises à jour directes des demandes afin d'imposer le RPC et
  l'historique ;
- annulation salarié historisée ;
- interface RH adaptée pour appeler le RPC et bloquer la confirmation d'un
  rejet sans motif ;
- build et contrôles SQL à exécuter avant validation navigateur ;
- périmètre manager volontairement différé : aucune relation manager-équipe
  fiable n'existe encore dans le modèle local.

## 2026-11-02 — Phase 3, notifications et visibilité de l'historique

- ajout de `employee_notifications` avec RLS par `auth.uid()` ;
- une décision RH crée une notification destinée au compte lié à la fiche
  salarié ;
- ajout de l'affichage des notifications non lues dans `Mon espace` ;
- ajout de l'historique dépliable dans l'écran RH des demandes ;
- vérification transactionnelle : décision, historique et notification créés
  puis rollback ; la notification est invisible à un autre compte, comme
  attendu par la RLS.

## 2026-11-02 — Cadrage du dossier administratif salarié

- intégration de la proposition UX/UI « Mon Dossier Administratif » dans le
  cadre technique, le plan d'évolution et la feuille de route ;
- catalogue cible de 18 exigences en cinq sections : identité, qualification,
  famille/social, aptitude médicale et cas spécifiques ;
- décision d'architecture : exigences configurables, versions de documents,
  revue RH, stockage privé, URL temporaires, journal d'accès et PDF indexé ;
- séparation confirmée entre les droits salarié/RH et le périmètre manager ;
- ajout des contrôles ESS-014 à ESS-018 dans la matrice locale ;
- le développement est volontairement suspendu jusqu'à validation du catalogue,
  des conditions d'applicabilité et des durées de conservation.
