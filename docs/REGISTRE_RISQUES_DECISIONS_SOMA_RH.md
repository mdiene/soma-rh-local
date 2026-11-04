# SOMA-RH — Registre des risques et des décisions

Version 1.0 — 3 novembre 2026. Produit par `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` (§6.8).
Voir [SYNTHESE_CORPUS_DOCS.md](./SYNTHESE_CORPUS_DOCS.md), [ARCHITECTURE_CIBLE_SOMA_RH.md](./ARCHITECTURE_CIBLE_SOMA_RH.md), [FEUILLE_DE_ROUTE_V3_SOMA_RH.md](./FEUILLE_DE_ROUTE_V3_SOMA_RH.md), [PLAN_CONTROLE_QUALITE_SOMA_RH.md](./PLAN_CONTROLE_QUALITE_SOMA_RH.md).

**Résumé**
1. Quinze risques ; les trois plus sérieux : référence de paie indéfinie (K1), valeurs légales non vérifiées (K2), travail non commité (K9).
2. Douze questions ouvertes, classées par urgence, chacune avec une **recommandation par défaut** que vous pouvez accepter ou refuser.
3. Quatre remises en cause de décisions sont proposées (R1 à R4) ; aucune n'est appliquée sans votre accord.
4. Échelles : probabilité et impact en faible / moyenne / élevée ; ces cotations sont mon jugement, pas une mesure.
5. Toutes les décisions D1 à D12 sont lues dans `FEUILLE_DE_ROUTE_SOMA_RH.md` lignes 673-694.

## 1. Risques

