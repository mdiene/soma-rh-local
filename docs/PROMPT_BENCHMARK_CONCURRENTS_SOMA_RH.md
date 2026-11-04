# Prompt Claude Code — Analyse de SOMA-RH, benchmark des logiciels de paie et RH, workflows et intégrations à développer

> À coller dans Claude Code lancé dans `C:\IT-Mozaic\SOMA-RH-local` (Windows, Docker Desktop démarré si tu dois lire la base).
> Mission d'**analyse et de recommandation** : tu ne développes rien dans l'application. Tu produis des documents dans `docs/comparatif/` (publiés avec Mintlify) et tu mets à jour la feuille de route.
> Complète la phase 13 du prompt `docs/PROMPT_CAMPAGNE_TESTS_SOMA_RH.md` ; si la campagne de tests a déjà tourné, utilise ses résultats (`docs/qa/`).

---

## 1. OBJECTIF

1. Établir un **état des lieux fiable** de SOMA-RH : modules, écrans, workflows réels, rôles, règles, intégrations existantes.
2. Le **comparer** aux grands noms de la paie et des RH (liste en section 4) sur l'usage, la profondeur des workflows, la sécurité et la gouvernance.
3. Identifier **les modules à améliorer** et décrire précisément **les workflows à utiliser** (qui fait quoi, dans quel ordre, avec quelles validations, statuts, notifications et contrôles).
4. Dresser le **catalogue des intégrations non prises en compte aujourd'hui** et qu'il faudra développer, avec priorité, prérequis et effort, adaptées au Sénégal et à la zone OHADA.
5. Produire une **feuille de route priorisée** de ce qu'il faut intégrer à la solution finale.

## 2. CONTEXTE À LIRE D'ABORD

Projet local Docker (PostgreSQL, PostgREST, API Node, front React). Base légale de la paie : **Code du travail du Sénégal** et textes liés ; le classeur Excel n'est plus une référence. Le rôle `rh` peut calculer la paie, seul l'`admin` valide et clôture. Public visé : PME à plus de 200 salariés. Cible de qualité : le niveau d'usage et de sécurité de Sage et de Frappe HR.

Lis : `CLAUDE.md`, `docs/ARCHITECTURE_CIBLE_SOMA_RH.md`, `docs/FEUILLE_DE_ROUTE_V3_SOMA_RH.md`, `docs/ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md`, `docs/GAP_ANALYSIS_NEXTGEN_SOMA_RH.md`, `docs/ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md`, `docs/REGISTRE_RISQUES_DECISIONS_SOMA_RH.md`, `docs/PLAN_CONTROLE_QUALITE_SOMA_RH.md`, `docs/SYNTHESE_CORPUS_DOCS.md`, `docs/captures-frappe-hr/`, `docs/LOCAL_TEST_MATRIX.md`. **Ne refais pas** ces analyses : vérifie-les contre le code et la base, corrige-les, complète-les.

## 3. ÉTAT DES LIEUX DE SOMA-RH (inventaire vérifié, pas supposé)

- Parcours `web/src/pages` et `web/src/components` (routes, rôles autorisés, actions), `db/migrations` (tables, statuts, fonctions, déclencheurs, RLS), `api/server.mjs` (routes, documents, miniatures), files de notifications.
- Pour chaque module, relever : écrans, **workflow réel** (états et transitions, qui peut agir, contrôles, journalisation), règles métier, rapports et exports, droits par rôle, intégrations existantes (WhatsApp prérempli, e-mails en file, export, etc.).
- Dessiner chaque workflow en **diagramme Mermaid** (acteurs, états, transitions, points de contrôle) et noter les trous : état manquant, validation absente, notification manquante, retour arrière impossible, pas de trace.
- Lire la base en lecture seule pour les volumes et usages réels ; ne copier aucune donnée personnelle dans les fichiers.

Modules à couvrir au minimum : organisation (salariés, emplois, conventions, organigramme et équipes), contrats et cycle de vie, présences et postes, congés, variables et éléments de paie, traitement de paie et contrôles, bulletins, états et déclarations, règlement (billetage, ordres, rapprochement), portail salarié et demandes (attestations, acomptes), pilotage et prévision, paramétrage, rôles et sécurité, audit, documents, notifications.

## 4. ÉDITEURS ET PRODUITS À ANALYSER

**Solutions du marché (paie et SIRH)** : PayFit (paie et déclarations sociales automatisées, TPE/PME) ; Cegid HR / Cegid Payroll (PME, ETI, grands groupes) ; Silae / mySilae (référence des cabinets d'expertise comptable) ; Eurécia (SIRH complet congés, temps, entretiens, paie connectée) ; Lucca (suite modulaire : Poplee, Timmi…) ; Sage (Sage 100 Paie & RH, Sage Business Cloud, et l'offre Sage en Afrique) ; Kelio (pointage, temps, plannings, options paie) ; Workday (grandes entreprises, finances, RH et paie) ; Factorial (SIRH tout-en-un, temps, recrutement, variables de paie) ; Deel (équipes internationales, contrats globaux, paie multi-pays).

