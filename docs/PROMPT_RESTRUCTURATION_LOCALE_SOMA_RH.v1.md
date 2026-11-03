# Prompt opératoire — restructuration locale de SOMA-RH

> **Document à donner à une IA de développement**  
> **Périmètre décidé :** une seule entreprise, la SOMA, au Sénégal uniquement.  
> **Déploiement cible :** environnement local uniquement.  
> **Dépôt source :** projet SOMA-RH actuel.  
> **Résultat attendu :** une nouvelle copie indépendante du projet, connectée à une base PostgreSQL locale et entièrement testable sans dépendre du projet Supabase distant.

---

## 0. Prompt à copier-coller

```text
Tu es l'IA principale responsable de restructurer le projet SOMA-RH pour un fonctionnement entièrement local.

OBJECTIF
=======
À partir du dépôt SOMA-RH actuel, crée une nouvelle copie indépendante dans un nouveau dossier voisin du dépôt source. Transforme cette copie en application RH et paie locale pour une seule entreprise, la Société Minière Africaine (SOMA), au Sénégal uniquement.

L'application doit pouvoir fonctionner, être migrée, être testée et être réinitialisée localement sans dépendre du projet Supabase distant mzhdwdpesbggxtjxxgab.

Le périmètre n'est PAS multi-tenant et n'est PAS international pour cette étape. Ne construis pas maintenant une architecture SaaS multi-entreprises ou multi-pays. Préserve cependant une structure suffisamment propre pour que cette évolution soit possible plus tard.

RÈGLES ABSOLUES
===============
1. Ne travaille jamais directement dans le dépôt source.
2. Crée une copie dans un nouveau dossier clairement identifiable, par exemple :
   C:\IT-Mozaic\SOMA-RH-local
   Si ce dossier existe déjà, arrête-toi et demande un autre nom ; ne l'écrase jamais.
3. Ne supprime, ne réinitialise et ne remplace jamais le dépôt source.
4. N'utilise aucune donnée personnelle réelle dans Git, les fixtures, les tests ou les logs.
5. Utilise uniquement des données synthétiques pour les scénarios locaux.
6. Ne mets jamais de clé service Supabase, mot de passe PostgreSQL ou secret dans le code ou Git.
7. Toute modification du schéma PostgreSQL doit passer par une migration versionnée.
8. Toute modification du moteur de paie doit préserver la référence Excel d'août 2026.
9. Ne change pas silencieusement une règle métier ambiguë ; documente l'ambiguïté et demande validation.
10. Ne déclare pas une étape terminée sans preuve : commande exécutée, résultat observé et fichier de rapport ou test associé.
11. Travaille en français dans l'interface, la documentation et les messages métier.
12. N'installe pas de dépendance ou de service externe sans vérifier qu'il est nécessaire et documenter son rôle.

RÉFÉRENCE MÉTIER NON NÉGOCIABLE
================================
Le moteur public compute_salary_slip doit rester fidèle au classeur Excel « GESTION DE LA PAIE DES CONGES ».

Après toute modification du moteur :
- recalculer les 25 bulletins de référence d'août 2026 ;
- comparer les montants de chaque bulletin et les totaux ;
- respecter une tolérance maximale de 0,000001 F ;
- vérifier au minimum :
  - brut total : 4 929 179,09 F ;
  - net total : 4 662 739,89 F ;
  - les retenues, charges patronales, IR, TRIMF, IPRES, CSS, IPM et provisions ;
- produire un rapport de non-régression sans données personnelles réelles.

Consulte et respecte :
- docs/ANALYSE_EXCEL.md ;
- docs/PLAN_EVOLUTION_SOMA_RH.md ;
- docs/AUDIT_COMMERCIALISATION_SOMA_RH.md ;
- CLAUDE.md ;
- README.md.

ARCHITECTURE LOCALE À PRIVILÉGIER
=================================
Le frontend actuel dépend de Supabase Auth, PostgREST, PostgreSQL, RLS et RPC PL/pgSQL. Un PostgreSQL nu ne fournit pas Auth ni l'API utilisée par le frontend.

Choisis donc en priorité l'une des deux solutions suivantes, après vérification des outils disponibles :

A. Solution recommandée : Supabase CLI local
   - PostgreSQL local ;
   - Auth local ;
   - API REST locale ;
   - migrations et fonctions SQL locales ;
   - stockage local si nécessaire.

B. Solution de repli : PostgreSQL local + backend local compatible
   - uniquement si Supabase CLI local est impossible ;
   - documenter le backend choisi ;
   - préserver les règles RLS, les RPC et les contrats de données ;
   - ne pas contourner la sécurité en donnant au navigateur un accès administrateur.

Ne remplace pas Supabase par un PostgreSQL brut uniquement pour simplifier l'installation. Vérifie d'abord les prérequis Docker, Supabase CLI, Node.js, npm et PostgreSQL.

PHASE 1 — INSPECTION ET RAPPORT INITIAL
=======================================
1. Vérifie le répertoire courant, le dépôt Git, la branche et l'état du worktree.
2. Vérifie que le dépôt source est intact et note les modifications préexistantes.
3. Analyse les fichiers suivants avant toute copie :
   - web/package.json ;
   - vercel.json ;
   - supabase/migrations/ ;
   - supabase/seed/ ;
   - web/src/lib/supabase.ts ;
   - web/src/lib/auth.tsx ;
   - web/src/lib/queries.ts ;
   - docs/ANALYSE_EXCEL.md ;
   - docs/PLAN_EVOLUTION_SOMA_RH.md ;
   - docs/AUDIT_COMMERCIALISATION_SOMA_RH.md.
4. Vérifie si le projet contient déjà un fichier supabase/config.toml.
5. Vérifie les versions disponibles :
   - node --version ;
   - npm --version ;
   - docker --version ;
   - supabase --version ;
   - psql --version.
6. Si un outil essentiel manque, ne l'installe pas silencieusement. Indique :
   - l'outil manquant ;
   - la raison ;
   - la commande d'installation proposée ;
   - l'étape bloquée.
7. Crée dans le dépôt source uniquement un rapport temporaire hors Git si nécessaire. Ne modifie pas le code source à cette phase.

PHASE 2 — CRÉATION DE LA COPIE ISOLÉE
=====================================
1. Crée un nouveau dossier voisin, par exemple :
   C:\IT-Mozaic\SOMA-RH-local
2. Copie le projet source en excluant au minimum :
   - .git ;
   - node_modules ;
   - web/dist ;
   - fichiers .env contenant des secrets ;
   - dumps de données personnelles ;
   - caches et sorties temporaires.
3. Initialise un nouveau dépôt Git local uniquement si cela facilite les tests ; il ne doit pas être relié au dépôt distant par défaut.
4. Crée un fichier local de configuration à partir de .env.example.
5. Vérifie que la copie compile avant toute restructuration.
6. Crée un journal de migration dans :
   docs/LOCAL_RESTRUCTURATION_LOG.md
   Ce journal doit contenir les commandes, les décisions, les problèmes et les preuves.

PHASE 3 — INITIALISATION DE LA BASE LOCALE
==========================================
1. Initialise la configuration Supabase locale dans la copie si elle n'existe pas.
2. Démarre les services locaux avec la solution retenue.
3. Note les URL locales, ports et identifiants générés. Ne mets aucun secret dans Git.
4. Vérifie avec une connexion réelle que :
   - PostgreSQL répond ;
   - les migrations peuvent être appliquées ;
   - Auth local répond ;
   - l'API locale répond ;
   - la clé publique locale permet au frontend de se connecter.
5. Applique les migrations dans l'ordre exact des noms de fichiers.
6. Si une migration échoue :
   - arrête la phase ;
   - capture l'erreur complète ;
   - identifie la migration et l'instruction fautive ;
   - corrige la cause dans une nouvelle migration ou un correctif versionné ;
   - ne modifie pas silencieusement l'historique déjà appliqué.
7. Vérifie les extensions, fonctions, triggers, vues, contraintes, index et politiques RLS.
8. Vérifie que les tables métier ont bien leurs contraintes et index de clés étrangères.

PHASE 4 — DONNÉES DE TEST SYNTHÉTIQUES
======================================
1. N'importe aucune donnée personnelle réelle depuis le projet distant.
2. Ne réutilise pas les vrais noms, CNI, téléphones, RIB, e-mails ou adresses.
3. Crée un jeu de données synthétique pour une seule société SOMA :
   - au moins 25 salariés fictifs ;
   - plusieurs types de contrat ;
   - plusieurs conventions et catégories ;
   - plusieurs situations familiales ;
   - salariés cadres et non cadres ;
   - absences, maladie, heures supplémentaires, congés et variables ;
   - au moins un cas de sortie ;
   - au moins un cas de prestation ;
   - au moins un cas sans structure salariale, pour tester une erreur explicite.
4. Les matricules de test doivent être clairement artificiels ou générés localement.
5. Sépare les seeds de démonstration des seeds de test.
6. Rend l'initialisation idempotente ou fournis une commande de remise à zéro documentée.
7. Ajoute des identifiants déterministes uniquement pour les tests ; ne les utilise pas comme secrets.

PHASE 5 — CONFIGURATION DU FRONTEND LOCAL
=========================================
1. Remplace les URL et clés distantes par les valeurs locales.
2. Vérifie que web/src/lib/supabase.ts ne contient aucun fallback silencieux vers la production.
3. Ajoute une protection explicite :
   - en développement local, l'application doit refuser une URL Supabase distante non autorisée ;
   - les erreurs de configuration doivent être visibles ;
   - aucune clé service ne doit être acceptée côté navigateur.
4. Configure les scripts npm nécessaires, par exemple :
   - npm run dev ;
   - npm run build ;
   - npm run lint ;
   - npm run test ;
   - npm run db:reset ;
   - npm run db:migrate ;
   - npm run db:seed:test ;
   - npm run verify:payroll.
5. Ne casse pas les routes, les rôles, les RPC ni les types générés.
6. Régénère web/src/lib/database.types.ts depuis la base locale après les changements de schéma.
7. Vérifie les états de chargement, erreur, vide, absence de rôle et session expirée.

PHASE 6 — DURCISSEMENT POUR LE PÉRIMÈTRE MONO-ENTREPRISE
=========================================================
Le produit reste mono-entreprise et Sénégal. Ne construis pas de multi-tenant maintenant, mais rends explicites les limites locales.

À faire :
1. Ajouter ou formaliser une configuration locale de la société SOMA.
2. Empêcher la création de plusieurs entreprises dans l'interface si le périmètre est strictement mono-entreprise.
3. Conserver company_id là où il existe pour préserver l'évolutivité, mais ne pas prétendre avoir une isolation SaaS complète.
4. Vérifier que tous les écrans ne lisent que la société locale attendue.
5. Vérifier que les rôles admin, rh, paie et salarie sont testables localement.
6. Conserver les protections RLS existantes et corriger toute lecture trop large qui expose des données personnelles.
7. Ajouter des tests de sécurité :
   - un salarié ne voit que ses données et ses bulletins validés ;
   - RH et paie ne voient que les données autorisées ;
   - un utilisateur sans rôle ne peut pas accéder aux opérations protégées ;
   - une RPC sensible refuse un identifiant ou une ressource hors périmètre ;
   - aucune lecture anonyme n'est possible.
8. Ne pas ajouter de tenant_id, abonnement ou facturation sauf si cela est nécessaire au fonctionnement local ; dans ce cas, documenter la raison.

PHASE 7 — GOUVERNANCE DU CYCLE DE PAIE
=======================================
Sans élargir le périmètre produit, implémente les protections nécessaires pour tester une paie fiable :

1. états explicites : brouillon, calculée, en revue, validée, payée, clôturée, annulée ;
2. contrôle des transitions côté base ;
3. impossibilité de modifier une paie clôturée ;
4. correction par nouvelle opération tracée plutôt que suppression silencieuse ;
5. motif obligatoire pour toute réouverture ou correction ;
6. journal de l'acteur, de l'heure, de l'action et des totaux avant/après ;
7. snapshot des paramètres et variables utilisés lors de la validation ;
8. anomalies bloquantes et avertissements visibles avant validation ;
9. validation de l'équilibre du journal comptable ;
10. recalcul idempotent sans doublons ;
11. tests de concurrence sur deux calculs du même mois.

Si une décision métier ou légale n'est pas certaine, crée une anomalie documentée et ne choisis pas arbitrairement.

PHASE 8 — TESTS AUTOMATISÉS
===========================
Crée une vraie suite de tests locale, sans données personnelles.

Minimum attendu :
1. tests du schéma et des contraintes ;
2. tests RLS par rôle ;
3. tests des fonctions compute_income_tax, compute_trimf et compute_salary_slip ;
4. tests des 25 bulletins synthétiques d'août 2026 ;
5. tests de tolérance monétaire ;
6. tests de plafonds et seuils ;
7. tests CDI, CDD, COD, stage, apprentissage et prestation ;
8. tests absence, maladie, congé et heures supplémentaires ;
9. tests entrée, sortie, licenciement et retraite ;
10. tests d'absence de structure salariale ;
11. tests de validation, clôture, correction et annulation ;
12. tests d'idempotence ;
13. tests de remise à zéro puis réinstallation ;
14. test de build et lint frontend.

Chaque test doit indiquer :
- préconditions ;
- données synthétiques ;
- commande ;
- résultat attendu ;
- résultat obtenu ;
- statut.

PHASE 9 — VALIDATION DU MOTEUR ET RAPPORTS
==========================================
1. Exécute la paie synthétique d'août 2026.
2. Compare les résultats aux références documentées dans docs/ANALYSE_EXCEL.md.
3. Si les données synthétiques ne peuvent pas reproduire exactement les références historiques, crée deux suites :
   - suite de fidélité mathématique avec fixtures anonymisées et totaux de référence ;
   - suite fonctionnelle synthétique pour les nouveaux scénarios.
4. Génère un rapport sans données personnelles :
   docs/LOCAL_PAYROLL_VALIDATION.md
5. Le rapport doit inclure :
   - version du code ;
   - version de la base ;
   - version des migrations ;
   - date du test ;
   - nombre de bulletins ;
   - tolérance ;
   - totaux attendus et obtenus ;
   - écarts ;
   - statut final.

PHASE 10 — RECONSTRUCTION ET INSTALLATION REPRODUCTIBLE
=========================================================
Crée une procédure permettant à une autre personne de reconstruire le projet local depuis zéro :

1. prérequis Windows ;
2. copie du projet ;
3. installation des dépendances ;
4. démarrage de la base ;
5. application des migrations ;
6. chargement des seeds synthétiques ;
7. génération des types ;
8. configuration du frontend ;
9. lancement ;
10. création d'un compte admin local ;
11. exécution des tests ;
12. remise à zéro complète ;
13. arrêt propre des services ;
14. sauvegarde et restauration locales.

La procédure doit fonctionner sans accès au projet Supabase distant.

PHASE 11 — CONTRÔLE FINAL
=========================
Avant de conclure, exécute toutes les commandes pertinentes et produis un tableau :

| Contrôle | Commande | Résultat attendu | Résultat obtenu | Statut |
|---|---|---|---|---|
| dépendances | ... | installation sans erreur | ... | PASS/FAIL |
| base locale | ... | PostgreSQL accessible | ... | PASS/FAIL |
| migrations | ... | toutes appliquées | ... | PASS/FAIL |
| seed synthétique | ... | données chargées | ... | PASS/FAIL |
| Auth local | ... | session créée | ... | PASS/FAIL |
| RLS | ... | accès autorisés/refusés | ... | PASS/FAIL |
| paie | ... | écarts sous tolérance | ... | PASS/FAIL |
| build | npm run build | succès | ... | PASS/FAIL |
| lint | npm run lint | succès sans erreur | ... | PASS/FAIL |
| tests | npm run test | tous les tests passent | ... | PASS/FAIL |
| reset | ... | environnement recréé | ... | PASS/FAIL |

Ne conclus pas « terminé » s'il reste un FAIL critique. Liste les blocages restants avec une commande de reproduction.

LIVRABLES OBLIGATOIRES
======================
Dans la nouvelle copie locale, livre :

1. le code restructuré ;
2. les migrations PostgreSQL/Supabase locales ;
3. les seeds synthétiques ;
4. la configuration locale sans secret ;
5. les scripts de démarrage, reset, migration et test ;
6. les types de base régénérés ;
7. docs/LOCAL_SETUP.md ;
8. docs/LOCAL_RESTRUCTURATION_LOG.md ;
9. docs/LOCAL_PAYROLL_VALIDATION.md ;
10. docs/LOCAL_TEST_MATRIX.md ;
11. un résumé final des choix et limites ;
12. la liste des fichiers modifiés ;
13. la liste des commandes exécutées et leurs résultats.

FORMAT DE TA RÉPONSE FINALE
===========================
Réponds en français avec les sections :

1. Résumé exécutif ;
2. Dossier de la nouvelle copie ;
3. Architecture locale retenue et justification ;
4. État de PostgreSQL/Auth/API locaux ;
5. Migrations et seeds ;
6. Changements frontend/backend ;
7. Tests exécutés ;
8. Validation de la paie ;
9. Problèmes non résolus ;
10. Commandes pour démarrer, tester et réinitialiser ;
11. Décision GO / NO-GO pour poursuivre les tests.

Ne fournis aucune donnée personnelle réelle dans la réponse.
```

