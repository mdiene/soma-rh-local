# Analyse Sage Paie & RH et Frappe HR — adaptation et différenciation de SOMA-RH

Version 0.2 — 3 novembre 2026 — document de cadrage, à valider.
Remplace la v0.1 du même fichier. Complète `GAP_ANALYSIS_NEXTGEN_SOMA_RH.md` et `FEUILLE_DE_ROUTE_NEXTGEN_SOMA_RH.md`.

## 0. Sources, méthode et limites

| Source | Couverture réelle | Limite |
|---|---|---|
| Manuel Sage Paie & RH 7.50 (oct. 2015) | Table des matières complète ; texte lisible jusqu'au chapitre « Ergonomie » | Détail des écrans et champs non lu au-delà |
| Cours gratuit « Sage Paie & RH V9 » (informatique-bureautique.com) | 29 pages lues sur les 14 modules : paramètres de structure, de paie, de contrôle, caisses, cotisations, constantes, rubriques, variables, natures d'événements, bulletins modèles, fiches de personnel, bulletin salarié, paie des salariés, calcul, édition, règlement, charges, clôtures (intermédiaire, mensuelle, ouverture), bilan social, paramétrage et transfert comptables, droits d'accès | Plusieurs pages ne contiennent que des captures (champs des paramètres de paie et de contrôle illisibles) ; les barèmes de cotisations du cours datent de 2017 et sont français |
| Documentation Frappe HR (docs.frappe.io/hr) | Sommaire complet (13 modules) ; 17 pages lues : paie, composants, structures, bulletin, saisie de paie, correction, arriérés, heures supplémentaires, solde de tout compte, cycle de vie, congés, postes, présences, paramètres de paie, salaire additionnel, prêts, rapports | Pages d'introduction parfois courtes ; **aucune capture d'écran prise** (voir §9) ; localisation indienne, sans règles sénégalaises |
| Notebook « logiciel HR » (NotebookLM, 85 sources) | Transcription de la vidéo Sage « Paramétrage et création du fichier société » ; réponse à une question de différenciation (12 fonctionnalités, lue en entier à l'écran) | Texte non exportable : lu par captures. **Les chiffres légaux cités (plafonds, taux) sont ceux de NotebookLM et ne sont pas vérifiés** |

Principe directeur : on extrait **le fonctionnement et la logique de structuration** des deux progiciels, pas leurs règles légales. Sage est français (DSN, DUCS, AGIRC/ARRCO) et Frappe HR indien (EPF, ESI, TDS). Les règles de paie restent sénégalaises et doivent être confirmées par le comptable ou le juriste avant codage.

## 1. Architecture fonctionnelle de Sage Paie & RH

| Menu Sage | Rôle | Contenu principal |
|---|---|---|
| Fichier | Administration du dossier | Création/ouverture de société, utilitaires (reprise, purge, vérification, cumuls), paramètres (entête, paie, contrôles), droits d'accès, calendrier et alertes |
| Listes | Données de référence | Fiches de personnel, constantes, rubriques, variables, natures d'événements, organisations (établissements, départements, services, unités), caisses, conventions collectives, plannings modèles, table des prêts, modélisation comptable, tables de codes |
| Gestion | Traitements du mois | Bulletins modèles et salariés, absences, arrêts, acomptes, prêts, heures, calcul, édition, paiements, clôtures |
| États | Sorties | Livre de paie, fiche individuelle, mouvements de personnel, états de cotisations et de cumuls, déclarations |
| Annexes | Traitements périodiques | Passation comptable, modification en masse, rappel de salaires, bilan social, duplicata de bulletin |
| Gestion avancée | Éditions sur mesure | Sélections, modèles de listes et de documents, publipostage |
| Aide | Mises à jour | Mise à jour du Plan de paie, codes BIC/IBAN |
| Modules optionnels | Extensions | Multi-sociétés, formation, carrières, temps |

### 1.1 Le « plan de paie » : comment Sage structure la paie

```text
ÉTABLISSEMENT ► DÉPARTEMENT ► SERVICE ► (UNITÉ)          [paramètres de structure]
CAISSES ──► rattachées aux établissements (obligatoire)
CONSTANTES (légale | société | salarié | calculée)  ──┐
VARIABLES (cumuls, déclarations)                    ──┼──► RUBRIQUES (brut | cotisation | non soumise)
FICHE DE PERSONNEL (9 onglets)                      ──┘          base × taux × nombre
                                                                  │
                                         BULLETIN MODÈLE (« plan de paie » par catégorie)
                                                                  │
                                         BULLETIN SALARIÉ (8 zones) ► CALCUL ► ÉDITION
                                                                  │
                          RÈGLEMENT ► CLÔTURE INTERMÉDIAIRE ► CLÔTURE MENSUELLE ► OUVERTURE DU MOIS
                                                                  │
                                       PASSATION COMPTABLE · ÉTATS DE CHARGES · BILAN SOCIAL (annuel)
```

### 1.2 Éléments de conception à retenir (lus dans le cours)

| Élément | Détail lu |
|---|---|
| Constantes | 4 natures ; zone « mémo » pour filtrer ; constantes éditeur non supprimables ; plafonds et Smic mis à jour à la main |
| Rubriques | Brut / cotisation / non soumise ; **base × taux × nombre** ; rattachées à une caisse ; onglet Comptabilité (journal, comptes) ; codes mémo et arbre par nature |
| Bulletin modèle | Aussi appelé « plan de paie » ; modifier un modèle modifie tous les salariés rattachés après recalcul ; création par duplication du modèle le plus proche puis activation/désactivation de rubriques |
| Fiche de personnel | 8 onglets : État civil, Coordonnées (banque si virement), Contrat, Poste, Paie (salaire de base + bulletin modèle), Congés, DADS-U (déclaratif), Administratif (liaison comptable) |
| Bulletin salarié | Zones : Rubriques, Congés/absences (+ cumuls congés, RTT), Heures supplémentaires, Autres variables, Valeurs de base, Bulletin calculé, Édition. **Code couleur** : gains en bleu, retenues en rouge, saisies en noir, modifiés en vert, non modifiables en gris. **Icônes d'état** : édité, calculé, clôture intermédiaire, clôture mensuelle, absent, sorti, en sommeil. **Calcul inversé** (du net vers le brut) |
| Saisie en masse | Sélection multiple de salariés (Ctrl/Maj) ; saisie par population (heures, absences) ; « préparation par rubriques » depuis des tableaux externes |
| Calcul | Définitif, tous salariés ou sélection, critère de tri, case « recalculer tous les bulletins » ; **toujours exécuté avant l'édition** |
| Règlement | Ordres de paiement vérifiés contre les bulletins → virements (**simulation avant génération**, fichier XML) ou chèques ; espèces mentionnées sans procédure. Le mode vient de la fiche salarié |
| Clôture intermédiaire | Fige un sous-ensemble de bulletins ; **refusée si les bulletins n'ont pas été édités** ; **aucun message d'erreur** : il faut contrôler le rapport et l'écran salariés (point faible à ne pas copier) |
| Clôture mensuelle | Rapport de clôture en PDF + PDF de tous les bulletins + clôture de la période, puis ouverture du mois suivant |
| Comptabilité | Rubrique → journal et comptes ; salarié → compte individuel (42MARTIN) ou générique (42100000) ; transfert **mensuel** par fichier texte |
| Charges | Trois états : charges patronales, salariales, résumé des cotisations |
| Droits d'accès | Création d'utilisateurs avec mot de passe ; profils et droits non détaillés dans la page |

## 2. Frappe HR comme référentiel

Frappe HR couvre 13 modules : organisation, présences, postes, congés, performance, frais, recrutement, formation, cycle de vie, flotte, paie (structures, bulletins, saisie de paie, salaire additionnel, primes), fiscalité, prêts, heures supplémentaires, avantages flexibles, correction de paie, arriérés, rapports.

### 2.1 Modèle de paie

| Concept Frappe HR | Fonctionnement lu | Pertinence pour SOMA-RH |
|---|---|---|
| **Salary Component** | Type Gain / Retenue / **Contribution employeur** (non versée, hors bulletin, comptée dans le coût) ; abréviation utilisable dans les formules ; « montant par formule » + condition ; fonctions `round`, `ceil`, `floor`, `getdate` ; options : dépend des jours payés, soumis à l'impôt, **composant statistique** (valeur intermédiaire sans effet sur le net), exclu du total mais affiché, désactivé | Reprendre la **contribution employeur** (IPRES, CSS, CFCE) et le **composant statistique** (bases intermédiaires comme le brut imposable) |
| **Salary Structure** | Gains/retenues, mode de paiement et compte, version « feuilles de temps », encaissement de congés, aperçu du bulletin avant affectation | Équivalent de nos structures ; ajouter l'**aperçu avant affectation** |
| **Salary Structure Assignment** (+ outil d'affectation en masse) | Une affectation datée par salarié ; création unitaire ou en lot ; solde d'ouverture (revenus imposables et impôt déjà retenu) pour un salarié sans historique | Datée = base de la reprise d'historique et des arriérés |
| **Payroll Entry** | Filtres (succursale, désignation, département, projet) → « Get Employees » → création des bulletins en lot (idempotent, ne recrée pas l'existant) → **vérification** → soumission groupée qui enregistre la **charge à payer** → « Make Bank Entry » (écriture groupée) ; option « Validate Attendance » | Le **lot de paie** est l'objet pivot : sélection, génération, contrôle, soumission, règlement |
| **Salary Slip** | Création depuis structure + période ; jours payés calculés selon présences ou congés ; congé sans solde = absence ; **cumuls annuel et mensuel** (par composant) ; envoi par e-mail à la soumission (PDF protégé par un mot de passe construit à partir de champs du salarié) ; annulation | Cumuls par composant ; PDF protégé |
| **Additional Salary** | Ajout ou retenue **ponctuel ou récurrent** (de/à) sur un composant, avec option « remplace le montant de la structure » | Primes, retenues et acomptes : un seul mécanisme, daté, traçable |
| **Payroll Correction** | Annule partiellement des jours de congé sans solde déjà appliqués : calcule le détail des arriérés, puis crée des Additional Salary et des écritures au **grand livre des avantages** ; lié au bulletin de référence | **Régularisation sans modifier un mois clos** |
| **Arrears** | Effet rétroactif d'une nouvelle structure approuvée tard : calcul automatique gains/retenues/accumulations, versés via Additional Salary ; accumulations suivies dans le grand livre | Rappel de salaire |
| **Overtime** | Type d'heures sup. (plafond journalier, composant, taux fixe ou basé sur composants, multiplicateurs standard / férié / week-end) ; activation par type de poste ; **bordereau d'heures sup. approuvé par la RH** → crée un salaire additionnel | Chaîne pointage → bordereau → approbation → paie |
| **Loans** | Type, demande approuvée, prêt, échéancier généré, décaissement, retenue automatique sur salaire, échéancier modifiable après soumission (congé sans solde) | Prêts et acomptes à échéancier |
| **Full and Final Statement** | Liste de contrôle de sortie : dettes (bulletin, indemnité de fin de carrière, frais, primes, encaissement de congés), créances (prêt, avance), **actifs à restituer ou à recouvrer** ; statuts ligne (non réglé → réglé) et document (en attente → **payé**) ; écriture de règlement finale | Solde de tout compte en workflow |
| **Payroll Settings** | Jours ouvrés selon présences ou congés ; statut des jours non pointés ; fériés comptés ou non ; fraction de salaire d'une demi-journée ; arrondi ; solde de congés sur le bulletin ; e-mail et chiffrement ; **écritures comptables détaillées par salarié ou consolidées** | Paramètres explicites au lieu de règles cachées |

### 2.2 Présences, postes, congés

| Domaine | Fonctionnement lu | Pertinence |
|---|---|---|
| Présences | Statuts : présent, absent, en congé, demi-journée (avec statut de l'autre moitié), télétravail ; saisie unitaire, en masse (au-delà de 10 jours : tâche de fond, erreurs isolées), import de fichier, **pointage automatique** depuis les entrées/sorties avec seuils d'absence et de demi-journée ; unicité par employé et par date ; **la paie lit les présences** | Cohérence : toute absence passe par une fiche de présence |
| Congé approuvé | À la soumission, passe les jours en « en congé » ; la fiche de présence retrouve la demande liée | Congé → présence → jours payés |
| Postes | Types de poste (horaires, seuils, pointage automatique, heures sup. autorisées), lieux, affectations, **plannings et affectations de plannings**, demandes de changement, **roster** | Gardiens 24 h/24 : planning + heures majorées |
| Congés | Types, politiques, périodes, **affectations de politique**, allocations, demandes avec approbateur par employé, **liste de blocage**, congé compensatoire, encaissement, congés acquis au prorata, **registre des écritures de congés (leave ledger)** | Registre de congés par écritures, plutôt qu'un simple solde |
| Cycle de vie | Intégration, promotion, transfert, séparation, entretien de sortie, solde de tout compte, cartographie de compétences | Historique de carrière et sortie |
| Rapports | Solde de congés, registre des salaires, présence mensuelle (détail/résumé), présence par poste, sorties (entretien, solde en attente), **remises bancaires**, remboursements de prêts, anniversaires, salariés présents un jour férié | À reprendre comme catalogue d'états |

## 3. Écarts SOMA-RH par rapport à Sage et Frappe HR

« Existe » = signalé comme livré ou partiel dans la feuille de route, l'analyse comparative et le gap analysis ; à confirmer dans le code.

| # | Fonction | Sage | Frappe HR | SOMA-RH | Écart |
|---|---|:-:|:-:|---|---|
| 1 | Constantes datées et typées | ● | ◐ | Paramètres légaux datés, non versionnés | `rule_sets` + typologie en 4 natures |
| 2 | Rubriques base × taux × nombre rattachées à une caisse | ● | ● (formule) | Composants de structure | Formaliser base nommée, caisse, contribution employeur, composant statistique |
| 3 | Bulletin modèle par catégorie | ● | ● (structure) | Structures salariales | Duplication + aperçu avant affectation |
| 4 | Lot de paie (sélection → génération → contrôle → soumission) | ◐ | ● | Traitements mensuels | Objet « lot » avec filtres et idempotence |
| 5 | Calcul ciblé et recalcul | ● | ◐ | Calcul global | Sélection de salariés, recalcul ciblé |
| 6 | Salaire additionnel ponctuel ou récurrent | ◐ | ● | Variables du mois | Mécanisme unique daté |
| 7 | Régularisation et arriérés sans toucher un mois clos | ◐ (rappel de salaires) | ● | À faire | Priorité haute |
| 8 | Heures sup. avec bordereau approuvé | ◐ | ● | Présences, sans bordereau | Bordereau + approbation |
| 9 | Prêts et acomptes à échéancier | ● | ● | Acomptes par demande | Échéancier et retenue automatique |
| 10 | Solde de tout compte en workflow (actifs inclus) | ○ | ● | À faire | Statuts ligne/document |
| 11 | Clôture intermédiaire / mensuelle / ouverture | ● | ◐ | Périodes et transitions | Rapport de clôture, sauvegarde, **erreurs explicites** |
| 12 | Règlement : simulation avant génération, chèque, billetage | ● | ◐ | Suivi chèque/espèces/mobile money | Simulation, billetage, API mobile money |
| 13 | Cumuls annuel/mensuel par composant | ● | ● | Cumuls annuels | Cumul par composant sur le bulletin |
| 14 | Registre de congés par écritures | ◐ | ● | Soldes | Registre + liste de blocage |
| 15 | Pointage automatique et plannings de postes | ◐ | ● | Planning gardiens | Import pointeuse, majorations de nuit |
| 16 | Droits d'accès par profil | ◐ | ● | 4 rôles | Matrice de droits et périmètre manager |
| 17 | États : charges, livre de paie, remises bancaires | ● | ● | Livre de paie, états internes | Catalogue d'états ; générateur filtrable |
| 18 | Transfert comptable par rubrique et par salarié | ● | ● | Écritures comptables | Compte individuel ou générique ; détaillé ou consolidé |
| 19 | E-mail des bulletins en PDF protégé | ○ | ● | Absent | Lot 3 (Gmail) |
| 20 | Bilan social | ● | ○ | Pilotage RH | Indicateurs à fixer avec le droit sénégalais |

● couvert · ◐ partiel · ○ absent.

## 4. Fonctionnalités de différenciation (recherches NotebookLM + analyse)

Ces douze fonctionnalités proviennent de la réponse de NotebookLM à la question « manques d'un SaaS de paie sénégalais face à Sage, Odoo, Frappe HR, SunuPayRH ». Elles sont **à confirmer**, car NotebookLM ne cite que des numéros de sources et ses chiffres n'ont pas été vérifiés. J'y ajoute l'apport des analyses Sage et Frappe HR.

| Rang | Fonctionnalité | Besoin | Workflow retenu | Statut vis-à-vis de l'existant |
|---|---|---|---|---|
| 1 | **Déclaration sociale unifiée (CSS + IPRES)** | Fichier nominatif mensuel/trimestriel avant le 15 du mois, plafonds d'assiette automatiques | Clôture → calcul des assiettes plafonnées → fichier au format du portail → contrôle de cohérence avec le livre de paie → export et titre de paiement | **Décision D8 : pas de transmission pour l'instant** ; garder l'état de contrôle et le fichier de synthèse, formats à confirmer |
| 2 | **IR + TRIMF avec parts familiales** | Abattement forfaitaire, quotient familial, TRIMF, sans confusion avec l'IUTS d'autres pays | Base imposable → abattement → barème progressif → TRIMF → retenue et état fiscal | Déjà dans le moteur ; ajouter **explication du calcul** |
| 3 | **Paiement par mobile money (Wave, Orange Money)** | Salaires et acomptes réglés par mobile money plutôt que par virement | Validation du livre ou de l'acompte → choix opérateur et contrôle du numéro → transfert groupé → archivage de l'identifiant de transaction sur le bulletin | Suivi manuel existant ; **API opérateur à instruire** |
| 4 | **Planning 24 h/24 et majorations** | Gardiens et équipes de quart : heures de nuit, dimanches, fériés, repos compensateur | Grille de roulement → import pointage → ventilation des heures majorées → injection en paie et contrôle du repos | Planning gardiens existant ; règles de nuit **laissées telles quelles par décision du 30/10** : à rouvrir si souhaité |
| 5 | **Moteur multi-conventions** | Conventions collectives (mines, pétrole et gaz, BTP, sécurité) : planchers, primes, ancienneté | Choix de la convention à la création du contrat → contrôle du plancher → primes conventionnelles → révision des grilles | **Nouveau** ; forte valeur pour le secteur minier |
| 6 | **Portail mobile salarié** | Bulletins conformes au décret de référence, acomptes, solde de congés | Connexion → demande → validation manager → consultation du bulletin | Première version existante ; PWA |
| 7 | **Congés légaux et majorations** | Droit de base mensuel, majorations d'ancienneté et pour mères d'enfants de moins de 14 ans | Paramétrage → cumul mensuel → majorations → mise à jour du bulletin et du portail | À spécifier avec les textes |
| 8 | **CFCE** | Contribution employeur sur la masse salariale brute, hors remboursements de frais | Masse brute → exclusion des frais → taux → état fiscal | Déjà dans le moteur ; contrôle à ajouter |
| 9 | **Solde de tout compte et certificat** | Indemnités selon le motif, salaire moyen des 12 derniers mois, indemnité de précarité des CDD | Motif → salaire moyen et congés restants → grille d'indemnité → reçu et certificat de travail | **Point Excel ouvert** (base mensuelle ou moyenne) ; Frappe HR apporte la **liste de contrôle d'actifs** |
| 10 | **Écrêtement des plafonds sociaux** | Assiettes plafonnées par régime (retraite générale, cadres, CSS, prévoyance maladie) | Brut → écrêtement par plafond applicable → cotisations → contrôle | Déjà dans le moteur ; **plafonds à confirmer** |
| 11 | **Dossier du personnel réglementaire** | Dossier en sous-dossiers (état civil, carrière/diplômes, congés/absences, récompenses, discipline), accès restreint | Dépôt de pièces → classement → règles d'accès → export du dossier pour l'inspection | **Lot 4 en attente** (système documentaire à venir) |
| 12 | **Registre de paie immuable et émargement** | Registre mensuel scellé à la clôture, émargement papier ou électronique | Génération à la clôture → scellement → émargement → archivage | À relier à l'audit chaîné par hash du gap analysis |

### 4.1 Apports propres à notre analyse (à instruire)

| Idée | Origine | Intérêt |
|---|---|---|
| **Explication d'un montant** : afficher la formule, la base et le taux source de chaque ligne du bulletin | Détail des valeurs de Sage | Argument fort face aux solutions opaques ; sans IA |
| **Paie à blanc** comparée à l'Excel et à l'ancien outil | Feuille de route lot 1 | Sécurise la bascule |
| **Régularisation par écritures** (Payroll Correction) plutôt que réouverture | Frappe HR | Mois clos jamais modifiés |
| **Registre des congés par écritures** | Frappe HR | Soldes recalculables et auditables |
| **Erreurs de clôture explicites** | Faiblesse de Sage (clôture muette) | Confiance de l'utilisateur |
| **Simulation avant génération** des ordres de paiement | Sage | Moins d'erreurs bancaires |
| **Contribution employeur et coût total** par salarié | Frappe HR (CTC) | Pilotage de la masse salariale |
| **Base de connaissances légale datée et sourcée** | Plan de paie Sage | Mise à jour des taux sans coder |

## 5. Workflows cohérents : règles d'ensemble

### 5.1 Automates d'état

```text
PÉRIODE DE PAIE
 ouverte ─► préparée ─► calculée ─► contrôlée ─► approuvée ─► éditée ─► payée ─► clôturée
              ▲            │           │            │                              │
              └────────────┴───────────┴────────────┘ (corrections avant approbation)
                                                                     clôturée ─► (réouverture admin, motif) ─► rouverte
 Après clôture : toute correction passe par une RÉGULARISATION sur une période ultérieure.

DEMANDE (congé, acompte, attestation, correction de présence, données personnelles)
 brouillon ─► soumise ─► approuvée | refusée | annulée ─► appliquée   (délégation, délai, escalade)

SORTIE
 préavis ─► solde de tout compte (lignes : dettes, créances, actifs) ─► validé ─► payé ─► certificat remis

PRÊT / ACOMPTE
 demandé ─► approuvé ─► décaissé ─► remboursé par retenues ─► soldé
```

### 5.2 Invariants de cohérence (testables)

| # | Règle | Pourquoi |
|---|---|---|
| I1 | Un congé ou une absence approuvé produit une fiche de présence ; la paie lit **uniquement** les présences | Évite deux sources de vérité (Frappe HR) |
| I2 | Une présence ne peut exister avant la date d'embauche ni pour un salarié sorti ; une seule par salarié et par date | Idem |
| I3 | Aucun calcul sur une période non ouverte ; aucune approbation avec une anomalie bloquante | Sage refuse la clôture silencieusement : nous bloquons **avec message** |
| I4 | Le préparateur n'est pas l'approbateur ; seul l'admin clôture et rouvre (motif obligatoire) | Décision D2 |
| I5 | Un bulletin approuvé est figé avec ses paramètres (snapshot) ; il se recalcule à l'identique | Reproductibilité |
| I6 | Toute correction après clôture crée un salaire additionnel daté sur une période ultérieure | Frappe HR |
| I7 | Salaire additionnel, prêt, heures supplémentaires et prime passent par le **même** mécanisme daté | Un seul chemin vers le bulletin |
| I8 | Le total des ordres de paiement égale le total des nets à payer ; la simulation précède la génération | Sage |
| I9 | Chaque rubrique porte ses comptes ; la passation comptable ne contient aucune règle propre | Sage |
| I10 | Chaque modification sensible est journalisée (auteur, avant/après, motif) | Gap analysis |
| I11 | Les droits se vérifient en base (RLS), pas seulement à l'écran | Existant |
| I12 | Le coût employeur (contributions) est calculé pour chaque bulletin, même s'il n'y figure pas | Frappe HR |

## 6. Feuille de route de différenciation (proposition)

| Priorité | Lot | Contenu | Dépend de |
|---|---|---|---|
| P0 | Fiabiliser la référence (porte zéro) | 25 cas d'août 2026, fixture, CI de non-régression | — |
| P0 | Salaire additionnel unifié + régularisation | I6, I7 ; prêts et acomptes sur ce socle | Porte zéro |
| P0 | Clôture explicite + rapport + sauvegarde | I3, I8 | Périodes existantes |
| P1 | Explication du bulletin | Formule, base, taux par ligne | `rule_sets` |
| P1 | Lot de paie (sélection, génération, contrôle) | Filtres, idempotence, recalcul ciblé | P0 |
| P1 | Heures sup. en bordereau approuvé + planning 24 h/24 | Pointage → bordereau → paie | Présences |
| P1 | Solde de tout compte en workflow | Dettes, créances, actifs, certificat | Prêts, congés |
| P1 | Règlement : simulation, billetage, mobile money | I8 | Lot de paie |
| P2 | Moteur multi-conventions | Planchers et primes | `rule_sets` |
| P2 | Registre de paie scellé et émargement | Audit chaîné par hash | Audit |
| P2 | Déclarations CSS/IPRES | Après confirmation des formats | Décision D8 |
| P2 | Dossier du personnel réglementaire | Après le système documentaire | Lot 4 |

## 7. Ce qui manque encore à l'analyse

| Sujet | Raison | Suite proposée |
|---|---|---|
| Champs des paramètres de paie (7 pages) et de contrôle de Sage | Visibles seulement en captures | Lire les captures de la vidéo ; abandonné sur votre demande |
| Pages Frappe HR de détail : types de poste, politiques de congés, présence automatique, demandes d'heures, avantages flexibles | Non lues (sommaire et pages d'introduction seulement) | Lecture ciblée |
| Pages de la fiche de personnel Sage (champs par onglet) | Captures non lisibles | À compléter sur démonstration |
| Réponses 1 à 12 de NotebookLM : sources exactes | NotebookLM n'affiche que des numéros | Interroger source par source |
| Validation légale des plafonds et taux cités | Non vérifiés | Comptable ou juriste |

## 8. Décisions à prendre

1. **Priorité de la régularisation** : l'adopter en P0 (écritures datées) à la place de la réouverture comme chemin normal de correction ?
2. **Mobile money** : instruire dès maintenant les API Wave/Orange Money, ou rester sur le suivi manuel jusqu'au lot 3 ?
3. **Majorations de nuit** : rouvrir la décision du 30/10 (règles laissées telles quelles) pour appliquer les majorations de nuit des gardiens ?
4. **Multi-conventions** : cibler d'abord la convention minière ?
5. **Squelette de navigation** : adopter les menus de Sage (Fichier, Listes, Gestion, États, Annexes) ?

## 9. Captures d'écran et structure des écrans

**Disponibles** : 9 captures Frappe HR dans `docs\captures-frappe-hr\` (index dans son README) ; 2 captures Sage dans `docs\video-captures\sage-paie-rh-1\`. Les écrans Sage du cours n'ont pas pu être capturés lisiblement (fenêtre trop étroite, images tronquées) : la source recommandée est le manuel PDF.

**Gabarits d'écran déduits des captures Frappe HR** (à adapter, pas à copier) :

| Gabarit | Constat | Application SOMA-RH |
|---|---|---|
| Fiche document | Barre latérale (commentaires, pièces jointes, étiquettes) + formulaire en sections + statut (Brouillon, Soumis, Annulé) + boutons d'action en en-tête | Un seul gabarit pour période, bulletin, demande, prêt, sortie |
| Lot de paie | Date, fréquence, filtres, liste des salariés, puis « générer les bulletins » ; non destructif si déjà généré | Écran pivot de la paie mensuelle |
| Bulletin | Gains à gauche, retenues à droite, brut, total retenues, net, arrondi, cumul annuel et du mois | Bulletin lisible avec cumuls et « explication » de chaque ligne |
| Éditeur de rubriques | Tableau : composant, abréviation, montant, case statistique, formule | Écran d'administration des règles |
| Demande de congé | Tableau des soldes par type au-dessus du formulaire | Solde visible avant de demander |
| Salaire additionnel | Salarié, composant, montant, date de paie, récurrent, remplace la structure | Un mécanisme pour primes, retenues, acomptes |
| Solde de tout compte | Trois blocs : dettes, créances, actifs, avec statuts | Écran de sortie |
| Paramètres de paie | Cases explicites avec aide courte sous chaque case | Pas de règle cachée dans le code |
| Navigation du module | Menu latéral : Roster, tableau de bord, pointage, demandes, heures sup., rapports, paramètres | À comparer avec les menus Sage (décision 5, §8) |

## Annexe — Liens

- Cours Sage : https://www.informatique-bureautique.com/moodle/course/view.php?id=102
- Manuel Sage Paie : https://wilroad.com/documentation/Manuel%20Sage%20Paie.pdf
- Frappe HR : https://docs.frappe.io/hr/introduction
