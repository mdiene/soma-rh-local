# SOMA-RH — cadre de travail et proposition technique

> **Version :** 1.1  
> **Date :** 31 octobre 2026  
> **Périmètre immédiat :** une entreprise (SOMA), Sénégal, environnement local  
> **Références :** [PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md](./PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md), [ANALYSE_EXCEL.md](./ANALYSE_EXCEL.md), [PLAN_EVOLUTION_SOMA_RH.md](./PLAN_EVOLUTION_SOMA_RH.md), [AUDIT_COMMERCIALISATION_SOMA_RH.md](./AUDIT_COMMERCIALISATION_SOMA_RH.md)

## 1. Décision de cadrage

SOMA-RH doit évoluer comme une **application RH et paie sénégalaise explicable et contrôlée**, et non comme un ERP généraliste dès maintenant.

Le périmètre de la prochaine séquence est volontairement limité :

- une société SOMA ;
- une base PostgreSQL locale ;
- une interface française ;
- les rôles `admin`, `rh`, `paie` et `salarie` ;
- le moteur de paie existant comme référence fonctionnelle ;
- aucune donnée personnelle réelle dans les fixtures, tests ou rapports versionnés ;
- pas de multi-tenant, facturation ou internationalisation dans les premières phases.

Le multi-tenant et l'internationalisation resteront possibles plus tard, mais ne doivent pas ralentir la fiabilisation du produit local.

## 2. État de départ constaté

### 2.1 Socle disponible

- Frontend React/Vite/TypeScript/Tailwind.
- PostgreSQL local Docker, base `soma_rh`.
- API locale JWT et passerelle compatible avec les appels `supabase-js`.
- PostgREST local et RLS PostgreSQL.
- Authentification locale fonctionnelle.
- Données migrées et accessibles depuis l'application.
- Migrations SQL versionnées.
- Écrans RH, présences, congés, variables, paie, bulletins, états et paramètres.
- Moteur PL/pgSQL validé sur la référence Excel d'août 2026.

### 2.2 Limites actuelles

- cycle de paie encore trop permissif pour une exploitation commerciale ;
- absence de période de paie formellement verrouillée ;
- anomalies et approbations insuffisamment structurées ;
- suppression d'un traitement validé à remplacer par annulation/correction auditée ;
- tests automatisés, tests RLS et restauration à industrialiser ;
- sorties bancaires et déclaratives non finalisées ;
- portail salarié/manager incomplet ;
- documents imprimables mais pas encore gérés comme un coffre privé versionné ;
- observabilité et procédure d'incident à formaliser.

### 2.3 Référence de non-régression obligatoire

Toute modification du moteur ou de ses paramètres doit préserver la référence Excel :

- 25 bulletins d'août 2026 ;
- tolérance maximale : `0,000001 F` ;
- brut total : `4 929 179,09 F` ;
- net total : `4 662 739,89 F` ;
- contrôle des retenues, charges patronales, IR, TRIMF, IPRES, CSS, IPM et provisions ;
- rapport sans données personnelles réelles.

Les ambiguïtés documentées dans l'analyse Excel — indemnité de licenciement, transport/kilométrique, IPM des prestataires, maladie et arrondis — ne doivent jamais être corrigées silencieusement.

## 3. Principes techniques non négociables

1. Toute modification de schéma passe par une migration versionnée.
2. Toute table nouvelle possède RLS, politiques adaptées et index de clés étrangères.
3. Les montants restent en `numeric` en base ; l'arrondi est réservé à l'affichage.
4. Une paie clôturée est immuable.
5. Toute correction est une opération tracée, jamais une suppression silencieuse.
6. Chaque règle de paie possède une date d'effet, une source, un statut et des tests.
7. Les données personnelles ne sont pas copiées dans Git, les fixtures ou les logs.
8. Les contrôles de sécurité sont exécutés avec des rôles distincts et des sessions réelles.
9. Toute fonctionnalité possède des états chargement, vide, erreur et accès refusé.
10. Une phase n'est déclarée terminée qu'après preuve reproductible et validation.

## 4. Architecture cible locale

