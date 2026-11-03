# SOMA-RH — Gap analysis face au blueprint « Next-Gen Enterprise » (v2)

> Version 2.0 — 2 novembre 2026. Remplace la v1 du même fichier.
> Complète `FEUILLE_DE_ROUTE_SOMA_RH.md`, `AUDIT_COMMERCIALISATION_SOMA_RH.md` et `PLAN_EVOLUTION_SOMA_RH.md`.
>
> **Périmètre fixé par le propriétaire : Sénégal uniquement, une seule entreprise.**
> Sont donc *hors périmètre* : multi-tenant (RLS par société, schéma par tenant, opérateur Kubernetes), multi-pays / LDG Niger, multi-devises, consolidation de groupe, facturation PEPM, multi-régions, IdP d'entreprise (SCIM/SAML).
> La v1 traitait le Niger comme un second jeu de règles et prévoyait la RLS par société : **supprimé** pour les phases 1 à 4.
> **Exception : la phase 5 (§4) rouvre le multi-entreprise** si SOMA-RH devient un produit vendu à d'autres sociétés sénégalaises. Elle ne démarre qu'après les phases 1 à 3, et reste limitée au Sénégal.

---

## 0. Ce qui change par rapport à la v1

| Sujet | v1 | v2 |
|---|---|---|
| Niger / LDG `NE` | Prévu en phase 3 | **Supprimé.** Les règles du rapport de cadrage (Niger) ne s'appliquent pas ; seules ses *catégories* servent de liste de contrôle, à re-spécifier avec des sources sénégalaises (§3) |
| RLS par `company_id`, schéma par tenant | Phase 1 / 4 | **Supprimés** (une seule société). La table `companies` reste |
| Audit | « Étendre l'audit » | **Journal chaîné par hash** (manque identifié dans le blueprint) |
| Détection d'anomalies (RIB avant clôture…) | Absente | **Ajoutée** (§2.4) |
| Workflows | Étapes simples | **Portes de décision, délais, escalade** ajoutés (§2.3) |
| Défauts du blueprint lui-même | Non relevés | Section 1 |