---

## 1. Décisions déjà prises

Les éléments suivants ne doivent pas être redemandés par l’IA :

| Décision | Valeur |
|---|---|
| Nombre d’entreprises | Une seule |
| Entreprise | Société Minière Africaine (SOMA) |
| Pays | Sénégal |
| Déploiement | Local uniquement |
| Source | Copie du dépôt actuel |
| Dossier de sortie | Nouveau dossier voisin, jamais le dépôt source |
| Base | PostgreSQL local, idéalement via Supabase CLI local pour conserver Auth, API, RLS et RPC |
| Données | Synthétiques pour les tests ; aucune donnée personnelle réelle dans Git |
| Priorité | Fiabilité de la paie et tests avant enrichissement RH |
| Internationalisation | Hors périmètre immédiat |
| Multi-tenant | Hors périmètre immédiat |

---

## 2. Arborescence cible recommandée

```text
C:\IT-Mozaic\
├── SOMA-RH\                         # dépôt source, intouché
└── SOMA-RH-local\                   # nouvelle copie de travail
    ├── docs\
    │   ├── LOCAL_SETUP.md
    │   ├── LOCAL_RESTRUCTURATION_LOG.md
    │   ├── LOCAL_PAYROLL_VALIDATION.md
    │   └── LOCAL_TEST_MATRIX.md
    ├── supabase\
    │   ├── config.toml
    │   ├── migrations\
    │   └── seed\
    ├── web\
    │   ├── .env.example
    │   └── .env.local              # non suivi par Git
    └── scripts\
        ├── local-reset.ps1
        ├── local-seed.ps1
        └── verify-payroll.ps1
```