```text
Navigateur React
    │
    │ API locale compatible Supabase JS
    ▼
Passerelle JWT Node.js
    ├── Auth locale : auth.users + bcrypt + JWT
    └── Proxy REST
          ▼
      PostgREST local
          ▼
      PostgreSQL 17
        ├── schéma RH et paie
        ├── fonctions PL/pgSQL
        ├── vues et états
        ├── RLS
        └── audit / snapshots
```

### 4.1 Choix retenu

Le dépôt utilise actuellement PostgreSQL local + passerelle JWT + PostgREST, solution de repli prévue par le prompt de restructuration. Elle conserve les contrats frontend, RPC, RLS et fonctions SQL sans dépendance au projet distant.

Ce choix doit être conservé tant qu'une migration vers Supabase CLI local n'apporte pas un bénéfice démontré et testé. Une migration d'infrastructure ne doit pas être mélangée à un lot métier.

### 4.2 Séparation des responsabilités

- **Frontend :** présentation, formulaires, navigation et messages métier.
- **Passerelle :** authentification, JWT, CORS contrôlé et proxy HTTP.
- **PostgREST/RLS :** accès aux données et autorisations de ligne.
- **PostgreSQL :** invariants, calculs de paie, transitions, snapshots et audit.
- **Scripts :** démarrage, reset, seeds synthétiques, validation et sauvegarde.

## 5. Modèle de gouvernance de la paie

### 5.1 États proposés

```text
brouillon
  → calculée
  → en_revue
  → approuvée
  → validée
  → payée
  → clôturée
```

États exceptionnels :

```text
annulée
réouverte
corrigée
```

Une transition doit être contrôlée côté base, avec rôle autorisé, motif si nécessaire, acteur et horodatage.

### 5.2 Tables à introduire ou formaliser

La structure exacte sera confirmée après inspection des migrations existantes. Le modèle cible est :

- `payroll_periods` : période, statut, dates, société, verrouillage ;
- `payroll_checklists` : contrôles attendus et résultats ;
- `payroll_anomalies` : niveau, statut, blocage, résolution ;
- `payroll_approvals` : acteur, rôle, décision, commentaire, horodatage ;
- `payroll_snapshots` : paramètres, rubriques, affectations, variables, hash et version ;
- `payroll_corrections` : avant/après, motif, approbation et régularisation ;
- `audit_events` : ressource, action, résultat, acteur et corrélation.

Chaque table devra être ajoutée par migration avec contraintes, index, RLS et tests.

### 5.3 Invariants

- une seule période active pour un mois et une société ;
- aucun calcul concurrent non maîtrisé sur la même période ;
- aucune modification d'entrée rattachée à une période clôturée ;
- chaque export référence un snapshot ;
- chaque approbation est attribuée à un acteur autorisé ;
- le préparateur ne peut pas être l'unique approbateur si la séparation des tâches est activée ;
- un recalcul répété ne crée ni doublon ni variation non expliquée ;
- la balance comptable doit rester équilibrée avant validation.

## 6. Roadmap par phases et portes de validation

Chaque phase suit le cycle :

```text
cadrage → migration → implémentation → tests ciblés
→ démonstration métier → correction → validation
→ rapport → décision GO/NO-GO
```

### Phase 0 — socle qualité et reproductibilité

**Objectif :** rendre l'environnement local reconstruisible et mesurable.

**Livrables :**

- `docs/LOCAL_SETUP.md` ;
- `docs/LOCAL_RESTRUCTURATION_LOG.md` ;
- `docs/LOCAL_TEST_MATRIX.md` ;
- scripts `reset`, `seed synthétique`, `backup`, `restore` ;
- tests de build, lint, schéma et authentification ;
- jeu de données synthétique séparé des données migrées ;
- rapport de santé des services ;
- procédure d'incident et de reprise.

**Validation :**

- reconstruction depuis zéro ;
- migrations rejouables ;
- compte de test créé puis supprimé ;
- aucune URL ou clé distante dans la configuration frontend ;
- sauvegarde restaurée dans une base de test ;
- `npm run build` et `npm run lint` réussis.

**GO :** environnement reproductible et aucun secret versionné.  
**NO-GO :** dépendance distante, reset destructif non documenté ou restauration non prouvée.