**Solutions libres ou auto-hébergeables** : Frappe HR (référence de structure fonctionnelle), Odoo (modules RH et paie), OrangeHRM, IceHrm, HR.my, TimeTrex (édition communautaire), PHP Payroll, Bitrix24 (portail RH en libre-service, plannings, flux de congés).

**Localement** : cherche 3 à 5 solutions de paie et RH réellement utilisées au Sénégal et dans la zone OHADA (éditeurs locaux, offres Sage régionales, ERP déployés par des intégrateurs locaux). Cite tes sources. Ne retiens que ce que tu peux vérifier.

Règles de véracité : ne jamais affirmer une fonction d'un concurrent sans source (documentation officielle, aide en ligne, démonstration, support de formation). Note pour chaque affirmation sa source et la date de consultation. Les offres de pays étrangers (DSN française, par exemple) servent de **modèle fonctionnel** ; elles ne s'appliquent pas telles quelles : traduis-les vers l'équivalent sénégalais.

## 5. SOURCES : NOTEBOOKLM, PUIS LE WEB

**NotebookLM d'abord.** Le propriétaire a un carnet NotebookLM (aussi appelé Gemini Notebook) sur les logiciels de paie et RH, avec un dossier ou un groupe de sources « logiciel SaaS » / « logiciel HR » (vidéos de démonstration, tutoriels, documentations). Le nom exact n'est pas garanti : liste les carnets et choisis celui dont les sources correspondent, en le disant.

