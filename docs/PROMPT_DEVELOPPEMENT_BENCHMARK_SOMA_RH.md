# Prompt — Développer les éléments du benchmark, étape par étape, dans SOMA-RH-local

> À coller dans Claude Code, ouvert dans `C:\IT-Mozaic\SOMA-RH-local` (base de test, Docker local).
> Prérequis : `docs/comparatif/` existe (benchmark du 4 novembre 2026).

## Rôle

Tu es l'équipe de développement de SOMA-RH-local (PostgreSQL Docker, PostgREST, API Node `api/server.mjs`, web React/Vite/TypeScript/Tailwind). Tu intègres au système, **un lot à la fois**, les éléments identifiés dans `docs/comparatif/`. Interface, données et documentation en français.

## Règles non négociables

1. **Base légale** : Code du travail du Sénégal, conventions collectives, CGI, règles IPRES et CSS. Toute règle de paie s'appuie sur `docs/regles-de-paie/registre-legal.md` (article + source). Valeur douteuse ou sources divergentes : écrire « à confirmer », ne rien inventer, appliquer la règle la plus favorable au salarié tant que ce n'est pas tranché, et me poser la question.
2. **Sauvegarde avant tout** : `scripts/local-backup.ps1` avant chaque lot qui touche au schéma.
3. **Migrations seulement** : `db/migrations/AAAAMMJJHHMMSS_nom.sql` + `db/rollback/` correspondant, puis `notify pgrst, 'reload schema'`. Jamais de modification directe de la base.
4. **Toute nouvelle table** : RLS activée, politiques par rôle (`has_role`), index sur les clés étrangères, entrée dans le journal d'audit si elle porte des données de paie ou personnelles.
5. **Montants** en `numeric` pleine précision ; arrondi à l'affichage seulement.
6. **Données personnelles** : jamais dans Git ni dans la documentation ; données de test synthétiques uniquement ; `scripts/scan-pii.sh` doit rester propre.
7. **Non-régression** : `scripts/verify-payroll.ps1` doit rester identique (empreinte de référence) sauf lot de paie volontaire, expliqué et validé par moi.
8. **Pas d'identifiants réels** (banque, Mobile Money, SMTP, DGID, IPRES/CSS) : adaptateurs derrière une interface, mode simulé/fichier par défaut, secrets via variables d'environnement hors Git.
9. La base de développement peut être modifiée librement pour simuler une PME jusqu'à plus de 200 salariés.

## Phase A — Recoupement avec l'existant (aucun code)

1. Lis `docs/comparatif/` (état des lieux, matrices, workflows, intégrations, modules à améliorer, backlog, sources).
2. Pour chaque élément du backlog, **vérifie dans le code et la base** s'il existe déjà, partiellement ou pas : migrations, fonctions SQL, `api/server.mjs`, pages `web/src/pages`, scripts. Lecture seule, sans copier de données personnelles.
3. Relis aussi `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md`, `GAP_ANALYSIS_NEXTGEN_SOMA_RH.md`, `FEUILLE_DE_ROUTE_V3_SOMA_RH.md` et `REGISTRE_RISQUES_DECISIONS_SOMA_RH.md` pour ne pas refaire ni contredire.
4. Corrige le benchmark si le code contredit un constat (par exemple recrutement, formation ou évaluation déjà présents).
5. Produis `docs/comparatif/plan-de-developpement.mdx` : tableau des éléments à développer, avec pour chacun : identifiant `DEV-nn`, existant (oui / partiel / non, preuve), valeur, effort (S/M/L), risque traité, dépendances, tables et pages touchées, décision requise de ma part. Classe-les en lots ordonnés.
6. **Arrête-toi** et présente-moi la liste (10 lignes maximum de résumé). Attends ma validation de l'ordre et du périmètre avant la phase B.

## Phase B — Développement lot par lot

Ordre de départ proposé (à ajuster selon la phase A) :

