# Audit de commercialisation et trajectoire SaaS — SOMA-RH

> **Version :** 1.0  
> **Date de l’audit :** 31 octobre 2026  
> **Périmètre :** dépôt SOMA-RH observé localement, documentation fonctionnelle, migrations Supabase, frontend React/Vite, carte Graphify et comparaison de solutions open source.  
> **Conclusion courte :** SOMA-RH est un **MVP métier crédible pour un pilote interne ou quelques clients accompagnés**, mais **pas encore un SaaS commercialisable en autonomie**. Le moteur de paie est la partie la plus prometteuse ; les risques principaux sont le multi-tenant, la clôture irréversible/auditable, la conformité déclarative, les tests automatisés, l’exploitation et les parcours ESS/MSS.

---

## 1. Décision de commercialisation

### 1.1 Verdict

| Usage envisagé | Décision | Conditions |
|---|---:|---|
| Démonstration commerciale | **Oui** | Environnement de démonstration isolé et données fictives. |
| Pilote chez une entreprise unique, accompagné par l’équipe | **Oui, sous réserve** | Contrat pilote, revue paie mensuelle humaine, sauvegardes et procédure de reprise. |
| Production pour une seule société avec opérateurs experts | **Possible après durcissement P0** | Gouvernance de paie, tests RLS, procédure de clôture et exports vérifiés. |
| SaaS multi-entreprises autonome en Afrique de l’Ouest | **Non, pas dans l’état actuel** | Tenant explicite, isolation prouvée, facturation, support, observabilité et conformité. |
| Produit international multi-pays | **Non** | Moteur de règles localisé, devise/fuseau/calendrier, déclarations et modèle de données à généraliser. |

### 1.2 Score de préparation

Ces scores ne sont pas une certification ; ils expriment le niveau de preuve présent dans le dépôt.

| Dimension | Score actuel | Niveau cible commercial | Commentaire |
|---|---:|---:|---|
| Proposition de valeur paie sénégalaise | 7/10 | 8/10 | Bonne fidélité Excel, mais plusieurs règles doivent être confirmées avec des experts locaux. |
| Moteur de calcul | 7/10 | 9/10 | Calcul en `numeric`, trace JSON et validation août 2026 ; couverture de tests reproductibles à industrialiser. |
| RH opérationnelle | 5/10 | 8/10 | Dossier, congés et présences présents ; historique, documents, onboarding et workflow manager manquent. |
| Cycle de paie et contrôle interne | 3/10 | 9/10 | États simples ; pas encore de période verrouillée, snapshot, anomalies bloquantes ni double approbation robuste. |
| Sécurité applicative | 4/10 | 8/10 | Auth et RLS existent, mais le périmètre est global/mono-société et plusieurs lectures sont trop larges. |
| Multi-tenant | 1/10 | 9/10 | `companies` existe, mais il n’y a pas de tenant, membership ou scoping RLS généralisé. |
| Sorties banque / déclarations | 2/10 | 8/10 | États et journal comptable présents ; exports bancaires, IPRES/CSS/impôts et rapprochement non livrés. |
| Documents et conformité | 2/10 | 8/10 | Impression navigateur ; pas de coffre privé, versions, rétention, signature ni accès temporaire serveur. |
| UX ESS/MSS | 3/10 | 8/10 | Consultation de bulletins et congés partiels ; demandes, notifications et approbations manquent. |
| Qualité et exploitation SaaS | 3/10 | 8/10 | Build fonctionnel, mais pas de suite automatisée visible, SLO, plan incident ou restauration testée. |
| Internationalisation | 2/10 | 8/10 | Libellés français et règles Sénégal codées ; architecture pays à construire. |
| **Moyenne indicative** | **3,6/10** | **8,3/10** | Le produit peut être vendu comme pilote, pas comme SaaS self-service mature. |

### 1.3 Recommandation de positionnement

Le meilleur positionnement initial n’est pas « ERP RH complet ». Il est :

> **Une paie sénégalaise explicable, contrôlée et adaptée aux PME, cabinets et sociétés multi-sites d’Afrique francophone, avec un dossier RH et un portail salarié progressivement ajoutés.**

La différenciation défendable est la combinaison suivante :

1. reprise contrôlée des règles et habitudes Excel ;
2. moteur de paie local avec détail explicable ;
3. traçabilité des versions et corrections ;
4. intégration présences → variables → paie ;
5. sorties opérationnelles banque, organismes et comptabilité ;
6. expérience française simple pour RH, paie, managers et salariés.

---

## 2. Méthode et limites de l’audit

### 2.1 Sources examinées

- [`README.md`](../README.md) : périmètre fonctionnel, architecture, migrations et correspondance Frappe HR.
- [`docs/ANALYSE_EXCEL.md`](./ANALYSE_EXCEL.md) : 13 feuilles Excel, 114 colonnes de calcul, macros VBA, anomalies et validation d’août 2026.
- [`docs/PLAN_EVOLUTION_SOMA_RH.md`](./PLAN_EVOLUTION_SOMA_RH.md) : plan d’évolution existant, workflows cibles et tickets P0/P1/P2.
- `web/src/` : routes, écrans, accès, requêtes Supabase, états et impressions.
- `supabase/migrations/` : schéma, moteur PL/pgSQL, RLS, vues, audit et évolutions.
- `graphify-out/graph.json` : cartographie Graphify utilisée pour orienter l’analyse (466 nœuds avant mise à jour ; 749 nœuds après la mise à jour AST du dépôt).
- Build et lint frontend exécutés le 31/10/2026.
- Documentation et dépôts publics des alternatives open source, à vérifier à nouveau avant toute décision de licence ou d’intégration.

