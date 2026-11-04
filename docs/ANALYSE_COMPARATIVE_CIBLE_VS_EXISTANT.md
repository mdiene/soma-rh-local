# Analyse comparative — cible NextGen vs existant SOMA-RH

Date de l'audit : 2 novembre 2026  
Méthode : lecture statique du dépôt et des migrations présentes. Aucun `.env`, secret,
aucune donnée nominative et aucune écriture en base n'ont été utilisés.

## 1. Verdict en 10 lignes

1. La cible est réaliste comme feuille de route interne mono-société, mais pas comme description de l'état actuel.
2. Le socle PostgreSQL, PostgREST, RLS et le moteur PL/pgSQL existent réellement.
3. La gouvernance de paie existe partiellement : transitions, anomalies, approbations et snapshots sont présents.
4. Le test de référence d'août 2026 est réellement en échec : 26 salariés éligibles au lieu de 25.
5. Écart grave n°1 : le périmètre et les totaux de paie ne reproduisent pas la référence Excel.
6. Écart grave n°2 : l'audit métier existe, mais il n'est pas chaîné par hash et sa couverture n'est pas WORM.
7. Écart grave n°3 : les RIB sont stockés en `text`, sans chiffrement applicatif constaté.
8. Écart grave n°4 : `company_id` existe, mais les politiques RLS ne filtrent généralement pas par société.
9. Écart grave n°5 : les règles légales sont datées par fonction, mais non scopées par société/tenant et non versionnées par `rule_set`.
10. Les phases 1 à 3 sont faisables, sous réserve de préserver `compute_salary_slip` et de faire passer le test d'août avant/après chaque migration.

## 2. Inventaire factuel de l'existant

### 2.1 Taille et objets déclarés

Le dépôt contient 48 migrations SQL. Un comptage textuel des déclarations donne :

| Objet | Nombre déclaré | Preuve |
|---|---:|---|
| Tables (`create table`, y compris `if not exists`) | 51 | `supabase/migrations/*.sql`, scan des déclarations |
| Fonctions (`create function` / `create or replace function`) | 76 | même scan |
| Déclencheurs | 20 | même scan |
| Politiques RLS | 81 | même scan |
| Activations RLS | 51 | même scan |
| Vues déclarées dans les migrations | 0 trouvé par ce motif | les fonctions de reporting existent ; l'existence effective en base reste à interroger |

Ces nombres sont des déclarations dans les fichiers, non un `pg_catalog` de la base démarrée.
Les migrations initiales créent le cœur RH et paie (20261028170000_core_hr.sql:23-210,
20261028170100_payroll_schema.sql:10-265).

### 2.2 Autorisation et RLS

- Rôles applicatifs réellement déclarés : `admin`, `rh`, `paie`, `salarie`
  (20261028170200_security_rls.sql:7-18).
- Fonctions d'autorisation constatées : `has_role(text[])`, `my_employee_id()` et
  `claim_first_admin()` (20261028170200_security_rls.sql:20-60).
- `has_role` traite `admin` comme rôle englobant (20261028170200_security_rls.sql:20-35).
- RLS activée sur les tables cœur et paie (20261028170200_security_rls.sql:66-90).
- Plusieurs référentiels utilisent `using (true)` en lecture (20261028170200_security_rls.sql:102-126). C'est cohérent avec une seule société, mais ce n'est pas une isolation par `company_id`.
- Aucun `FORCE ROW LEVEL SECURITY` n'a été trouvé dans les migrations recherchées.
- Les politiques utilisent souvent `WITH CHECK` pour les écritures, mais aucune fonction `app.can()`,
  `app.current_roles()`, `app.current_employee()`, `app.is_my_report()` ou `app.mfa_active()` n'a été trouvée dans le dépôt.

**Conclusion :** RBAC et périmètre manager existent ; ABAC/PBAC, MFA dans la décision SQL et
RLS forcée ne sont pas livrés.

### 2.3 Sociétés et colonnes d'organisation

`companies.id` est référencé par `departments`, `employees`, `salary_structures`,
`payroll_entries` et `payroll_periods` (20261028170000_core_hr.sql:23-49,83-134;
20261028170100_payroll_schema.sql:94-101,175-193;
20261031190000_payroll_period_governance.sql:6-24).

`tenant_id` n'a pas été trouvé dans les migrations. Il n'y a pas de preuve d'un modèle
multi-tenant actuel. Cela confirme le périmètre mono-société des phases 1 à 4.

### 2.4 Audit et traçabilité

