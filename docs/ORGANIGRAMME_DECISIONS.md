# Module Organigramme — décisions, dépendances, mesures

Version 1.0 — 3 novembre 2026. Prompt source : `PROMPT_MODULE_ORGANIGRAMME_SOMA_RH.md`. Tests : `ORGANIGRAMME_TESTS.md`.

## 0. Hypothèses retenues (session non surveillée : règle de conduite n° 1)

Le prompt demande de valider cinq points avant de coder. Faute de réponse, j'ai pris l'hypothèse la plus raisonnable. **À confirmer ou corriger par Moussa Diene.**

| # | Question du prompt | Hypothèse appliquée | Conséquence si elle change |
|---|---|---|---|
| 1 | Visibilité par rôle | Tout utilisateur connecté voit nom, poste, département, statut calculé et nombre de subordonnés. **L'e-mail professionnel est réservé à `rh` et `admin`.** Aucune donnée de paie, d'identité ou de téléphone n'est jamais exposée. | Restreindre un salarié à son périmètre = filtrer dans `org_chart()` (une seule fonction). |
| 2 | Photos | **Initiales colorées uniquement**, aucune photo. | Ajouter un stockage local d'avatars et une colonne. |
| 3 | Rôle manager | Il existe déjà (`user_roles.role = 'manager'`, 2 comptes). Je le réutilise, sans création. | — |
| 4 | Historique | **Inclus dès la V1** : sélecteur « Organigramme au jj/mm/aaaa », les liens étant datés. | — |
| 5 | Gardiens / planning 24 h/24 | **Hors module** (le lot L3 est reporté, un système dédié est prévu). | — |

## 1. Existant réutilisé

- `employee_manager_assignments` (manager, salarié, dates de validité) devient **la hiérarchie directe**. Pas de colonne `manager_id` ajoutée : la table existante est déjà datée.
- `employees` (nom, poste via `designations`, statut, `relieving_date`, `email_work`), `departments` (vide à ce jour : le champ s'affiche s'il est renseigné), `leave_applications` (statut « en congé »), `user_roles`, `audit_log` (journal unique chaîné), `business_audit()`.
- Aucun composant d'interface partagé n'était adapté à un graphe : les composants du module sont dans `web/src/components/organigramme/`.

## 2. Règle métier modifiée (à valider)

**Un salarié a un seul manager direct valide à une date.** L'ancien contrôle (`prevent_manager_assignment_overlap`) ne refusait que le même couple manager-salarié ; il autorisait donc deux managers simultanés. Le trigger `org_prevent_cycle` refuse désormais tout second rattachement qui chevauche un rattachement existant, avec un message qui renvoie vers « Changer de manager ». Aucune donnée existante ne violait la règle (vérifié avant la migration). **Si des co-managers sont voulus, cette règle doit être assouplie.**

## 3. Modèle de données (migration `20261103220000_organigramme.sql`, retour : `db/rollback/…_down.sql`)