### 2.2 Ce qui n’a pas été prouvé

L’audit local ne prouve pas :

- que les migrations présentes sont exactement celles appliquées au projet Supabase de production ;
- qu’une restauration de sauvegarde fonctionne ;
- qu’un test RLS exhaustif a été exécuté avec plusieurs utilisateurs et sociétés ;
- que les formats IPRES, CSS, DGID ou banques ont été validés par les organismes ;
- que les règles fiscales 2026 sont juridiquement à jour ;
- que les performances tiennent avec plusieurs milliers de salariés et plusieurs tenants ;
- que les paramètres Vercel/Supabase de production sont correctement cloisonnés ;
- qu’un contrôle de pénétration ou une revue juridique RGPD/loi sénégalaise a été réalisé.

Les éléments non prouvés doivent être traités comme des **risques**, jamais comme des capacités acquises.

---

## 3. État de l’existant

### 3.1 Architecture observée

```text
Navigateur
  └─ React 18 + Vite + TypeScript + Tailwind
       ├─ React Router
       ├─ TanStack Query/Table
       └─ Supabase JS avec clé publishable
            ├─ Auth
            ├─ PostgREST / RPC
            ├─ PostgreSQL
            │    ├─ tables RH et paie
            │    ├─ fonctions PL/pgSQL
            │    ├─ RLS
            │    └─ vues d’états
            └─ Vercel pour le frontend statique
```

Le système est volontairement mince : la logique métier sensible est principalement en base, le frontend orchestre les formulaires et affiche les résultats. C’est une bonne direction pour la paie, à condition de formaliser les transactions, permissions, versions et journaux.

### 3.2 Capacités déjà présentes

#### RH

- sociétés, départements, emplois, conventions et catégories ;
- dossier salarié avec matricule, contrat, famille, coordonnées bancaires et situation ;
- congés, allocations, demandes et soldes ;
- présences, absences, maladie et heures supplémentaires ;
- affectation d’une structure salariale ;
- rôles `admin`, `rh`, `paie`, `salarie`.

#### Paie

- rubriques et structures salariales ;
- paramètres, plafonds, barèmes IR/TRIMF et parts familiales ;
- variables mensuelles et salaires additionnels ;
- traitement mensuel et bulletins ;
- calcul brut, retenues, charges patronales, net, provisions et cumuls ;
- simulateur net/brut par résolution du sursalaire ;
- livre de paie, synthèse des cotisations, charges et journal comptable ;
- impressions de bulletins, fiche salarié et livre.

#### Qualité métier déjà démontrée

Selon [`docs/ANALYSE_EXCEL.md`](./ANALYSE_EXCEL.md), le calcul d’août 2026 reproduit 25 bulletins avec un écart maximal annoncé inférieur à `10^-10 F`, pour un brut total de `4 929 179,09 F` et un net total de `4 662 739,89 F`. C’est un atout majeur pour un pilote.

### 3.3 Validation technique observée

- `npm run build --prefix web` : **succès** ;
- `npm run lint --prefix web` : **succès avec 2 avertissements**, dans `PrintPortal.tsx` et `auth.tsx` concernant Fast Refresh ;
- aucune suite de tests `*.test.*` ou `*.spec.*` n’a été trouvée dans le dépôt ;
- le build produit un bundle initial important, notamment un chunk d’environ 443 kB et un dashboard d’environ 395 kB avant gzip ;
- le dépôt de travail contient déjà des modifications non liées à cet audit ; elles ont été conservées.

Le build prouve la compilabilité, pas l’exactitude des permissions, de la paie ou de l’exploitation.

---

## 4. Analyse fonctionnelle par domaine

### 4.1 Dossier salarié et cycle de vie

**Forces :**

- fiche riche, structurée et déjà proche des besoins sénégalais ;
- matricule séquencé et verrouillé par trigger ;
- structures salariales et contrats rattachables ;
- données historisées dans le snapshot du bulletin.

**Manques bloquants pour un SaaS :**

- absence d’historique métier unifié des événements : embauche, mutation, promotion, augmentation, suspension, retour ;
- pas de gestion complète des versions de contrat ;
- pas de coffre documentaire ni expiration CNI, contrat, visite médicale, permis ou habilitation ;
- pas d’onboarding/offboarding guidé ;
- pas d’équipements, habilitations, formations sécurité ou aptitudes métiers miniers ;
- pas d’import salarié avec prévisualisation, validation ligne par ligne et rapport d’erreur ;
- peu de séparation entre identité légale, identité de connexion et personne salariée ;
- pas de modèle explicite d’organisation multi-site, centre de coût, projet ou hiérarchie manager.

**Priorité :** P1 après le verrouillage de paie, sauf documents d’identité et organisation qui doivent être anticipés pour le multi-tenant.

### 4.2 Congés, présence et temps

**Forces :**

- grille de présence et contrôles de non-duplication ;
- intégration des absences, maladies et heures supplémentaires dans les variables ;
- demandes et soldes de congés existants.

**Manques :**

