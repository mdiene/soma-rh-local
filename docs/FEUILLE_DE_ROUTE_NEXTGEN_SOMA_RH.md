# SOMA-RH — Feuille de route Next-Gen réaliste

Version 1.1 — 3 novembre 2026  
Périmètre engagé : Sénégal, une entreprise, PostgreSQL local, React/PostgREST/Node.

## 1. Décision d'architecture

Le blueprint fourni est une cible Enterprise générale, pas une architecture à
implémenter immédiatement. SOMA-RH doit conserver un **monolithe modulaire
transactionnel**, avec des événements internes et une outbox seulement lorsque
un consommateur réel existe.

### À adopter maintenant

- PostgreSQL comme source de vérité ;
- RLS et fonctions SQL pour les décisions sensibles ;
- historisation métier progressive ;
- snapshots immuables et audit vérifiable ;
- API Node privée pour les documents et les traitements asynchrones ;
- `numeric` pour tous les montants ;
- interfaces React par domaine et états de workflow explicites ;
- tests de non-régression paie avant et après toute migration.

### À ne pas adopter maintenant

- Kafka/Debezium, tant qu'il n'y a pas plusieurs consommateurs ;
- Temporal.io, tant qu'un workflow ne nécessite pas de reprise distribuée longue ;
- Rust/Go pour remplacer le moteur PL/pgSQL validé avec Excel ;
- OPA en sidecar, tant que l'autorisation peut être vérifiée dans PostgreSQL ;
- schema-per-tenant, multi-pays, SEPA et NDAMLI, hors périmètre actuel ;
- MinIO/WORM avant décision sur la conservation réglementaire et l'infrastructure cible.

Le document de comparaison vérifié confirme que `compute_salary_slip`, les
paramètres datés, la gouvernance de période, les demandes et le coffre
documentaire existent déjà partiellement ([ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md](./ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md)).
Le projet reste volontairement limité à une seule entreprise afin de faciliter
les tests et l'évolution progressive du produit.

## 2. Porte zéro — fiabiliser la référence paie

**Statut : à recalibrer, P0.**

Un salarié a été ajouté puis rendu inactif pendant les tests. Le nombre de
salariés actifs peut donc évoluer avec les besoins de validation. Le fichier
Excel reste une référence historique et ne constitue plus la base normative du
projet, qui a depuis évolué. Les tests doivent désormais s'appuyer sur un
roster de test versionné, anonymisé et explicitement défini par le projet.

### Modules à livrer

| Module | Livrable |
|---|---|
| Fixture de test | Roster anonymisé des cas actifs retenus et empreinte des résultats |
| Contrôle de périmètre | Inclusion/exclusion explicite, sans données personnelles dans Git |
| Régression CI | Exécution PostgreSQL du contrôle avant/après migration |
| Matrice de cas | absence, maladie, congé, heures supplémentaires, sortie, retraite, CDI/CDD |
| Diagnostic | rapport limité aux identifiants techniques et agrégats |

### Critère de sortie

Le roster de test actif est défini et validé, les cas inactifs sont exclus de
manière explicite, et les résultats sont reproductibles avec une tolérance
documentée. Toute divergence non expliquée est **NO-GO**.

## 3. Roadmap priorisée

### Phase 0 — Référence, tests et exploitation (1 à 2 sprints)

**Objectif : rendre les changements mesurables.**

1. Définir la fixture et le périmètre actifs des tests d'août 2026.
2. Ajouter la régression paie au workflow CI existant, qui ne lance aujourd'hui
   que lint et build (.github/workflows/ci.yml).
3. Ajouter tests de migration, restauration et idempotence.
4. Ajouter scan de dépendances et seuil de vulnérabilités.
5. Documenter une sauvegarde/restauration réellement rejouée.

**Porte A :** le contrôle paie passe sur une base neuve et une base restaurée,
avec le même périmètre actif et les mêmes résultats.

### Phase 1 — Paie gouvernée et audit fiable (3 à 4 sprints)

**Objectif : empêcher une clôture incorrecte et rendre chaque décision explicable.**

Modules :

- checklist par période : salariés, structures, variables, présences, congés,
  totaux et anomalies ;
- séparation préparateur / approbateur / payeur ;
- snapshot immuable des paramètres, variables et résultats ;
- réouverture administrateur avec motif obligatoire ;
- comparaison avant/après et régularisation ;
- audit unique avec `before_data`, `after_data`, acteur, motif, hash précédent
  et empreinte de ligne ;
- export de l'audit vers une sauvegarde verrouillée ;
- blocage SQL des alertes bloquantes, pas seulement blocage d'écran.

**Dépendances :** Porte zéro. Ne pas créer un troisième journal : choisir
`audit_log` ou `audit_events`, puis migrer l'autre progressivement.

**Porte B :** un cycle à blanc complet est approuvé, clôturé, vérifié et
réouvert dans un environnement de test sans mutation silencieuse.

### Phase 2 — Sécurité PII et organisation historisée (4 à 6 sprints)

**Objectif : protéger les données sensibles sans casser la paie existante.**