- `org_relations` : liens hors hiérarchie (`dotted`, `interim`, `functional`), datés, quote-part facultative, note. Contrôles : pas de lien vers soi-même, dates cohérentes, pas de chevauchement du même lien.
- `teams`, `team_members` : équipes transverses (projet, comité, transverse), membres avec quote-part et dates.
- Cycle hiérarchique refusé (trigger récursif, profondeur 60).
- `org_chart(date)` : une seule lecture JSON (nœuds, liens, équipes, anomalies) à une date. Statut calculé : **en congé** (congé approuvé), **intérim** (lien d'intérim actif), sinon **actif** ; un salarié sorti n'apparaît plus après sa date de sortie. **Pas de statut « en mission »** : aucune donnée ne le porte dans SOMA-RH, je ne l'ai pas inventé. Pas de présence en temps réel.
- Écritures : `org_set_manager`, `org_save_relation`, `org_end_relation`, `org_save_team`, `org_set_team_member` — rôle `rh` (ou `admin`), motif de 5 caractères minimum, journalisées dans `audit_log` ; `org_log_export` journalise chaque export.
- Anomalies : `sans_manager` (ni manager ni subordonné), `manager_sorti`, `interim_expire` (terminé depuis moins de 90 jours), `allocation_depassee` (> 100 %). Le dépassement de quote-part est **signalé, pas bloqué** (le prompt dit « anomalie visible »).
- Interprétation du lien d'intérim : `employee_id` assure l'intérim de `related_employee_id`.

## 4. Choix techniques et dépendances

| Paquet | Version (épinglée) | Rôle | Licence | Justification |
|---|---|---|---|---|
| `@xyflow/react` | 12.8.6 (sept. 2025) | canevas : zoom, déplacement, mini-carte, nœuds et arêtes personnalisés, virtualisation | MIT | aucune bibliothèque de graphe n'existait dans le projet |
| `@dagrejs/dagre` | 2.0.4 (févr. 2026) | disposition de l'arbre | MIT | léger ; `elkjs` écarté (non nécessaire, les liens hors hiérarchie ne participent pas à la disposition) |
| `html-to-image` | 1.11.11 | export PNG, chargé à la demande | MIT | seul moyen sans service externe de capturer le canevas |

**`motion` non ajouté** : les ressorts (survol, sélection, ouverture du panneau) sont en CSS (courbe avec léger dépassement) et `prefers-reduced-motion` les supprime. Aucun service externe, CDN, police ou avatar distant.

Disposition : calculée **uniquement** sur la hiérarchie directe ; les liens pointillés, d'intérim et fonctionnels sont dessinés par-dessus (test automatisé). Les salariés sans manager ni subordonné sont regroupés dans un nœud replié « Non rattachés » pour ne pas étaler 20 cartes sur une ligne.

## 5. Mesures (jeu synthétique de 500 salariés, Node, `tests/unit/org.layout.test.mjs`)

| Mesure | Résultat | Seuil | Statut |
|---|---|---|---|
| Construction de l'arbre | 0,4 ms | — | ✔ |
| Disposition de 501 nœuds | **148 ms** | 100 ms (au-delà : worker) | ⚠ légèrement au-dessus ; acceptable à ce volume, **worker non implémenté** |
| Repli total puis dépliage de 100 nœuds | 139 ms | — | ✔ |
| Chargement réel de la page, fluidité du déplacement | **non mesurés** (voir §6) | — | à faire |

Le jeu réel compte 27 salariés : la disposition est instantanée.

## 6. Vérifié dans un navigateur (3/11/2026, compte `rh` fourni par Moussa Diene) et ce qui reste à vérifier

Vérifié à l'écran : chargement (rôle `rh`), arbre avec société, branches, liens pointillé / intérim / fonctionnel étiquetés, nœud « Non rattachés » replié, mini-carte, fil d'Ariane qui suit la sélection, fiche latérale (manager, subordonnés, liens, actions RH), vue Équipes, thème clair et sombre, affichage mobile (390 px : fiche en feuille inférieure, pas de défilement horizontal).
Défauts trouvés puis corrigés pendant cette vérification : icône de recherche qui chevauchait le texte ; fond parasite sur « Non rattachés » (le type de nœud `group` est réservé par React Flow, renommé `unattached`) ; mini-carte vide (dimensions initiales des nœuds manquantes) ; serveur de développement à relancer après l'ajout des dépendances.
**Pas encore vérifié** : vue Liste, formulaires d'édition (changement de manager, lien, équipe), export PNG, parcours clavier complet, accessibilité automatisée (axe), contrastes mesurés. Sur mobile, la barre d'outils occupe beaucoup de hauteur (amélioration possible : la replier).

## 7. Écarts au prompt

- Pas de `worker` de disposition (voir §5).
- Pas de nœud d'équipe dans le graphe : la vue « Équipes » regroupe les membres à part, sans toucher à la hiérarchie.
- Pas de test automatisé d'interface (Playwright, axe) : aucun outil de ce type n'est installé dans le projet.

## 8. Structure de l'entreprise et saisie directe (4/11/2026, migration `20261104100000_organigramme_structure.sql`)

Demande du propriétaire : saisir directement dans l'organigramme, créer directions, secteurs, sections et postes, rattacher même les salariés sans compte.

- **Directions, secteurs, sections, services** : la table `departments` (vide jusque-là, avec `parent_id` et nom unique par société) est **réutilisée** comme structure ; ajout de `kind`, `head_employee_id` (responsable) et `note`. Pas de cycle (trigger). Un salarié est rattaché par `employees.department_id`, **sans compte utilisateur requis**.
- **Postes** : `designations` (23 existants) ; création et affectation depuis l'organigramme (`org_save_post`, `org_set_employee_post`).
- **« Manager » sans compte** : un salarié s'affiche « Manager » dès qu'il a des subordonnés directs **ou** qu'il est responsable d'une unité ou d'une équipe (`isManager`). Le rôle applicatif `manager` n'est accordé que s'il a un compte (comportement existant).
- **Deux vues** du graphe : « Managers » (qui rapporte à qui + liens pointillé, intérim, fonctionnel) et « Directions » (société › direction › secteur › section, chaque salarié sous son unité, responsable en premier).
- **Bouton « + » sur chaque carte** : menu d'actions (rattacher un salarié, ajouter à une équipe, affecter à une direction, changer de poste, changer ou détacher de manager, ajouter un lien, ouvrir la fiche ; pour une unité : rattacher, sous-unité, modifier, supprimer). Bouton « Créer » (direction, secteur, section, service, poste, équipe) dans l'en-tête et sur la carte « SOMA ». **Un clic sur n'importe quel élément ouvre la fiche**, avec les actions de rattachement et de détachement.
- **Listes de choix colorées** : un salarié déjà affecté (manager, équipe, unité) est en **orange avec un texte explicite** (« déjà sous X », « équipe : Y », « déjà dans Z »), un salarié libre en vert. La couleur n'est jamais seule.
- **Règle du motif — changement par rapport au prompt initial** : le motif est désormais **facultatif** (« information complémentaire ») pour tous les rattachements, équipes, unités, postes et liens. Il reste **obligatoire (5 caractères)** pour **remplacer ou retirer un manager direct existant** (traçabilité de la hiérarchie). Un premier rattachement n'exige rien. Les actions sont toujours journalisées, avec ou sans motif. *À confirmer : si vous voulez aussi le motif facultatif pour un changement de manager, c'est une condition dans `org_set_manager`.*
- Supprimer une unité détache ses salariés (ils ne sont pas supprimés) ; une unité qui contient des sous-unités ne peut pas être supprimée.

**Non vérifié à l'écran pour cette évolution** : l'outil de pilotage du navigateur n'était plus connecté. Vérifié : typage, build, lint (0 erreur), 10 tests unitaires (arbre des directions, règle Manager, affectations), test SQL (unités, cycle, doublon, postes, retrait d'équipe, droits, motif). À regarder par vous : menu « + », fiche d'unité, formulaires, couleurs des listes, vue « Directions ».