- acquisition configurable selon pays, convention, ancienneté, type de congé et arrondis ;
- calendrier de jours fériés par pays, site et année ;
- planning d’équipes, rotation, repos minimum et travail de nuit ;
- import pointeuse et idempotence documentée ;
- workflow de correction avec justification, pièce jointe, approbation et impact avant/après ;
- délégation temporaire et périmètre manager ;
- application mobile/PWA hors connexion si les sites miniers ont une connectivité limitée ;
- validation formelle des heures supplémentaires.

**Risque métier :** une correction manuelle des présences peut modifier la paie sans motif obligatoire, auteur, avant/après et pièce justificative. Le champ `attendance_override` protège contre l’écrasement automatique, mais ne remplace pas un workflow d’approbation.

### 4.3 Moteur de paie

**Forces :**

- fonctions pures de calcul et fonctions de traitement séparées ;
- pleine précision `numeric` en base ;
- paramètres avec date d’effet ;
- trace JSON de calcul ;
- logique IPRES, CSS, IPM, CFCE, BRS, IR, TRIMF, indemnités et provisions ;
- solveur de sursalaire ;
- validation Excel étendue.

**Risques et manques :**

1. **Règles codées pour un seul contexte.** Les fonctions recherchent les paramètres par date mais pas par pays, société, convention ou tenant.
2. **Version de règle incomplète.** `effective_from` existe sur plusieurs tables, mais il n’existe pas de `rule_set` approuvé, signé, publié puis figé dans chaque paie.
3. **Réouverture/régularisation insuffisamment modélisée.** Une paie validée peut être supprimée par un administrateur ; cela n’est pas équivalent à une correction auditable.
4. **Absence de snapshot complet de toutes les entrées.** Le bulletin conserve une trace calculée, mais la gouvernance doit aussi figer paramètres, rubriques, affectations, variables, version de code et utilisateur.
5. **Tests non intégrés au dépôt.** La validation est documentée, mais les 25 cas d’août 2026 et les 720 cas IR/TRIMF ne sont pas visibles sous forme de test CI.
6. **Règles ambiguës à arbitrer.** Transport/heures, indemnité de licenciement, IPM des prestataires et autres anomalies Excel doivent être confirmées par un référent légal.
7. **Pas de moteur de régularisation rétroactive.** Il faut calculer l’écart, expliquer la période d’origine, générer le mois de régularisation et conserver le lien.
8. **Pas de gestion explicite des erreurs métier.** Le moteur doit distinguer absence de structure, donnée incohérente, paramètre manquant, dépassement de plafond et résultat calculé.

**Conclusion :** le moteur est un actif produit, mais sa valeur commerciale dépend de la gouvernance autour du calcul.

### 4.4 Cycle de paie

Le statut actuel `Brouillon → Calculée → Validée → Annulée` est un début, pas un contrôle interne complet.

Il manque :

- une table `payroll_periods` ou équivalent avec verrouillage ;
- checklist par étape ;
- contrôles d’anomalies bloquants et avertissements ;
- ségrégation préparateur / réviseur / approbateur / payeur ;
- double validation configurable ;
- snapshot immuable ;
- signature ou approbation horodatée ;
- export avec version et hash ;
- statut de transmission, accusé, rejet, correction et rapprochement ;
- réouverture exceptionnelle avec motif et approbation ;
- journal des totaux avant/après ;
- impossibilité technique de modifier les entrées rattachées à une paie clôturée.

La possibilité de supprimer un traitement validé, même limitée à `admin`, est acceptable pour un prototype mais dangereuse pour un service commercial : elle doit devenir une annulation ou une correction compensée, jamais une disparition de l’historique.

### 4.5 Déclarations, banque et comptabilité

Le journal comptable et les vues de contributions sont une bonne base de sortie. Il manque la chaîne opérationnelle :

```text
préparer → contrôler → approuver → exporter → transmettre
→ recevoir accusé/rejet → corriger → rapprocher → archiver
```

À livrer :

- format de virement configurable par banque ;
- contrôle de RIB, doublons, titulaire et statut ;
- fichier signé ou hashé, versionné et téléchargeable une seule fois par export ;
- exports IPRES, CSS, IR/TRIMF et autres formats officiellement acceptés ;
- jeux de test fournis par banque, cabinet et organismes ;
- axes analytiques : société, site, département, projet, centre de coût ;
- import des retours bancaires ;
- rapprochement avec les écritures comptables ;
- facture prestataire issue du BRS ;
- gestion des rejets partiels et reprise idempotente.

Sans ces fonctions, le produit calcule une paie mais ne ferme pas la boucle de production.

### 4.6 Documents, bulletins et signatures

L’impression navigateur est utile pour un pilote, mais elle ne suffit pas pour un SaaS :

- génération PDF serveur reproductible ;
- modèle versionné et langue ;
- hash et métadonnées du fichier ;
- stockage privé ;
- URL temporaire ;
- journal des téléchargements ;
- rétention et suppression ;
- signature électronique ou approbation interne ;
- envoi e-mail avec reprise sur erreur ;
- accès salarié uniquement après validation.

Les documents personnels ne doivent jamais être placés dans le dépôt ou les fixtures Git.

### 4.7 ESS/MSS et UX

Le salarié peut consulter ses bulletins validés et certaines demandes, mais le produit ne propose pas encore un vrai portail :

