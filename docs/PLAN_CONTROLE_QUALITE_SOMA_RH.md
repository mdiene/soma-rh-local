# SOMA-RH — Plan de contrôle et de qualité

Version 1.0 — 3 novembre 2026. Produit par `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` (§6.7).
Complète `LOCAL_TEST_MATRIX.md` (état des tests existants) et `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` §8-9. Lots : [FEUILLE_DE_ROUTE_V3_SOMA_RH.md](./FEUILLE_DE_ROUTE_V3_SOMA_RH.md). Invariants : [ARCHITECTURE_CIBLE_SOMA_RH.md](./ARCHITECTURE_CIBLE_SOMA_RH.md) §3.

**Résumé**
1. Un contrôle ne vaut que s'il peut échouer : aujourd'hui le script de paie ne compare à aucune valeur attendue, et la CI ne lance ni la paie ni les tests de sécurité (SYNTHESE C2, §2).
2. Tolérance monétaire unique : **0,000001 F** (1e-6), sur 17 montants par bulletin.
3. Chaque invariant I1-I20 a un test nommé **T-Ix**.
4. Toute recette métier est une liste signée par le comptable ou le responsable RH ; aucun chiffre légal n'est validé sans elle.
5. Définition de « terminé » commune en §4.

## 1. Contrôles transversaux (tous les lots)

| Famille | Contrôle | Méthode | Outil | Seuil | Responsable |
|---|---|---|---|---|---|
| **Calcul** | Rejeu de la fixture de 25 cas (I13) | Paramètres D10 à « excel », calcul d'août, comparaison poste par poste | `verify-payroll` (à créer, L0) | écart ≤ 1e-6 F sur 17 montants ; brut 4 929 179,09 F et net 4 662 739,89 F **si** la référence est maintenue (Q1) | Développeur |
| Calcul | Cas limites : entrée et sortie en cours de mois, absence, maladie, congé, heures supplémentaires, plafond atteint, plafond dépassé, majoration, arrondi | Fixture paramétrée par cas | SQL + script | résultat attendu écrit **avant** le test | Développeur |
| Calcul | 720 cas IR/TRIMF | Rejeu contre le classeur | script existant `local-synthetic-fixture-validation.ps1` (couvre 25 cas) à étendre | 720 verts | Développeur |
| Calcul | Contrats : CDI, CDD, COD, stage, apprentissage, prestation | Un bulletin par type | fixture | cohérent avec `ANALYSE_EXCEL.md` | Développeur |
| Calcul | **Paie à blanc** : un mois calculé en parallèle de l'Excel | Comparaison bulletin par bulletin | `verify-payroll` + classeur | aucun écart non expliqué | Comptable |
| **Fonctionnel** | Un scénario bout en bout par automate : période, demande, sortie, prêt | Parcours navigateur + SQL | Playwright | statut final attendu, historique complet | Développeur |
| **Sécurité** | RLS par rôle : admin, rh, paie, manager, salarié, anonyme, sans rôle (I11) | Session avec JWT de chaque rôle, transaction annulée | SQL | 0 ligne hors périmètre | Développeur |
| Sécurité | Journalisation de chaque modification sensible (I10) | Modifier puis lire le journal | SQL | auteur, avant/après, motif présents | Développeur |
| Sécurité | Séparation préparateur / approbateur (I4) | Même utilisateur prépare et approuve | SQL | refus **avec message** | Développeur |
| Sécurité | Sauvegarde et restauration | Dump, base temporaire, relecture | `local-backup.ps1`, `local-restore.ps1` | 27 salariés lisibles, fixture identique | Développeur |
| **Données** | Cohérence comptable : débit = crédit ; total des ordres de paiement = total des nets (I8, I9) | Requête sur le traitement validé | SQL | égalité exacte en `numeric` | Développeur |
| Données | Migration de l'historique et des cumuls | Comparaison avant/après par salarié | SQL | écart nul | Comptable |
| **Performance** | Temps de calcul d'un mois complet | Chronométrer 26 bulletins, puis un jeu synthétique de 1 000 | `psql \timing` | **cible proposée** : 26 bulletins < 5 s ; 1 000 < 30 s. Valeurs non mesurées à ce jour | Développeur |
| **Recette métier** | Liste de validation signée | Tableau de §3 | document signé | tous « conforme » | Comptable / RH |
| **CI** | Non-régression à chaque modification | Workflow `ci.yml` étendu | GitHub Actions | lint + build + paie + RLS + scan PII verts | Développeur |

## 2. Tests des invariants