- `audit_log` est créé par le lot matricule, avec RLS de lecture
  (20261029160000_lot6_matricule.sql:15-33).
- `business_audit()` écrit `table_name`, `record_id`, `record_key`, `action`,
  `old_data` et `new_data` (20261030150000_lot0_audit_et_garde_periodes.sql:12-43).
- Les triggers du lot 0 couvrent `employees`, `salary_structure_assignments`, `payroll_inputs`,
  `additional_salaries`, `attendance`, `leave_applications`, `salary_slips`,
  `payroll_entries`, `payroll_settings` et `user_roles`
  (20261030150000_lot0_audit_et_garde_periodes.sql:45-59).
- `audit_events` est une seconde table de transitions de paie
  (20261031190000_payroll_period_governance.sql:102-129).
- Aucun `hash`, `previous_hash`, `audit_chain`, `audit_verify()` ou mécanisme WORM n'a été trouvé.

**État :** l'affirmation du document « audit non chaîné » est confirmée ; l'affirmation
« lot 0 couvre seulement cinq référentiels » est inexacte : le code montre dix tables
dans la boucle de triggers du lot 0.

### 2.5 Gouvernance de paie

Statuts de `payroll_entries` : `Brouillon`, `Calculée`, `En revue`, `Approuvée`,
`Validée`, `Payée`, `Clôturée`, `Réouverte`, `Annulée`
(20261031190000_payroll_period_governance.sql:35-43).

Garde-fous constatés :

- garde des mois futurs et des mois précédents non validés
  (20261030150000_lot0_audit_et_garde_periodes.sql:49-82) ;
- interdiction des `UPDATE` directs de statut
  (20261031192000_payroll_transition_guard.sql:3-18) ;
- transitions contrôlées par `transition_payroll_entry`
  (20261031192000_payroll_transition_guard.sql:20-83) ;
- anomalies, approbations, snapshot et audit de transition
  (20261031190000_payroll_period_governance.sql:62-129) ;
- contrôle `payroll_entry_checks` et blocage UI/SQL ajouté récemment
  (20261030170000_lot1_gouvernance_paie.sql:33-98,
  20261102201000_payroll_validation_guard.sql:1-31).

**Limite vérifiée :** le contrôle local local-payroll-validation.ps1:35-151
échoue actuellement : 26 bulletins éligibles, au lieu de 25, et totaux différents de la référence.
Le moteur n'est pas déclaré conforme tant que le roster de référence n'est pas réconcilié.

### 2.6 Demandes, notifications et managers

- `employee_requests` et les fonctions de décision/annulation existent
  (20261030200000_lot2_demandes_salaries.sql:6-35,
  20261102131500_phase3_employee_request_workflow.sql:35-82).
- `employee_notifications` et la décision de demande existent
  (20261102133000_phase3_request_notifications.sql:3-32).
- `employee_manager_assignments`, ses contrôles de chevauchement et ses politiques RLS existent
  (20261102140000_phase3_manager_team_scope.sql:8-107).
- Aucun système générique `workflow_definitions`, `workflow_instances`, `workflow_decisions`,
  `approval_delegations` ou `outbox_events` n'a été trouvé.

### 2.7 Paramètres légaux et moteur

`payroll_settings_at(date)` et `tax_slab_at(date)` existent
(20261028170300_payroll_engine.sql:34-62).
`compute_salary_slip` les appelle (20261028170300_payroll_engine.sql:64-250).

Le code prouve donc une lecture de tables paramétrées et datées, pas des constantes
uniquement en dur. En revanche, ces fonctions ne prennent pas de société/tenant et le
schéma `rule_sets`/`rule_values` n'existe pas.

### 2.8 Documents et stockage

- Les documents privés sont dans `employee_documents`, avec versions, chemin de stockage,
  miniature et slots familiaux (20261102173500_phase3_private_documents.sql:3-56,
  20261102193000_document_family_slots.sql:1-35).
- Le catalogue et la revue RH/admin existent
  (20261102180000_phase3_admin_document_catalog.sql:3-20,171-220).
- L'API Node sert des URL privées, des miniatures et un bundle PDF
  (api/server.mjs:20,85-137,227-264).
- Le volume Docker est privé et monté sur `/data/documents`
  (docker-compose.yml:40-52).
- MinIO, verrouillage WORM des bulletins et rétention documentaire n'ont pas été trouvés.

