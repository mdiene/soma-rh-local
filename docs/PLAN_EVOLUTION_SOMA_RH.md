# SOMA-RH — canevas d'évolution du SaaS RH et paie

> **Version :** 1.1 — 2 novembre 2026  
> **Périmètre :** application web SOMA-RH, moteur de paie sénégalais, portail RH et intégrations  
> **Objectif :** transformer l'application actuelle en un SaaS RH/paie fiable, auditable et extensible pour des PME, groupes et sociétés minières d'Afrique francophone.

## 0. Résumé exécutif

SOMA-RH dispose déjà d'un socle plus avancé qu'un simple prototype :

- moteur de paie PostgreSQL reproduisant les formules Excel avec une validation sur 25 bulletins d'août 2026 ;
- dossiers salariés, contrats, conventions, catégories et structures salariales ;
- congés, présences et reprise des absences/maladies/heures supplémentaires dans les variables de paie ;
- calcul, contrôle, validation, bulletins, livre de paie et états comptables ;
- paramètres, rôles, RLS et premières traces d'audit ;
- simulateur net/brut et correction manuelle des variables issues des présences.

Le principal enjeu n'est donc pas de remplacer le moteur existant, mais de construire autour de lui un **cycle de paie contrôlé**, un **portail salarié/manager**, une **couche documentaire et déclarative**, puis les modules RH qui créent de la valeur au-delà du bulletin.

### Priorités recommandées

1. **Fiabiliser la clôture et l'audit de paie** : périodes verrouillées, checklist, anomalies, approbations, réouverture contrôlée.
2. **Livrer l'ESS/MSS** : demandes, validations, bulletins, attestations,
   notifications et dossier administratif guidé.
3. **Industrialiser les sorties** : virements bancaires, déclarations IPRES/CSS/impôts, journal comptable importable et factures prestataires.
4. **Gérer le cycle de vie salarié** : onboarding, mouvements, équipements, départ et archivage.
5. **Ajouter les modules différenciants** : missions/frais, prêts/acomptes, compétences, évaluations et analytique RH.

---

## 1. Sources et méthode

### 1.1 Sources locales analysées

- `README.md` : modules, routes fonctionnelles, migrations et correspondance Frappe HR.
- [`docs/ANALYSE_EXCEL.md`](./ANALYSE_EXCEL.md) : 13 feuilles Excel, 114 colonnes de calcul, macros VBA, règles fiscales/sociales et écarts connus.
- `web/src/pages/` : écrans actuels de tableau de bord, salariés, congés, présences, variables, paie, bulletins, états, paramètres et simulateur.
- `supabase/migrations/` : schéma RH/paie, RLS, moteur, états, audit, référentiels, présences et corrections manuelles.
- `graphify-out/graph.json` : carte du code et des relations entre modules.

Le fichier Excel source n'est pas présent dans les fichiers suivis localement ; l'analyse ci-dessous utilise la documentation fonctionnelle versionnée et les résultats de validation qui en reprennent le contenu.

### 1.2 Références open source consultées