## 9. Données de démonstration

`tests/fixtures/organigramme/demo_seed.sql` (10 salariés fictifs, statut `Suspended` donc jamais dans un calcul de paie, 3 liens hors hiérarchie, 2 équipes, 1 congé) ; `demo_cleanup.sql` les retire. Idempotent. Les lignes d'audit créées par la démonstration restent dans le journal (il est immuable).

## 10. Actions directes, liaison à la souris, notifications (4/11/2026, migration `20261104110000_organigramme_actions.sql`)

Retours du propriétaire après usage, et traitement :

| Retour | Cause trouvée | Correction |
|---|---|---|
| Clic sur une carte sans effet, bouton « + » inactif, fiche ouverte en cliquant sur la ligne | Le canevas est configuré sans sélection ni déplacement : React Flow met alors les cartes en `pointer-events: none` | Règle CSS qui rend les cartes cliquables ; clic sur une carte = fiche, clic sur une ligne = menu d'actions |
| « Détacher de son manager » sans changement | Le motif (5 caractères) restait exigé sans que le bouton l'explique ; un rattachement commencé le jour même bloquait aussi l'opération | **Motif facultatif partout** ; un rattachement du jour est remplacé au lieu de bloquer ; message de confirmation affiché |
| Direction ou section créée mais invisible | Elles ne figurent que dans la vue « Directions », l'écran restait sur « Managers » | Après création ou rattachement : bascule automatique sur « Directions » + message ; le département s'affiche aussi sous le poste sur les cartes de la vue « Managers » |
| Salarié déjà sous un manager, rattaché à une direction | Aucun lien automatique avec le responsable de la direction | `org_attach_to_unit` : option « rattacher aussi à son responsable » (cochée par défaut si le salarié a déjà un manager) ; message précisant l'ancien et le nouveau manager ; **notification** au salarié s'il a un compte (`notify_user`) ; journalisé |
| Clôturer dans « Équipes et managers » | Le badge restait « Active » (fin = aujourd'hui) | Clôturer = fin la veille. États : **À venir / Actif / Désaffecté**. Une affectation qui n'avait pas pris effet est supprimée |
| Manager sans compte dans « Équipes et managers » | La liste ne proposait que les salariés avec compte | Tout salarié actif peut être manager (le rôle `manager` n'est accordé que s'il a un compte) |

**Liaison à la souris** (RH uniquement) : au survol d'une carte, une pastille en bas à droite (tirer vers un salarié = le rattacher sous cette carte), une en haut (tirer vers un manager ou une direction), et une sur chaque côté (tirer vers un salarié = lien hors hiérarchie). Déposer sur n'importe quel point de la carte visée ouvre la fenêtre correspondante, déjà remplie ; rien n'est enregistré sans validation. Sur écran tactile, les pastilles restent visibles.

**Non vérifié à l'écran** : l'outil de pilotage du navigateur n'est plus connecté. Vérifié : typage, build, lint (aucune nouvelle alerte), 10 tests unitaires, test SQL section 10 (rattachement avec et sans suivi du responsable, détachement du jour, clôture d'une affectation à venir et en cours), non-régression de la paie (PASS). **À essayer par vous** : glisser-déposer des pastilles, menu au clic sur une ligne, messages de notification.