**ERREUR DU DOCUMENT :** la matrice affirme « aucun stockage de fichiers » et le ticket
P2-05 propose de créer le coffre ; le coffre documentaire salarié existe déjà, mais le
WORM des bulletins n'est pas démontré.

### 2.9 Tests et CI

- CI GitHub présente : `npm ci`, lint et build frontend
  (.github/workflows/ci.yml:1-24).
- Le contrôle de paie existe comme script local, pas comme étape de CI
  (scripts/local-payroll-validation.ps1:1-151).
- Aucun workflow CI appelant ce script, aucun test de migration PostgreSQL et aucune preuve
  de test automatisé du coffre/documentaire n'a été trouvé.

## 3. Erreurs et hypothèses non confirmées du document

| Hypothèse | État | Preuve / conclusion |
|---|---|---|
| `employees`, `companies`, `payroll_entries`, `user_roles`, `employee_manager_assignments` existent | Confirmé | Migrations citées aux sections 2.1, 2.2 et 2.6 |
| Colonnes `company_id` existent sur les objets principaux | Confirmé partiellement | Présentes sur `employees`, `salary_structures`, `payroll_entries`, `payroll_periods`; couverture de toutes les tables non confirmée |
| `date_embauche` existe | Non vérifiable comme colonne exacte | Le dépôt contient des dates d'embauche dans le seed, mais cette recherche d'inventaire ne suffit pas à confirmer le nom de colonne sur la table finale |
| `bank_account` existe | Confirmé | `core_hr.sql`:125 |
| Il n'existe aucun historique daté | Infirmé | `employee_manager_assignments` utilise `valid_from`/`valid_to`; l'historique bitemporel complet des contrats/postes/salaires reste absent |
| Aucune RLS ne filtre par société | Confirmé pour les politiques examinées | Les politiques vues utilisent rôles/propriété, pas `company_id`; absence d'une politique cachée en base non vérifiable sans introspection |
| `payroll_transition_guard` existe | Infirmé comme nom exact | Le déclencheur réel est `payroll_entries_transition_guard`, fonction `guard_payroll_status_transition()` |
| Le garde-fou peut bloquer une alerte | Confirmé partiellement | Il bloque transitions directes et anomalies de préparation ; les alertes RIB/compliance prévues n'existent pas |
| L'audit lot 0 ne couvre que cinq référentiels | **ERREUR DU DOCUMENT** | La boucle lot 0 cite dix tables |
| `compute_salary_slip` lit des constantes en dur uniquement | **ERREUR DU DOCUMENT** | Les fonctions `payroll_settings_at` et `tax_slab_at` lisent des tables |
| `app.*` n'existe pas | Confirmé dans le dépôt | Aucun schéma/fonction `app` trouvé ; seules les fonctions `public.has_role` et `public.my_employee_id` existent |
| Totaux août 2026 vérifiables par script | Confirmé, mais résultat NO-GO | `scripts/local-payroll-validation.ps1`; il vérifie les totaux mais échoue sur 26 bulletins |

## 4. Matrice comparative

| # | Exigence | État réel (preuve) | Écart | Effort | Risque paie | Dépendances |
|---:|---|---|:---:|:---:|:---:|---|
| 1 | Bitemporel | Affectations manager datées seulement | fort | L | fort | roster, vues de compatibilité |
| 2 | Postes/ETP gelés | `work_posts` existe, pas `positions` bitemporelles | moyen | M | moyen | organisation cible |
| 3 | Hiérarchie matricielle | Un manager daté existe, quotes-parts absentes | moyen | M | faible | décision RH |
| 4 | Multi-tenant | Hors périmètre, aucun `tenant_id` | aucun en phases 1-4 | L en phase 5 | fort | décision commerciale |
| 5 | Audit hash/WORM | audit JSONB et événements, sans hash/WORM | fort | M | moyen | clé de hachage, export |
| 6 | Workflows complets | demandes et décisions simples, pas délégation/escalade générique | moyen | L | moyen | calendrier, rôles |
| 7 | Anomalies RIB/grille | `payroll_entry_checks`, pas `compliance_alerts` RIB | fort | M | fort | données sensibles, transition |
| 8 | RBAC/ABAC/PBAC/MFA | RBAC + manager, pas `app.can`/MFA SQL | moyen | L | fort | JWT, politiques |
| 9 | Chiffrement PII | RIB `text`, aucun chiffrement constaté | fort | M | fort | gestion clé, migration Expand |
| 10 | Champs JSONB personnalisés | non trouvé | moyen | M | faible | UI et validation |
| 11 | Moteur batch 50k | PL/pgSQL Excel-compatible | faible | S | très fort si réécrit | benchmark avant changement |
| 12 | Règles légales versionnées | fonctions datées + tables, pas `rule_sets` | fort | L | très fort | référence légale sénégalaise |
| 13 | Temps/présences/HS | présence et planning existants, profils/pointeuse absents | moyen | L | fort | décision gardiens |
| 14 | Outbox | non trouvé | moyen | M | moyen | worker/idempotence |
| 15 | Webhooks HMAC | non trouvé, reporté | faible | M | faible | consommateur réel |
| 16 | Virement bancaire | suivi de paiement local, pas fichier bancaire | moyen | L | fort | banque pilote |
| 17 | WORM bulletins | documents privés et bundle PDF, pas WORM | fort | M | fort | MinIO ou équivalent |
| 18 | OLAP/CDC | fonctions et requêtes SQL, pas ClickHouse | faible | M | faible | volume réel |
| 19 | GraphQL/OpenAPI/AsyncAPI | PostgREST auto-exposé, pas GraphQL | faible | M | moyen | contrats externes |
| 20 | SSO/SCIM | hors périmètre, auth locale | aucun phases 1-4 | L | moyen | annuaire |
| 21 | Expand/Contract | migrations directes existantes | moyen | S | fort | CI paie |
| 22 | ATS/Talent/LMS | non trouvé | moyen | L | faible | priorisation produit |