L’IA peut adapter cette arborescence si le dépôt possède déjà des conventions, mais elle doit conserver la séparation entre source, copie locale, scripts et documentation.

---

## 3. Critères GO / NO-GO

### GO pour poursuivre la restructuration

- la copie locale est indépendante ;
- le dépôt source n’a pas été modifié par erreur ;
- PostgreSQL local répond ;
- les migrations sont rejouables ;
- Auth/API/RLS locales fonctionnent ;
- les seeds sont synthétiques ;
- le frontend ne contacte pas le projet distant ;
- le build et le lint passent ;
- les tests de sécurité essentiels passent ;
- la paie de référence respecte la tolérance ;
- reset et reconstruction fonctionnent.

### NO-GO

- dépendance obligatoire au projet Supabase distant ;
- présence d’un secret dans Git ;
- données personnelles réelles dans les fixtures ;
- échec d’une politique RLS ;
- migration non rejouable ou base impossible à recréer ;
- paie divergente sans décision documentée ;
- suppression silencieuse d’un historique validé ;
- test critique ignoré ;
- modification du dépôt source ;
- service local démarré mais non vérifié.

---

## 4. Fichiers de référence du dépôt source

- [README.md](../README.md)
- [ANALYSE_EXCEL.md](./ANALYSE_EXCEL.md)
- [PLAN_EVOLUTION_SOMA_RH.md](./PLAN_EVOLUTION_SOMA_RH.md)
- [AUDIT_COMMERCIALISATION_SOMA_RH.md](./AUDIT_COMMERCIALISATION_SOMA_RH.md)
- [CLAUDE.md](../CLAUDE.md)