Modules :

1. chiffrement des RIB et identifiants sensibles avec clé hors dépôt ;
2. vues de lecture masquées par rôle ;
3. tests RLS par rôle sur chaque table sensible ;
4. positions, affectations, contrats et rattachements avec dates d'effet ;
5. vue de compatibilité `_current` pour ne pas modifier immédiatement le moteur ;
6. contrôles de chevauchement avec `btree_gist` après vérification de l'extension ;
7. champs personnalisés JSONB limités à des définitions validées ;
8. matrice d'accès RH/paie/manager/salarié documentée.

`company_id` est conservé comme clé d'organisation. Le projet reste
mono-entreprise pour faciliter les tests et l'évolution ; `tenant_id`,
memberships et schema-per-tenant ne sont pas introduits avant une décision
commerciale écrite.

**Porte C :** RLS, masquage, restauration et recalcul paie passent leurs tests
avec les mêmes résultats Excel.

### Phase 3 — ESS/MSS et workflows opérationnels (3 à 4 sprints)

**Objectif : compléter les parcours salariés sans introduire un orchestrateur
distribué prématurément.**

Modules :

- moteur de workflow générique au-dessus de `employee_requests` ;
- étapes, approbateur, délégation temporaire, délai et motif de refus ;
- boîte manager/RH ;
- notifications in-app et e-mail avec reprise sur erreur ;
- demandes de congé, attestation, correction de présence, acompte ;
- historique des décisions ;
- calendrier d'équipe et périmètre manager ;
- attestations générées depuis des modèles ;
- tests d'idempotence des décisions et notifications.

**Architecture :** fonctions/RPC transactionnelles et worker Node. Temporal est
un candidat ultérieur, seulement si une chaîne externe longue exige pause,
reprise et compensation.

### Phase 4 — Sorties paie et conformité sénégalaise (4 à 6 sprints)

**Objectif : produire des sorties contrôlées, sans inventer de format légal.**

Modules :

- contrat d'export bancaire abstrait ;
- premier format validé avec la banque pilote ;
- contrôle RIB, doublons et total net ;
- suivi `préparé → exporté → transmis → accusé → rejeté → corrigé` ;
- états internes IPRES/CSS/CFCE/IR/TRIMF ;
- génération de fichiers seulement après validation des formats officiels ;
- axes analytiques : site, département, projet, centre de coût ;
- PDF serveur des bulletins et livre de paie avec empreinte ;
- calendrier des échéances et alertes.

Les règles sénégalaises doivent être confirmées par le comptable/juriste. Le
blueprint fourni ne constitue pas une source légale suffisante.

**Porte D :** un mois à blanc est rapproché avec la banque et les états
internes, sans transmission externe non validée.

### Phase 5 — Règles versionnées et temps avancé (4 à 6 sprints)

**Objectif : faire évoluer les règles sans modifier le code du moteur.**

Modules :

- `rule_sets` et `rule_values` avec source, statut, approbation et date d'effet ;
- `rule_set_id` figé par période/bulletin ;
- reprise historique et recalcul reproductible ;
- profils horaires et heures supplémentaires à partir des présences ;
- alertes d'échéance : visite médicale, CDD, documents ;
- vues analytiques matérialisées si le volume le justifie ;
- benchmark synthétique 1 000 / 10 000 / 50 000 seulement après mesure.

La migration doit d'abord reproduire les paramètres actuels, puis activer la
lecture versionnée après comparaison Excel. Aucun changement de règle implicite.

### Phase 6 — Produit SaaS conditionnel (après décision)

Cette phase n'est pas engagée. Elle commence uniquement si le propriétaire
décide de vendre SOMA-RH à plusieurs sociétés.

Ordre : `tenant_id` et memberships, isolation RLS restrictive, onboarding,
export/suppression d'un tenant, tests d'étanchéité, observabilité, contrats,
facturation et support. Le multi-pays, les devises, SCIM/SAML et Kubernetes
restent hors périmètre tant qu'un client ne les exige pas.

## 4. Modules fonctionnels à développer

### P0 — Sécurité de la paie

| Module | État actuel | Prochaine version |
|---|---|---|
| Référence paie | Script local, actuellement NO-GO | Fixture 25 cas + CI |
| Gouvernance | transitions, anomalies, snapshots partiels | checklist, séparation des rôles, audit chaîné |
| Audit | `audit_log`/`audit_events`, sans hash | journal unique vérifiable et exporté |
| PII | RIB en colonne `text` | chiffrement, masquage, rotation de clé |
| RLS | RBAC et périmètre manager | tests exhaustifs, `WITH CHECK`, force après preuve |

### P0 — Portail RH

| Module | État actuel | Prochaine version |
|---|---|---|
| Demandes | demandes et décisions présentes | workflow configurable et délégation |
| Notifications | notifications in-app présentes | e-mail fiable, reprise et journal |
| Documents | coffre privé, miniatures, revue RH | expirations, rétention, versions et archivage |
| Managers | affectations datées | périmètres, N+1, calendrier et délégation |

### P1 — Sorties et conformité