| # | Domaine | Risque | Prob. | Impact | Parade | Lot |
|---|---|---|:-:|:-:|---|---|
| K1 | Calcul | **Référence de paie indéfinie** : quatre documents donnent quatre définitions de l'oracle (SYNTHESE C1) ; le script actuel ne compare à rien | Élevée | Élevé | Décision Q1 ; fixture de 25 cas ; script comparatif ; CI | L0 |
| K2 | Légal | Plafonds, taux, indemnités non vérifiés ; chiffres de NotebookLM non sourcés | Élevée | Élevé | Aucun taux codé sans confirmation écrite ; tableau « à confirmer » (SYNTHESE §5) ; recette signée | L7, L9 |
| K3 | Calcul | Corrections D10 actives par défaut : le moteur n'est plus Excel à l'identique sur absences, prestataires, sorties | Moyenne | Moyen | Fixture avec paramètres « excel » ; paramètres documentés | L0 |
| K4 | Calcul | Modification du moteur qui casse la fidélité | Moyenne | Élevé | Expand/Contract ; fixture avant/après ; pas de renommage | tous |
| K5 | Données | RIB et identifiants sensibles stockés en clair (`employees.bank_account text`) | Moyenne | Élevé | Chiffrement L4 ; sauvegarde de clé avant le backfill | L4 |
| K6 | Données | Donnée personnelle dans Git, une fixture, un rapport ou une capture (`video-captures` contient l'interface du compte du propriétaire) | Moyenne | Élevé | Scan PII en CI (S3) ; remplacer les captures | L0 |
| K7 | Données | Perte ou corruption : sauvegarde non rejouée en CI ; perte de la clé de chiffrement | Faible | Élevé | Test de restauration en CI ; clé sauvegardée à part | L0, L4 |
| K8 | Données | Tables déclarées deux fois (`employee_requests`, `work_posts`, `salary_payments`) avec des définitions possiblement différentes | Moyenne | Moyen | Comparer les deux définitions ; migration corrective si écart | L0 |
| K9 | Charge | **Dépôt avec un très grand nombre de fichiers modifiés ou non suivis** (état Git au démarrage de la session) : perte ou mélange de travail | Élevée | Élevé | Commit de base avant L0 ; branches par ticket | L0 |
| K10 | Charge | Un seul développeur ; estimation 109-196 j sans vélocité mesurée | Élevée | Moyen | Fourchettes ; revoir après L1 ; lots parallélisables | tous |
| K11 | Charge | Dérive du périmètre : cinq documents de feuille de route, numérotations différentes | Moyenne | Moyen | Ce corpus (lots L0-L9) devient la référence ; archiver les doublons (sans supprimer) | — |
| K12 | Dépendance | Environnement local unique (Docker) : pas de redondance | Moyenne | Moyen | Sauvegardes testées ; reconstruction documentée (`LOCAL_SETUP.md`) | L0 |
| K13 | Dépendance | Extensions absentes de l'image Docker (`btree_gist`, `pg_cron`) | Élevée | Faible | Ne pas les utiliser avant provisionnement ; worker Node pour les tâches planifiées | L1+ |
| K14 | Dépendance | E-mail Gmail (D5) : quotas, délivrabilité | Moyenne | Faible | Reprise sur erreur et journal d'envoi | L6 |
| K15 | Légal | Majorations de nuit des gardiens non appliquées (décision du 30/10) alors que le planning 24 h/24 est prioritaire | Moyenne | Élevé | Remise en cause R3 ; avis du juriste | L3 |

## 2. Questions ouvertes (par urgence)

### Bloquantes avant L0

| # | Question | Recommandation par défaut |
|---|---|---|
| **Q1** | **TRANCHÉE le 3/11/2026 par le propriétaire** : l'Excel n'est plus la référence (base de test changeante) et l'écart 26≠25 est abandonné. L'oracle devient la non-régression interne (`scripts/verify-payroll.ps1`, empreinte locale). Les lignes K1/K3 et la fixture « excel » ci-dessous sont caduques. — Question initiale : quel est le roster officiel de la référence d'août 2026 : les 25 salariés payés (S0026 sans paie), ou le roster actif courant (26) ? Et l'Excel reste-t-il l'oracle ? | **Deux niveaux** : fixture de 25 cas pour la *fidélité* du moteur (paramètres D10 à « excel ») + test de *cohérence interne* sur le roster courant. Mettre à jour `CLAUDE.md` en conséquence. |
| **Q2** | **TRANCHÉE le 3/11/2026 : audit_log est le journal unique** (migration 20261103100000). — Question initiale : quel journal d'audit devient unique : `audit_log` ou `audit_events` ? | `audit_log` comme journal métier, `audit_events` migré dedans ; garder l'ancien en lecture jusqu'à un cycle validé. |

### Avant L1-L4

| # | Question | Recommandation par défaut |
|---|---|---|
| **Q4** | Qui peut déchiffrer les RIB et où est gérée la clé ? | Clé dans un secret hors dépôt, sauvegardée à part ; déchiffrement réservé à `paie` et `admin` ; accès journalisé. |
| **Q11** | Qui **approuve** la paie ? D2 : « RH ou DAF » ; périmètre révisé : validation réservée à `admin`. | `rh` approuve (différent du préparateur), `admin` valide et clôture. |
| **Q10** | Faut-il rouvrir la décision du 30/10 pour appliquer les majorations de nuit des gardiens ? | Oui, **après** confirmation du texte légal par le juriste ; sinon alerte seulement. |
| **Q7** | Quelles sources juridiques sénégalaises valident les règles hors classeur ? | Désigner le comptable (cotisations, impôts) et le juriste (indemnités, durée du travail) ; une ligne par valeur de SYNTHESE §5. |

### Avant L5-L9

| # | Question | Recommandation par défaut |
|---|---|---|
| **Q5** | Adopter la navigation par menus de Sage (Fichier, Listes, Gestion, États, Annexes) ? | **Non** : menu latéral par domaine (paie, présences, demandes, états, paramètres), plus proche du portail Frappe HR et déjà familier de l'équipe. |
| **Q8** | Le workflow doit-il couvrir aussi les changements de salaire, ou seulement congés et attestations ? | Congés, attestations, acomptes, corrections de présence d'abord ; changements de salaire après L9 (impact sur les règles). |
| **Q12** | Instruire l'API Wave/Orange Money maintenant ? | Non : suivi manuel et simulation en L8 ; instruire l'API quand un volume le justifie. |
| **Q6** | Quelle banque valide le premier export et sous quel format ? | BSIC ou BNDE (D3) ; contrat d'export abstrait sans format officiel ; virements reportés. |
| **Q3** | Politique de conservation et de suppression (bulletins, CNI, contrats, RIB, audits) ? | À fixer avec le juriste ; en attendant, **ne supprimer aucun document**. |

### Gelée

| # | Question | Recommandation par défaut |
|---|---|---|
| **Q9** | La phase SaaS multi-entreprise est-elle autorisée ? | **Non** tant qu'aucune décision écrite de vendre n'existe ; ne rien préparer (pas de `tenant_id`). |

## 3. Remises en cause proposées des décisions D1 à D12

| # | Décision concernée | Constat | Proposition | Si refusée |
|---|---|---|---|---|
| **R1** | **D4** — chiffrement des champs sensibles reporté (30/10) | RIB en clair ; `FEUILLE_DE_ROUTE_NEXTGEN` Phase 2 le recommande (l'audit §5.5 traite des données personnelles, non relu ici) | Lever le report ; L4 | Le risque K5 reste ouvert ; documenter l'acceptation |
| **R2** | **D2** — « RH ou DAF approuve » | Le périmètre révisé du 30/10 réserve validation et clôture à `admin` : les deux textes ne disent pas qui approuve | Préciser par Q11 | Le code garde `Approuvée` sans rôle fixé : ambigu |
| **R3** | Décision du 30/10 « règles de nuit laissées telles quelles » (non numérotée) | Conflit avec D11 (gardiens 24 h/24 prioritaires) | Rouvrir après avis juridique (Q10) | Les gardiens sont payés sans majoration de nuit : risque légal K15 |
| **R4** | **D1** — « `company_id` partout » | `ANALYSE_COMPARATIVE` : présent sur les tables principales, couverture complète **non confirmée** | Inventaire des tables sans `company_id` en L0 ; compléter par Expand | Écart d'exécution documenté |

**Décisions respectées sans changement** : D3 (virements reportés, BSIC/BNDE), D5 (Gmail), D6, D7, D8 (pas de transmission aux organismes), D9, D10 (Excel = base avec arbitrages paramétrés), D11 (gardiens, L3), D12 (équipements hors périmètre).

**Point d'attention sur D10** : « Excel = base » mais trois règles corrigées sont actives par défaut (`ARBITRAGES_PAIE.md`). Ce n'est pas une remise en cause (D10 autorise l'arbitrage) ; c'est la raison pour laquelle la fixture de fidélité doit fixer ces paramètres à « excel ».

## 4. Prompt de restructuration locale

`PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md` n'a **pas été relancé** : son point 2 impose de s'arrêter si le dossier `C:\IT-Mozaic\SOMA-RH-local` existe, et il existe (c'est le dossier de travail, qui contient déjà `LOCAL_SETUP.md`, `LOCAL_TEST_MATRIX.md`, `LOCAL_RESTRUCTURATION_LOG.md`, `docker-compose.yml`). Les phases 5 à 11 du prompt sont partiellement réalisées (voir `LOCAL_TEST_MATRIX.md`) ; ce qui reste est repris par les lots L0 (reproductibilité, CI, tests) et L4 (RLS). Le fichier a un titre « # c » et une copie `.v1` quasi identique : à nettoyer par vous.

## Fichiers sources

`SYNTHESE_CORPUS_DOCS.md` ; `FEUILLE_DE_ROUTE_V3_SOMA_RH.md` ; `ARCHITECTURE_CIBLE_SOMA_RH.md` ; `PLAN_CONTROLE_QUALITE_SOMA_RH.md` ; `FEUILLE_DE_ROUTE_SOMA_RH.md` (§10, l. 673-694) ; `FEUILLE_DE_ROUTE_NEXTGEN_SOMA_RH.md` (§8) ; `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` (§10) ; `AUDIT_COMMERCIALISATION_SOMA_RH.md` (§5.1 bis, §11) ; `ARBITRAGES_PAIE.md` ; `ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md` ; `PROMPT_RESTRUCTURATION_LOCALE_SOMA_RH.md` ; état Git de la session.

## Risques ajoutés le 4 novembre 2026 (benchmark)

- R-SEC-1 : `signup` public avec e-mail confirmé automatiquement (api/server.mjs). Décision à prendre : invitation par admin.
- R-SEC-2 : jeton de rafraîchissement identique au jeton d'accès, sans révocation.
- R-LEG-1 : sources divergentes (quotient familial vs grille forfaitaire ; HS +40 % dès la 48e ou 49e heure ; référence « loi 2026-18 » vs loi 97-17). À confirmer avant modification du moteur.
- R-INT-1 : aucune intégration comptable, bancaire ou NDAMLI.