- Outil : la CLI `notebooklm-py` installée dans `C:\Users\HP\dev\NotebookKlmElement` (session déjà authentifiée), via le wrapper `nlm` : `nlm list`, `nlm use <id partiel>`, `nlm ask "…" --json`. Si la CLI échoue, utilise le navigateur du propriétaire (Claude in Chrome) sur `https://notebooklm.google.com/` ; ne tape jamais d'identifiants, demande-lui de se connecter lui-même si la page de connexion apparaît.
- Commence par lister les sources du carnet (titre, type, durée des vidéos) et vérifie qu'il couvre bien la question avant de l'interroger.
- Pose des **questions précises, en français, plusieurs à la fois plutôt qu'une question géante**, par exemple : étapes exactes du traitement de la paie mensuelle dans tel produit ; qui valide quoi ; comment se gèrent les variables, les congés, les rappels et régularisations ; quelles déclarations sont générées ; quelles intégrations sont proposées (banque, comptabilité, pointeuse, e-signature, API) ; quels contrôles avant clôture ; quels rôles et droits.
- **Garde l'ancrage** : cite la source (titre, minute pour une vidéo) pour chaque élément repris, distingue ce qui vient de NotebookLM de ton propre raisonnement, signale les contradictions.
- NotebookLM est en **lecture** : n'efface rien, ne renomme rien, ne partage rien, ne démarre pas une nouvelle conversation qui écraserait le fil existant. Ajouter une note ou une source n'est permis que si c'est utile, en le signalant. Tu peux lancer une génération (tableau de données, mind map) seulement si elle apporte un gain net.
- Complète ensuite par le web (documentation officielle des éditeurs, centres d'aide, pages produit) pour ce que le carnet ne couvre pas. Ne reproduis pas de contenu protégé : synthétise et cite.

## 6. MÉTHODE D'ANALYSE

Pour chaque produit et chaque module, remplis une fiche comparable :

1. **Périmètre fonctionnel** : fonctions principales, profondeur, particularités.
2. **Workflow** : étapes, acteurs, états, validations, délégations, notifications, contrôles, retours arrière, historique.
3. **Paramétrage** : assistant de démarrage, modèles, règles par pays, périodes de paie, check-list de clôture.
4. **États et déclarations** : lesquels, formats, fréquence, dépôt automatique ou non.
5. **Intégrations** : natives, par API, par fichier, par partenaire.
6. **Sécurité et gouvernance** : rôles, séparation des tâches, droits fins, audit, MFA/SSO, chiffrement, sauvegarde, données personnelles, certifications.
7. **Expérience** : ergonomie, mobile, libre-service, aide intégrée, temps de prise en main.
8. **Public et prix** : taille cible, modèle commercial si public.

Puis la grille d'écart pour SOMA-RH, module par module : statut (absent, partiel, équivalent, supérieur), écart précis, **impact utilisateur** (1–5), **risque métier ou légal** (1–5), effort (S/M/L/XL), dépendances, lot proposé.

## 7. CATALOGUE DES INTÉGRATIONS À DÉVELOPPER

Toutes les intégrations ci-dessous sont **hors périmètre actuel**. Pour chacune : objectif métier, produits de référence qui l'offrent, mode (API, fichier, lien, partenaire), données échangées, équivalent sénégalais ou OHADA, prérequis légaux ou contractuels, sécurité, effort, priorité et risque.

- **Déclarations et organismes** : IPRES, CSS, impôts (DGID : IR, TRIMF, CFCE), états annuels ; équivalent sénégalais de la déclaration sociale nominative des solutions françaises ; dépôt manuel assisté puis automatisé si un canal officiel existe.
- **Banque et paiement** : formats de virement de masse (BSIC, BNDE et autres), paiements mobiles (Wave, Orange Money) par export puis API, chèques, espèces avec billetage, rapprochement.
- **Comptabilité** : export des écritures (plan SYSCOHADA), connexion à Sage, Odoo ou autre ; ventilation analytique par département, site ou projet.
- **Temps et présences** : pointeuses et biométrie (modèle Kelio), badgeuses, application mobile de pointage avec géolocalisation, import de fichiers de pointeuse.
- **Communication** : e-mail (compte dédié), WhatsApp (lien prérempli aujourd'hui, API officielle ensuite), SMS, notifications push de la PWA.
- **Identité et sécurité** : SSO (Google, Microsoft), MFA, annuaire, gestion centralisée des accès.
- **Documents** : gestion documentaire et archivage (contrats, certificats médicaux, bulletins), **signature électronique**, coffre-fort numérique des bulletins, OCR des justificatifs.
- **Recrutement et intégration** : suivi des candidats, offres d'emploi, parcours d'accueil, formulaires d'embauche.
- **Performance, formation, notes de frais** : entretiens et objectifs, plan de formation, frais et avances.
- **Plateforme** : API publique documentée et webhooks, import/export de masse, connecteurs d'automatisation, sauvegarde externalisée chiffrée, supervision.
- **Multi-société et multi-pays** : `company_id`, consolidation, règles par pays (modèle Deel ou Workday), devises.

## 8. LIVRABLES (dans `docs/comparatif/`, pages MDX publiées par Mintlify)

1. `etat-des-lieux.mdx` : inventaire vérifié des modules, workflows (Mermaid), trous.
2. `fiches-concurrents/<produit>.mdx` : une fiche par produit selon la grille de la section 6, sources et date.
3. `matrice-usage.mdx` et `matrice-securite.mdx` : produits en colonnes, fonctions en lignes, statuts SOMA-RH.
4. `workflows-cibles.mdx` : pour chaque module, le **workflow recommandé** (diagramme, acteurs, états, validations, notifications, contrôles, exceptions), justifié par les produits de référence et le droit sénégalais.
5. `integrations.mdx` : le catalogue de la section 7, trié par priorité.
6. `modules-a-ameliorer.mdx` : classement des modules par impact, risque et effort, avec les actions précises.
7. `backlog-priorise.mdx` et mise à jour de `docs/FEUILLE_DE_ROUTE_V3_SOMA_RH.md` : lots (gains rapides, structurants, optionnels), dépendances, critères d'acceptation, indicateurs de succès.
8. `sources.mdx` : liste des sources (carnet NotebookLM : titre et minute ; liens web : URL et date de consultation).
9. Mise à jour de `docs/docs.json` (groupe « Comparatif ») et de `docs/REGISTRE_RISQUES_DECISIONS_SOMA_RH.md` (nouveaux risques et décisions à prendre).

Valide avec `mint validate` et `mint broken-links` avant de conclure. Ne lance jamais `mint new` ni `--force` dans `docs/`.

## 9. RÈGLES

- Analyse seulement : pas de modification du code ni du schéma, pas de migration. Les gains rapides sont proposés dans le backlog, non appliqués.
- Aucune donnée personnelle dans les fichiers ; aucun mot de passe saisi ; aucun partage ni suppression dans NotebookLM.
- Chaque affirmation sur un concurrent est sourcée ; ce qui n'est pas vérifiable est marqué « non vérifié ».
- Adapter au contexte sénégalais : un module français copié sans traduction légale est une erreur.
- Écris en français, simplement, orienté décision ; tableaux et diagrammes plutôt que longs paragraphes.
- Style de travail : un plan en une ligne par étape, liste de tâches tenue à jour, court résumé par livrable dans la conversation.

## 10. SYNTHÈSE FINALE À RENDRE

En une page : les 5 modules à améliorer en premier et pourquoi, les 5 workflows les plus importants à redessiner, les 5 intégrations les plus rentables à développer d'abord, les points où SOMA-RH est déjà au niveau ou au-dessus, les risques légaux ou de sécurité à traiter avant toute mise en production réelle, et les décisions que le propriétaire doit prendre.
