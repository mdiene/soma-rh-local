# SOMA-RH — matrice de tests locale

## Phase 0 — socle

| ID | Contrôle | Commande / méthode | Résultat attendu | Statut |
|---|---|---|---|---|
| P0-001 | Services Docker | `docker compose ps` | PostgreSQL, PostgREST, API et pgAdmin actifs | À exécuter |
| P0-002 | PostgreSQL | `.\scripts\local-health.ps1` | PostgreSQL répond et la base `soma_rh` est lisible | À exécuter |
| P0-003 | Auth locale | navigateur, création puis connexion d'un compte synthétique | session JWT créée | Validé précédemment |
| P0-004 | Frontend | `Set-Location web; npm run build` | build sans erreur | Validé précédemment |
| P0-005 | Lint | `Set-Location web; npm run lint` | aucune erreur | PASS (2 avertissements préexistants) |
| P0-006 | Backup | `.\scripts\local-backup.ps1` | fichier `.dump` créé hors Git | À exécuter |
| P0-007 | Restore | restauration isolée du dump courant | base temporaire restaurée, 27 salariés lisibles | PASS |
| P0-008 | Reset | `.\scripts\local-reset.ps1 -Volumes` | services recréés et migrations appliquées | À exécuter avec confirmation |
| P0-009 | Secrets | `git status` et revue des fichiers suivis | aucun secret ou dump suivi | PASS à contrôler avant commit |

## Régression paie obligatoire

| ID | Contrôle | Résultat attendu |
|---|---|---|
| PAY-001 | 25 bulletins août 2026 | écart maximal inférieur à `0,000001 F` |
| PAY-002 | Brut total | `4 929 179,09 F` |
| PAY-003 | Net total | `4 662 739,89 F` |
| PAY-004 | IR/TRIMF | 720 scénarios verts |
| PAY-005 | Idempotence | recalcul sans doublon ni variation inexpliquée |
| PAY-006 | Journal comptable | débit et crédit équilibrés |

## Sécurité fonctionnelle

| ID | Contrôle | Résultat attendu |
|---|---|---|
| SEC-001 | Lecture anonyme | refusée |
| SEC-002 | Salarié A / salarié B | aucune donnée de B visible |
| SEC-003 | Utilisateur sans rôle | opérations protégées refusées |
| SEC-004 | Session expirée | retour à la connexion |
| SEC-005 | Rôle paie / paramètres RH | séparation respectée |

## Phase 1 — gouvernance de paie

| ID | Contrôle | Résultat attendu | Statut |
|---|---|---|---|
| GOV-001 | Migration appliquée | tables, contraintes, index et RLS présents | PASS |
| GOV-002 | Transitions | Calculée → En revue → Approuvée → Validée → Payée → Clôturée | PASS transactionnel |
| GOV-003 | Snapshot | une clôture crée un snapshot hashé | PASS transactionnel |
| GOV-004 | Immutabilité | mutation d'une paie clôturée refusée | PASS transactionnel |
| GOV-005 | Réouverture | uniquement administrateur, motif obligatoire | PASS transactionnel |
| GOV-006 | Audit | transitions enregistrées avec acteur et avant/après | PASS par fonction |
| GOV-007 | Suppression | paie validée/payée/clôturée non supprimable | PASS par fonction |
| GOV-008 | Contournement UPDATE | changement direct vers Payée/Clôturée refusé | PASS transactionnel |
| GOV-009 | Interface de suivi | écran de période et anomalies | PASS — écran `/paie/gouvernance` |
| GOV-010 | Approbations UI | affichage des approbations et transitions gouvernées | PASS — transitions RPC sécurisées |
| GOV-011 | RPC sous rôle applicatif | validation et clôture sans accès direct du rôle `authenticated` au schéma `auth` | PASS |
| GOV-012 | Ancien bouton « Valider la paie » | RPC historique `submit_payroll_entry` compatible avec l'auth locale | PASS |

## Fonctionnalités récupérées depuis GitHub

| ID | Contrôle | Résultat attendu | Statut |
|---|---|---|---|
| LOT2-001 | Mon espace | portail salarié et demandes personnelles accessibles | PASS — routes et page intégrées |
| LOT2-002 | Demandes salariés | traitement RH des demandes avec RLS | PASS — table/RPC/policies présentes |
| LOT3-001 | Paiement des salaires | suivi espèces, chèque, mobile money et états | PASS — table et écran intégrés |
| LOT5-001 | Planning des postes | planning et génération de rotations | PASS — fonction locale compatible |
| LOT6-001 | Pilotage RH | effectifs, mouvements, absentéisme et coûts | PASS — `hr_analytics` présente |
| LOT6-002 | Prévision de masse salariale | composant réintégré dans le traitement de paie | PASS — build frontend |

## Correctifs paie du 31/10/2026

| ID | Contrôle | Résultat attendu | Statut |
|---|---|---|---|
| PAY-FIX-001 | Comparaison de paie | RPC visible par PostgREST après rechargement du schema cache | PASS — HTTP 200 |
| PAY-FIX-002 | Marquer comme payé | transition et écriture `salary_payments` sans accès direct `auth` | PASS — rollback |
| PAY-FIX-003 | Routes paie Playwright | aucun `pageerror` ni réponse HTTP en erreur | PASS |