- soumission de congé, attestation et correction de présence ;
- suivi de statut et motif de refus ;
- centre de notifications ;
- calendrier d’équipe ;
- téléchargement des documents ;
- profil et coordonnées modifiables selon approbation ;
- espace manager avec périmètre hiérarchique ;
- délégation d’approbation ;
- expérience mobile prioritaire.

Le SaaS devra aussi traiter systématiquement les états chargement, vide, erreur, conflit concurrent et action irréversible. Les mutations frontend doivent afficher l’erreur, invalider correctement les caches et éviter les doubles soumissions.

### 4.8 Administration SaaS

Éléments absents ou à concevoir :

- tenant et abonnement ;
- plans, limites et facturation ;
- onboarding d’une société ;
- invitation d’utilisateurs ;
- membership avec rôle, périmètre et dates de validité ;
- suspension, export et suppression d’un tenant ;
- support et impersonation contrôlée ;
- feature flags par pays/plan ;
- journal d’administration de la plateforme distinct du journal métier ;
- métriques d’usage et quotas.

---

## 5. Audit technique et sécurité

### 5.1 Multi-tenant : risque critique

Les tables utilisent `company_id` sur certaines ressources, mais le schéma ne contient pas de tenant explicite ni de membership. Plusieurs politiques utilisent `using (true)` pour la lecture de référentiels. Les fonctions comme `payroll_settings_at()` et `tax_slab_at()` recherchent une ligne globale par date, sans `company_id`, pays ou `rule_set`.

Conséquence : une extension naïve à plusieurs entreprises pourrait exposer des référentiels, appliquer les règles d’une autre société ou laisser un utilisateur naviguer vers des données hors périmètre.

**Remédiation obligatoire :**

1. créer `tenants`, `tenant_memberships`, `tenant_settings` ;
2. rattacher chaque table métier à un tenant explicite ou démontrablement dérivable ;
3. créer `has_tenant_role(tenant_id, roles[])` ;
4. inclure le tenant dans toutes les requêtes, index et contraintes uniques ;
5. écrire des tests négatifs entre deux tenants ;
6. interdire toute requête métier sans tenant courant ;
7. distinguer `tenant_id` et `company_id` : un tenant peut gérer plusieurs sociétés.

### 5.1 bis Registre des risques prioritaires

| ID | Gravité | Risque | Preuve observée | Effet commercial | Remédiation |
|---|---|---|---|---|---|
| R-01 | Critique | Fuite ou mélange inter-tenant | rôles globaux, référentiels lus avec `using (true)`, fonctions de paramètres sans tenant | incident de confidentialité et paie erronée | tenant explicite, membership, RLS négative et tests d’isolation |
| R-02 | Critique | Paie validée supprimable | RPC `delete_payroll_entry` autorise la suppression admin d’une paie validée | perte d’historique, impossibilité d’audit ou de preuve | annulation/correction compensée, snapshot immuable, réouverture tracée |
| R-03 | Élevée | Règle fiscale non juridiquement confirmée | anomalies Excel documentées : licenciement, transport, IPM, maladie | redressement ou litige salarié | comité de validation pays, sources datées et fixtures approuvées |
| R-04 | Élevée | Correction de variables sans workflow complet | `attendance_override` empêche l’écrasement mais ne porte pas motif/approbation avant-après | manipulation ou erreur non détectée | demande de correction, justification, pièce, approbation et audit |
| R-05 | Élevée | Export opérationnel incomplet | pas de chaîne banque/organismes/rapprochement livrée | calcul obtenu mais travail manuel maintenu | contrats d’export, accusés, rejets et idempotence |
| R-06 | Élevée | Documents sensibles non industrialisés | registre initial présent, mais pas encore de fichier privé/version/rétention opérationnels | fuite, non-conformité, support coûteux | catalogue par exigence, stockage privé, antivirus, URL temporaire, validation RH, PDF serveur et journal d’accès |
| R-07 | Moyenne | Régression non détectée automatiquement | aucun fichier de test visible, validation surtout documentaire | évolution risquée du moteur | tests CI de 25 bulletins, propriétés et scénarios limites |
| R-08 | Moyenne | Accès et séparation des tâches trop grossiers | quatre rôles globaux, pas de périmètre manager ni MFA démontré | fraude interne ou erreur de validation | permissions par action, scope organisationnel, MFA et revue périodique |
| R-09 | Moyenne | Scalabilité non démontrée | listes riches côté frontend, chunks importants, aucune charge documentée | coût et lenteur avec plusieurs clients | pagination, index tenant/période, tests de charge et budgets |
| R-10 | Moyenne | Couplage au Sénégal | libellés, enums et fonctions codés pour un seul contexte | coût élevé d’ouverture régionale | catalogue de règles, pays, devise, calendrier, langue et formats versionnés |

#### Dossier administratif : contrôles de commercialisation

Le dossier salarié est désormais cadré comme un coffre documentaire soumis à
preuve, et non comme une fonctionnalité d'upload générique. La cible commerciale
exige les contrôles suivants avant activation :

- catalogue configurable des exigences, cinq sections UX et règles
  d'applicabilité (étranger, mineur, situation familiale) ;
- validation MIME, taille, extension neutralisée, antivirus et empreinte du
  fichier avant mise à disposition ;