### Phase 1 — clôture de paie contrôlée

**Objectif :** transformer le calcul existant en cycle de paie auditable.

**Livrables :**

- périodes et transitions ;
- checklist et anomalies bloquantes ;
- snapshot immuable ;
- approbation séparée ;
- réouverture avec motif ;
- correction/régularisation ;
- audit des variables, présences, rôles et paies ;
- verrouillage après clôture ;
- validation idempotente et test de concurrence.

**Validation métier :**

- créer une période synthétique ;
- importer ou saisir les variables ;
- calculer ;
- résoudre ou justifier les anomalies ;
- approuver avec deux rôles ;
- clôturer ;
- prouver qu'une mutation est refusée ;
- rouvrir uniquement avec motif et permission ;
- comparer le recalcul aux totaux attendus.

**Critère de sortie :** aucun traitement validé ne peut disparaître sans trace.

### Phase 2 — régression paie et sécurité RLS

**Objectif :** rendre les garanties mesurables en continu.

**Livrables :**

- fixtures synthétiques pour CDI, CDD, COD, stage, apprentissage et prestation ;
- cas absence, maladie, congé, heures supplémentaires, sortie et retraite ;
- 720 cas IR/TRIMF ;
- 25 cas de référence anonymisés ou empreintes/totaux contrôlés ;
- tests RLS par rôle ;
- tests d'accès hors périmètre ;
- rapport `LOCAL_PAYROLL_VALIDATION.md`.

**Validation :**

- écart inférieur à `0,000001 F` ;
- données anonymisées uniquement ;
- salarié A ne voit pas salarié B ;
- utilisateur sans rôle ne peut pas exécuter d'opération protégée ;
- lecture anonyme refusée ;
- plafonds, seuils et journal comptable vérifiés.

### Phase 3 — portail ESS/MSS

**Objectif :** permettre aux salariés et managers de réaliser les demandes courantes.

**Livrables :**

- demandes de congé, attestation et correction de présence ;
- boîte de validation manager/RH ;
- suivi des statuts et motifs de refus ;
- notifications internes ;
- attestations à partir de modèles ;
- périmètre manager et délégation ;
- téléchargement contrôlé des documents.

#### Sous-lot ESS-014 — « Mon Dossier Administratif »

Le portail salarié doit présenter un dossier documentaire guidé, et non une simple
liste de fichiers. L'écran porte le titre **Mon Dossier Administratif**, explique
pourquoi les justificatifs sont nécessaires et affiche une progression globale
(`12 sur 18 documents fournis — 66 %`).

Les documents sont regroupés en cinq sections :

1. **État civil et identité** : pièce d'identité, naissance, nationalité/résidence,
   casier judiciaire, photo et contacts d'urgence.
2. **Qualification et parcours** : CV, diplômes/attestations et certificats de
   travail antérieurs.
3. **Famille et social** : situation matrimoniale, enfants, scolarité et
   immatriculation CNSS/IPRES.
4. **Aptitude médicale** : aptitude médicale et justificatifs maladie/maternité.
5. **Cas spécifiques** : permis/visa de travail pour les étrangers et autorisation
   parentale pour les mineurs.

Chaque exigence est une carte mobile-first avec statut `Manquant`, `En attente de
validation`, `Validé` ou `Refusé`, motif de refus visible et actions adaptées :
charger, glisser-déposer, capture caméra, visualiser, remplacer et soumettre.
Les types obligatoires et conditionnels doivent être configurables par société,
contrat et situation du salarié ; ils ne doivent pas être codés uniquement dans
le composant React.

**Proposition technique :**

- `document_requirements` décrit le catalogue, la section, l'obligation, la
  description, les conditions et la durée de validité ;
- `employee_documents` représente une soumission et sa version courante ;
- `document_versions` conserve chaque remplacement avec empreinte, taille, MIME,
  auteur et horodatage ;
- stockage privé hors Git, chemin opaque, URL temporaire générée côté serveur ;
- `document_reviews` impose la décision RH, le motif obligatoire en cas de refus
  et l'historique des changements de statut ;