### Tickets P1 à P3 et phase 5

| Ticket | État réel | Écart | Effort | Risque paie | Dépendances |
|---|---|:---:|:---:|:---:|---|
| P1-01 | Script local, pas CI | fort | S | très fort | fixture 25 salariés |
| P1-02 | manager daté, pas bitemporel métier | fort | L | fort | vues `_current`, backfill |
| P1-03 | audit non chaîné | fort | M | moyen | export verrouillé |
| P1-04 | RLS/RBAC présents, `app.can` absent | fort | L | fort | matrice rôles |
| P1-05 | RIB en clair | fort | M | fort | secret hors dépôt |
| P1-06 | anomalies paie génériques, RIB absent | fort | M | très fort | `compliance_alerts` |
| P1-07 | non trouvé | moyen | M | faible | schéma de métadonnées |
| P2-01 | demandes existantes, workflow générique absent | moyen | L | moyen | pg_cron à vérifier |
| P2-02 | outbox/worker absent | moyen | M | moyen | contrat événement |
| P2-03 | manager daté partiel | moyen | M | faible | positions |
| P2-04 | aucun fichier bancaire | moyen | L | fort | banque pilote |
| P2-05 | coffre privé existant, WORM absent | moyen | M | fort | stockage objet |
| P3-01 | paramètres datés mais pas rule sets | fort | L | très fort | sources légales |
| P3-02 | snapshot de paie, pas rule_set_id | fort | M | très fort | P3-01 |
| P3-03 | aucun benchmark 1k/10k/50k trouvé | moyen | M | moyen | dataset synthétique |
| P3-04 | présence/planning présents, pointeuse/profils absents | moyen | L | fort | décision métier |
| P3-05 | notifications documents/demandes, compliance absent | moyen | M | fort | échéances sources |
| P3-06 | fonctions de reporting, pas vues matérialisées/Metabase | faible | M | faible | besoins analytiques |
| P5A-P5H | phase conditionnelle, aucune preuve de multi-client | hors périmètre actuel | XL | très fort | phases 1-3, décision de vente |

## 5. Problèmes de faisabilité du SQL proposé

### 5.1 Bitemporel

Le SQL proposé suppose `btree_gist`, `daterange`/`tstzrange`, `positions` et
`employee_assignments`. `pgcrypto` est explicitement créé dans
20261028170000_core_hr.sql:8,
mais `btree_gist` n'est pas trouvé dans les migrations ni dans
postgres/Dockerfile:1-8. Le bloc doit donc commencer par
une vérification d'extension et une migration Expand sans remplacer les tables actuelles.
La collision principale est le nom `employee_assignments`, à distinguer de
`employee_manager_assignments`.

### 5.2 Audit chaîné

Le trigger proposé doit se brancher sur `audit_log`/`business_audit()` ou sur
`audit_events`, pas créer un troisième journal parallèle. Il faut définir une
chaîne monotone et le traitement des corrections. `sha256` peut être fourni par
`pgcrypto`, mais la clé de signature et la copie WORM ne sont pas fournies par Docker.