Le blueprint décrit une plateforme à 25 000+ salariés, multi-pays, vendue au salarié actif par mois. SOMA-RH est un outil interne pour une entreprise minière sénégalaise (27 salariés aujourd'hui). La règle de lecture : **on garde ce qui protège la paie, l'historique et les données personnelles ; on écarte ce qui sert à vendre ou à passer à l'échelle.**

---

## 1. Défauts du blueprint à ne pas recopier

| # | Passage du blueprint | Problème | Correction retenue |
|---|---|---|---|
| B1 | DDL `employment_contracts` : `EXCLUDE (tenant_id, worker_id, valid_range &&)` | La contrainte ignore `system_range`. Toute **correction** (nouvelle ligne sur la même période métier, ancienne ligne fermée dans le temps système) viole la contrainte : le « bitemporel » ne permet pas de corriger. | Exclure sur `valid_range` **et** `system_range` (§2.1) |
| B2 | `PRIMARY KEY (contract_id, valid_range, system_range)` et borne `'9999-12-31 23:59:59'` | Clé primaire sur des intervalles : lourd et inutile. Date sentinelle fragile. | PK `uuid` simple ; borne ouverte `NULL`/`infinity` |
| B3 | Moteur de paie « SIMD, lock-free, Rust » | La paie exige une arithmétique **décimale exacte** (le moteur actuel est validé à moins de 1e-6 F). Le SIMD flottant n'a pas sa place ; le gain n'est pas démontré. | Rester en SQL `numeric` ; mesurer avant de réécrire (§2.5) |
| B4 | Kafka + Debezium + ClickHouse pour 50 000 bulletins | 27 salariés. Trois composants à exploiter pour un volume qu'une seule requête Postgres absorbe. | Table d'événements sortants (outbox) + vues matérialisées |
| B5 | « OPA évalue en moins de 2 ms » | Chiffre non démontré dans le texte, et OPA ne peut pas être appelé par PostgREST. | `app.can()` en SQL (§2.4) |
| B6 | Phase 1 = Kubernetes multi-régions + Kong + Keycloak | Infrastructure de plusieurs mois avant la première fonction métier. | Docker Compose existant ; reverse proxy simple |
| B7 | Politique RLS sans `FORCE` ni distinction lecture/écriture | Le propriétaire de la table contourne la RLS ; pas de `WITH CHECK`. | Voir §2.4 |

---

## 2. Matrice d'écart et architecture corrective

Légende : ● écart fort · ◐ moyen · ○ faible · — hors périmètre.

| # | Exigence du blueprint | SOMA-RH aujourd'hui | Écart | Décision |
|---|---|---|:-:|---|
| 1 | Bitemporel (`valid_range` + `system_range`, GIST) | Aucun historique daté ; recalcul rétroactif impossible | ● | **Faire** sur 4 tables (§2.1) |
| 2 | Postes (Position) dissociés du salarié, ETP, gel | Salarié-centrique | ◐ | **Faire** (§2.1) |
| 3 | Hiérarchie matricielle avec quote-parts | Un seul manager (phase 3) | ◐ | **Faire**, version simple (§2.1) |
| 4 | Multi-tenant, LDG, multi-devises | Mono-société de fait | — | **Hors périmètre** |
| 5 | Audit immuable, chaîné SHA-256, copie WORM | Audit non chaîné, modifiable par un administrateur de base | ● | **Faire** (§2.2) |
| 6 | Workflows : décision, approbation, délai, escalade, délégation, compensation | Demandes simples, sans délégation | ◐ | **Faire** en tables (§2.3) |
| 7 | Détection d'anomalies (RIB avant clôture, hausse hors grille) | Aucune | ● | **Faire** (§2.4) |
| 8 | RBAC + ABAC + PBAC, attributs d'environnement (MFA, réseau) | RBAC + périmètre manager | ◐ | **Faire** `app.can()` ; OPA plus tard (§2.4) |
| 9 | Chiffrement PII + masquage dynamique | RIB / numéros en clair | ● | **Faire** (§2.4) |
| 10 | Champs personnalisés JSONB | Aucun | ◐ | **Faire** (§2.6) |
| 11 | Moteur de paie DAG Rust/Go, batch 50 000 | PL/pgSQL fidèle à Excel | ○ | **Garder** ; benchmark d'abord (§2.5) |
| 12 | Règles légales versionnées par date | Constantes dans les fonctions | ● | **Faire** `rule_sets` pour le Sénégal seul (§2.5) |
| 13 | Time & Attendance (profils horaires, HS, pointeuses) | Grille de présences + planning gardiens | ◐ | **Faire** par étapes (§2.7) |
| 14 | Outbox + événements (CloudEvents) | Aucun | ◐ | **Faire** l'outbox ; Kafka non (§2.3) |
| 15 | Hub de webhooks signés HMAC, réessai 72 h | Aucun | ○ | **Reporter** jusqu'au premier consommateur réel |
| 16 | Virement SEPA PAIN.001 | Aucun fichier bancaire | ◐ | **Faire** pour la banque pilote ; PAIN.001 seulement si la banque l'accepte (non vérifié) |
| 17 | Stockage WORM des bulletins PDF | Aucun stockage de fichiers | ● | **Faire** (MinIO, verrouillage d'objet) |
| 18 | OLAP ClickHouse + CDC | Vues SQL directes | ○ | **Non** : vues matérialisées + Metabase |
| 19 | GraphQL, REST OpenAPI, AsyncAPI | PostgREST (REST auto) | ○ | **Non** pour GraphQL |
| 20 | Keycloak, SSO, SCIM | Authentification locale | — | **Hors périmètre** tant qu'il n'y a pas d'annuaire d'entreprise |
| 21 | Migrations zéro interruption (Expand/Contract) | Migrations directes | ◐ | **Faire** comme règle de revue (§2.8) |
| 22 | ATS, Talent, LMS | Absents | ◐ | Phase 4, après la paie et la conformité |

### Architecture cible (réduite)

```text
 React PWA ─► PostgREST ─► PostgreSQL ◄─ worker (api/server.mjs)
                │ JWT{role, amr}  │ RLS + app.can()           │ lit outbox_events
                ▼                 │ tables bitemporelles       ▼ e-mail, fichiers, webhooks (plus tard)
          api Node (documents) ──►│ audit_chain (hash)        MinIO (PDF, objet verrouillé)
                                  └ rule_sets, workflow_*
```

### 2.1 Postes, bitemporel, matriciel

Une seule société : pas de `tenant_id`. Les deux axes sont exclus ensemble (correction de B1).

```sql
create extension if not exists btree_gist;
create schema if not exists app;

create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text not null,
  org_unit_id      uuid,
  headcount_budget numeric(6,2) not null default 1,
  is_frozen        boolean not null default false,
  valid_range      daterange not null,
  system_range     tstzrange not null default tstzrange(now(), null),
  exclude using gist (code with =, valid_range with &&, system_range with &&)
);

create table public.employee_assignments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id),
  position_id   uuid references public.positions(id),
  contract_type text not null,
  base_salary   numeric not null,                       -- pleine précision
  reason        text,
  changed_by    uuid,
  valid_range   daterange not null,                     -- temps métier
  system_range  tstzrange not null default tstzrange(now(), null), -- temps système
  exclude using gist (employee_id with =, valid_range with &&, system_range with &&)
);
create index on public.employee_assignments(employee_id);
create index on public.employee_assignments(position_id);

create table public.reporting_lines (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  manager_id  uuid not null references public.employees(id),
  kind        text not null check (kind in ('hierarchical','functional','project')),
  pct         numeric(5,2) not null default 100 check (pct > 0 and pct <= 100),
  valid_range daterange not null,
  exclude using gist (employee_id with =, manager_id with =, kind with =, valid_range with &&)
);
create index on public.reporting_lines(manager_id);
-- somme des pct par (employé, kind, date) <= 100 : trigger DEFERRABLE à écrire.
```

**Règle d'écriture.** Jamais d'`UPDATE` métier direct. Pour un changement effectif au jour D :
1. fermer la ligne courante (`system_range := tstzrange(lower(system_range), now())`) ;
2. réinsérer la partie antérieure à D ;
3. insérer la nouvelle version à partir de D.

Un trigger `BEFORE UPDATE OR DELETE` refuse tout sauf la fermeture de `system_range`. Une vue `employee_assignments_current` (`system_range @> now()`) alimente l'écran ; la paie rétroactive lit `valid_range @> :date` et `system_range @> :date_de_décision`.

*Cas d'usage du blueprint (augmentation saisie en avril, effective au 1er janvier)* : D = 1er janvier, saisie en avril → la paie d'avril peut calculer le rappel de janvier-mars ; le bulletin de mars déjà validé reste reproductible (`system_range` du moment).

**Intégration sans repartir de zéro :** créer les tables, amorcer `employee_assignments` depuis `employees` (`valid_range = [date_embauche, ∞)`), garder les colonnes actuelles en lecture, brancher `compute_salary_slip` sur la vue. Porte de sortie : le test d'août 2026 reste identique (brut 4 929 179,09 ; net 4 662 739,89 ; écart < 1e-6 F).

### 2.2 Journal d'audit chaîné

Chaque ligne contient le hash SHA-256 de son contenu concaténé au hash de la précédente. Toute modification a posteriori casse la chaîne.

```sql
create extension if not exists pgcrypto;

create table app.audit_chain (
  seq       bigserial primary key,
  payload   jsonb not null,
  prev_hash bytea,
  hash      bytea not null
);
revoke update, delete, truncate on app.audit_chain from public;

create function app.audit_append() returns trigger language plpgsql security definer as $$
declare v_prev bytea; v_payload jsonb;
begin
  perform pg_advisory_xact_lock(727001);                 -- sérialise : la chaîne a un seul "dernier"
  select hash into v_prev from app.audit_chain order by seq desc limit 1;
  v_payload := jsonb_build_object('table', tg_table_name, 'op', tg_op,
      'old', to_jsonb(old), 'new', to_jsonb(new),
      'by', nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      'at', clock_timestamp());
  insert into app.audit_chain(payload, prev_hash, hash)
  values (v_payload, v_prev, digest(coalesce(v_prev, '\x') || convert_to(v_payload::text, 'UTF8'), 'sha256'));
  return null;
end $$;

-- Vérification : renvoie le premier seq dont le hash ne correspond pas (null = chaîne intacte)
create function app.audit_verify() returns bigint language sql stable as $$
  select seq from (
    select seq, hash, digest(coalesce(lag(hash) over (order by seq), '\x') || convert_to(payload::text, 'UTF8'), 'sha256') as expected,
           prev_hash, lag(hash) over (order by seq) as lag_hash
    from app.audit_chain) t
  where hash <> expected or prev_hash is distinct from lag_hash order by seq limit 1
$$;
```

Limites assumées : le verrou consultatif sérialise les écritures (acceptable à ce volume) ; un superutilisateur de base peut réécrire **toute** la chaîne. C'est pourquoi une copie quotidienne du dernier hash (et des lignes du jour) part vers un stockage à verrouillage d'objet (MinIO, mode *compliance*). Sans cette copie externe, la chaîne détecte les erreurs mais pas un administrateur malveillant.
À faire avant migration : lister les tables du journal existant (lot 0) et y brancher le trigger à la place ; ne pas tenir deux journaux en parallèle.

### 2.3 Workflows, délais, escalade, délégation, événements

Le blueprint exige des *portes de décision*, des *délais avec escalade* et des *compensations*. En tables :

```sql
create table public.workflow_definitions (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,            -- 'leave','advance','overtime','raise','rib_change'
  steps jsonb not null
  -- [{ "id":"s1","type":"DECISION_GATE","if":"salary > grade_max","then":"s2","else":"s3" },
  --  { "id":"s2","type":"APPROVAL","approver":"role:rh","timeout_hours":48,"on_timeout":"escalate:role:admin" },
  --  { "id":"s3","type":"APPROVAL","approver":"manager_n1","timeout_hours":24 }]
);
create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.workflow_definitions(id),
  subject_type text not null, subject_id uuid not null,
  state text not null default 'pending' check (state in ('pending','approved','rejected','cancelled','suspended')),
  current_step text not null, due_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.workflow_decisions (
  id bigserial primary key,
  instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  step text not null, decided_by uuid not null, on_behalf_of uuid,   -- délégation
  decision text not null check (decision in ('approve','reject','escalate')), comment text,
  decided_at timestamptz not null default now()
);
create table public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator uuid not null, delegate uuid not null, valid_range daterange not null,
  exclude using gist (delegator with =, valid_range with &&)
);
create index on public.workflow_instances(state, due_at);
create index on public.workflow_decisions(instance_id);

create table public.outbox_events (
  id bigserial primary key,
  event_type text not null,             -- 'worker.promoted', 'payroll.period.closed'
  payload jsonb not null,               -- enveloppe CloudEvents (specversion, type, source, time, data)
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index on public.outbox_events(id) where published_at is null;
```

- La fonction `decide()` vérifie que l'appelant est l'approbateur de l'étape **ou** son délégataire à cette date, journalise `on_behalf_of`, avance l'étape et écrit l'événement dans `outbox_events` **dans la même transaction**.
- Un job `pg_cron` toutes les 15 min traite `due_at < now()` : escalade ou rappel.
- *Compensation* : pas de saga distribuée à ce stade ; les étapes d'effet externe (création de compte, virement) sont des tâches idempotentes qui, en cas d'échec, passent l'instance en `suspended` et créent une alerte. **Temporal** ne se justifie que si une chaîne longue (clôture → virement → déclaration) nécessite des reprises automatiques.
- Le worker lit l'outbox (`for update skip locked`) et livre ; livraison au moins une fois, consommateurs idempotents sur `id`.

### 2.4 Autorisation, chiffrement, masquage, anomalies

**Une seule porte `app.can()`**, appelée par les politiques RLS existantes (on ne les réécrit pas) :

```sql
create table app.policies (
  id uuid primary key default gen_random_uuid(),
  role text not null, action text not null, resource text not null,
  scope text not null default 'all' check (scope in ('all','own_team','self')),
  require_mfa boolean not null default false,      -- attribut d'environnement du blueprint
  effect text not null default 'allow' check (effect in ('allow','deny'))
);

create function app.can(p_action text, p_resource text, p_employee uuid default null)
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from app.policies p
                  where p.role = any (app.current_roles()) and p.action = p_action
                    and p.resource = p_resource and p.effect = 'allow'
                    and (not p.require_mfa or app.mfa_active())
                    and (p.scope = 'all'
                         or (p.scope = 'self'     and p_employee = app.current_employee())
                         or (p.scope = 'own_team' and app.is_my_report(p_employee))))
     and not exists (select 1 from app.policies p
                  where p.role = any (app.current_roles()) and p.action = p_action
                    and p.resource = p_resource and p.effect = 'deny');
$$;
```

`current_roles()`, `current_employee()`, `is_my_report()` se déduisent de `user_roles` et `employee_manager_assignments` ; `mfa_active()` lit la revendication `amr` du JWT (nécessite une double authentification à mettre en place côté connexion). Les politiques RLS sensibles utilisent `FORCE ROW LEVEL SECURITY` et un `WITH CHECK` (correction de B7).

**OPA** : le blueprint le place derrière Kong ; ici PostgREST ne sait pas l'appeler et tout passerait par l'API Node. On exporte `app.policies` en `data.json` si un besoin inter-systèmes apparaît. La règle du blueprint (« un collaborateur lit sa propre rémunération ; un HRBP lit son unité sous MFA ») est exactement une ligne `self` et une ligne `own_team` + `require_mfa`.

**Chiffrement des PII** (RIB, numéro IPRES/CSS, pièce d'identité) par `pgcrypto` :

```sql
alter table public.employees add column bank_account_enc bytea;
-- écriture : pgp_sym_encrypt(:rib, current_setting('app.pii_key'))
create view public.employees_secure with (security_invoker = true) as
select e.id,
  case when app.can('read','bank_details', e.id)
       then pgp_sym_decrypt(e.bank_account_enc, current_setting('app.pii_key'))
       else '•••• ' || right(pgp_sym_decrypt(e.bank_account_enc, current_setting('app.pii_key')), 4) end as bank_account
from public.employees e;
```

La clé vient d'un secret du conteneur (jamais du dépôt). Le chiffrement protège une copie volée de la base, pas un administrateur qui lit la clé. Il n'est pas indexable : une recherche par RIB passerait par un hash séparé.

**Détection d'anomalies** (manque majeur du blueprint côté sécurité de la paie). Règles minimales, toutes en SQL :

| Code | Condition | Effet |
|---|---|---|
| `RIB_CHANGE_NEAR_CLOSE` | RIB modifié alors qu'une période de paie est ouverte | Alerte ; la validation de la période est **bloquée** tant qu'elle est ouverte |
| `RIB_AND_ADDRESS` | RIB et adresse modifiés dans la même semaine | Alerte |
| `RAISE_OUT_OF_GRID` | Salaire de base > maximum de la catégorie | Le flux `raise` passe par la porte de décision (§2.3) |
| `DUPLICATE_RIB` | Même RIB sur deux salariés | Alerte |

Branchement : un trigger sur `employees` insère dans `compliance_alerts` (§2.7) ; le garde-fou de transition de période existant (`payroll_transition_guard`) refuse la validation s'il reste une alerte bloquante ouverte.

### 2.5 Moteur de paie : règles datées (Sénégal) et benchmark

Pas de réécriture en Rust/Go. On sort les valeurs légales du code, avec dates d'effet (barème IR, plafonds IPRES/CSS, SMIG, taux) :

```sql
create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null, label text,
  status text not null default 'draft' check (status in ('draft','approved','active','retired')),
  source_reference text,                 -- texte de loi, circulaire, convention
  approved_by uuid, approved_at timestamptz,
  valid_range daterange not null,
  exclude using gist (valid_range with &&) where (status in ('approved','active'))
);
create table public.rule_values (
  rule_set_id uuid not null references public.rule_sets(id),
  key text not null, value numeric, table_json jsonb,    -- barèmes par tranches en table_json
  primary key (rule_set_id, key)
);
alter table public.payroll_entries add column rule_set_id uuid references public.rule_sets(id);
```

`rule_set_id` est figé à la validation du bulletin : un ancien bulletin se recalcule toujours avec les règles d'origine (constat C3 du roadmap). Tous les montants restent en `numeric`.

**Benchmark avant toute décision** (jeu synthétique, jamais de données réelles ; base : `scripts/local-synthetic-fixture-validation.ps1`) :

| Volume | Seuil proposé | Si dépassé |
|---|---|---|
| 1 000 bulletins | < 30 s | rien |
| 10 000 | < 5 min | paralléliser par lot |
| 50 000 | < 10 min | alors seulement, extraire le calcul net/brut en service dédié avec les mêmes tests Excel |

Pour 27 salariés, ce benchmark sert à connaître la marge, pas à justifier un chantier.

### 2.6 Champs personnalisés

```sql
create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('employee','position','contract')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  data_type text not null check (data_type in ('text','number','date','bool','select')),
  options jsonb, required boolean not null default false, is_pii boolean not null default false,
  unique (entity, key)
);
alter table public.employees add column custom jsonb not null default '{}';
create index employees_custom_gin on public.employees using gin (custom jsonb_path_ops);
```

Un trigger refuse toute clé de `custom` absente de `custom_field_definitions` ; le contrôle de type reste à l'écran.

### 2.7 Temps, présences et conformité sénégalaise

Les alertes sont des **données** (`compliance_alerts`) générées par un job quotidien `pg_cron`, jamais des `if` dans le code :

```sql
create table public.compliance_alerts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  rule_code text not null,            -- 'MED_PERIODIC','CDD_END','RIB_CHANGE_NEAR_CLOSE'…
  due_date date not null, blocking boolean not null default false,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  payload jsonb not null default '{}'
);
create index on public.compliance_alerts(status, due_date);
create index on public.compliance_alerts(employee_id);
```

Time & Attendance : le planning mensuel et le cycle des gardiens existent. À ajouter par étapes : profils horaires (table), décompte des heures supplémentaires à partir des présences, **point d'entrée REST des pointeuses** dans l'API Node (MQTT inutile pour ce volume). Ce que la paie fait des heures de nuit des gardiens reste régi par la décision du 30/10/2026 (non modifié).

### 2.8 Règle de migration (Expand / Contract)

Tout changement de schéma suit deux migrations : (1) *expand* : ajouter colonnes/tables compatibles ; déployer le code ; (2) *contract* : supprimer l'ancien, dans un cycle ultérieur. Toute migration est précédée du test d'août 2026 en CI. Coût : aucun outil à ajouter, une règle de revue.

---

## 3. Conformité : ce qu'il reste à spécifier pour le Sénégal

Le rapport de cadrage fourni décrit le **Niger** (Code du Travail du Niger, ANPE, CNSS, SMIG nigérien). Ses règles chiffrées (majorations d'heures supplémentaires, barème de saisie, plafonds d'avances, seuils CSST, durées de contrats) **ne doivent pas être reprises**. Seules ses *catégories* sont utiles comme liste de contrôle :

| Catégorie | À spécifier avec sources sénégalaises | Statut |
|---|---|---|
| Durée du travail, heures supplémentaires et majorations | Code du travail (loi 97-17), convention collective applicable à la mine | Moteur actuel = règles du classeur Excel ; **à confronter au texte** |
| Saisie / cession sur salaire, avances | Code des obligations civiles et commerciales / Code du travail | À rechercher |
| Contrats (CDD, renouvellements, étrangers, apprentis) | Code du travail, autorisation de travail | À rechercher |
| Registres obligatoires et durées d'archivage | Code du travail, Inspection du travail | À rechercher |
| Santé et sécurité, visites médicales, comité d'hygiène | Code du travail, textes SST | À rechercher |
| Cotisations et déclarations | IPRES, CSS, DGI (IR, TRIMF), CFCE | Calcul fait ; **déclaratif non fait** (décision du 30/10) |
| Portail « NDAMLI » du blueprint | — | **Non vérifié** ; ne pas développer de connecteur |

Aucune valeur légale sénégalaise n'est affirmée dans ce document : elles doivent venir des textes et être saisies dans `rule_values`, validées par votre comptable ou juriste.

### Rôles (matrice du rapport, adaptée)

| Rôle | Existant | Action |
|---|---|---|
| Direction RH / RRH | `admin`, `rh` | Périmètre organisationnel pour RRH si plusieurs sites |
| Paie | `paie` | OK (validation et clôture : `admin`, décision du 30/10) |
| Gestionnaire administratif | — | `rh_admin` : dossier, pas de paramètres de paie |
| Médecin / infirmier | — | `medecin` : données médicales invisibles aux autres rôles |
| Inspection du travail (externe) | — | `auditeur` en lecture seule, **à créer seulement si la demande existe** |
| Manager, salarié | `manager`, `salarie` | OK |

---

## 4. Feuille de route (une entreprise, Sénégal)

1 développeur + Claude Code, sprints de 2 semaines. Durées indicatives, à recaler après la phase 1.
**Règle de sortie commune : le test d'août 2026 passe en CI** (25 bulletins, écart < 1e-6 F ; brut 4 929 179,09 ; net 4 662 739,89).

### Phase 1 — Core & Sécurité (≈ 6 semaines)

| Ticket | Contenu | Critère de fin |
|---|---|---|
| P1-01 | CI : test d'août 2026 à chaque migration (SOC-004) + règle Expand/Contract | Échec de CI au-delà de 1e-6 |
| P1-02 | `positions`, `employee_assignments`, `reporting_lines` bitemporelles + amorçage + vue `_current` | Fiche salarié lit la vue ; paie inchangée |
| P1-03 | `audit_chain` + trigger sur tables sensibles + `audit_verify()` + export quotidien verrouillé | Chaîne vérifiée ; copie hors base |
| P1-04 | `app.policies` + `app.can()` ; `FORCE RLS` + `WITH CHECK` sur tables sensibles | Matrice des rôles testée |
| P1-05 | Chiffrement RIB / numéros IPRES-CSS + vue masquée | Illisible sans clé |
| P1-06 | Détection d'anomalies RIB (§2.4) branchée sur le garde-fou de transition | Validation bloquée sur alerte |
| P1-07 | Champs personnalisés (§2.6) | Un champ ajouté sans migration |

### Phase 2 — Workflows & Intégration (≈ 6 semaines)

| Ticket | Contenu | Critère de fin |
|---|---|---|
| P2-01 | `workflow_*`, délégations, délais + escalade (`pg_cron`) ; migration des demandes existantes | Congé à 2 niveaux, délégation, escalade |
| P2-02 | `outbox_events` (enveloppe CloudEvents) + worker e-mail | Au moins une livraison, idempotente |
| P2-03 | Organigramme daté, quotes-parts matricielles | Organigramme « à la date D » |
| P2-04 | Fichier de virement (banque pilote) | Rapprochement sur un mois à blanc |
| P2-05 | Coffre de documents : MinIO + verrouillage d'objet pour bulletins PDF | Bulletin archivé non modifiable |

### Phase 3 — Paie, Temps & Analytics (≈ 6 semaines)

| Ticket | Contenu | Critère de fin |
|---|---|---|
| P3-01 | `rule_sets` / `rule_values` Sénégal ; constantes sorties des fonctions | Août 2026 identique |
| P3-02 | `rule_set_id` figé par bulletin ; rappels rétroactifs depuis l'historique bitemporel | Ancien bulletin reproductible |
| P3-03 | Benchmark 1 000 / 10 000 / 50 000 | Marge documentée |
| P3-04 | Profils horaires, décompte HS, point d'entrée REST des pointeuses | HS calculées depuis les présences (si validé par le propriétaire) |
| P3-05 | `compliance_alerts` : visites médicales, fins de CDD, échéances de documents | Alertes sur jeu synthétique |
| P3-06 | Vues matérialisées + Metabase en lecture seule | Pilotage RH hors tables transactionnelles |

### Phase 4 — Évolutions (à la demande, sans calendrier)

| Déclencheur | Ajout |
|---|---|
| Un partenaire externe veut des événements | Hub de webhooks signés HMAC, réessai exponentiel |
| Plus de 3 consommateurs de l'outbox | Kafka + Debezium lisant `outbox_events` |
| Règles d'accès à partager avec d'autres systèmes | OPA |
| Chaîne longue avec reprises automatiques | Temporal.io |
| Annuaire d'entreprise (Active Directory) | Keycloak, SSO |
| Recrutement, performance, formation à intégrer | ATS, évaluations, LMS (voir roadmap lots 7-8) |
| Benchmark P3-03 négatif | Service de calcul dédié |

### Phase 5 — SaaS commercial (Sénégal, plusieurs entreprises)

Objectif : atteindre le niveau de **fiabilité** des éditeurs établis (Sage, Odoo, Frappe HR) sur la paie sénégalaise, pas leur largeur fonctionnelle. Elle n'est lancée qu'après décision explicite du propriétaire de vendre le produit.
Durées indicatives, à recaler : 12 à 18 mois au total pour un développeur avec Claude Code, jusqu'au premier client payant (estimation sans données de référence).

Chaque étape a une **condition de passage** ; on ne commence pas la suivante avant de l'avoir remplie.

| Étape | Contenu | Condition de passage |
|---|---|---|
| **5A. Paie paramétrable** | Rubriques et structures de paie entièrement configurables par client (primes, conventions, cas particuliers) ; modèles de bulletin personnalisables ; import de l'historique et des cumuls (Excel, Sage) ; jeu de tests de non-régression **par client** (le plan de tests minimal de l'audit §9.1 : 720 cas IR/TRIMF, types de contrat, plafonds, régularisation, recalcul idempotent) | Une seconde entreprise réelle passe un mois de paie à blanc, écart < 1e-6 F, **sans modifier le code** ; plan de tests §9.1 de l'audit entièrement vert |
| **5B. Multi-entreprise** | **`tenant_id` distinct de `company_id`** (un cabinet comptable, tenant, gère plusieurs sociétés) ; tables `tenants`, `tenant_memberships` (rôle, périmètre, dates), `has_tenant_role()` (modèle de l'audit §5.1) ; `tenant_id` dans les index et contraintes uniques ; filtre RLS **restrictif** sur le tenant courant, en plus des politiques de rôle existantes ; **suppression des lectures `using (true)` sur les référentiels** ; `payroll_settings_at()` et `tax_slab_at()` (globales, sans société) remplacées par des lectures via `rule_set` du tenant ; création d'un client en self-service ; suspension, export complet et suppression d'un tenant ; schéma séparé par client seulement si un gros compte l'exige | Test d'étanchéité : deux tenants, deux JWT, aucune ligne de A visible par B, y compris via les vues et les RPC appelées avec un identifiant hors périmètre. **Aucun tenant client réel avant** la réussite de ce test, d'une restauration complète et d'une clôture de paie (go/no-go de l'audit §8, phase 0) |
| **5C. Sorties légales et bancaires** | Déclarations sociales et fiscales (IPRES, CSS, impôts, CFCE) ; export comptable SYSCOHADA ; plusieurs formats de virement ; coffre de documents et attestations générées | Un mois de déclarations accepté par les organismes pour une entreprise pilote (formats à confirmer avec le comptable) |
| **5D. Exploitation du service** | Hébergement redondant ; sauvegardes **restaurées régulièrement en test** ; supervision, alertes, page d'état ; environnements test / préproduction / production ; limitation de débit ; quotas et métriques d'usage ; **journal d'administration de la plateforme distinct du journal métier** ; support avec impersonation contrôlée et tracée (l'admin plateforme ne lit pas le contenu métier sans piste d'audit) ; engagement de disponibilité tenable (ex. 99,5 %) | Restauration complète testée ; incident simulé détecté et résolu dans le délai annoncé |
| **5E. Sécurité et conformité** | Double authentification obligatoire pour les rôles sensibles ; test d'intrusion externe ; conformité à la loi sénégalaise sur les données personnelles (déclaration CDP, contrat de sous-traitance, registre des traitements) ; SSO et ISO 27001 / SOC 2 seulement sur demande d'un client | Rapport de test d'intrusion sans faille critique ouverte ; avis d'un juriste sur la conformité (**à obtenir, non vérifié ici**) |
| **5F. Offre commerciale** | Structure éditrice, conditions générales, contrat SaaS et engagement de service ; tarification par salarié et par mois ; facturation et encaissement local (mobile money, virement) ; documentation et guides par rôle ; formation ; support avec délais de réponse ; partenariats avec cabinets comptables | Contrat type validé par un juriste ; support documenté |
| **5G. Clients pilotes** | 3 à 5 entreprises à prix réduit, avec support direct | Au moins 3 entreprises ont fait au moins 3 mois de paie réelle sans correction de moteur |
| **5H. Lancement** | Ouverture commerciale | 5A à 5G remplies |
| **Après le lancement** | Recrutement (ATS), évaluations, formation, notes de frais, mobile avancé, intégrations (API documentée, webhooks) | Priorisés par la demande des clients |

**Risque principal** : le moteur est validé sur le classeur d'une seule entreprise. La variété des cas de paie des autres clients est l'inconnue la plus coûteuse ; c'est pourquoi 5A est la première étape et sa condition de passage est volontairement dure.

**Ce que la phase 5 réactive** parmi les éléments écartés au §0 : RLS par société et provisionnement de clients. Restent hors périmètre : multi-pays, multi-devises, consolidation de groupe, multi-régions.

#### Confrontation de la phase 5 avec les documents existants (2 novembre 2026)

Documents lus : `AUDIT_COMMERCIALISATION_SOMA_RH.md` (§1, 4.8, 5.1, 8, 9, 11), `PLAN_EVOLUTION_SOMA_RH.md` (§5, 8, 9), `FEUILLE_DE_ROUTE_SOMA_RH.md` (§0, périmètre révisé). Les autres sections de ces documents n'ont pas été relues ici.

**Conflits à trancher par le propriétaire**

| # | Conflit | Détail | Ma recommandation |
|---|---|---|---|
| X1 | Décision actée « une seule entreprise, multi-tenant hors périmètre » (audit §11, feuille de route D1) | La phase 5 la lève. L'audit prévoit lui-même que « toute évolution future partira d'une base locale testée et documentée » | Phase 5 verrouillée tant que les phases 1 à 3 ne sont pas terminées et que le propriétaire n'a pas écrit la décision de vendre le produit |
| X2 | Lot 3 réduit (30/10) : « pas de format bancaire, pas de transmission IPRES/CSS/impôts, le comptable s'en charge » | 5C les réintroduit | Normal pour un produit vendu, mais c'est un **renversement explicite** : à consigner dans la feuille de route avant de commencer |
| X3 | Lot 4 en attente : « un système de gestion documentaire sera mis en place ensuite » | 5C (coffre MinIO) et P2-05 anticipent un coffre interne | Décider si le coffre est interne ou le système externe prévu ; sinon double développement |
| X4 | SOC-008 « données de démonstration anonymisées » abandonné | Une démonstration commerciale exige un environnement isolé à données fictives (audit §1.1) | Rétablir une fixture synthétique pour la phase 5G |
| X5 | Délais : l'audit prévoit une « première offre commercialisable » en 6 à 12 semaines, ma phase 5 donne 12 à 18 mois | Ce ne sont pas les mêmes objets : l'audit décrit un pilote accompagné, la phase 5 un SaaS autonome avec trois clients ayant passé trois mois de paie réelle | Garder les deux ; l'estimation de 12 à 18 mois reste sans donnée de référence |

**Recoupements (ce que ces documents couvrent déjà, à ne pas réécrire)**
- Modèle tenant, memberships, onboarding, quotas, suspension, export, impersonation : audit §4.8 et §5.1, plan d'évolution §5.1.
- Plan de tests avant vente (moteur, sécurité, workflow, produit) : audit §9 ; devient la condition de passage de 5A et 5B.
- Versionnement des règles avec statut et approbation : plan d'évolution §5.2 ; intégré à `rule_sets` (§2.5 de ce document).
- Documents (`documents`, `document_versions`, `document_access_log`…) : plan d'évolution §5.4 ; URL temporaires et espace privé.
- Observabilité et sécurité SaaS : plan d'évolution §8.

**Ce que ma phase 5 ajoute à ces documents**
- Le critère d'acceptation « trois clients, trois mois de paie réelle sans correction de moteur ».
- L'ordre des étapes, chacune avec une condition de passage.
- La distinction explicite `tenant_id` / `company_id` appliquée aux fonctions globales `payroll_settings_at()` et `tax_slab_at()`.

**Ce que l'audit prévoit et que ma phase 5 laissait de côté** : fonctionnalités par pays/plan (feature flags), signature électronique (niveau à décider, audit §9 question 10), politique de conservation des CNI, bulletins et RIB (question ouverte), fournisseur d'e-mail/SMS/WhatsApp (question ouverte). Ces points restent des décisions du propriétaire, non tranchées ici.

### Build vs Adopt (périmètre réduit)

| Brique | Décision | Raison |
|---|---|---|
| Moteur de paie Sénégal | **Build (existant)** | Aucun open source ne couvre IR/TRIMF/IPRES/CSS |
| Bitemporel, postes, audit chaîné, `app.can()`, workflows en tables | **Build** | Spécifiques ; absents de Frappe HR / Horilla |
| Frappe HR, Horilla | **Adopt les idées**, pas le code | Stack Python ≠ React/PostgREST ; licences à vérifier avant toute reprise |
| Documents | **Adopt** MinIO | Objet verrouillable |
| Analytics | **Adopt** Metabase | Pas de BI maison |
| Planification | **Adopt** `pg_cron` | Déjà dans l'écosystème Postgres |
| Kafka, Debezium, ClickHouse, Kong, Camel, Temporal, OPA, Keycloak, GraphQL | **Reporter** (phase 4) | Voir §1 B4-B6 et tableau de la phase 4 |
| Opérateur Kubernetes, PEPM, multi-région | **Hors périmètre** | Une seule entreprise |

---

## 5. Par où commencer

1. **P1-01** (test automatique) : sans lui, chaque changement de moteur est un risque.
2. **P1-02** (bitemporel) : la décision la plus difficile à rattraper ; plus l'historique est démarré tôt, moins il y a à reconstituer.
3. **P1-03 et P1-05** (audit chaîné, chiffrement) : protègent la paie et les données personnelles, sans dépendre du reste.

Questions ouvertes pour le propriétaire : (a) la banque pilote et son format de virement ; (b) qui conserve la copie externe du journal (§2.2) ; (c) quelles règles légales sénégalaises doivent être confrontées au classeur (§3).
