# SOMA-RH — Analyse, benchmark et feuille de route

> **Version 2.1 — 2 novembre 2026 — proposition mise à jour**
> Document de travail structuré à partir du canevas joint (v1.0), de l'application telle qu'elle existe aujourd'hui (code, base de données, déploiement) et d'une comparaison avec Frappe HR, OrangeHRM, Odoo (module Paie Sénégal), Sage et les obligations légales sénégalaises.

---

## Comment lire ce document

| Vous voulez… | Allez à |
|---|---|
| La décision à prendre en 2 minutes | [§0 Synthèse et décisions](#0-synthèse-et-décisions-demandées) |
| Savoir où en est vraiment l'application | [§1 État réel](#1-état-réel-de-lapplication-constaté-le-30102026) |
| Ce que le canevas joint a bien vu / manqué | [§2 Lecture critique du canevas v1.0](#2-lecture-critique-du-canevas-joint-v10) |
| La comparaison avec les autres logiciels | [§3 Benchmark](#3-benchmark--soma-rh-face-aux-autres-solutions) |
| Ce qui n'est pas encore informatisé et devrait l'être | [§4 Angles morts](#4-angles-morts--ce-qui-nest-pas-encore-informatisé) |
| L'architecture cible | [§5 Architecture cible](#5-architecture-cible) |
| Le plan de développement | [§7 Feuille de route](#7-feuille-de-route-de-développement) et [§8 Backlog](#8-backlog-détaillé-des-trois-premiers-lots) |
| La méthode de travail | [§6 Canevas de travail](#6-canevas-de-travail) |

---

## 0. Synthèse et décisions demandées

### Où en est SOMA-RH

SOMA-RH est une **application de paie et de RH fonctionnelle et vérifiée**, pas un prototype : moteur de paie en base, fidèle au classeur Excel (écart inférieur à 0,000001 F sur les 25 bulletins d'août 2026), dix traitements mensuels, bulletins et états imprimables, congés, présences, rôles et sécurité par ligne sur toutes les tables.

Ce qui lui manque pour devenir un **produit** n'est pas de la paie supplémentaire, ce sont **cinq couches autour de la paie** :

| # | Couche manquante | Pourquoi c'est urgent |
|---|---|---|
| 1 | **Gouvernance de la paie** (périodes, clôture, approbations) | Aujourd'hui rien n'empêche de valider un mois futur ou de sauter un mois (voir §1.3) |
| 2 | **Traçabilité** (audit des corrections) | Seuls 5 référentiels sont journalisés ; salariés, variables, présences et affectations ne le sont pas |
| 3 | **Portail salarié / manager** | Les salariés ne peuvent que consulter leurs bulletins |
| 4 | **Sorties** (virements, déclarations IPRES/CSS/impôts, documents) | Le calcul est juste, mais rien n'est directement transmissible à la banque ou aux organismes |
| 5 | **Dossier RH vivant** (documents, mouvements, conformité légale) | Aucun stockage de fichiers, aucun historique de carrière, aucune alerte d'échéance |

### Vue d'ensemble de la proposition

```text
LOT 0  Socle & quick wins      ██                          S1–S2
LOT 1  Gouvernance de paie     ████████                    S3–S6
LOT 2  Portail ESS / MSS       ████████████                S7–S12
LOT 3  Sorties & déclaratif    ████████████                S13–S18
LOT 4  Documents & carrière    ████████████                S19–S24
LOT 5  Temps, mines, frais     ████████████████            S25–S32
LOT 6  Pilotage RH             ████████                    S33–S36
LOT 7  Talent & mobile         ████████████████            S37–S44
LOT 8  IA assistée             ████████                    S45+
       ───────────────────────────────────────────────────────────►
       Hypothèse : 1 développeur + Claude Code, sprints de 2 semaines.
       Durée totale indicative : ~11 mois. Les lots 0 à 3 forment le « produit utilisable en production ».
```

### Décisions demandées

Quatre décisions bloquent le démarrage ; les autres sont en §10.

| # | Question | Ma recommandation par défaut |
|---|---|---|
| D1 | **Une seule société (SOMA) ou plusieurs clientes ?** Aujourd'hui 0 règle de sécurité sur 108 ne filtre par société : l'application est mono-société de fait. | Rester **mono-société sur les lots 0 à 4**, mais ajouter dès le lot 0 une colonne `company_id` partout (coût faible). Le vrai multi-société = lot dédié si vous décidez de vendre le produit. |
| D2 | **Qui approuve la paie ?** (paie seule, paie + RH, + direction financière) | Préparation **paie**, approbation **RH ou DAF** (personne différente), clôture **admin**. |
| D3 | **Premier format bancaire** à supporter | Une banque pilote d'abord (celle qui paie le plus de salariés), puis un format générique CSV/XLSX. |
| D4 | **Portail : PWA mobile ou application native ?** | **PWA** (même code, installable, hors-ligne partiel). Native seulement si pointage géolocalisé exigé. |

---

### Périmètre révisé après validation (30/10/2026)

| Élément | Décision |
|---|---|
| Multi-société / `company_id` généralisé (SOC-007) | Reporté ; rester mono-société |
| Données de démonstration anonymisées (SOC-008) | Abandonné ; les données réelles restent telles quelles |
| Droits de paie | Préparation par rh / paie / admin ; **validation et clôture réservées à l'admin** (appliqué) |
| Lot 3 | Réduit au **traitement** : pas de format bancaire, pas de transmission IPRES/CSS/impôts (le comptable s'en charge) ; ajout d'un fichier de synthèse du journal de paie |
| Lot 4 | **En attente** : un système de gestion documentaire (scan des bons médicaux, contrats…) sera mis en place ensuite |
| Lot 5 | Poste et rotation des gardiens (24 h/24) prioritaires ; équipements/dotations hors périmètre (HSQE) |
| Application mobile | PWA uniquement |

### Avancement (mis à jour le 30/10/2026)

| Ticket | État |
|---|---|
| SOC-001 audit étendu, SOC-002 journal, SOC-003 garde-fou, SOC-005 CI | Fait |
| SOC-004 régression de paie automatique | En attente (le traitement d'août 2026 est laissé tel quel, non recréé) |
| SOC-006 nettoyage Vercel | À faire côté Vercel (projet `souare-soma-rh` en échec) |
| PAY-004 validation admin seul, PAY-005 copie des paramètres, PAY-003 contrôles (partiel) | Fait |
| Lien WhatsApp prérempli (congés) | Fait |
| PAY-006 réouverture motivée (admin), PAY-008 comparaison avec le mois précédent, fichier de synthèse du journal de paie (D8) | Fait |
| PAY-001/002 périodes et checklist complètes, PAY-007 régularisation, PAY-009 règles versionnées, PAY-010 points Excel | À faire (PAY-010 : fait, voir `docs/ARBITRAGES_PAIE.md`) |
| D10 arbitrages des règles Excel + réglages dans Paramètres | Fait (docs/ARBITRAGES_PAIE.md) |
| Lot 3 réduit : suivi du paiement (espèces / chèque / mobile money), états de paiement imprimables par mode | Première version faite ; synthèse CSV du journal faite ; pas de format bancaire ni de transmission (D3, D8) |
| Règles de paie des postes de nuit / heures sup. des gardiens | Laissées telles quelles (décision du 30/10/2026) ; le planning n'alimente pas la paie |
| Lot 6 pilotage RH : effectifs, structure (contrat, catégorie, sexe, âge, ancienneté), entrées/sorties, rotation, absentéisme, heures sup., coût du dernier mois validé | Première version faite (page Pilotage RH) ; prévision de masse salariale avec scénarios (CDD non renouvelés, augmentation générale, recrutements) ajoutée |
| TPS-002 postes et rotations (gardiens) | Première version : planning mensuel + génération de cycle |
| ESS-001/002/006 portail salarié (Mon espace : dernier bulletin, soldes, planning, demandes d'attestation / acompte / correction de présence / données personnelles) et traitement RH | Première version faite ; notifications e-mail Gmail et délégation d'approbation à venir |

---

## 1. État réel de l'application (constaté le 30/10/2026)

### 1.1 Chiffres vérifiés

| Mesure | Valeur | Source |
|---|---|---|
| Écrans (pages) | 16 pages, ≈ 3 150 lignes de code applicatif | `web/src/pages` |
| Migrations de schéma | 17 | `supabase/migrations` |
| Tables / vues | 28 tables, 5 vues (toutes en `security_invoker`) | base Supabase |
| Fonctions SQL | 34 (moteur de paie, états, tableaux de bord) | base Supabase |
| Sécurité par ligne (RLS) | **100 %** des tables, 108 règles | base Supabase |
| Rôles | `admin`, `rh`, `paie`, `salarie` | `user_roles` |
| Données | 1 société, 27 salariés, 10 traitements de paie | base Supabase |
| Stockage de fichiers | **0 espace de stockage** | base Supabase |
| Journal d'audit | 5 tables couvertes (référentiels uniquement) | déclencheurs |

### 1.2 Cartographie : ce qui existe

```text
                        ┌──────────────────────────────────────────┐
                        │                SOMA-RH                    │
                        └────────────────────┬─────────────────────┘
                                             │
   ┌───────────────────┬─────────────────────┼──────────────────────┬────────────────────┐
   ▼                   ▼                     ▼                      ▼                    ▼
┌────────────┐  ┌───────────────┐   ┌────────────────┐   ┌──────────────────┐  ┌───────────────┐
│ Core RH    │  │ Temps/Absences│   │ Paie           │   │ États & sorties  │  │ Administration│
│ ██████░░░░ │  │ █████░░░░░    │   │ █████████░     │   │ ██████░░░░       │  │ █████░░░░░    │
└─────┬──────┘  └──────┬────────┘   └───────┬────────┘   └────────┬─────────┘  └──────┬────────┘
      │                │                    │                     │                   │
 ✔ Fiche salarié  ✔ Grille présences   ✔ Moteur compute_salary_slip  ✔ Bulletin (1 / lot)   ✔ Utilisateurs & rôles
 ✔ Matricule auto ✔ Absence/maladie/HS ✔ Structures & affectations    ✔ Livre de paie       ✔ Référentiels
 ✔ Fiche imprimée ✔ Demandes de congé  ✔ Variables du mois            ✔ Cotisations/charges ✔ Paramètres légaux
 ✔ Référentiels   ✔ Soldes & bon       ✔ Simulateur net → brut        ✔ Écritures compta    ✔ Journal référentiels
 ✔ Contrats/CDD   ✔ Reprise → paie     ✔ Provisions congé/précarité   ✔ Synthèse annuelle   ✔ Suppression de traitement
 ✘ Documents      ✘ Calendrier/fériés  ✔ Cumuls annuels              ✘ Virement bancaire   ✘ Audit complet
 ✘ Historique     ✘ Shifts / rotations ✘ Périodes & clôture          ✘ Fichiers IPRES/CSS  ✘ Notifications
 ✘ Organigramme   ✘ Approbation manager✘ Approbation / snapshot      ✘ Envoi des bulletins ✘ Multi-société
```

Légende : ✔ présent · ✘ absent. Les barres donnent une couverture indicative par rapport au périmètre cible du §5.

### 1.3 Constats techniques à traiter en priorité

| # | Constat | Gravité | Lot |
|---|---|---|---|
| C1 | **Aucun garde-fou sur les périodes de paie.** Lors de l'analyse, un traitement de novembre 2026 était validé alors qu'octobre manquait (constat non reproduit lors du recontrôle du 30/10 : la base ne contient plus que janvier à juin 2026, tous validés). Rien n'interdisait de valider un mois futur ni de sauter un mois ; **corrigé au lot 0 (SOC-003, appliqué le 30/10/2026)**. | Élevée | 1 |
| C2 | **Audit incomplet.** Les modifications des salariés, structures salariales, variables, présences et bulletins ne laissent aucune trace (auteur, avant/après, motif). La correction manuelle des variables est désormais possible : elle doit être journalisée. | Élevée | 0 |
| C3 | **Pas d'immutabilité forte des bulletins validés** au-delà du statut ; pas de snapshot des paramètres utilisés (taux, barèmes, rubriques). Un changement de paramètre peut rendre un ancien bulletin non reproductible. | Élevée | 1 |
| C4 | **Mono-société de fait** : aucune règle de sécurité ne filtre par société. | Moyenne (devient élevée si vente en SaaS) | 0 / dédié |
| C5 | **Aucun stockage de fichiers** : ni pièces d'identité, ni contrats, ni justificatifs, ni PDF archivés. | Moyenne | 4 |
| C6 | **Pas de notifications** (e-mail, in-app) : une demande de congé n'alerte personne. | Moyenne | 2 |
| C7 | **Règles Excel reprises à l'identique** y compris des anomalies documentées (transport/absences, indemnité de licenciement, IPM prestataires…). Elles ne sont pas versionnées ni justifiées. | Moyenne | 1 |
| C8 | **Pas de tests automatisés** : la non-régression d'août 2026 est un contrôle manuel (script SQL), pas une vérification automatique à chaque modification. | Moyenne | 0 |
| C9 | **Déploiement fragile** : deux projets Vercel liés au même dépôt ; l'un échoue régulièrement à l'installation. Un échec laisse l'ancienne version en ligne sans alerte visible. | Moyenne | 0 |

> **Leçon opérationnelle du jour** : un contrôle de types local avec la mauvaise commande (`tsc -p .` au lieu de `npm run build`) a laissé passer une erreur qui a bloqué un déploiement et fait réapparaître d'anciennes versions à l'impression. Le lot 0 intègre un contrôle automatique identique à celui de Vercel avant tout envoi.

---

## 2. Lecture critique du canevas joint (v1.0)

Le canevas v1.0 est solide dans sa vision (paie locale explicable, portail, audit, IA encadrée). Voici comment je l'ai confronté à l'application réelle.

### 2.1 Ce qui est confirmé et conservé

- La **priorité 1 = gouvernance de la paie** : confirmée par la constatation C1 (absence de garde-fou sur les périodes).
- Le **modèle de versionnement des règles** (`rule_set`) : indispensable, voir C3 et C7.
- Les **principes non négociables** (calcul en base, précision totale, paie validée immuable, IA qui propose sans valider) : conservés tels quels.
- La **liste des décisions à prendre** (§9 du canevas) : reprise et hiérarchisée en §10.

### 2.2 Ce qui est à corriger ou à nuancer

| Point du canevas v1.0 | Réalité constatée | Conséquence |
|---|---|---|
| « Premières traces d'audit » | Audit limité à **5 référentiels** ; rien sur salariés, variables, présences, affectations, bulletins | L'extension de l'audit passe en **lot 0** (quick win), avant la gouvernance |
| « Isolation inter-entreprises à expliciter » | **0 règle sur 108** ne filtre par société | À traiter comme un **chantier de conception**, pas une simple documentation |
| Écart « Portail ESS/MSS » décrit comme partiel | Seules les consultations de bulletins et de congés existent ; aucune notification, aucun périmètre manager | Écart plus large que décrit |
| Fichier Excel « non présent » | Exact, mais le moteur est validé sur des valeurs de référence | Conserver le contrôle d'août 2026 comme **test de référence automatique** |
| Aucune mention du déploiement | Deux projets Vercel, builds instables | Ajout du **socle d'intégration continue** au lot 0 |
| Absence de spécificités légales de terrain | Obligations d'embauche, registres, accidents du travail, visites médicales (voir §4) | Ajout d'un module **Conformité légale** au lot 4 |
| Absence de spécificités minières | Postes/rotations, primes de site ou de pénibilité, habilitations, EPI, HSE | Ajout d'un module **Exploitation minière** au lot 5 |

### 2.3 Ce que le canevas ne dit pas et qui compte

1. **Données de test anonymisées** : indispensables avant toute démonstration ou vente (aucune donnée réelle dans le dépôt, règle déjà inscrite dans `CLAUDE.md`).
2. **Import de l'historique** : reprise des bulletins antérieurs à 2026 et des cumuls, nécessaire pour les régularisations et les attestations.
3. **Mode « paie à blanc »** : comparer le calcul SOMA-RH au calcul Excel/Sage pendant un ou deux mois avant d'abandonner l'ancien outil.
4. **Gestion du changement** : formation des utilisateurs, guide par rôle, support.

---

## 3. Benchmark : SOMA-RH face aux autres solutions

### 3.1 Sources

| Produit | Nature | Ce qui a été vérifié | Lien |
|---|---|---|---|
| **Frappe HR** | Open source (Frappe/ERPNext) | Liste des modules dans la documentation officielle | [docs.frappe.io/hr](https://docs.frappe.io/hr/introduction) |
| **OrangeHRM** | Open source (édition communautaire GPL) | Non revérifié dans cette session — repris du canevas joint | [github.com/OrangeHRM](https://github.com/OrangeHRM/OrangeHRM) |
| **Odoo — Paie Sénégal V18** (éditeur Paiesoft) | **Propriétaire (OPL-1)**, nécessite Odoo Enterprise, ≈ 1 009 $ affichés | Fonctionnalités et licence lues sur la page de l'application | [apps.odoo.com](https://apps.odoo.com/apps/modules/18.0/hr_payroll_seng) |
| **Sage Paie / Sage 100** | Propriétaire | Connaissance générale du produit et du modèle de livre de paie que vous avez fourni ; **à confirmer par démonstration** | — |
| **Obligations légales** | Guide pratique | Échéances, déclarations, registres | [africarrieres.com](https://africarrieres.com/senegal/fr/guide/employeur-entreprise/obligations-employeur) |

> Rappel important : **Odoo Paie Sénégal n'est pas open source**. Sa licence interdit la redistribution ; on peut s'en inspirer fonctionnellement, pas en réutiliser le code.

### 3.2 Matrice de couverture

Légende : ● couvert · ◐ partiel · ○ absent · ? non vérifié.

| Fonction | SOMA-RH | Frappe HR | OrangeHRM | Odoo Paie SN | Sage |
|---|:-:|:-:|:-:|:-:|:-:|
| **Dossier salarié complet** | ● | ● | ● | ● | ● |
| Historique de carrière (mutations, promotions) | ○ | ● | ◐ | ◐ | ● |
| Onboarding / offboarding | ○ | ● | ◐ | ○ | ? |
| Organigramme | ○ | ● | ● | ◐ | ? |
| Coffre documentaire + expirations | ○ | ◐ | ◐ | ○ | ● |
| **Congés** (types, soldes, demandes) | ● | ● | ● | ● | ● |
| Politiques d'acquisition, calendriers de fériés | ◐ | ● | ● | ● | ● |
| **Présences** (grille, pointage) | ◐ | ● | ● | ● (pointeuse) | ● |
| Shifts / plannings / rotations | ○ | ● | ◐ | ◐ | ● |
| Heures supplémentaires avec approbation | ◐ | ● | ◐ | ● | ● |
| **Moteur de paie sénégalais** (IR, TRIMF, IPRES, CSS, CFCE, IPM) | ● | ○ (localisation Inde) | ○ | ● | ● |
| Structures et rubriques paramétrables | ● | ● | ◐ | ● | ● |
| Simulateur net → brut | ● | ○ | ○ | ○ | ? |
| Provisions congé / précarité | ● | ◐ | ○ | ? | ● |
| Cumuls annuels, synthèse | ● | ◐ | ○ | ◐ | ● |
| **Périodes de paie, clôture, approbation** | ○ | ◐ | ○ | ● | ● |
| Régularisations / rappels de paie | ○ | ● (arriérés) | ○ | ◐ | ● |
| Prêts, avances sur salaire, acomptes | ○ | ● | ○ | ● | ● |
| Notes de frais, missions | ○ | ● | ● | ◐ | ◐ |
| **Bulletin imprimé** | ● | ● | ◐ | ● | ● |
| Livre de paie imprimé | ● | ◐ | ○ | ◐ | ● |
| Envoi des bulletins par e-mail | ○ | ● | ◐ | ● | ● |
| **États CSS / IPRES / récapitulatif de salaires** | ◐ (états internes) | ○ | ○ | ● | ● |
| Virement bancaire (fichier) | ○ | ◐ | ○ | ? | ● |
| Écritures comptables | ● | ● | ○ | ● | ● |
| Recrutement (ATS) | ○ | ● | ● | ○ | ◐ |
| Évaluations, objectifs | ○ | ● | ● | ○ | ◐ |
| Formation, compétences | ○ | ● | ◐ | ○ | ◐ |
| **Libre-service salarié** | ◐ | ● | ● | ◐ | ● |
| Application mobile | ○ | ● | ● | ◐ | ● |
| Notifications | ○ | ● | ● | ● | ● |
| Piste d'audit complète | ◐ | ● | ◐ | ● | ● |
| Multi-société | ○ | ● | ◐ | ● | ● |

### 3.3 Ce que cette comparaison apprend

1. **Votre avantage réel** : le moteur de paie sénégalais est complet, vérifié et ouvert. Frappe HR et OrangeHRM n'ont pas cette localisation ; Odoo la vend sous licence propriétaire. C'est le cœur de votre différenciation.
2. **Là où vous êtes en retard** : tout ce qui entoure la paie (périodes, approbations, documents, notifications, portail). Ce sont aussi les fonctions que les concurrents ont toutes en commun.
3. **Où ne pas aller trop tôt** : recrutement, évaluations et formation sont des produits à part entière chez Frappe HR et OrangeHRM. Ils ne se justifient qu'après la paie, le portail et les sorties (lots 7 à 8).
4. **La vraie « copie » utile** : les **parcours** de Frappe HR (cycle de vie, demandes, approbations) sont une excellente source de conception ; leur code ne l'est pas (architecture différente, localisation indienne).

---

## 4. Angles morts : ce qui n'est pas encore informatisé

Ces points ne figurent ni dans votre application ni (pour la plupart) dans le canevas v1.0. Les chiffres légaux viennent d'un guide pratique et **doivent être confirmés auprès des organismes** avant développement.

### 4.1 Conformité employeur (Sénégal)

| Obligation | Détail relevé | Ce qu'il faut informatiser | Lot |
|---|---|---|---|
| Déclaration préalable d'embauche | À déposer jusqu'à 48 h avant l'embauche à l'inspection du travail ; amende de 50 000 à 200 000 F si omise | Tâche automatique à la création d'un salarié, avec preuve de dépôt | 4 |
| Immatriculation IPRES et CSS | Dans les 8 jours suivant l'embauche | Statut par salarié : à immatriculer / immatriculé, avec n° et date | 4 |
| Paiement des cotisations | Avant le 15 du mois suivant ; pénalité de 1,5 % par mois de retard | Calendrier des échéances, alertes, suivi du paiement | 3 |
| Taux d'accident du travail CSS | 1 %, 3 % ou 5 % selon le risque | Taux par établissement ou par catégorie de poste (à confirmer) | 3 |
| Registres obligatoires | Registre du personnel, registre des accidents du travail, registre d'hygiène et sécurité (> 20 salariés), registre des heures supplémentaires | Génération et archivage de ces registres à partir des données | 4 |
| Accident du travail | Déclaration à la CSS sous 48 h | Fiche d'accident, délai, statut de déclaration | 5 |
| Visites médicales | À l'embauche, annuelles, et après arrêt maladie de plus de 21 jours | Planning et alertes par salarié | 4 |
| Comité d'hygiène et sécurité | À partir de 50 salariés | Suivi des membres, réunions, procès-verbaux | 7 |
| Équipements de protection | Fournis gratuitement quand le poste l'exige | Dotation et restitution par salarié, dates de renouvellement | 4 |

### 4.2 Sorties de contrat

| Élément | Pourquoi | Lot |
|---|---|---|
| Calcul du **solde de tout compte** (préavis, congés non pris, indemnité de licenciement) | Aujourd'hui calculé hors outil ; l'écart « base mensuelle ou moyenne des 12 mois » est un point Excel non tranché | 4 |
| Certificat de travail, attestation de salaire | Pièces exigées à chaque départ ; à générer depuis un modèle | 4 |
| Notification et délais de préavis | Suivi des étapes et des dates | 4 |

### 4.3 Spécificités d'une société minière (SOMA, site de Matam)

Ces éléments sont une **hypothèse métier à valider avec vous** ; ils découlent du secteur, pas d'une analyse de vos fichiers.

| Besoin probable | Pourquoi | Lot |
|---|---|---|
| **Postes et rotations** (3×8, 14/14, équipes de jour/nuit) | La présence se mesure par poste, pas par jour calendaire | 5 |
| **Primes de site, de pénibilité, d'astreinte, de panier** | Rubriques déjà possibles ; manque l'attribution automatique par poste et par site | 5 |
| **Habilitations et formations de sécurité** (travaux en hauteur, engins, électricité…) | Un salarié sans habilitation valide ne doit pas être affecté au poste | 5 |
| **Dotation EPI** (casque, chaussures, tenue) | Obligation légale + coût à suivre | 4 |
| **Hébergement, transport, restauration sur site** | Avantages en nature à intégrer à la paie | 5 |
| **Analytique par site / projet / centre de coût** | Pour le pilotage et la refacturation entre sociétés du groupe | 3 |
| **Sous-traitants et prestataires** | Déjà amorcé (BRS, honoraires) ; manque la facture et le suivi | 3 |

### 4.4 Sécurité des données personnelles

| Élément | Pourquoi |
|---|---|
| Journal des **accès** aux dossiers sensibles | Qui a consulté quelle fiche, quel bulletin |
| Politique de **conservation** et de suppression | Durées à fixer par type de document (bulletins, CNI, contrats) |
| Chiffrement des champs sensibles | RIB, pièce d'identité |
| Authentification forte | Approbateurs de paie et administrateurs |
| Conformité à la loi sénégalaise sur les données personnelles | À faire valider par un juriste (la loi et l'autorité compétente sont à confirmer) |

---

## 5. Architecture cible

### 5.1 Vue par domaines

```text
                        ┌──────────────────────────────────────────┐
                        │                SOMA-RH SaaS              │
                        └────────────────────┬─────────────────────┘
                                             │
   ┌───────────────────┬─────────────────────┼─────────────────────┬────────────────────┐
   ▼                   ▼                     ▼                     ▼                    ▼
┌────────────┐  ┌────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌─────────────────┐
│ Core RH    │  │ Temps & Mines  │  │ Paie & Taxes     │  │ Self-Service   │  │ Talent & Dev    │
│ (lots 0,4) │  │ (lots 2,5)     │  │ (lots 1,3)       │  │ (lot 2)        │  │ (lots 7,8)      │
└─────┬──────┘  └───────┬────────┘  └────────┬─────────┘  └───────┬────────┘  └────────┬────────┘
      │                 │                    │                    │                    │
      ├─ Dossier        ├─ Calendrier        ├─ Moteur de règles  ├─ Demandes          ├─ Recrutement (ATS)
      │  salarié        │  & jours fériés    │  versionnées       │  (congés, acomptes,├─ Évaluations
      ├─ Historique     ├─ Postes/rotations  ├─ Périodes,         │   attestations,    │  & objectifs
      │  de carrière    ├─ Pointage          │  clôture,          │   corrections)     ├─ Compétences
      ├─ Documents      ├─ Heures sup.       │  approbations      ├─ Boîte de          │  & habilitations
      │  & expirations  ├─ Habilitations     ├─ Bulletins,        │  validation        ├─ Plan de formation
      ├─ Organigramme   │  & EPI             │  livre, états      │  manager           └─ Assistant IA
      ├─ Onboarding /   ├─ Missions, frais   ├─ Virements         ├─ Notifications        (explications,
      │  offboarding    └─ Accidents du      ├─ Déclarations      └─ Bulletins              anomalies)
      ├─ Conformité        travail             IPRES / CSS / impôts   & attestations
      │  légale                              └─ Journal comptable
      └─ Équipements                            analytique
```

### 5.2 Couches transverses

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  SOCLE (lot 0)                                                             │
│  Auth + MFA · Rôles & périmètres · Audit complet · Versionnement des       │
│  règles · Stockage privé · Notifications · Tests automatiques · Sauvegarde │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Nouvelles tables à prévoir (synthèse)

| Domaine | Tables |
|---|---|
| Gouvernance | `payroll_periods`, `payroll_checklist_items`, `payroll_anomalies`, `payroll_approvals`, `payroll_snapshots`, `payroll_adjustments`, `payroll_reopenings` |
| Règles | `rule_sets` (+ liaison des taux, barèmes et rubriques) |
| Audit | `audit_events` (avant/après, motif, résultat, corrélation) ; extension du déclencheur d'audit aux tables métier |
| Organisation | `work_sites`, `cost_centers`, `projects`, `organizational_units`, `manager_scopes` |
| Demandes | `requests` (type, état, demandeur, approbateurs), `request_steps`, `request_comments`, `notifications` |
| Carrière | `employee_events` (embauche, mutation, promotion, augmentation, suspension, sortie) |
| Documents | `documents`, `document_versions`, `document_templates`, `document_expirations`, `document_access_log` |
| Sorties | `payment_batches`, `payment_lines`, `declaration_exports`, `export_log` |
| Prêts et frais | `loans`, `loan_schedules`, `expense_claims`, `mission_orders` |
| Temps | `holiday_calendars`, `shift_patterns`, `shift_assignments`, `timesheets` |
| Conformité | `legal_registrations` (IPRES, CSS, DPE), `medical_visits`, `work_accidents`, `ppe_issues`, `certifications` |
| Talent | `skills`, `employee_skills`, `objectives`, `appraisal_cycles`, `appraisals`, `training_plans`, `training_sessions` |

Règle commune : **toute nouvelle table reçoit RLS activée, politiques par rôle, index sur les clés étrangères, et `company_id`** (règles déjà inscrites dans `CLAUDE.md`, complétées pour la société).

---

## 6. Canevas de travail

### 6.1 Définition de « terminé » (applicable à chaque ticket)

- [ ] Migration SQL versionnée, appliquée, types régénérés
- [ ] RLS + index + rôles testés (au moins : un rôle autorisé, un rôle refusé)
- [ ] Interface : états chargement / vide / erreur, adaptée mobile, impression si document
- [ ] Journal d'audit alimenté pour toute écriture sensible
- [ ] **`npm run build` complet réussi** (identique à Vercel) + lint
- [ ] **Régression de paie d'août 2026** inchangée si le moteur ou ses données sont touchés (brut 4 929 179,09 ; net 4 662 739,89)
- [ ] Documentation mise à jour (`README.md`, `docs/`)
- [ ] Revue : relecture de la migration + test sur données anonymisées

### 6.2 Modèle de ticket

```markdown
## [DOMAINE-NNN] Titre court
**Lot** : N · **Priorité** : P0/P1/P2 · **Taille** : S/M/L · **Dépend de** : …

### Besoin
En tant que <rôle>, je veux <action>, afin de <résultat>.

### Règles métier
- …

### Données / migration
- Tables, index, RLS, fonctions

### Interface
- Écrans, états vide/chargement/erreur, impression

### Sécurité et audit
- Rôles autorisés · périmètre · événements journalisés

### Critères d'acceptation
- [ ] …

### Tests
- Nominal · limite · régression août 2026 (si paie)
```

### 6.3 Règles de livraison

1. **Une migration = une intention**, nommée `AAAAMMJJHHMMSS_nom.sql`, appliquée puis suivie de la régénération des types.
2. **Un commit par ticket**, message en français préfixé (`feat`, `fix`, `docs`, `style`), auteur `noreply@anthropic.com` pour les commits générés par Claude.
3. **Contrôle avant envoi** : `npm run build` (et non un contrôle de types partiel), lint, script de régression.
4. **Déploiement** : un seul projet Vercel de production ; l'autre est supprimé ou rattaché à une branche de prévisualisation.
5. **Données** : aucun fichier contenant des données personnelles de salariés dans le dépôt Git.
6. **Environnements** : production, prévisualisation (données anonymisées), local.

### 6.4 Gabarit de revue de lot

| Rubrique | Contenu |
|---|---|
| Objectif atteint ? | oui / partiel / non, avec preuve |
| Régression de paie | résultat du contrôle d'août 2026 |
| Sécurité | tests RLS, revue des fonctions exposées (advisors Supabase) |
| Dette ajoutée | liste explicite |
| Décision à prendre | questions pour le lot suivant |
| Démo | scénario de 10 minutes sur données anonymisées |

---

## 7. Feuille de route de développement

> Estimations indicatives : 1 développeur assisté de Claude Code, sprints de 2 semaines. À recaler après validation du périmètre. Les durées ne comprennent pas les délais d'attente externes (banques, IPRES, CSS, DGID).

### 7.1 Vue synthétique

| Lot | Titre | Durée | Priorité | Résultat visible |
|---|---|---|---|---|
| **0** | Socle & quick wins | 2 sem. | P0 | Audit complet, build contrôlé, garde-fous de période, données de test anonymisées |
| **1** | Gouvernance de paie | 4 sem. | P0 | Périodes, checklist, anomalies, double validation, snapshot, réouverture |
| **2** | Portail salarié / manager | 6 sem. | P0 | Demandes, validations, notifications, attestations |
| **3** | Sorties financières et déclaratives | 6 sem. | P0 | Virements, états IPRES/CSS/impôts, journal analytique, envoi des bulletins |
| **4** | Documents, carrière, conformité légale | 6 sem. | P1 | Coffre, expirations, onboarding/offboarding, solde de tout compte, registres |
| **5** | Temps avancé, exploitation minière, frais | 8 sem. | P1 | Postes, fériés, habilitations, EPI, missions, notes de frais, prêts |
| **6** | Pilotage RH | 4 sem. | P1 | Tableaux de bord effectifs, absentéisme, masse salariale, prévisions |
| **7** | Talent et mobile | 8 sem. | P2 | Recrutement, évaluations, formation, PWA |
| **8** | IA assistée | 4 sem. | P2 | Explication de bulletin, détection d'anomalies, recherche |

### 7.2 Jalons de validation (portes de décision)

```text
  ┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐     ┌───────────────────┐
  │ Porte A     │     │ Porte B          │     │ Porte C            │     │ Porte D           │
  │ fin lot 1   │ ──► │ fin lot 3        │ ──► │ fin lot 4          │ ──► │ fin lot 6         │
  │ « Paie sûre »│    │ « Paie livrable »│     │ « RH conforme »    │     │ « Produit complet »│
  └─────────────┘     └──────────────────┘     └────────────────────┘     └───────────────────┘
   Paie à blanc        Un mois réel traité       Dossier complet d'un       Décision : vente
   1 mois,             de bout en bout :         salarié, de l'embauche     en SaaS, multi-
   régression OK       calcul → banque →         au solde de tout compte    société, tarification
                       déclarations
```

### 7.3 Détail par lot

#### Lot 0 — Socle et quick wins (2 semaines, P0)

| Ticket | Description | Taille |
|---|---|---|
| SOC-001 | Étendre l'audit (auteur, avant/après, motif facultatif) à `employees`, `salary_structure_assignments`, `payroll_inputs`, `additional_salaries`, `attendance`, `leave_applications`, `salary_slips` | M |
| SOC-002 | Page « Journal des modifications » filtrable (admin, rh) | S |
| SOC-003 | Garde-fou : interdire de valider une période future ou d'en sauter une sans confirmation | S |
| SOC-004 | Script de **régression de paie automatique** (cas août 2026 + empreinte des calculs) exécutable à la demande | M |
| SOC-005 | Intégration continue : build complet + lint + régression à chaque envoi sur GitHub | M |
| SOC-006 | Nettoyage du déploiement : un seul projet Vercel de production, alerte en cas d'échec | S |
| SOC-007 | Colonne `company_id` généralisée + helper de sécurité (sans changer le comportement mono-société) | M |
| SOC-008 | Jeu de **données de démonstration anonymisées** (27 salariés fictifs) pour tests et démonstrations | M |
| SOC-009 | Sauvegarde/restauration : procédure écrite et testée | S |

**Critère de sortie** : toute écriture sur une donnée de paie laisse une trace lisible ; une régression de paie échoue visiblement ; aucun déploiement ne peut partir avec une erreur de build.

#### Lot 1 — Gouvernance de paie (4 semaines, P0)

| Ticket | Description | Taille |
|---|---|---|
| PAY-001 | Table `payroll_periods` (ouverte → contrôlée → approuvée → validée → payée → clôturée) et transitions contrôlées en base | L |
| PAY-002 | Checklist configurable par période (salariés, affectations, variables, présences, congés, totaux) | M |
| PAY-003 | Détecteur d'anomalies : salarié sans structure, variation > X % vs mois précédent, net négatif, doublon, variables corrigées à la main | L |
| PAY-004 | Double validation : préparateur ≠ approbateur (contrainte en base) | M |
| PAY-005 | Snapshot immuable des paramètres et variables à la validation ; recalcul vérifiable | L |
| PAY-006 | Réouverture avec motif obligatoire, réservée à l'admin, journalisée | M |
| PAY-007 | Régularisation d'un écart sur un mois ultérieur (rappel de salaire) | L |
| PAY-008 | Comparaison automatique avec le mois précédent (écran « avant / après ») | M |
| PAY-009 | `rule_sets` : versionnement des taux, barèmes et rubriques avec date d'effet, source et statut | L |
| PAY-010 | Tranchage des **points Excel ouverts** (§2.3 du canevas) : décision écrite par point, test de référence associé | M |

**Critère de sortie** : on ne peut plus valider un mois sans passer la checklist et l'approbation ; un bulletin validé se recalcule à l'identique ; porte A franchie après **un mois de paie à blanc**.

#### Lot 2 — Portail salarié et manager (6 semaines, P0)

| Ticket | Description | Taille |
|---|---|---|
| ESS-001 | Moteur de demandes générique (type, étapes, approbateurs, délai, motif de refus) | L |
| ESS-002 | Demandes : congé (migration du flux actuel), attestation de travail, attestation de salaire, correction de présence, acompte | L |
| ESS-003 | Périmètres de manager (`manager_scopes`) et boîte de validation | L |
| ESS-004 | Délégation temporaire d'approbation pendant une absence | M |
| ESS-005 | Notifications in-app + e-mail (fournisseur à décider) | L |
| ESS-006 | Tableau de bord salarié : dernier bulletin, solde de congés, demandes en cours | M |
| ESS-007 | Demande de modification de données personnelles avec validation RH | M |
| ESS-008 | Calendrier d'équipe (absences) pour le manager | M |
| ESS-009 | Installation en **PWA** (écran d'accueil, hors-ligne en lecture) | M |

**Critère de sortie** : un salarié fait une demande, son manager la valide, la RH est notifiée, le solde et la présence se mettent à jour, tout est tracé.

#### Lot 3 — Sorties financières et déclaratives (6 semaines, P0)

| Ticket | Description | Taille |
|---|---|---|
| OUT-001 | Contrat d'export de virement indépendant de la banque + premier format pilote | L |
| OUT-002 | Contrôles bancaires : RIB manquant ou invalide, doublons, total = net à payer | M |
| OUT-003 | Calendrier des échéances sociales (15 du mois) avec alertes | S |
| OUT-004 | États **CSS** (mensuel/trimestriel/annuel) et **IPRES** au format accepté (à confirmer avec les organismes) | L |
| OUT-005 | État récapitulatif des traitements et salaires (déclaration fiscale annuelle) — format à confirmer avec la DGID | L |
| OUT-006 | Axes analytiques dans le journal comptable (site, département, projet, centre de coût) | L |
| OUT-007 | Envoi des bulletins par e-mail avec reprise sur erreur et accusé | L |
| OUT-008 | Facture prestataire à partir du BRS (numérotation, archivage) | M |
| OUT-009 | Suivi de statut : préparé → exporté → transmis → accusé → rejeté → corrigé | M |
| OUT-010 | Génération **PDF côté serveur** archivée avec empreinte (bulletins, livre de paie) | L |

**Critère de sortie** : un mois réel traité de bout en bout sans ressaisie ; porte B franchie.

#### Lot 4 — Documents, carrière et conformité légale (6 semaines, P1)

| Ticket | Description | Taille |
|---|---|---|
| DOC-001 | Stockage privé + URL temporaires + journal des accès | L |
| DOC-002 | Catalogue `document_requirements` et coffre documentaire par salarié | L |
| DOC-002A | UX « Mon Dossier Administratif » : 5 sections, cartes, progression, recherche, états et responsive mobile | L |
| DOC-002B | Dépôt fichier/caméra, prévisualisation, remplacement, limites MIME/taille et contrôle antivirus | L |
| DOC-002C | Workflow RH : soumettre, valider, refuser avec motif, versionner et notifier | L |
| DOC-002D | Vue RH/admin d'une fiche salarié, opérations assistées et contrôle du périmètre manager | M |
| DOC-002E | Génération PDF de checklist/dossier complet avec index et empreinte | L |
| DOC-002F | Rétention, expiration, purge contrôlée et export du journal d'accès | M |
| DOC-003 | Expirations et alertes (CNI, contrat, visite médicale, habilitation) | M |
| DOC-004 | Modèles de documents avec variables (attestations, contrats, certificat de travail) | L |
| CAR-001 | Historique de carrière `employee_events` (mutation, promotion, augmentation) lié aux structures salariales | L |
| CAR-002 | Onboarding : checklist (DPE 48 h, immatriculations IPRES/CSS 8 jours, banque, équipement, formation sécurité) | L |
| CAR-003 | Offboarding : préavis, **solde de tout compte**, restitution matériel, certificat | L |
| CAR-004 | Organigramme et rattachement site / département / manager | M |
| CAR-005 | Registres légaux (personnel, heures supplémentaires) générés depuis les données | M |
| CAR-006 | Dotation EPI et équipements | M |
| CAR-007 | Import contrôlé de salariés (prévisualisation, rapport d'erreurs) | M |

**Critère de sortie** : le dossier complet d'un salarié se constitue de l'embauche à la sortie ; porte C franchie.

**Séquence recommandée avant le développement :**

1. valider le catalogue des 18 exigences et les règles conditionnelles ;
2. valider les documents obligatoires, les durées de validité et les rôles
   autorisés par type de pièce ;
3. livrer le modèle SQL/RLS et les tests négatifs salarié A/B, RH et manager ;
4. livrer l'UX salarié mobile-first avec fixtures anonymisées ;
5. livrer la revue RH et le PDF complet ;
6. tester le parcours réel sur téléphone et clôturer la porte C.

#### Lot 5 — Temps avancé, exploitation minière, frais (8 semaines, P1)

| Ticket | Description | Taille |
|---|---|---|
| TPS-001 | Calendriers de jours fériés par pays/site/année | S |
| TPS-002 | Postes et rotations (3×8, 14/14), affectations et planning | L |
| TPS-003 | Pointage manuel et import de pointeuse | L |
| TPS-004 | Heures supplémentaires avec approbation préalable | M |
| TPS-005 | Politiques d'acquisition de congés par ancienneté et type | M |
| MIN-001 | Habilitations par poste, blocage d'affectation si expirée | L |
| MIN-002 | Primes de site / pénibilité / astreinte attribuées automatiquement par poste | L |
| MIN-003 | Registre et déclaration des accidents du travail (48 h) | M |
| MIN-004 | Avantages en nature : hébergement, transport, restauration | M |
| FRA-001 | Ordres de mission avec avance et approbation | L |
| FRA-002 | Notes de frais avec justificatif, plafonds, doublons | L |
| FRA-003 | Prêts et acomptes avec échéancier et retenue automatique en paie | L |

**Critère de sortie** : un salarié posté voit sa présence, ses primes et ses retenues calculées sans saisie manuelle de paie.

#### Lot 6 — Pilotage RH (4 semaines, P1)

Effectifs, entrées/sorties, ancienneté, absentéisme, turnover, coût des heures supplémentaires, masse salariale par site/contrat/centre de coût, prévisions avec scénarios, exports. Ces tableaux reposent sur les données enrichies des lots 1 à 5.

#### Lot 7 — Talent et mobile (8 semaines, P2)

Référentiel de compétences, objectifs, campagnes d'évaluation, plan de formation, recrutement (ATS léger), centre de notifications avancé, application installable renforcée.

#### Lot 8 — IA assistée (4 semaines, P2)

| Fonction | Garde-fou |
|---|---|
| Explication d'un bulletin (« d'où vient ce montant ? ») | Lecture seule, cite la règle et la donnée source |
| Détection d'anomalies et de dérives | Propose, ne corrige jamais |
| Recherche sur données autorisées | Respecte les droits de l'utilisateur ; aucune donnée personnelle envoyée à un tiers sans accord et minimisation |
| Brouillons d'attestations et de checklists | Toujours relus et validés par un humain |

---

## 8. Backlog détaillé des trois premiers lots

### Sprint 1 (lot 0)

- [ ] SOC-001 Audit étendu aux tables métier
- [ ] SOC-003 Garde-fou sur les périodes futures et les mois sautés
- [ ] SOC-004 Régression de paie automatique
- [ ] SOC-005 Intégration continue (build complet + lint + régression)
- [ ] SOC-006 Un seul projet Vercel de production

### Sprint 2 (lot 0)

- [ ] SOC-002 Écran « Journal des modifications »
- [ ] SOC-007 `company_id` généralisé
- [ ] SOC-008 Données anonymisées
- [ ] SOC-009 Sauvegarde / restauration testée
- [ ] Atelier de décision D1 à D4 (§0)

### Sprints 3 à 6 (lot 1)

- [ ] PAY-001 → PAY-010 dans l'ordre : périodes, checklist, anomalies, double validation, snapshot, réouverture, régularisation, comparaison, règles versionnées, points Excel
- [ ] **Paie à blanc** d'un mois réel en parallèle de l'outil actuel
- [ ] Porte A : revue et décision

### Dépendances critiques

```text
SOC-001 (audit) ─────────────► PAY-006 (réouverture), ESS-001 (demandes)
SOC-007 (société) ───────────► toutes les nouvelles tables
PAY-001 (périodes) ──────────► PAY-002..008, OUT-001 (virement par période)
PAY-009 (règles versionnées) ► OUT-004/005 (déclarations), TPS-005 (congés)
ESS-005 (notifications) ─────► OUT-007 (envoi bulletins), DOC-003 (expirations)
DOC-001 (stockage) ──────────► OUT-010 (PDF archivés), DOC-002..004, CAR-003
```

---

## 9. Risques et parades

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Régression silencieuse du moteur de paie | Moyenne | Très élevé | Régression automatique en intégration continue (SOC-004/005) |
| Formats bancaires ou déclaratifs inconnus ou changeants | Élevée | Élevé | Contrat d'export générique + banque pilote ; recueillir les spécifications **avant** le lot 3 |
| Données personnelles exposées | Faible | Très élevé | RLS testée par rôle, stockage privé, journal d'accès, aucune donnée réelle dans le dépôt |
| Règles légales changées (taux, plafonds) | Moyenne | Élevé | `rule_sets` versionnés avec date d'effet et source |
| Dépendance à une seule personne | Élevée | Élevé | Documentation par lot, tests, procédure de restauration |
| Périmètre qui s'étend (ATS, évaluations…) | Élevée | Moyen | Portes de décision A à D ; lots 7-8 conditionnés au succès des lots 0-4 |
| Déploiement qui échoue sans alerte | Moyenne | Moyen | SOC-005/006 |
| Fournisseur d'e-mail / SMS non retenu | Moyenne | Moyen | Décision en D5 avant le lot 2 |

### Indicateurs de réussite

| Indicateur | Cible |
|---|---|
| Temps de traitement d'un mois de paie | −50 % vs aujourd'hui (à mesurer au lot 1) |
| Corrections après validation | 0 sans régularisation tracée |
| Bulletins distribués sans intervention manuelle | 100 % à partir du lot 3 |
| Demandes traitées dans le portail | > 90 % des congés dès le lot 2 |
| Écart de paie à blanc vs outil actuel | 0 F sur un mois complet |
| Incidents de sécurité sur données personnelles | 0 |

---

## 10. Décisions à valider

Cases à cocher une fois tranchées. « Défaut » = ce que je ferai si vous ne précisez pas.

### Bloquantes avant le lot 1

- [x] **D1** Mono-société, `company_id` partout — *validé 30/10/2026*
- [x] **D2** Paie prépare, RH ou DAF approuve, admin clôture — *validé 30/10/2026*
- [x] **D2 (précision)** Le rôle « rh » prépare et calcule la paie lui-même (variables, présences, calcul, suppression d’un traitement non validé) ; paramètres, barèmes, structures et suivi des paiements restent à « paie » ; validation, clôture, réouverture et annulation restent à « admin » — *validé 30/10/2026*
- [x] **D3** Banques BSIC et BNDE ; virements reportés. Paie actuelle par chèque ou espèces sur site (comptable), envois Wave / Orange Money — *validé 30/10/2026* (le lot 3 devra couvrir chèque/espèces/mobile money avant le virement bancaire)
- [x] **D4** PWA d'abord, application native après stabilisation — *validé 30/10/2026*. Chiffrement des champs sensibles : reporté.

### Avant le lot 2

- [x] **D5** E-mail via Gmail ; WhatsApp à intégrer si gratuit (à instruire : l'API WhatsApp Business est payante au-delà des conversations gratuites, alternative = lien « click-to-chat » gratuit) — *validé 30/10/2026*
- [x] **D6** Valeurs par défaut — *validé 30/10/2026*
- [x] **D7** Simple validation interne — *validé 30/10/2026*

### Avant le lot 3

- [x] **D8** Valeur par défaut : pas de transmission aux organismes pour l'instant ; le comptable la fait lui-même. On produit un fichier de synthèse du journal de paie — *validé 30/10/2026*
- [x] **D9** Valeur par défaut (site + centre de coût) — *validé 30/10/2026*
- [x] **D10** Excel = base ; si une meilleure règle existe, arbitrer et la mettre en place (décision écrite et test de référence par point) — *validé 30/10/2026*

### Avant le lot 5

- [x] **D11** Gardiens en présence 24 h/24 : prévoir rotation et affectation par poste — *validé 30/10/2026*
- [x] **D12** Équipements et dotations : module développé ailleurs, géré par le HSQE (hors périmètre SOMA-RH) — *validé 30/10/2026*

---

## 11. Prochaine étape proposée

1. **Validation de ce document** : vos réponses à D1–D4 et vos remarques sur le périmètre.
2. **Démarrage du lot 0** (2 semaines) : audit étendu, garde-fou de période, régression automatique, intégration continue, nettoyage du déploiement.
3. **Atelier de cadrage** (1 à 2 h) pour D5–D10, en particulier la collecte des formats bancaires et déclaratifs, qui conditionne le lot 3.
4. **Démarrage du lot 1** avec un mois de paie à blanc.

---

## Annexes

### A. Sources

- Application : code (`web/src`), migrations (`supabase/migrations`), base de production interrogée le 30/10/2026 (structure, règles de sécurité, déclencheurs d'audit, traitements).
- Canevas joint v1.0 « SOMA-RH — canevas d'évolution du SaaS RH et paie » (30/10/2026).
- [Frappe HR — documentation](https://docs.frappe.io/hr/introduction) : liste des modules.
- [Odoo Apps — Paie Sénégal V18](https://apps.odoo.com/apps/modules/18.0/hr_payroll_seng) : fonctionnalités, dépendances, licence propriétaire OPL-1, prix affiché.
- [Africarrières — obligations de l'employeur au Sénégal](https://africarrieres.com/senegal/fr/guide/employeur-entreprise/obligations-employeur) : déclarations, registres, échéances, taux. Le guide signale lui-même des incohérences internes (taux CSS « non confirmé », CMU/IPM) et demande une vérification auprès des sources officielles.
- [OrangeHRM](https://github.com/OrangeHRM/OrangeHRM) : repris du canevas joint, non revérifié ici.

### B. Limites de cette analyse

- Les chiffres légaux et les formats de déclaration **ne sont pas validés** ; ils servent à identifier les besoins, pas à les coder.
- La colonne Sage du benchmark est **à confirmer par une démonstration** ou par vos utilisateurs de ce logiciel.
- Les durées sont des ordres de grandeur, à recaler après les décisions D1–D4.
- Les spécificités minières (§4.3) sont des hypothèses sectorielles à valider avec vous.

### C. Glossaire

| Terme | Sens |
|---|---|
| ESS / MSS | Employee / Manager Self-Service : portail salarié / manager |
| RLS | Sécurité par ligne dans la base (chaque utilisateur ne voit que ses données) |
| Snapshot | Copie figée des paramètres et variables utilisés pour une paie validée |
| BRS | Retenue à la source sur les prestataires |
| DPE | Déclaration préalable d'embauche |
| EPI | Équipement de protection individuelle |
| IPRES / CSS | Caisses de retraite / de sécurité sociale (famille, accidents du travail) |
| IPM | Institution de prévoyance maladie |
| CFCE | Contribution forfaitaire à la charge de l'employeur |
| PWA | Application web installable sur téléphone |