| Lot | Contenu | Sources de référence |
|---|---|---|
| 1 | Sécurité de l'API : inscription fermée (invitation par admin), jeton de rafraîchissement opaque et révocable, `logout` effectif, limitation de débit, verrouillage après échecs, CORS configurable, puis TOTP | `matrice-securite.mdx` |
| 2 | Arbitrage des règles contestées au registre légal (quotient familial ou grille forfaitaire pour l'IR, heures supplémentaires dès la 48e ou 49e heure, TRIMF, référence du Code du travail) | `sources.mdx`, `registre-legal.md` |
| 3 | Journal de contrôle comptable : équilibre débit/crédit, blocage des rubriques sans imputation, export d'OD de paie après clôture (CSV puis format comptable choisi) | `workflows-cibles.mdx` |
| 4 | Fichiers IPRES / CSS (NDAMLI) et états DGID (IR, TRIMF, CFCE) | `integrations.mdx` |
| 5 | Envoi réel des notifications (file d'attente existante → worker SMTP, journal de livraison, reprise sur échec) | `modules-a-ameliorer.mdx` |
| 6 | Solde de tout compte, certificat de travail, sortie du salarié (retrait des accès, archivage) | `workflows-cibles.mdx` |
| 7 | Fichier de virement bancaire depuis le règlement L8, puis adaptateur Mobile Money | `integrations.mdx` |
| 8 | Import de pointeuses (CSV puis connecteur), majorations d'heures supplémentaires | `matrice-usage.mdx` |
| 9 | MFA/SSO, ABAC, chiffrement des colonnes sensibles | `matrice-securite.mdx` |
| 10 | Recrutement, formation, évaluation (seulement si je les valide) | `matrice-usage.mdx` |

Pour **chaque lot**, dans cet ordre, sans sauter d'étape :

1. **Cadrage** (5 lignes) : objectif, tables et pages touchées, règle légale concernée (article + source), risques. Si une décision m'appartient, pose la question et attends.
2. **Sauvegarde** puis migration + rollback ; appliquer ; vérifier le rollback sur une copie.
3. **Tests d'abord** : cas d'usage `docs/qa/` (nominal, limite, erreur, droits par rôle admin/rh/paie/manager/salarié), test d'isolation RLS, et pour la paie un test contre l'oracle indépendant et les valeurs de référence.
4. **Implémentation** : SQL, API, interface (palette `ink / paper / river / phosphate / signal`, police Archivo, chiffres tabulaires, accessibilité clavier).
5. **Vérification** : `verify-payroll.ps1`, `scan-pii.sh`, build web, tests, essai manuel du parcours complet avec données synthétiques (scénario PME 25 puis 200+ salariés si le lot touche la volumétrie).
6. **Documentation Mintlify** : page du lot dans `docs/` (cas d'usage, étapes, captures sans donnée personnelle), `docs/docs.json` mis à jour, `mint validate` et `mint broken-links` si Mint est disponible ; mise à jour de `docs/comparatif/matrice-usage.mdx` et `matrice-securite.mdx` (la case passe de ❌ à ✅ avec preuve), de `FEUILLE_DE_ROUTE_V3_SOMA_RH.md` et de `REGISTRE_RISQUES_DECISIONS_SOMA_RH.md`.
7. **Compte rendu du lot** (10 lignes) : ce qui est fait, tests passés, écarts, points « à confirmer », décisions ouvertes. **Arrête-toi et attends mon « lot suivant »**.

## Phase C — Suite

À la fin de chaque lot ou sur demande, recoupe de nouveau le benchmark avec l'état réel du code et propose la liste mise à jour des éléments restant à développer (même format que la phase A), avec les nouveaux écarts rencontrés.

## Sorties attendues

- `docs/comparatif/plan-de-developpement.mdx` (phase A) et sa mise à jour après chaque lot.
- Migrations + rollbacks, code, tests, pages Mintlify, matrices à jour.
- Une synthèse d'une page à chaque lot : fait / reste / décisions pour moi.

## Garde-fous

- Ne touche pas à `C:\IT-Mozaic\SOMA-RH-local\backups\` ni aux fichiers `.env` ; ne publie rien en production ; pas de `git push` sans mon accord.
- Si un test échoue ou si l'empreinte de paie change sans l'avoir voulu : annule le lot (rollback), explique la cause, ne contourne pas.
- Si une information légale ou technique manque (format NDAMLI, format de fichier bancaire, API d'opérateur), ne la devine pas : liste ce qu'il faut obtenir et de qui, et avance sur ce qui est faisable en mode fichier.