- version immuable lors d'un remplacement ; le refus conserve le document,
  l'auteur, la date et le motif ;
- accès salarié/RH/admin par défaut, manager uniquement sur les types
  explicitement partageables ; documents médicaux et d'identité exclus du
  périmètre manager par défaut ;
- URL de téléchargement courte, révocable et journalisée ; aucun stockage
  public, lien permanent ou fichier personnel dans Git ;
- export PDF serveur avec index et état de complétude, sans contourner la RLS ;
- politique de conservation et expiration par type, purge contrôlée et preuve
  d'exécution ;
- tests négatifs d'isolation, revue des accès, scénario mobile et restauration
  avant la porte commerciale.

La notation **Documents et conformité** reste donc à `2/10` tant que les lots
D1 à D7 de la feuille de route ne sont pas exécutés et vérifiés.

### 5.2 RLS et fonctions privilégiées

La RLS est activée sur les tables principales, `has_role()` est `SECURITY DEFINER` avec `search_path` vide et des fonctions sensibles sont retirées de l’API. C’est une base saine.

Points à corriger :

- les rôles sont globaux à l’utilisateur, pas limités à une entreprise ;
- les référentiels lisibles par tout utilisateur authentifié peuvent devenir cross-tenant ;
- la visibilité `salary_slip_details` dépend du bulletin parent, mais doit être testée avec un salarié réel et des identifiants arbitraires ;
- les RPC privilégiées doivent vérifier tous les paramètres et le périmètre de la ressource ;
- les écritures sensibles doivent être uniquement des RPC transactionnelles ;
- les champs personnels et bancaires nécessitent une politique de moindre privilège ;
- les vues `security_invoker` doivent être testées avec chaque rôle et chaque tenant ;
- l’accès de service doit être séparé des accès opérateurs et journalisé.

### 5.3 Authentification et contrôle d’accès

L’authentification Supabase persiste la session et rafraîchit le jeton. L’interface masque les routes selon le rôle, mais la sécurité réelle repose sur la RLS, ce qui est correct.

Manques SaaS :

- MFA obligatoire pour administrateurs et approbateurs ;
- SSO/SAML/OIDC pour clients entreprise ;
- politique de mot de passe et récupération surveillée ;
- invitation et révocation de session ;
- séparation des rôles incompatibles ;
- limitation des tentatives et protection contre l’automatisation ;
- journal des changements de rôle ;
- revue périodique des accès ;
- session timeout pour postes partagés.

Le mécanisme « premier utilisateur peut se déclarer administrateur » est acceptable pour l’installation initiale, mais doit être désactivé ou limité après l’activation du tenant.

### 5.4 Auditabilité et non-répudiation

`audit_log` couvre certaines modifications importantes, notamment les matricules et référentiels. Il ne couvre pas encore de façon homogène :

- lecture de documents ;
- changement de compte bancaire ;
- changement d’identité ou de parts fiscales ;
- correction de présence ;
- correction de variable ;
- calcul, validation, réouverture et export de paie ;
- téléchargement ou envoi de bulletin ;
- changement de rôle et membership ;
- configuration des règles.

Le journal cible doit contenir : tenant, acteur, rôle, horodatage, action, ressource, valeurs filtrées avant/après, motif, corrélation, résultat et adresse technique si légalement autorisée. Il ne doit pas contenir de secrets ni recopier inutilement des données personnelles.

### 5.5 Données personnelles et conformité

Le produit traite CNI, téléphones, filiation, famille, banque, salaire et fiscalité. Il faut donc formaliser :

- registre des traitements ;
- finalités et base légale ;
- minimisation ;
- droits d’accès/correction/export/suppression ;
- conservation des bulletins, contrats, CNI et journaux ;
- chiffrement en transit et au repos ;
- rotation des secrets ;
- procédure d’incident ;
- sous-traitants et transferts hors zone ;
- masquage en support et environnement de test ;
- politique de suppression d’un salarié et d’un tenant.

La compatibilité « RGPD » ne doit pas être revendiquée sans analyse juridique adaptée au Sénégal, à l’UEMOA/CEDEAO et aux pays ciblés.

### 5.6 Intégrité et concurrence

Les contraintes uniques et triggers sont utiles. Il faut encore tester :

- deux calculs simultanés du même mois ;
- deux imports de présence ;
- deux corrections de variable ;
- double approbation concurrente ;
- suppression pendant génération d’export ;
- changement de référentiel pendant un calcul ;
- retry réseau après succès serveur ;
- idempotence des RPC ;
- verrouillage de période.

Le calcul et la validation doivent s’exécuter dans des transactions explicites avec verrous adaptés, identifiant de corrélation et résultat déterministe.

### 5.7 Performance et coûts

Le frontend est compilable et utilise le lazy loading des pages, mais le dashboard et le chunk initial sont lourds. Les requêtes `useEmployees()` chargent une fiche riche pour une liste ; cela peut devenir coûteux avec plusieurs milliers de salariés.

À mesurer :

- temps de chargement p50/p95 ;
- coût et durée d’un calcul de 25, 500 et 5 000 salariés ;
- pagination serveur ;
- index des clés étrangères et filtres tenant/période ;
- taille des vues et JSON `calculation` ;
- limites PostgREST ;
- connexions PostgreSQL et pooler ;
- coûts Vercel/Supabase par tenant.

---

## 6. Comparaison avec les logiciels open source