- exports et rapprochement bancaire ;
- états sociaux et fiscaux validés ;
- bulletin PDF archivé avec empreinte ;
- règles de conservation ;
- axes analytiques ;
- alertes de conformité.

### P1 — Données RH structurées

- contrats et mouvements historisés ;
- postes et organigramme ;
- profils de paie ;
- compétences, diplômes, permis et santé cloisonnée ;
- champs personnalisés gouvernés.

### P2 — Pilotage et extensibilité

- outbox transactionnelle ;
- vues analytiques ;
- connecteurs externes ;
- webhooks signés ;
- benchmark et optimisation ;
- recherche assistée et explication de bulletin, sans décision automatique.

## 5. Comparaison du blueprint fourni

| Proposition du blueprint | Décision SOMA-RH | Motif |
|---|---|---|
| Bitemporalité complète | Oui, progressivement | utile pour historique et paie rétroactive |
| Graph-over-relational | Partiel | positions/rattachements d'abord ; graphe dédié injustifié à 27 salariés |
| Kafka/Debezium | Reporter | aucun consommateur réel aujourd'hui |
| Schema-per-tenant | Phase SaaS uniquement | contradiction avec le périmètre mono-société |
| Temporal.io | Reporter | workflow local transactionnel suffisant |
| Moteur Rust/Go | Refuser maintenant | risque direct sur la fidélité Excel |
| 50 000 bulletins sous 10 minutes | Mesurer plus tard | seuil non pertinent pour 27 salariés sans benchmark |
| OPA | Reporter | ajouterait un second moteur d'autorisation avant le besoin |
| AES-256/masquage PII | Oui | risque de confidentialité immédiat |
| JSONB custom fields | Oui, limité | extensibilité utile si validation et audit |
| Apache Camel | Reporter | aucun ERP ou contrat d'intégration confirmé |
| SEPA/PAIN.001 | Conditionnel | dépend de la banque pilote |
| NDAMLI | Ne pas développer sans spécification officielle | non vérifié dans le dépôt |

## 6. Build vs Adopt

| Brique | Décision | Justification |
|---|---|---|
| Moteur paie Sénégal | Build/conserver | règles locales et référence Excel spécifiques |
| Gouvernance, audit, RLS | Build | contraintes propres au modèle SOMA-RH |
| React/PostgREST/PostgreSQL | Conserver | socle déjà opérationnel |
| Documents privés | Conserver l'API Node | déjà intégré et adapté au volume |
| Frappe HR / Horilla | Étudier comme référence UX/processus | ne pas importer leur modèle ou leur paie sans audit |
| Temporal | Adopt seulement si workflow long réel | coût d'exploitation inutile avant preuve |
| OPA | Adopt seulement pour multi-système | `has_role`/RLS suffisent d'abord |
| Kafka/Debezium | Adopt seulement à plusieurs consommateurs | outbox locale avant bus |
| MinIO | Évaluer pour WORM | décision de conservation et exploitation préalable |
| Metabase | Adopt pour BI | éviter une BI transactionnelle maison |
| pg_cron | Évaluer après vérification d'installation | sinon worker externe |
| Camel | Reporter | intégration SAP/NetSuite non demandée |

## 7. Règles de réalisation

Chaque migration doit :

1. respecter `AAAAMMJJHHMMSS_nom.sql` ;
2. suivre Expand/Contract ;
3. ajouter RLS, politiques par rôle et index sur les clés étrangères ;
4. garder les montants en `numeric` ;
5. préserver les API/RPC existantes pendant la transition ;
6. exécuter le test d'août avant et après ;
7. fournir un rollback ou une procédure de restauration ;
8. ne jamais ajouter de données personnelles dans le dépôt.

Chaque module frontend doit fournir les états chargement, vide, erreur,
autorisation refusée, succès et mobile. Chaque workflow doit être idempotent et
audité.

## 8. Questions de passage obligatoires

1. Quel roster anonymisé et versionné définit exactement le périmètre actif des
   tests d'août 2026 ?
2. Quel journal devient la source unique : `audit_log` ou `audit_events` ?
3. Quelle politique de conservation et de suppression s'applique aux documents ?
4. Quelle banque valide le premier export et sous quel format ?
5. Quelles sources juridiques sénégalaises valident les règles hors classeur ?
6. Qui peut déchiffrer les RIB et où la clé est-elle gérée ?
7. Le workflow actuel doit-il couvrir seulement congés/attestations ou aussi les changements de salaire ?
8. Le propriétaire autorise-t-il officiellement la phase SaaS multi-entreprise ?

## 9. Références

- [Analyse comparative cible vs existant](./ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md)
- [Feuille de route historique](./FEUILLE_DE_ROUTE_SOMA_RH.md)
- [Plan d'évolution](./PLAN_EVOLUTION_SOMA_RH.md)
- [Audit de commercialisation](./AUDIT_COMMERCIALISATION_SOMA_RH.md)
- [Validation paie locale](./LOCAL_PAYROLL_VALIDATION.md)
- [Analyse Excel](./ANALYSE_EXCEL.md)