- `document_access_log` journalise visualisation, téléchargement, remplacement,
  validation et refus ;
- limites de taille, MIME autorisés, contrôle antivirus et nom de fichier
  neutralisé avant stockage ;
- génération d'une fiche PDF de complétude pour le salarié et d'un dossier PDF
  RH indexé, sans exposer de lien permanent ;
- le manager ne voit que les documents explicitement autorisés par son périmètre,
  tandis que les pièces d'identité et médicales restent RH/salarié par défaut ;
- la page RH permet de sélectionner un salarié, consulter sa fiche documentaire,
  valider/refuser avec motif, remplacer un fichier et imprimer l'état complet.

**Choix de stockage proposé pour l'environnement local :** MinIO dans Docker,
avec un bucket privé `employee-documents`, chiffrement côté serveur, versioning
activé et exposition uniquement par l'API locale. PostgreSQL conserve les
métadonnées et les empreintes, jamais le contenu binaire. L'API vérifie le
JWT, la taille et le MIME, écrit dans MinIO avec un identifiant opaque, puis
crée la version SQL dans une transaction cohérente. Les téléchargements passent
par une URL présignée de courte durée après contrôle RLS et journalisation.
Cette solution reste compatible avec une migration ultérieure vers S3,
Cloudflare R2 ou Supabase Storage sans modifier le modèle métier.

La progression est calculée sur les exigences applicables, et non sur le nombre
de fichiers bruts. Une pièce refusée reste incomplète jusqu'à une nouvelle
soumission validée.

**Validation :**

- salarié limité à ses données ;
- manager limité à son équipe ;
- chaque demande possède un historique ;
- refus exige un motif ;
- accès après expiration ou révocation refusé ;
- parcours mobile et états d'erreur validés.

### Phase 4 — sorties financières et réglementaires

**Objectif :** fermer le cycle opérationnel de paie.

**Livrables :**

- contrat d'export bancaire indépendant de la banque ;
- contrôle RIB, doublons et bénéficiaire ;
- export versionné et hashé ;
- formats IPRES, CSS, IR/TRIMF à confirmer avec jeux officiels ;
- journal analytique ;
- facture prestataire ;
- retours, rejets et rapprochement.

**Validation :**

- prévisualisation avant export ;
- approbation avant transmission ;
- export répété sans doublon ;
- rejet partiel rejouable ;
- rapprochement des montants avec le bulletin et la comptabilité.

### Phase 5 — documents et cycle de vie salarié

**Objectif :** passer du dossier courant à un dossier RH vivant.

**Livrables :**

- historique des mouvements ;
- versions de contrats ;
- coffre privé de documents ;
- expirations et alertes ;
- onboarding/offboarding ;
- équipements, habilitations et restitution ;
- PDF serveur déterministe et audit des accès.

### Phase 6 — temps, frais et avances

**Objectif :** couvrir les besoins opérationnels des sites et équipes.

**Livrables :**

- calendriers et jours fériés ;
- planning de rotation ;
- import pointeuse idempotent ;
- missions et notes de frais ;
- acomptes et prêts ;
- impact paie explicable.

### Phase 7 — pilotage et préparation commerciale

**Objectif :** rendre le produit exploitable et démontrable.

**Livrables :**

- KPI effectifs, absentéisme, turnover et masse salariale ;
- exports décisionnels ;
- observabilité, corrélation et alertes ;
- tests de charge ;
- sauvegardes chiffrées et restauration périodique ;
- procédure support et incidents ;
- politique de conservation et dossier de conformité.

Le multi-tenant, le provisioning, la facturation et l'internationalisation ne seront ouverts qu'après validation de ce socle mono-entreprise.

## 7. Organisation du développement

### 7.1 Un ticket = une unité vérifiable

Chaque ticket doit contenir :

```markdown
## [DOMAINE-XXX] Titre
### Besoin utilisateur
### Règles métier
### Données / migration / index / RLS
### Interface et états
### Sécurité
### Critères d'acceptation
### Tests nominaux et limites
### Régression paie si concerné
### Dépendances
```

### 7.2 Ordre recommandé pour la Phase 1