| PAY-UX-001 | État clôturé | bandeau contrasté, ligne grisée et bouton d'action désactivé | PASS |

## Compatibilité compte administrateur local

| ID | Contrôle | Résultat attendu | Statut |
|---|---|---|---|
| AUTH-001 | Liste des utilisateurs locale | aucune référence à `auth.users.last_sign_in_at` absent du schéma local | PASS |
| AUTH-002 | Compte `mdiene@gmail.com` | rôles `admin`, `rh`, `paie`, `salarie` présents | PASS |
| AUTH-003 | Smoke test Playwright | page de connexion rendue sur `http://localhost:5173` | PASS |

## Phase 2 — régression paie et sécurité RLS

| ID | Contrôle | Commande / résultat | Statut |
|---|---|---|---|
| P2-001 | Harnais reproductible | `.\scripts\local-payroll-validation.ps1` | PASS — commande versionnée |
| P2-002 | Rejeu calcul pur août 2026 | 26 salariés avec structure ; brut/net cohérents avec les bulletins stockés | PASS technique |
| P2-003 | Fidélité référence Excel | attendu 25 bulletins, brut `4 929 179,09`, net `4 662 739,89` ; obtenu 26, `5 017 834,60`, `4 765 432,33` | NO-GO |
| P2-004 | Salariés actifs sans structure | 0 au 01/08/2026 ; 1 fiche inactive hors périmètre | PASS |
| P2-005 | Administrateur RLS | compte administrateur lit les 27 salariés | PASS |
| P2-006 | Lecture anonyme | accès refusé par PostgreSQL | PASS |
| P2-007 | Utilisateur sans rôle | aucune ligne salarié visible | PASS |
| P2-008 | Salarié isolé | 1 seule ligne visible | PASS |
| P2-009 | Analyse de périmètre | 26 actifs locaux contre 25 références Excel, cause à confirmer avec le roster source | NO-GO investigation |
| P2-010 | Fixtures anonymisées | 25 cas synthétiques sans données personnelles | PASS |
| P2-011 | Exécution fixtures fiscales | `.\scripts\local-synthetic-fixture-validation.ps1` ; 25 sorties fiscales non négatives | PASS |

## Phase 3 — portail ESS/MSS (lot 1)

| ID | Contrôle | Résultat attendu | Statut |
|---|---|---|---|
| ESS-001 | Création salarié | une demande ouverte est limitée à sa propre fiche | PASS existant |
| ESS-002 | Annulation salarié | annulation uniquement avant décision et historisée | PASS transactionnel |
| ESS-003 | Décision RH | approbation via RPC et acteur enregistré | PASS transactionnel |
| ESS-004 | Rejet RH | motif obligatoire, sinon opération refusée | PASS transactionnel |
| ESS-005 | Mise à jour directe | aucune modification RH directe ne contourne l’historique | PASS transactionnel |
| ESS-006 | Historique | chaque décision/annulation est consultable par RH ou salarié concerné | PASS schéma/RLS |
| ESS-007 | Interface demandes | build et formulaire de motif cohérents avec le RPC | PASS build |
| ESS-008 | Manager équipe | accès limité à l’équipe et délégation | BLOQUÉ — relation manager-équipe à modéliser |
| ESS-009 | Notifications internes | notification visible uniquement par le salarié destinataire | PASS transactionnel |
| ESS-010 | Marquage notification | le salarié marque uniquement ses notifications comme lues | PASS transactionnel |
| ESS-011 | Documents privés | registre privé, accès salarié/RH et journal de consultation | PASS schéma/RLS ; stockage de fichiers local à brancher |
| ESS-012 | Périmètre manager | équipe et délégation datées, lecture limitée aux salariés affectés | PASS schéma/RLS + écran `/mon-equipe` en lecture seule |
| ESS-013 | Administration équipes | RH affecte/clôture une délégation manager datée ; rôle manager activé automatiquement | PASS RPC + build UI ; test navigateur authentifié à compléter |
| ESS-014 | Dossier administratif salarié | 5 sections, cartes, progression, recherche et états manquant/en attente/validé/refusé | PASS catalogue SQL + UI initiale ; documents informatifs, aucune sauvegarde bloquée |
| ESS-015 | Dépôt documentaire mobile | fichier, glisser-déposer, capture caméra, prévisualisation et remplacement | PASS upload privé API + versionnement ; glisser-déposer/caméra à compléter |
| ESS-016 | Revue RH documentaire | validation/refus motivé, notification et versionnement | À construire |
| ESS-017 | PDF dossier complet | checklist et index PDF générés sans lien public permanent | À construire |
| ESS-018 | Périmètre documentaire | salarié, RH/admin et manager limités par type de document | PASS initial RH/admin : liste et ouverture du dossier ; upload sécurisé à brancher |

## Règle de validation

Une phase est validée uniquement lorsque les contrôles critiques sont `PASS`, les écarts sont documentés et un rapport sans données personnelles est produit.