### 5.3 `app.can()` et RLS

Le SQL est incompatible tel quel avec l'existant car `app.*` n'existe pas et les
politiques actuelles appellent `public.has_role`. `security definer` exige un
`search_path` strict, des droits `EXECUTE` minimaux et une protection contre les
politiques modifiables par un rôle applicatif. Le schéma `app` n'est pas déclaré dans
`PGRST_DB_SCHEMA` visible dans docker-compose.yml; il ne doit
donc pas être exposé à PostgREST sans GRANT explicites. Une vue `employees_secure`
doit également être `security_invoker` et recevoir des politiques/GRANT vérifiés.

### 5.4 Chiffrement

Le SQL proposé suppose `pgcrypto` (présent comme extension disponible/créée), une
clé de conteneur non versionnée et une transition depuis `employees.bank_account text`
(20261028170000_core_hr.sql:120-130).
Il ne faut pas déchiffrer la valeur en clair dans une vue destinée à tous les rôles :
le masquage et l'autorisation doivent être séparés, et les fonctions de lecture doivent
être testées avec chaque rôle.

### 5.5 Workflows, outbox, `rule_sets`, `compliance_alerts`

- Les noms proposés ne collisionnent pas avec une table trouvée, mais ils n'existent pas.
- Chaque nouvelle table doit recevoir RLS, politiques par rôle, index sur toutes les
  clés étrangères et des contraintes d'idempotence.
- `pg_cron` n'est présent ni dans le Dockerfile ni dans les migrations recherchées :
  l'escalade doit rester un job externe tant que l'extension n'est pas provisionnée.
- `rule_sets`/`rule_values` ne doivent pas être branchés directement dans
  `compute_salary_slip` avant d'avoir figé une fixture de référence et un rollback.
- `alter table payroll_entries add rule_set_id` est compatible en Expand, mais le code
  de calcul doit continuer à prendre les paramètres historiques tant que la colonne
  n'est pas remplie et validée.
- Le garde-fou actuel connaît les transitions de `payroll_entries`; il ne connaît pas
  les alertes RIB proposées. Le branchement doit être explicite et testé.

## 6. Conflits de décision

| Conflit | Vérification |
|---|---|
| X1 : phase 5 rouvre le multi-entreprise | Exact. La feuille de route valide D1 mono-société (FEUILLE_DE_ROUTE_SOMA_RH.md:673) ; la cible réserve le multi-tenant à la phase 5 |
| X2 : sorties bancaires/déclarations | Exact. D8 reporte la transmission et laisse la synthèse au comptable (FEUILLE_DE_ROUTE_SOMA_RH.md:687) ; 5C les réintroduit |
| X3 : coffre documentaire | Partiellement dépassé. La cible signale un coffre à décider, mais le dépôt possède déjà un coffre privé et des miniatures (20261102173500_phase3_private_documents.sql:3-56) |
| X4 : SOC-008 abandonné | Exact. La feuille de route marque les données anonymisées comme abandonnées (FEUILLE_DE_ROUTE_SOMA_RH.md:69-76), alors que la phase commerciale en aurait besoin |
| X5 : 6-12 semaines contre 12-18 mois | Exact, mais ce sont bien un pilote accompagné contre un SaaS autonome ; aucune preuve de durée réelle n'est disponible |

Conflits supplémentaires :

1. Le document cible affirme « aucun stockage de fichiers », alors que le coffre
   documentaire privé est livré.
2. Le document cible décrit le moteur comme lisant des constantes, alors que les
   fonctions `payroll_settings_at` et `tax_slab_at` lisent des tables.
3. La cible nomme `payroll_transition_guard`, mais le nom réel est
   `payroll_entries_transition_guard`.
4. Le document cible parle d'une absence totale d'historique daté, alors que les
   affectations manager possèdent déjà `valid_from`/`valid_to`.
5. La cible propose les exports bancaires en phase 5 alors que D3 les a explicitement
   reportés et que la feuille de route les avait aussi listés comme lot futur.

## 7. Ordre de migration proposé

Chaque étape ci-dessous doit être une migration `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`,
précédée et suivie par `scripts/local-payroll-validation.ps1`. Le test doit rester
NO-GO tant que le roster exact de 25 salariés n'est pas établi.