| Produit | Ce qu'il apporte comme référence | Limite pour SOMA-RH |
|---|---|---|
| [Frappe HR](https://github.com/frappe/hrms) / [documentation](https://docs.frappe.io/hr/introduction) | cycle de vie salarié, onboarding, mouvements, congés, présence, frais, avances, objectifs, évaluations, paie, application mobile | paie et fiscalité doivent être localisées pour le Sénégal ; ne pas copier son modèle sans préserver le moteur SOMA |
| [OrangeHRM Starter](https://github.com/OrangeHRM/OrangeHRM) | socle RH généraliste, congés, employés et application mobile ; licence GPL annoncée dans le dépôt | paie locale et architecture très différente ; utile pour les parcours UX et le libre-service |
| [Odoo Community](https://github.com/odoo/odoo) | intégration RH/comptabilité, employés, dépenses, documents, approbations et ERP | le périmètre RH/paie dépend des modules et de la localisation ; vérifier chaque licence et module avant réutilisation |
| [Sentrifugo](https://github.com/sentrifugo/sentrifugo) | ancien exemple de HRMS configurable | projet et dépendances vieillissants ; à utiliser pour l'inventaire fonctionnel, pas comme base technique |

**Règle de décision :** s'inspirer des workflows et des concepts, mais ne pas importer de code ou de données sans vérifier la licence, les dépendances, la compatibilité avec Supabase et la conformité aux règles sénégalaises.

---

## 2. Diagnostic de l'existant

### 2.1 Capacités déjà présentes — à préserver

| Domaine | État observé | Conséquence produit |
|---|---|---|
| Dossier salarié | identité, famille, contrat, convention, catégorie, matricule et fiche imprimable | compléter avec historique et documents, sans refaire le dossier de base |
| Référentiels | conventions, catégories, emplois, types de contrat, modes de paiement, activation et journal | ajouter versionnement, import/export et dates d'effet explicites |
| Paie | rubriques, structures, affectations, variables, calcul en base, simulateur et validation | concentrer l'effort sur les contrôles, versions et sorties |
| Présences | grille journalière, contrôle 24 h, absence/maladie/HS, report vers paie | ajouter calendriers, jours fériés, pointage et workflow de correction |
| Congés | demandes, attribution, validation, soldes et bon de congé | ajouter politiques d'acquisition, délégation et portail manager |
| États | livre de paie, contributions, charges, écritures, cumuls et export CSV | ajouter formats bancaires/déclaratifs et rapprochement |
| Sécurité | Auth Supabase, rôles, RLS et traces d'audit partielles | renforcer séparation des tâches, MFA/SSO, rétention et journal exploitable |
| Impression | bulletin, lots de bulletins, fiche, bon de congé et livre Sage | compléter par PDF serveur, signature, envoi et archivage |

### 2.2 Tableau de suivi : réalisé, en cours et restant

Ce tableau est le point de contrôle du plan. **En cours** désigne une modification déjà engagée dans l'arbre de travail, mais qui doit encore être validée par build/tests et intégrée au produit. **À faire** désigne une capacité non encore implémentée ou non suffisamment industrialisée.

| Domaine / capacité | État au 30/10/2026 | Ce qui est déjà fait | Ce qui reste à faire | Priorité |
|---|---|---|---|---|
| Socle technique | **Fait** | React/Vite/TypeScript, Supabase/PostgreSQL, Auth, TanStack Query/Table, déploiement Vercel | observabilité, sauvegardes testées, gestion multi-tenant et plan d'incident | P0 |
| Dossier salarié | **Fait / partiel** | fiche salarié, matricule, contrat en cours, convention, catégorie, structure salariale, impression | historique des mouvements, coffre documentaire, onboarding/offboarding, équipements | P1 |
| Référentiels RH et paie | **Fait / partiel** | emplois, contrats, modes de paiement, conventions, catégories, taux, plafonds, barèmes et activation | version de règle avec source, approbation, date de fin et simulation avant activation | P0 |
| Moteur de paie | **Fait** | calcul PL/pgSQL, rubriques, cotisations, impôts, provisions, cumuls et simulateur ; validation Excel d'août 2026 | conserver les tests de non-régression et formaliser les régularisations rétroactives | P0 |
| Variables mensuelles | **Fait / partiel** | grille de saisie, reprise des présences et correction manuelle protégée par `attendance_override` | motif obligatoire, auteur, avant/après, pièce jointe et impact visible sur le bulletin | P0 |
| Présences et heures supplémentaires | **Fait / partiel** | grille journalière, contrôle 24 h, absence, maladie, HS et synchronisation vers la paie | calendrier/jours fériés, import pointeuse, planning de rotation, workflow manager | P1 |
| Congés | **Fait / partiel** | demandes, validation, soldes, attribution et bon de congé imprimable | acquisition configurable, délégation, calendrier équipe et portail salarié/manager complet | P0 |
| Cycle de paie | **Partiel** | traitements brouillon/calculé/validé, contrôles et suppression encadrée | périodes dédiées, checklist, anomalies bloquantes, double approbation, snapshot, clôture, réouverture et régularisation | P0 |
| États de paie | **En cours** | refonte du tableau groupé avec blocs, colonnes figées, recherche, tri, sous-totaux, contrôles et export CSV | valider build/tests, droits d'accès, exports complets et formats attendus par les destinataires | P0 |
| Livre de paie imprimable | **En cours** | livre au format Sage, rubriques dynamiques, 7 salariés/page, total, présence, absences, HS, provisions et coût total | validation visuelle A4, cas sans rubrique, pagination, comparaison avec le modèle Excel/Sage | P0 |
| Cotisations et écritures comptables | **Fait / partiel** | états IPRES/CSS/IPM/CFCE, charges patronales, cumuls, journal équilibré et export CSV | axes analytiques, import comptable, rapprochement et journal d'export | P0 |
| Déclarations sociales/fiscales | **À faire** | données sources disponibles dans les vues de cotisations | formats IPRES, CSS, IR/TRIMF, suivi des transmissions, accusés, rejets et corrections | P0 |
| Virements bancaires | **À faire** | mode de paiement salarié référencé, dont virement | contrat d'export par banque, contrôle RIB, fichier, approbation, retour bancaire et rapprochement | P0 |
| Bulletins et documents | **Fait / partiel** | bulletin imprimable, lots de bulletins, consultation des bulletins validés | PDF serveur, stockage privé, versions, attestations, signature, expiration et journal des accès | P0 |
| Portail salarié (ESS) | **Partiel** | accès aux bulletins personnels validés | demandes de congé/attestation/correction, notifications, documents et suivi des statuts | P0 |
| Portail manager (MSS) | **À faire** | validations RH existantes dans les écrans de gestion | périmètre d'équipe, validations, délégation, commentaires et alertes | P0 |
| Frais et missions | **À faire** | aucune couverture complète identifiée | ordre de mission, justificatifs, avances, approbations et intégration paie/comptabilité | P1 |
| Acomptes et prêts | **À faire** | retenues diverses prévues dans les rubriques | demandes, échéanciers, plafonds, prélèvements et solde de sortie | P1 |
| Cycle de vie salarié | **À faire** | données d'embauche et contrat courant | onboarding, mutations, augmentations, départ, solde de tout compte et restitution du matériel | P1 |
| Analytique RH | **Partiel** | tableau de bord mensuel/annuel, effectifs, masse et alertes de base | absentéisme, turnover, coûts par site/projet, prévisions et exports décisionnels | P1 |
| Sécurité et audit | **Partiel** | Auth, rôles, RLS, matricule journalisé et contrôles côté base | séparation préparateur/approbateur/payeur, MFA/SSO, audit complet et rétention | P0 |
| Tests et exploitation | **Partiel** | validation de référence sur 25 bulletins et contrôles de cohérence des états | CI, tests RLS, tests d'idempotence, restauration, alertes et mesure des traitements | P0 |
| SaaS multi-entreprises | **À faire** | société présente dans le modèle actuel | tenant explicite, isolation, provisioning, limites, abonnement, facturation et administration client | P1 |
| IA assistée | **À faire** | aucune automatisation IA métier requise à ce stade | explication des bulletins, recherche autorisée et détection d'anomalies sans validation automatique | P2 |

### 2.3 Lecture rapide de l'avancement

| Niveau | Interprétation | Décision |
|---|---|---|
| **Fait** | Fonction utilisable et déjà intégrée au socle | préserver et couvrir par des tests |
| **Fait / partiel** | Fonction présente mais incomplète pour un SaaS de production | compléter avant commercialisation |
| **En cours** | Modification engagée dans le dépôt, validation encore nécessaire | terminer, tester puis documenter |
| **À faire** | Capacité absente ou seulement prévue dans le plan | planifier selon la priorité et les dépendances |

**Conclusion de suivi :** le cœur calculatoire et le premier niveau de reporting sont déjà solides. Le prochain verrou produit n'est pas le calcul du brut/net, mais la **clôture auditée**, les **sorties réglementaires/bancaires** et le **portail ESS/MSS**.

### 2.4 Écarts critiques à traiter

1. **Cycle de paie incomplet** : pas encore de workflow formel `brouillon → contrôlé → approuvé → validé → payé → clôturé`, avec responsables, horodatage et motif de réouverture.
2. **Corrections et exceptions** : la correction manuelle des présences est utile, mais doit afficher l'auteur, la valeur avant/après, le motif, la preuve et l'impact sur le bulletin.
3. **Référentiel légal** : les taux et barèmes sont paramétrables, mais il manque un espace de versionnement, de justification et de simulation avant mise en production.
4. **Portail salarié/manager** : consultation des bulletins existe, mais il faut couvrir les demandes, validations, documents, notifications et délégations.
5. **Déclaratif et paiement** : les états internes existent ; les fichiers bancaires, déclaratifs et les accusés de dépôt restent à industrialiser.
6. **Données RH longitudinales** : historique des contrats, mutations, augmentations, absences et documents à compléter.
7. **SaaS multi-entreprises** : expliciter le tenant, la facturation, les limites, le provisioning, les exports et l'isolation inter-entreprises.
8. **Qualité opérationnelle** : tests de non-régression, jeux de cas légaux, import contrôlé, reprise après erreur et observabilité doivent devenir des fonctionnalités produit.

### 2.5 Points Excel à arbitrer avant automatisation

Ces éléments sont documentés comme anomalies ou règles reprises à l'identique. Ils ne doivent pas être “corrigés” silencieusement :

- transport et kilométrique : mélange possible entre heures et jours d'absence ;
- indemnité de licenciement : base mensuelle contre moyenne des 12 derniers mois ;
- IPM appliquée aux prestataires ;
- arrondis et absence d'arrondi du net ;
- taux maladie et base de retenue d'absence ;
- règles de congés, précarité et ancienneté ;
- formats des déclarations et obligations réellement acceptés par IPRES, CSS et l'administration fiscale.

Chaque changement doit être enregistré comme une **version de règle**, approuvé par la direction/paie et couvert par un cas de test de référence.

---

## 3. Vision produit cible

### 3.1 Proposition de valeur

> **SOMA-RH relie le dossier salarié, le temps, les absences et les éléments variables à une paie sénégalaise explicable, contrôlable et exportable, avec un portail simple pour le salarié et le manager.**

### 3.2 Architecture fonctionnelle

```text
                         SOMA-RH SaaS
                              │
 ┌────────────────────────────┼────────────────────────────┐
 │                            │                            │
 Core RH                    Temps & absences              Paie locale
 │                            │                            │
 dossier / contrats           calendrier / pointage        règles versionnées
 mouvements / documents      congés / maladie / HS        variables / contrôles
 organisation / équipements  validations                  clôture / bulletins
 │                            │                            │
 └───────────────┬────────────┴───────────────┬────────────┘
                 │                            │
          Portail ESS/MSS                 Finance & conformité
          demandes / validations           virements / déclarations
          bulletins / attestations         comptabilité / audits
                 │                            │
                 └───────────────┬────────────┘
                                 │
                         Analytique & IA assistée
                    masse salariale / alertes / recherche
```

### 3.3 Principes non négociables

- Le moteur de paie reste calculé côté base et garde une précision numérique complète.
- Toute règle possède une date d'effet, une source, un auteur, un statut et des tests.
- Une paie validée est immuable ; une correction passe par une régularisation ou une réouverture autorisée.
- Les données personnelles sont minimisées, chiffrées lorsque nécessaire, protégées par tenant et par rôle.
- Les montants ne sont arrondis qu'à l'affichage selon la convention de l'application.
- Les workflows sont explicites et auditables ; aucun “fallback” silencieux.
- Les fonctions IA proposent, expliquent et signalent ; elles ne valident jamais seules une paie ou une déclaration.

---

## 4. Modules à ajouter ou renforcer

### A. Gouvernance de la paie — priorité P0

#### Fonctionnalités

- périodes de paie avec dates d'ouverture, échéance et clôture ;
- checklist configurable : salariés actifs, affectations, variables, présences, congés, anomalies, contrôles de totaux ;
- tableau des anomalies bloquantes et avertissements ;
- double validation : préparateur paie puis approbateur ;
- snapshot immuable des paramètres, rubriques, variables et résultats ;
- réouverture uniquement par administrateur avec motif obligatoire ;
- régularisation rétroactive sur une période ultérieure ;
- comparaison avec le mois précédent et simulation “avant/après” ;
- rapprochement entre net à payer, journal comptable et total du fichier bancaire.

#### Données à prévoir

`payroll_periods`, `payroll_checklist_items`, `payroll_approvals`, `payroll_snapshots`, `payroll_adjustments`, `payroll_anomalies`, `payroll_reopenings`.

#### Critères d'acceptation

- impossible de modifier une période clôturée via l'API normale ;
- chaque bulletin validé est recalculable à partir de son snapshot ;
- toute différence de total affiche le détail par salarié et rubrique ;
- le contrôle d'août 2026 reste identique : brut `4 929 179,09 F`, net `4 662 739,89 F`, écart inférieur à `0,000001 F`.

### B. Portail salarié et manager (ESS/MSS) — priorité P0

#### Salarié

- tableau de bord : dernier bulletin, solde de congés, demandes en cours ;
- téléchargement des bulletins et attestations ;
- dossier administratif guidé en cinq sections, avec progression et statuts ;
- dépôt mobile par fichier, glisser-déposer ou capture caméra ;
- remplacement, prévisualisation, validation RH et motif de refus ;
- impression PDF de la checklist complète pour le salarié et la RH ;
- demande de congé, absence, attestation, acompte et correction de présence ;
- consultation des informations personnelles avec demande de modification ;
- notifications e-mail et in-app ;
- historique des actions et statut de chaque demande.

#### Manager

- équipe et organigramme limité au périmètre autorisé ;
- validation des congés, présences et frais ;
- alertes d'absence et de dépassement ;
- délégation temporaire pendant les congés ;
- commentaires et pièces jointes.

#### Critères d'acceptation

- un salarié ne voit que ses données et ses bulletins validés ;
- un manager ne voit que son périmètre organisationnel ;
- une demande possède un workflow, un SLA, un historique et un motif de refus ;
- le changement d'une donnée sensible exige confirmation et journalisation.

#### Dossier administratif — spécification UX/UI retenue

L'écran salarié s'appelle **Mon Dossier Administratif**. Il comporte une barre de
recherche, une progression globale et une grille de cartes responsive. Une carte
vide propose `Charger` et `Scanner`; une carte chargée affiche une miniature ou
une icône PDF, le nom du fichier, `Visualiser` et `Remplacer`. Les cartes ont
un état accessible par couleur et texte, avec transition douce et état d'erreur
explicite.

Le catalogue initial comprend 18 exigences réparties ainsi :

| Section | Exigences |
|---|---|
| État civil & identité | identité, naissance, nationalité/résidence, casier, photo, contacts d'urgence |
| Qualification & parcours | CV, diplômes/attestations, certificats de travail |
| Famille & social | situation matrimoniale, enfants, scolarité, CNSS/IPRES |
| Aptitude médicale | aptitude médicale, maladie/maternité |
| Cas spécifiques | permis/visa, autorisation parentale |

Le total de 18 est une référence de démonstration ; en production, les exigences
conditionnelles sont retirées du dénominateur selon la situation du salarié.
L'objectif est d'éviter de demander un visa à un salarié sénégalais ou une
autorisation parentale à un majeur.

#### Parcours RH et manager

- **RH/admin** : accès à la fiche documentaire de tout salarié autorisé,
  validation/refus avec motif, remplacement assisté, export PDF complet et
  consultation du journal.
- **Manager** : accès limité au périmètre organisationnel et uniquement aux
  documents explicitement partageables ; aucune pièce médicale ou d'identité par
  défaut.
- **Salarié** : accès à ses documents, dépôt/remplacement, progression et
  téléchargement de son dossier.

Le bouton **Tout soumettre pour validation** ne soumet que les cartes chargées
et non déjà validées. Toute soumission crée une version et une trace d'audit.

### C. Déclarations, banque et comptabilité — priorité P0/P1

- fichier de virement bancaire configurable par banque et mode de paiement ;
- contrôle des coordonnées bancaires et détection des doublons ;
- export IPRES, CSS, IR/TRIMF et états attendus par l'administration ;
- journal comptable avec axes analytiques : société, département, projet, site, centre de coût ;
- import/export au format CSV/XLSX et, si nécessaire, formats bancaires locaux ;
- suivi du statut : préparé, exporté, transmis, accusé, rejeté, corrigé ;
- rapprochement avec les retours bancaires et écritures comptables ;
- facture prestataire à partir du BRS, avec numérotation et archivage.

> Les formats exacts doivent être confirmés avec les banques, le cabinet comptable, IPRES, CSS et la DGID avant développement.

### D. Documents et conformité — priorité P1

- coffre documentaire par salarié, contrat et période ;
- types de documents avec durée de conservation ;
- expiration : CNI, contrat, visite médicale, permis, assurance, habilitation ;
- modèles d'attestation avec variables ;
- génération PDF serveur, hash du fichier et version ;
- signature électronique ou validation interne ;
- téléchargement contrôlé et journal des accès ;
- politique d'archivage, export d'un dossier complet et suppression conforme.

### E. Cycle de vie salarié — priorité P1

- onboarding par checklist : identité, contrat, banque, accès, équipement, formation sécurité ;
- événements historisés : embauche, mutation, promotion, augmentation, suspension, retour ;
- offboarding : préavis, solde de tout compte, restitution matériel, désactivation accès, certificat ;
- organigramme et affectation site/département/manager ;
- gestion des postes budgétés et demandes de recrutement ;
- import contrôlé de salariés avec prévisualisation et rapport d'erreurs.

### F. Temps, congés et activités — priorité P1

- politiques d'acquisition par type de congé et ancienneté ;
- jours fériés par pays, site et année ;
- calendrier équipe et planning de rotation ;
- pointage manuel, import pointeuse et PWA hors connexion si nécessaire ;
- feuilles de temps par projet/site ;
- règles d'heures supplémentaires nécessitant approbation ;
- correction de présence par workflow, avec justification et impact paie ;
- alertes de dépassement, absence injustifiée et repos minimal.

### G. Frais, missions, acomptes et prêts — priorité P1

- ordre de mission : destination, dates, avance, véhicule, approbations ;
- frais avec photo de justificatif, devise, catégorie et TVA éventuelle ;
- avances et remboursements ;
- acomptes ponctuels et prêts avec échéancier ;
- prélèvement automatique dans les bulletins ;
- contrôles : plafond, doublon de justificatif, période clôturée ;
- intégration paie : imposable, non imposable, retenue ou remboursement.

### H. Talent, compétences et formation — priorité P2

- référentiel compétences et niveaux ;
- objectifs/KPI par période ;
- campagnes d'évaluation manager/salarié ;
- plans de formation, coûts, présence et certificats ;
- matrice habilitations pour les métiers miniers et postes à risque ;
- lien avec mobilité, succession et revalorisation.

### I. Analytique et IA assistée — priorité P2

- masse salariale par période, contrat, département, site et centre de coût ;
- absentéisme, turnover, ancienneté, coût des heures supplémentaires ;
- prévision de masse salariale avec scénarios ;
- détection d'anomalies : variation inhabituelle, doublon, plafond dépassé, salarié sans affectation ;
- assistant de recherche sur les données autorisées ;
- explication lisible d'un bulletin : “quelles données et règles ont produit ce montant ?” ;
- génération de checklists et de brouillons d'attestations.

**Garde-fous IA :** aucune donnée personnelle envoyée à un fournisseur externe sans consentement, contrat et minimisation ; aucune écriture directe en paie ; réponse toujours accompagnée de la source et du niveau de confiance.

---

## 5. Modèle de données cible

### 5.1 Multi-tenant et organisation

Ajouter ou formaliser :

- `tenants` / `companies` : abonnement, pays, devise, fuseau, statut ;
- `tenant_memberships` : utilisateur, rôle, périmètre et dates ;
- `work_sites`, `cost_centers`, `projects`, `organizational_units` ;
- `manager_scopes` pour les périmètres de validation.

Chaque table métier doit avoir une clé de tenant ou être dérivable sans ambiguïté, avec index et politique RLS correspondante.

### 5.2 Versionnement des règles

Créer une notion commune de :

```text
rule_set
  code
  country
  effective_from
  effective_to
  status: draft | approved | active | retired
  source_reference
  approved_by
  approved_at
```

Les paramètres, plafonds, barèmes, conventions et rubriques référencent le `rule_set` appliqué au traitement. Une paie clôturée conserve la version utilisée.

### 5.3 Événements et audit

`audit_events` doit enregistrer au minimum :

- tenant, utilisateur, rôle, horodatage, adresse technique si autorisée ;
- action et ressource ;
- anciennes/nouvelles valeurs filtrées ;
- motif, demande ou ticket associé ;
- résultat : succès, refus, erreur ;
- corrélation avec le traitement de paie ou la période.

Ne jamais stocker de secrets, mots de passe ou données personnelles inutiles dans les journaux.

### 5.4 Documents

`documents`, `document_versions`, `document_access_log`, `document_templates`, `document_expirations`.

Les fichiers doivent être stockés dans un espace privé, servis par URL temporaire et protégés par RLS/contrôle serveur ; les documents personnels ne doivent pas être ajoutés au dépôt Git.

---

## 6. Workflows de référence

### 6.1 Cycle mensuel de paie

```text
Ouvrir période
  → importer/contrôler salariés et affectations
  → saisir ou synchroniser présences, congés et variables
  → analyser anomalies
  → calculer en brouillon
  → revue paie
  → approbation RH/direction
  → figer snapshot
  → générer bulletins / banque / déclarations / comptabilité
  → marquer payé
  → clôturer et archiver
```

### 6.2 Demande de congé

```text
Brouillon salarié → soumise → manager → RH/paie
      ↘ refus avec motif
      ↘ annulation selon règle
      → calendrier + solde + impact présence/paie
```

### 6.3 Correction de paie

```text
Anomalie détectée → proposition de correction → justification
→ approbation → recalcul contrôlé → comparaison avant/après
→ régularisation ou réouverture autorisée → audit
```

---

## 7. Roadmap de développement

| Lot | Objectif | Livrables | Priorité |
|---|---|---|---|
| 0 | Socle qualité SaaS | tenant explicite, tests, observabilité, audit, sauvegarde/restauration, documentation des rôles | P0 |
| 1 | Clôture de paie | périodes, checklist, anomalies, double validation, snapshot, réouverture et régularisation | P0 |
| 2 | Portail ESS/MSS | demandes, validations, notifications, documents et attestations | P0 |
| 3 | Sorties financières | virement, exports déclaratifs, journal analytique, facture prestataire, rapprochement | P0 |
| 4 | Documents et cycle salarié | coffre, expirations, onboarding/offboarding, mouvements et équipements | P1 |
| 5 | Temps et frais avancés | calendriers, jours fériés, missions, notes de frais, acomptes et prêts | P1 |
| 6 | Pilotage RH | KPI, effectifs, absentéisme, turnover, masse salariale, exports | P1 |
| 7 | Talent et mobile | compétences, évaluations, formation, PWA/mobile, notifications avancées | P2 |
| 8 | IA contrôlée | recherche autorisée, explications de bulletin, anomalies et assistants de brouillon | P2 |

### Découpage d'un lot en ticket

Chaque ticket doit utiliser ce format :

```markdown
## [DOMAINE-XXX] Titre
### Besoin utilisateur
En tant que [rôle], je veux [action], afin de [résultat].
### Règles métier
- ...
### Données / migration
- tables, index, RLS, fonctions, version de règle
### Interface
- écrans, états vide/chargement/erreur, responsive, impression
### Sécurité
- rôles autorisés, périmètre, données sensibles
### Critères d'acceptation
- [ ] ...
### Tests
- cas nominal
- cas limite
- régression août 2026 si la paie est concernée
### Dépendances
- ...
```

---

## 8. Qualité, sécurité et exploitation

### Tests indispensables

- tests unitaires des rubriques et barèmes ;
- tests de propriété : brut/net non négatifs selon le contrat, plafonds respectés, journal équilibré ;
- tests de non-régression des 25 bulletins d'août 2026 ;
- tests RLS par rôle et par tenant ;
- tests de clôture : impossibilité de mutation après snapshot ;
- tests d'idempotence : recalcul et synchronisation des présences sans doublon ;
- tests d'import avec erreurs partielles ;
- tests PDF, téléchargement privé et expiration des URLs ;
- tests de restauration d'une sauvegarde.

### Sécurité SaaS

- MFA ou SSO pour administrateurs et approbateurs ;
- séparation préparateur/approbateur/payeur ;
- limitation de débit et journalisation des actions sensibles ;
- secrets uniquement dans l'environnement sécurisé ;
- scans de dépendances et revue des migrations ;
- sauvegardes chiffrées, restauration testée et plan d'incident ;
- rétention et suppression documentées ;
- aucune donnée salarié réelle dans les fixtures ou le dépôt.

### Observabilité

- identifiant de corrélation par traitement ;
- durée et résultat des calculs ;
- nombre de bulletins, erreurs et anomalies ;
- suivi des exports, envois et rejets ;
- alertes sur échec de job, absence de sauvegarde ou divergence de totaux.

---

## 9. Décisions à prendre avant les prochains lots

1. Le produit cible-t-il une seule société SOMA ou plusieurs entreprises clientes dès le prochain lot ?
2. Quels rôles approuvent la paie : paie, RH, direction financière, direction générale ?
3. Quelles banques et quels formats de virement doivent être supportés en premier ?
4. Quels formats et canaux sont officiellement acceptés pour IPRES, CSS et la fiscalité ?
5. Le portail salarié doit-il être une PWA mobile ou une application mobile séparée ?
6. Quelles règles Excel sont contractuelles et lesquelles doivent être corrigées ?
7. Quelle politique de conservation s'applique aux bulletins, CNI, contrats et justificatifs ?
8. Quel fournisseur d'e-mail/SMS/WhatsApp est autorisé pour les notifications ?
9. Quels axes analytiques sont indispensables : site minier, département, projet, centre de coût ?
10. Quel niveau de signature électronique est requis pour bulletins, attestations et décisions RH ?

---

## 10. Première liste de tickets recommandés

### Sprint 1 — sécuriser la paie

- [ ] Créer `payroll_periods` et les transitions d'état.
- [ ] Ajouter checklist et anomalies bloquantes.
- [ ] Figer un snapshot des paramètres et variables à la validation.
- [ ] Ajouter approbation séparée et motif de réouverture.
- [ ] Étendre l'audit aux corrections de présence et de variables.
- [ ] Automatiser le contrôle des totaux d'août 2026 en CI ou script de validation.

### Sprint 2 — portail opérationnel

- [ ] Ajouter les demandes salarié : congé, attestation, correction de présence.
- [ ] Ajouter boîte de validation manager/RH.
- [ ] Ajouter centre de notifications.
- [ ] Générer les attestations à partir de modèles.
- [ ] Protéger les téléchargements par stockage privé et URL temporaire.

### Sprint 3 — sorties

- [ ] Concevoir un contrat d'export bancaire indépendant de la banque.
- [ ] Ajouter prévisualisation, validation et journal d'export.
- [ ] Formaliser les formats IPRES/CSS/impôts avec des jeux de test.
- [ ] Ajouter axes analytiques au journal comptable.
- [ ] Développer facture prestataire et envoi de bulletins avec reprise sur erreur.

---

## 11. Conclusion

SOMA-RH doit se positionner comme une **paie locale explicable et contrôlée**, enrichie d'un **dossier RH vivant** et d'un **portail de self-service**, plutôt que comme une copie générique de Sage, Odoo ou Frappe HR.

La différenciation la plus forte est la combinaison suivante :

1. fidélité vérifiée aux règles et données de paie sénégalaises ;
2. traçabilité complète des corrections et des versions ;
3. intégration native temps/congés/variables/paie ;
4. sorties directement utilisables par la banque, la comptabilité et les organismes ;
5. expérience simple pour les salariés et managers ;
6. IA limitée à l'assistance explicable, jamais à la validation automatique.

La prochaine étape recommandée est le **Lot 1 — Gouvernance de la paie**, car il réduit le risque financier et fournit la fondation nécessaire à tous les modules suivants.