| Test | Invariant | Procédure | Résultat attendu |
|---|---|---|---|
| T-I1 | I1 | Approuver un congé | une fiche de présence existe ; la paie la lit |
| T-I2 | I2 | Insérer une présence avant l'embauche ou après la sortie ; en insérer deux le même jour | refus avec message |
| T-I3 | I3 | Calculer une période fermée ; approuver avec une anomalie bloquante | refus avec message |
| T-I4 | I4 | Préparateur = approbateur ; non-admin qui clôture | refus avec message |
| T-I5 | I5 | Recalculer un bulletin approuvé après changement de paramètre | résultat identique au snapshot |
| T-I6 | I6 | Corriger après clôture | régularisation sur période ultérieure ; mois clos intact |
| T-I7 | I7 | Prime, prêt, heures sup. | toutes lues par la même fonction |
| T-I8 | I8 | Total des ordres ≠ total des nets | refus au passage en Validée |
| T-I9 | I9 | Journal comptable d'un mois | équilibré ; aucune règle dans la passation |
| T-I10 | I10 | Modifier un salarié | ligne d'audit complète |
| T-I11 | I11 | Matrice rôles × actions | 0 accès hors périmètre |
| T-I12 | I12 | Bulletin avec contributions employeur | coût employeur présent |
| T-I13 | I13 | Fixture de référence | ≤ 1e-6 F |
| T-I14 | I14 | Rechercher un taux légal en dur dans les fonctions | aucun résultat hors paramètre daté |
| T-I15 | I15 | Modifier un mois clos | refus |
| T-I16 | I16 | Lister les journaux d'audit | un seul |
| T-I17 | I17 | Scan des fichiers suivis, des fixtures et des rapports | aucune donnée personnelle |
| T-I18 | I18 | Altérer une ligne d'audit | `audit_verify()` signale la rupture |
| T-I19 | I19 | Recalculer deux fois, puis en parallèle | pas de doublon, pas de variation |
| T-I20 | I20 | Échéancier d'un prêt | somme des échéances = capital |

## 3. Contrôles par lot

| Lot | Contrôles de sortie (méthode → seuil) | Recette métier |
|---|---|---|
| **L0** | Fixture rejouée sur base neuve et base restaurée → mêmes résultats ; scan PII → 0 ; CI rouge si écart > 1e-6 F | Moussa Diene : décision sur la référence |
| **L1** | Cycle complet à blanc ; T-I3, T-I4, T-I10, T-I16, T-I18 ; chaque refus de transition a un message en français | Responsable paie : lecture des messages |
| **L2** | T-I6, T-I7, T-I19, T-I20 ; fixture L0 inchangée ; migration des acomptes comparée avant/après | Comptable : régularisation d'un cas réel anonymisé |
| **L3** | Mois de gardiens simulé ; totaux de la fixture inchangés ; T-I1, T-I2 ; alerte de repos | RH : planning d'un site |
| **L4** | T-I11 sur toutes les cases ; RIB illisible sans clé ; restauration puis lecture ; `FORCE RLS` sans régression | Moussa Diene : gestion de la clé |
| **L5** | T-I12 ; chaque gabarit : chargement, vide, erreur, refus, mobile ; accessibilité clavier | Paie : lot de paie sur un mois à blanc |
| **L6** | Congé à deux niveaux avec délégation ; décision idempotente ; e-mail rejoué sans doublon ; PWA installable | RH + un salarié pilote |
| **L7** | Soldes recalculables depuis le registre ; solde de tout compte | **Juriste et comptable** : indemnités |
| **L8** | T-I8 ; billetage = total des espèces | Comptable |
| **L9** | T-I5, T-I14 ; ancien bulletin identique après changement de règle ; comparaison avec la fixture avant activation | Comptable : sources légales |

## 4. Définition de « terminé » (commune à tous les lots)

Reprend `CADRE` §9 et ajoute les points marqués ★.

1. Besoin et règles documentés (fiche de ticket).
2. Migration versionnée, **rejouable**, Expand/Contract, avec procédure de retour arrière ★.
3. RLS, politiques par rôle et index sur les clés étrangères.
4. Interface : chargement, vide, erreur, refus de rôle, session expirée, mobile.
5. Tests ciblés verts, dont les T-Ix concernés ★.
6. Fixture de paie exécutée avant et après ★ et **CI verte** ★.
7. Aucun secret ni donnée personnelle ajouté (scan T-I17) ★.
8. Types régénérés ; `graphify update .` exécuté.
9. Documentation et `LOCAL_TEST_MATRIX.md` mis à jour ; preuve de commande et de résultat conservée.
10. Recette métier signée ★ quand le lot touche une règle légale ou financière.

## 5. Limites de ce plan

- Les seuils de performance sont des propositions, non mesurées.
- Les contrôles supposent la fixture L0, qui n'existe pas encore.
- Aucun contrôle ne peut valider un taux ou un plafond légal : seule une confirmation écrite du comptable ou du juriste le fait.
- Non vérifié : le contenu de `phase2-synthetic-cases.json` (présence seulement constatée) et ce que couvre exactement `local-synthetic-fixture-validation.ps1` au-delà de ce que dit `LOCAL_PAYROLL_SCOPE_ANALYSIS.md`.

## Fichiers sources

`FEUILLE_DE_ROUTE_V3_SOMA_RH.md` ; `ARCHITECTURE_CIBLE_SOMA_RH.md` ; `SYNTHESE_CORPUS_DOCS.md` ; `LOCAL_TEST_MATRIX.md` ; `LOCAL_PAYROLL_VALIDATION.md` ; `LOCAL_PAYROLL_SCOPE_ANALYSIS.md` ; `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` (§8-9) ; `AUDIT_COMMERCIALISATION_SOMA_RH.md` (§9) ; `ANALYSE_EXCEL.md` ; `.github/workflows/ci.yml` ; `scripts/` (noms).