| Ordre | Migration | Contenu en une phrase | Risque |
|---:|---|---|---|
| 0 | `..._payroll_reference_fixture.sql` | Isoler une fixture anonymisée de 25 bulletins et rendre le contrôle de périmètre reproductible | très fort |
| 1 | `..._audit_chain_expand.sql` | Ajouter colonnes de hash et métadonnées sans supprimer `audit_log`/`audit_events` | fort |
| 2 | `..._audit_chain_trigger.sql` | Brancher le chaînage sur le journal choisi et ajouter `audit_verify()` | fort |
| 3 | `..._pii_encryption_expand.sql` | Ajouter colonnes chiffrées, empreintes de recherche et fonctions de lecture masquée | très fort |
| 4 | `..._pii_encryption_backfill.sql` | Migrer les valeurs existantes dans une transaction contrôlée puis comparer les lectures par rôle | très fort |
| 5 | `..._positions_history_expand.sql` | Ajouter positions/affectations bitemporelles et index GIST après vérification de `btree_gist` | fort |
| 6 | `..._positions_history_backfill.sql` | Amorcer l'historique depuis les colonnes actuelles et créer les vues de compatibilité | très fort |
| 7 | `..._policy_engine_expand.sql` | Créer `app.policies` et les fonctions d'autorisation sans remplacer les politiques existantes | très fort |
| 8 | `..._policy_engine_cutover.sql` | Migrer table par table vers `app.can`, avec `FORCE RLS` seulement après tests de matrice | très fort |
| 9 | `..._compliance_alerts.sql` | Ajouter alertes RIB, grille et échéances avec RLS, FK indexées et statuts explicites | fort |
| 10 | `..._payroll_alert_guard.sql` | Relier uniquement les alertes bloquantes au RPC de transition et au trigger SQL | très fort |
| 11 | `..._workflow_core.sql` | Ajouter définitions, instances, décisions et délégations, sans migrer encore les demandes | moyen |
| 12 | `..._workflow_requests_expand.sql` | Relier progressivement les demandes existantes au workflow avec compatibilité descendante | fort |
| 13 | `..._outbox_events.sql` | Ajouter l'outbox et son index partiel, puis un worker idempotent séparé | moyen |
| 14 | `..._rule_sets_expand.sql` | Ajouter jeux de règles datés et `payroll_entries.rule_set_id` nullable | très fort |
| 15 | `..._rule_sets_backfill.sql` | Reproduire les paramètres actuels dans un rule set approuvé sans changer le calcul par défaut | très fort |
| 16 | `..._rule_sets_cutover.sql` | Figer le rule set par bulletin après comparaison Excel et seulement ensuite activer la lecture | très fort |
| 17 | `..._attendance_profiles.sql` | Ajouter profils horaires et entrée pointeuse, sans modifier les variables de paie existantes | fort |
| 18 | `..._compliance_reporting.sql` | Ajouter alertes d'échéance et vues analytiques en lecture seule | moyen |

La règle Expand/Contract impose de ne supprimer les anciennes colonnes, fonctions ou
politiques qu'après au moins un cycle de paie validé et une restauration testée.

## 8. Ce qui n'a pas pu être vérifié

- Le contenu effectif de la base au catalogue PostgreSQL, car l'audit demandé est en
  lecture statique et aucune requête de diagnostic ne devait être exécutée.
- Les extensions réellement installées dans l'instance, notamment `btree_gist`,
  `pgcrypto` et `pg_cron`; seul le Dockerfile et les migrations ont été lus.
- Les valeurs, rôles et politiques effectivement chargés après toutes les migrations.
- La conformité juridique sénégalaise des taux et formats IPRES/CSS/impôts.
- Le comportement réel de PostgREST pour un schéma `app` non exposé.
- La présence d'un WORM externe ou d'une politique de sauvegarde hors dépôt.
- La couverture complète des tests applicatifs hors CI et le contenu des données de production.

## 9. Questions bloquantes au propriétaire

1. Quel est le roster anonymisé officiel des 25 salariés de référence d'août 2026 ?
2. Faut-il corriger le jeu local pour retirer le 26e salarié, ou modifier officiellement la référence Excel ?
3. Quel journal devient la source d'audit unique : `audit_log` ou `audit_events` ?
4. Où la clé de chiffrement PII doit-elle être gérée et qui peut déchiffrer les RIB ?
5. Le coffre documentaire privé actuel remplace-t-il définitivement le système externe envisagé ?
6. Quelle banque pilote et quel format de virement sont réellement acceptés ?
7. Quelles sources juridiques sénégalaises valident les règles qui remplaceront progressivement le classeur ?
8. La phase 5 est-elle autorisée par une décision écrite de commercialisation, ou reste-t-elle gelée ?