1. `PAY-001` : modéliser les périodes et transitions ;
2. `PAY-002` : ajouter checklist et anomalies ;
3. `PAY-003` : créer snapshot et hash de calcul ;
4. `PAY-004` : implémenter approbations et séparation des tâches ;
5. `PAY-005` : verrouiller la période et remplacer la suppression ;
6. `PAY-006` : tracer corrections et réouvertures ;
7. `PAY-007` : brancher l'interface de suivi ;
8. `PAY-008` : produire le rapport de non-régression.

Chaque ticket doit être livré avec sa migration, ses tests et sa preuve de validation. Les tickets doivent être traités séquentiellement lorsque le schéma ou le workflow crée une dépendance.

## 8. Matrice de tests et validation

| Catégorie | Contrôle | Fréquence | Porte de sortie |
|---|---|---:|---|
| Compilation | TypeScript + Vite | chaque ticket | build réussi |
| Qualité | ESLint | chaque ticket | aucune erreur |
| Schéma | migrations, contraintes, index | chaque migration | reset/replay réussi |
| Auth | signup, login, session expirée, logout | chaque lot | parcours fonctionnel |
| RLS | admin, RH, paie, salarié, anonyme | chaque lot sensible | aucun accès hors périmètre |
| Paie | rubriques, seuils, plafonds, idempotence | chaque modification paie | tests ciblés verts |
| Référence | 25 bulletins et totaux août 2026 | chaque modification moteur | tolérance respectée |
| Workflow | approbation, clôture, correction, concurrence | chaque lot paie | invariants respectés |
| Documents | accès privé, expiration, version | chaque lot document | accès non autorisé refusé |
| Exploitation | backup/restore, logs, health | chaque phase | preuve de reprise |
| UX | mobile, clavier, vide, erreur | chaque écran | validation manuelle |

## 9. Definition of Done

Une fonctionnalité est terminée seulement si :

- le besoin et les règles sont documentés ;
- la migration est versionnée et rejouable ;
- RLS et index sont présents ;
- l'interface gère chargement, vide, erreur et refus ;
- les tests ciblés passent ;
- la régression paie est passée si nécessaire ;
- aucun secret ou renseignement personnel n'est ajouté ;
- la documentation est mise à jour ;
- une preuve de commande et de résultat est conservée ;
- la validation métier donne GO.

## 10. Décisions à obtenir avant les lots réglementaires

Ces décisions ne doivent pas être inventées par le code :

1. rôles exacts pour préparer, revoir, approuver, payer et administrer ;
2. politique de conservation des bulletins, contrats, CNI, RIB et audits ;
3. banques et formats de virement prioritaires ;
4. formats officiellement acceptés par IPRES, CSS et fiscalité ;
5. règles Excel contractuelles et règles à corriger ;
6. politique d'envoi des bulletins et fournisseur autorisé ;
7. axes analytiques : site, département, projet, centre de coût ;
8. niveau de signature requis pour les bulletins et attestations ;
9. besoin PWA/mobile pour les sites à connectivité limitée.

## 11. Décision de démarrage

**GO conditionnel pour la Phase 0**, car le socle local fonctionne et la connexion PostgreSQL est validée.

**NO-GO pour une commercialisation autonome** tant que les éléments suivants ne sont pas prouvés :

- clôture et correction auditées ;
- tests RLS complets ;
- non-régression paie automatisée ;
- sauvegarde/restauration ;
- sorties bancaires et déclaratives validées ;
- documents privés et portail ESS/MSS ;
- procédure d'incident et support.

## 12. Prochaine séquence de travail

La prochaine séquence doit commencer par la Phase 0, sans modifier encore les règles de calcul :

1. inventorier les migrations et tables actuelles ;
2. créer la matrice de tests locale ;
3. ajouter les scripts de reset, seed synthétique, backup et restore ;
4. mettre en place le rapport de validation paie ;
5. exécuter build, lint, tests de connexion, RLS et restauration ;
6. présenter le rapport de phase ;
7. décider GO/NO-GO pour la migration `payroll_periods`.

Cette séquence protège la référence Excel et donne une base mesurable avant toute évolution métier.