### 6.1 Lecture stratégique

Les alternatives sont des références de couverture fonctionnelle, pas nécessairement des briques à copier. Les licences, dépendances, marques et modules doivent être vérifiés avant toute réutilisation de code.

Références consultées :

- [Frappe HRMS](https://github.com/frappe/hrms) : le dépôt décrit plus de 13 modules, dont cycle salarié, congés, présence, dépenses, performance, paie et fiscalité, ainsi qu’une application mobile.
- [Odoo](https://github.com/odoo/odoo) : suite d’applications métier open source avec RH, comptabilité, documents et intégrations ; la licence et le périmètre exact doivent être vérifiés par module et version.
- [OrangeHRM Starter](https://github.com/OrangeHRM/OrangeHRM) : application HRM GPLv3 annoncée dans le dépôt, avec distribution Starter et application mobile.
- [Horilla HRMS](https://github.com/horilla/horilla-hr) : dépôt Django/Python affichant une licence LGPL-2.1 et couvrant RH, recrutement, onboarding, présence, paie, documents, imports et API.
- [Sentrifugo](https://github.com/sapplica/sentrifugo) : référence historique à examiner uniquement pour l’inventaire fonctionnel ; l’âge des dépendances doit être vérifié avant toute utilisation.

Ces liens sont des sources de benchmark, pas une autorisation d’incorporation. Une analyse juridique séparée doit confirmer les obligations de distribution, les marques, les dépendances transitives et les modules communautaires.

| Solution | Points forts à étudier | Limites pour SOMA-RH | Décision |
|---|---|---|---|
| **Frappe HR / ERPNext HRMS** | cycle salarié, onboarding, mouvements, congés, présence, dépenses, avances, objectifs, évaluations, paie et portail dans un ERP intégré | localisation Sénégal à construire ; architecture et modèle différents ; licence et modules à examiner séparément | **Référence fonctionnelle principale** |
| **Odoo Community** | employés, documents, dépenses, approbations, comptabilité, écosystème et intégrations | couverture paie souvent dépendante des localisations/modules ; risque de complexité et de dépendances ; vérifier licences | **Référence d’intégration, pas moteur à reprendre** |
| **OrangeHRM** | parcours RH généraliste, congés, dossiers et self-service ; bonne référence UX | paie locale et architecture éloignées ; couverture ERP/finance limitée selon édition | **Référence ESS/UX** |
| **Horilla HRMS** | approche moderne, modules RH, congés, présence et self-service dans une base open source récente | maturité commerciale, paie locale, support et licences à vérifier ; localisation Afrique limitée | **À surveiller pour les parcours RH** |
| **Sentrifugo** | inventaire historique de fonctions HRMS | projet vieillissant et dépendances obsolètes ; sécurité et maintenabilité insuffisantes | **Ne pas utiliser comme base technique** |
| **Solutions africaines/francophones open source** | connaissance des pratiques locales, paie et déclarations potentiellement plus proches | disponibilité, licence, qualité de code et pérennité variables ; audit obligatoire | **Benchmark local à poursuivre avant lancement pays** |

### 6.2 Ce que SOMA-RH doit prendre de Frappe HR

- modèle explicite du cycle de vie salarié ;
- workflows configurables plutôt que statuts codés dans les écrans ;
- entités organisationnelles et périmètres manager ;
- avances, prêts, frais et affectations ;
- portail et notifications ;
- séparation claire entre référentiels, transactions et documents ;
- extensibilité par pays et société.

### 6.3 Ce qu’il ne faut pas copier

- un modèle de paie générique qui diluerait la fidélité aux règles sénégalaises ;
- une dépendance ERP lourde si le besoin initial est la paie locale ;
- du code sans audit de licence et de sécurité ;
- des workflows qui permettent de contourner la clôture ;
- des règles fiscales stockées uniquement dans du code.

### 6.4 Différenciation face aux solutions généralistes

SOMA-RH ne gagnera pas sur le nombre de modules face à Odoo ou Frappe. Il peut gagner sur :

- délai de mise en œuvre pour le Sénégal ;
- import Excel et comparaison explicable ;
- qualité des bulletins et états locaux ;
- simplicité pour un cabinet ou une PME ;
- traçabilité de chaque correction ;
- expérience francophone mobile ;
- déploiement régional par packs de règles.

---

## 7. Modèle SaaS cible

### 7.1 Hiérarchie des entités

```text
Platform
  └─ Tenant (client, abonnement, région, plan)
       ├─ Membership (utilisateur, rôle, périmètre, dates)
       ├─ Company (entité légale)
       │    ├─ sites / départements / centres de coût
       │    ├─ règles et conventions
       │    └─ salariés / contrats / paie
       ├─ Documents
       ├─ Integrations
       └─ Audit / usage / facturation
```

### 7.2 Modules fonctionnels cibles

**P0 — vendre sans risque :**

- tenant et memberships ;
- paie clôturable et auditable ;
- tests de calcul et RLS ;
- portail bulletins ;
- documents privés minimum ;
- exports banque et déclaratifs validés ;
- sauvegarde, restauration et observabilité.

**P1 — devenir un SaaS RH crédible :**

- onboarding/offboarding ;
- historique salarié ;
- congés et présence configurables ;
- ESS/MSS complet ;
- frais, missions, acomptes et prêts ;
- axes analytiques ;
- notifications et modèles de documents.

**P2 — expansion et différenciation :**

- compétences, formation et habilitations ;
- analytique avancée et prévision ;
- assistant IA explicable ;
- mobile/PWA hors ligne ;
- multi-pays et règles versionnées ;
- API publique et marketplace d’intégrations.

### 7.3 Architecture de règles internationales

Introduire une abstraction commune :

```text
rule_set
  id
  tenant_id ou catalogue global
  country_code
  region_code
  currency
  effective_from
  effective_to
  status: draft | reviewed | approved | active | retired
  source_reference
  approved_by
  approved_at
  version
```

Chaque paie doit référencer le `rule_set` exact. Les paramètres, plafonds, barèmes, conventions, rubriques, jours fériés et formats déclaratifs doivent être rattachables à cette version.

Le moteur doit recevoir un contexte explicite : tenant, société, pays, période, calendrier, salarié, convention et version. Une fonction qui « prend la dernière ligne par date » sans contexte ne convient pas à l’international.

---

## 8. Roadmap priorisée

### Phase 0 — 0 à 6 semaines : rendre le pilote sûr

**Livrables :**

- tests automatisés de régression août 2026 ;
- tests unitaires IR/TRIMF et propriétés du moteur ;
- tests RLS avec deux sociétés et quatre rôles ;
- tables de période, checklist, anomalies et approbations ;
- verrouillage des variables et référentiels après snapshot ;
- remplacement de la suppression d’une paie validée par annulation/correction ;
- audit des corrections de présence, variables, paie et rôles ;
- sauvegarde et restauration testées ;
- MFA administrateurs ;
- données de démonstration synthétiques ;
- procédure d’incident et de reprise.

**Gabarit de ticket :**

```text
Besoin utilisateur
Règles métier
Données / migration / index / RLS
Interface et états d’erreur
Sécurité et périmètre
Critères d’acceptation
Tests nominaux, limites et régression août 2026
Dépendances et décision légale
```

**Go/no-go :** aucun tenant client réel avant la réussite des tests RLS, de restauration et de clôture.

### Phase 1 — 6 à 12 semaines : première offre commercialisable

- tenant explicite et memberships ;
- onboarding d’une société ;
- ESS bulletins/congés/attestations ;
- coffre documentaire privé ;
- PDF serveur et envoi e-mail ;
- exports bancaires et premiers formats sociaux/fiscaux ;
- journal d’export et rapprochement manuel ;
- support, métriques, quotas et journal plateforme ;
- tests de charge sur volumes cibles ;
- contrat de service, politique de conservation et DPA.

### Phase 2 — 3 à 6 mois : produit RH régional

- historique salarié et workflow de mouvements ;
- calendrier pays/site et politiques de congés ;
- pointeuses, planning, missions, frais, prêts et acomptes ;
- axes analytiques et intégration comptable ;
- délégation manager et notifications multicanal ;
- catalogue de règles Sénégal versionné et processus d’approbation.

### Phase 3 — 6 à 12 mois : internationalisation

- pays et devises séparés ;
- calendrier et langues ;
- fiscalité/social par pays ;
- règles de calcul composables ;
- formats bancaires et déclaratifs par pays ;
- séparation produit/configuration/données ;
- observabilité multi-région et exigences de résidence des données ;
- API publique versionnée.

---

## 9. Plan de tests minimal avant vente

### 9.1 Moteur

- 25 bulletins d’août 2026, tolérance `< 0,000001 F` ;
- 720 cas IR/TRIMF ;
- CDD, COD, CDI, stage, apprentissage et prestation ;
- zéro, plafond et dépassement de chaque cotisation ;
- parts familiales 1 à 5 et valeur invalide ;
- absence, maladie, heures supplémentaires et congé ;
- entrée, sortie, licenciement et retraite ;
- régularisation d’un mois antérieur ;
- paramètres avec changement de date d’effet ;
- recalcul idempotent.

### 9.2 Sécurité

- salarié A ne voit jamais salarié B ;
- manager ne voit que son périmètre ;
- RH ne modifie pas les paramètres de paie ;
- paie ne modifie pas les identités RH sans permission ;
- admin plateforme ne lit pas le contenu métier sans piste d’audit ;
- tenant A ne voit jamais tenant B ;
- URL document expirée et révoquée ;
- RPC appelée avec un identifiant hors périmètre ;
- session expirée, rôle retiré et compte suspendu.

### 9.3 Workflow

- double validation ;
- conflit de validation concurrente ;
- période verrouillée ;
- correction après clôture ;
- réouverture avec motif ;
- export répété sans doublon ;
- rejet bancaire partiel ;
- restauration d’une sauvegarde ;
- suppression conforme d’un tenant de test.

### 9.4 Produit

- parcours mobile ;
- import avec erreurs partielles ;
- temps de réponse p95 ;
- accessibilité clavier et lecteurs d’écran ;
- état vide/chargement/erreur ;
- e-mail non délivré et reprise ;
- impression/PDF déterministe ;
- localisation et formats de date/devise.

---

## 10. Structure de données pour une restructuration assistée par IA

L’IA ne doit pas être autorisée à modifier directement une paie ou une migration de production. Elle doit travailler sur des artefacts structurés et proposer des changements vérifiables.

### 10.1 Fiche de capacité

```yaml
id: payroll-period-approval
domain: payroll
tenant_scope: required
actors: [paie, rh, direction]
preconditions: [period_open, inputs_complete]
state_machine: [draft, calculated, reviewed, approved, paid, closed, reopened]
data:
  tables: [payroll_periods, payroll_anomalies, payroll_approvals]
  invariants:
    - closed_period_is_immutable
    - approval_separation_of_duties
security:
  rls: tenant_and_membership
  audit: required
acceptance:
  - no mutation after close
  - every export references a snapshot
tests:
  - concurrent_approval
  - reopen_with_reason
```

### 10.2 Fiche de règle de paie

```yaml
id: senegal-ipres-rg
country: SN
rule_set: 2026.1
effective_from: 2026-01-01
source_reference: "référence légale ou convention validée"
inputs: [gross_pay]
outputs: [employee_amount, employer_amount]
rounding: none_in_storage
caps:
  - base: min(gross_pay, configured_ceiling)
approval:
  status: approved
  approved_by: role:payroll_compliance
fixtures:
  - gross: 4929179.09
    expected: ...
```

### 10.3 Pipeline IA sûr

```text
documentation / ticket
  → extraction structurée
  → proposition de schéma ou règle
  → revue humaine paie/juridique
  → migration versionnée
  → tests unitaires + RLS + non-régression
  → prévisualisation sur données synthétiques
  → approbation
  → déploiement contrôlé
  → observation et possibilité de retour
```

### 10.4 Cas d’usage IA autorisés

- expliquer un bulletin à partir de sa trace et de la version de règle ;
- détecter une variation inhabituelle ;
- générer une checklist ou un brouillon d’attestation ;
- proposer un mapping d’import ;
- rechercher dans la documentation autorisée ;
- produire un rapport d’anomalies.

### 10.5 Cas interdits sans approbation humaine

- écrire directement une variable de paie ;
- valider ou clôturer une période ;
- modifier un barème ;
- changer un RIB ;
- envoyer une déclaration ;
- supprimer un document ou un tenant ;
- répondre à une question avec des données hors périmètre ;
- transmettre des données personnelles à un fournisseur externe non approuvé.

---

## 11. Décisions retenues pour la prochaine restructuration

Les décisions suivantes sont désormais actées et servent de base au prompt opératoire
[PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md](./PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md) :

1. le produit reste limité à une seule entreprise : la SOMA ;
2. le pays cible immédiat est le Sénégal ;
3. le déploiement et les tests se font en local uniquement ;
4. le dépôt actuel reste intact ; une nouvelle copie est créée dans un nouveau dossier ;
5. la base est PostgreSQL local, idéalement via Supabase CLI local afin de conserver Auth, API, RLS et RPC ;
6. les données de test sont synthétiques et ne contiennent aucune donnée personnelle réelle ;
7. la priorité est la fiabilité du moteur, la clôture de paie, la sécurité locale et la reproductibilité ;
8. le multi-tenant, la facturation et l’internationalisation sont hors périmètre immédiat ;
9. les rôles, la conservation des données, les formats bancaires/déclaratifs et les décisions légales Sénégal restent à formaliser dans l’environnement local ;
10. toute évolution future vers plusieurs pays ou entreprises devra partir d’une base locale testée et documentée.

Questions à traiter après la reconstruction locale :

- quels rôles séparent préparation, revue, approbation, paiement et administration ?
- quelle politique de conservation s’applique aux bulletins, CNI, contrats, RIB et audits ?
- quels organismes et banques fournissent les formats de test officiels ?
- quelles règles Excel sont contractuelles, et lesquelles doivent être corrigées ?
- quel niveau de signature est requis pour bulletin, attestation et clôture ?
- quels sites miniers exigent un mode hors ligne ?
- quel modèle de prix et quel support seront retenus lors de la commercialisation ?

---

## 12. Conclusion finale

SOMA-RH n’est pas un simple prototype visuel : la base de paie, les règles Excel, les états, les rôles et les premières protections constituent un socle différenciant. La preuve d’août 2026 est suffisamment forte pour justifier un pilote commercial accompagné.

En revanche, le dépôt ne doit pas être présenté aujourd’hui comme un SaaS RH/paie multi-entreprises autonome. Les lacunes les plus dangereuses sont structurelles :

- absence de multi-tenant explicite ;
- RLS non scopée par tenant ;
- cycle de paie non immuable ;
- suppression d’une paie validée ;
- audit incomplet ;
- exports opérationnels et déclaratifs non industrialisés ;
- documents personnels sans coffre/version/rétention ;
- absence de tests automatisés visibles ;
- internationalisation non séparée du code Sénégal ;
- exploitation et restauration non prouvées.

La séquence recommandée est donc :

1. **copier et isoler le projet localement** ;
2. **recréer PostgreSQL, Auth, API, migrations et seeds synthétiques** ;
3. **sécuriser la paie et prouver les invariants** ;
4. **fermer la boucle banque/déclarations/documents pour le Sénégal** ;
5. **livrer ESS/MSS et cycle salarié dans le périmètre SOMA** ;
6. **seulement ensuite décider d’une architecture multi-entreprises ou internationale**.

Le choix stratégique est de préserver le moteur de paie local et de construire autour de lui une plateforme gouvernée, plutôt que de transformer SOMA-RH en copie large d’Odoo ou Frappe HR.
