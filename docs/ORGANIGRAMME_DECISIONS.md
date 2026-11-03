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

## 6. Ce qui n'a PAS été vérifié

- **Rendu visuel dans un navigateur** : la connexion exige un compte avec rôle ; je n'ai pas eu l'autorisation d'en créer un. L'application compile (typage, build, lint) et l'écran de connexion se charge sans erreur, mais je n'ai pas vu l'organigramme à l'écran.
- Accessibilité automatisée (axe), contrastes mesurés, parcours clavier réel, thème clair/sombre, mobile : écrits dans le code (rôles, libellés, focus visible, cibles de 44 px, `prefers-reduced-motion`) mais **non testés**.
- Export PNG : écrit, non essayé.

## 7. Écarts au prompt

- Pas de `worker` de disposition (voir §5).
- Pas de nœud d'équipe dans le graphe : la vue « Équipes » regroupe les membres à part, sans toucher à la hiérarchie.
- Pas de test automatisé d'interface (Playwright, axe) : aucun outil de ce type n'est installé dans le projet.

## 8. Données de démonstration

`tests/fixtures/organigramme/demo_seed.sql` (10 salariés fictifs, statut `Suspended` donc jamais dans un calcul de paie, 3 liens hors hiérarchie, 2 équipes, 1 congé) ; `demo_cleanup.sql` les retire. Idempotent. Les lignes d'audit créées par la démonstration restent dans le journal (il est immuable).
