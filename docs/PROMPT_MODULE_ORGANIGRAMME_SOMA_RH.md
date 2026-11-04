# Prompt — Module « Organigramme » (Équipes et managers) pour SOMA-RH

Version 1.0 — 3 novembre 2026. À coller tel quel dans Claude Code, lancé à la racine de `C:\IT-Mozaic\SOMA-RH-local`. L'image de référence (organigramme sombre avec cartes, connecteurs lumineux, mini-carte, contrôles de zoom) est à joindre au message ou à copier dans `docs\captures-organigramme\reference-organigramme.png`.

Rattachement au corpus existant : feuille de route CAR-004 (organigramme et rattachement site, département, manager), gap analysis P2-03 (organigramme daté, quotes-parts matricielles), `PLAN_EVOLUTION_SOMA_RH.md` (organigramme limité au périmètre autorisé).

---

## 0. Prompt à copier-coller

```text
Tu es l'IA de développement principale. Tu ajoutes à SOMA-RH un module « Organigramme » dans la section « Équipes et managers ». Tu travailles dans C:\IT-Mozaic\SOMA-RH-local. Tu réponds et tu écris l'interface en français.

OBJECTIF
========
Fournir un organigramme interactif de la SOMA qui montre :
1. la hiérarchie directe (qui rapporte à qui) ;
2. en dehors de la hiérarchie, les liens entre managers et équipes : rattachement pointillé (matriciel), intérim, responsable fonctionnel, équipes transverses (projets, comités), avec la période de validité de chaque lien.

Le visuel s'inspire de l'image de référence jointe : cartes à avatar et pastille de statut, connecteurs fins avec tracé lumineux, bouton « Développer/Réduire » par nœud, mini-carte, contrôles de zoom, barre de recherche, fil d'Ariane, thème sombre et clair. Tu t'inspires de la structure et de l'ambiance ; tu ne copies pas l'image pixel pour pixel, et les noms de l'image (Sarah Jenkins, etc.) ne doivent apparaître nulle part.

CONTEXTE À RESPECTER
====================
- Pile : PostgreSQL local, PostgREST, React (PWA), worker Node. Monolithe modulaire. N'introduis ni Kafka, ni Temporal, ni nouveau backend. Le frontend est organisé en web/src/pages, web/src/components et web/src/lib : suis cette convention (ou celle que tu constates réellement) au lieu d'en imposer une nouvelle.
- Périmètre : une seule société (SOMA), Sénégal, déploiement local. Pas de multi-tenant. Conserve company_id là où il existe.
- Rôles : admin, rh, paie, salarie (et manager si le projet l'a déjà). La sécurité repose sur la RLS en base ; l'interface ne fait que masquer, jamais protéger.
- Moteur de paie : tu ne modifies pas compute_salary_slip ni aucune table de paie. La référence d'août 2026 (25 bulletins, brut 4 929 179,09 F, net 4 662 739,89 F) doit rester inchangée ; si une commande de vérification existe (npm run verify:payroll), exécute-la avant et après. Si elle échoue déjà avant tes changements (écart connu 26 contre 25 bulletins), note-le et ne le corrige pas dans ce module.
- Données : uniquement synthétiques pour les seeds et les tests. Aucune donnée personnelle réelle dans Git, les fixtures ou les logs.
- Gabarits d'écran : respecte les gabarits déjà définis (fiche document, liste, formulaire en sections, barre d'actions, badge d'état). Lis docs/ARCHITECTURE_CIBLE_SOMA_RH.md et docs/captures-frappe-hr/ s'ils existent. Réutilise les composants existants avant d'en créer.
- Règles légales : l'organigramme n'a pas de chiffre légal. Si tu rencontres une règle ambiguë, documente-la et ne choisis pas arbitrairement.

PHASE 1 — INSPECTION (lecture seule)
====================================
1. Vérifie le dossier, la branche Git et l'état du worktree. Note les modifications préexistantes.
2. Lis : package.json (web), la structure de web/src (routes, layout, thème, composants partagés), les migrations, le schéma des tables employés / départements / services / postes, les politiques RLS existantes, les types générés, la navigation et l'écran « Équipes et managers » s'il existe. Lis aussi, dans docs/, les passages sur l'organigramme (CAR-004, P2-03, PLAN_EVOLUTION_SOMA_RH.md).
3. Établis l'inventaire : quelles colonnes existent déjà pour manager, département, poste, statut, photo, e-mail, lieu ; quelles tables de congés, absences et présences permettent de calculer un statut.
4. Vérifie les versions : node, npm, psql. Si un outil manque, ne l'installe pas en silence : indique l'outil, la raison, la commande proposée.
5. Produis un court rapport « existant / manque » avant d'écrire du code. N'invente aucun nom de colonne : utilise ceux que tu as lus.

PHASE 2 — MODÈLE DE DONNÉES
===========================
Réutilise l'existant. Ajoute seulement ce qui manque, par migrations versionnées et réversibles, sans modifier l'historique déjà appliqué.

Schéma cible (adapte les noms à l'existant) :
- employees : id, matricule, nom, prénom, poste (role), department_id, manager_id (rattachement hiérarchique direct, nullable pour la direction), email_pro, location (site), avatar_url (nullable), statut de l'emploi. directReportsCount n'est PAS une colonne : il est calculé.
- org_units (départements, services, directions) : id, name, parent_id, head_employee_id, kind.
- org_relations (liens hors hiérarchie) : id, employee_id, related_employee_id, relation_type (dotted | interim | functional), start_date, end_date (nullable), allocation_pct (nullable, pour les quotes-parts matricielles), note, created_by. Contraintes : employee_id différent de related_employee_id ; dates valides ; pas de chevauchement incohérent.
- teams (équipes transverses) : id, name, kind (department | cross_functional | project | committee), lead_employee_id, start_date, end_date.
- team_members : team_id, employee_id, role_in_team, allocation_pct (0 à 100), start_date, end_date.
- Vue org_chart_nodes (lecture seule) : pour une date donnée, id, nom, poste, department, manager_id, avatar_url, email (selon le rôle), location, status calculé, direct_reports_count, is_interim, nombre d'équipes.
- Vue org_chart_edges : arêtes de type direct, dotted, interim, functional, team, avec période de validité.

Règles de cohérence (à faire respecter en base, avec message d'erreur explicite) :
1. Pas de cycle dans la hiérarchie directe (un salarié ne peut pas être son propre supérieur, directement ou indirectement). Trigger ou contrainte vérifiée par test.
2. Un seul manager direct valide à une date donnée.
3. Les liens pointillés, intérim et fonctionnels ne remplacent jamais le lien direct : ils s'ajoutent.
4. Un salarié sorti n'a plus de lien actif après sa date de sortie ; ses subordonnés doivent être réaffectés (anomalie visible dans l'interface).
5. Historisation : chaque changement de manager ou de lien est daté et journalisé dans audit_log (acteur, heure, avant, après, motif).
6. Le statut affiché est calculé à partir des données RH (actif, en congé, en mission, absent, intérim, sorti). Il ne s'agit PAS d'un statut de présence en temps réel (« en ligne », « en réunion ») : ce type d'information n'existe pas dans SOMA-RH et ne doit pas être inventé.
7. Quotes-parts matricielles : la somme des allocations d'un salarié sur les équipes et liens actifs ne dépasse pas 100 % ; sinon, anomalie visible.

Sécurité (RLS, testée par rôle) :
- Aucune donnée de paie dans les vues de l'organigramme (ni salaire, ni IBAN, ni CNI, ni téléphone personnel).
- admin et rh : lecture et écriture de la structure et des liens.
- paie : lecture de la structure, sans écriture.
- salarie (et manager) : lecture de l'organigramme en mode restreint, limité au périmètre autorisé (nom, poste, département, photo si autorisée) ; e-mail et lieu uniquement selon la règle documentée à la phase 1 ; modification interdite.
- Aucune lecture anonyme.
- Les écritures passent par des fonctions ou des routes contrôlées qui vérifient le rôle et journalisent.

PHASE 3 — CHOIX TECHNIQUES
==========================
Moteur de visualisation : @xyflow/react (React Flow) est le choix par défaut, parce qu'il fournit nativement zoom, déplacement, mini-carte, contrôles, nœuds React personnalisés et arêtes personnalisées. Disposition automatique : @dagrejs/dagre (simple, léger) ou elkjs (si les liens hors hiérarchie rendent le résultat illisible). Animation : motion (anciennement Framer Motion) pour les ressorts d'ouverture et de réduction ; CSS pour les transitions de position et le tracé des lignes. D3 n'est nécessaire que si tu justifies un besoin que ces outils ne couvrent pas.

Avant d'ajouter une dépendance : vérifie qu'elle est nécessaire, note son rôle et sa licence dans docs/ORGANIGRAMME_DECISIONS.md, et épingle une version stable publiée depuis au moins deux semaines. Si le projet utilise déjà une bibliothèque équivalente, réutilise-la et justifie.

Règle de disposition (importante) : la mise en page se calcule UNIQUEMENT sur les arêtes de hiérarchie directe. Les liens pointillés, intérim, fonctionnels et d'équipe sont dessinés par-dessus, sans influencer les positions, pour que l'arbre reste lisible. Les arêtes hors hiérarchie utilisent un style distinct (pointillé, couleur, étiquette) et peuvent être masquées par un filtre.

Composants (dans le dossier de composants du projet, par exemple web/src/components/organigramme/, et une page dans web/src/pages/) :
- OrganigrammePage : page « Équipes et managers > Organigramme », fil d'Ariane, chargement, erreur, vide.
- OrgChartCanvas : ReactFlowProvider, nœuds, arêtes, mini-carte, contrôles, plein écran.
- NodeCard : carte de salarié (avatar ou initiales, nom, poste, pastille de statut, badge intérim, nombre de subordonnés, bouton Développer/Réduire).
- TeamNode : nœud d'équipe transverse (regroupe des membres sans casser la hiérarchie).
- OrgEdge : arête personnalisée (direct, pointillé, intérim, fonctionnel) avec tracé animé.
- ControlsOverlay : zoom avant/arrière, recentrer, plein écran, export, bascule thème.
- SearchFilterBar : recherche d'un salarié ou d'un département, filtres (département, site, statut, type de lien), mise en évidence et centrage automatique sur le résultat.
- DetailPanel : panneau latéral de la fiche du nœud sélectionné (manager direct, liens hors hiérarchie, équipes, subordonnés, actions de modification pour admin et rh).
- LinkEditorDialog : création et modification d'un lien hors hiérarchie ou d'un changement de manager, avec dates, motif et contrôle de cohérence.
- Hooks : useOrgData, useOrgLayout, useCollapse, useOrgSearch.

FONCTIONNALITÉS
===============
1. Navigation : zoom, déplacement, plein écran, mini-carte cliquable, recentrage automatique, fil d'Ariane (Société > Direction > Département > Équipe) qui permet de remonter dans la hiérarchie.
2. Repli et dépli par nœud (et « tout réduire / tout développer »), avec exploration progressive par niveau (drill-down) si l'arbre dépasse 100 salariés. Mémorise l'état de repli dans le stockage du navigateur, avec try/catch et sans impact si le stockage est indisponible.
3. Recherche : saisie rapide, autocomplétion, mise en évidence du nœud trouvé, centrage animé, ouverture automatique des branches repliées qui le contiennent.
4. Date d'effet : sélecteur « organigramme au jj/mm/aaaa » pour consulter l'historique (utile pour les périodes de paie passées).
5. Liens hors hiérarchie : création, modification et fin de lien par admin et rh ; affichage filtrable ; légende ; info-bulle (type, période, quote-part, note).
6. Équipes transverses : vue qui regroupe les membres d'une équipe, leur responsable, la part d'allocation ; passage de la vue hiérarchique à la vue par équipe sans recharger.
7. Anomalies visibles : salarié sans manager (hors direction), subordonnés d'un salarié sorti, cycle refusé, intérim expiré, allocation supérieure à 100 %. Chaque anomalie a un message clair et un lien vers la correction.
8. Export : image (PNG) et liste (CSV) de la vue courante, sans donnée interdite au rôle. L'export est journalisé.
9. Thème sombre et clair, cohérent avec le thème existant du projet.
10. PWA : fonctionnement correct sur mobile (zoom tactile, panneau de détail en feuille inférieure) ; pas de dépendance à un service externe ; aucune bibliothèque d'icônes ou de polices chargée depuis un CDN en exécution.

SPÉCIFICATION UX — ÉTATS DES NŒUDS
==================================
- Repos : carte avec légère élévation, bordure fine, avatar, pastille de statut.
- Survol : élévation accrue, bordure d'accent, affichage du nombre de subordonnés et des actions rapides ; le survol met en évidence la chaîne hiérarchique (lignes vers le haut et vers le bas) et estompe le reste.
- Sélection : échelle d'environ 1,04 avec ressort, anneau d'accent, ouverture du panneau de détail, centrage animé.
- Focus clavier : anneau visible (au moins 3:1 de contraste), navigation par flèches entre nœuds parent, enfant et frères ; Entrée ouvre le détail ; Espace replie ou déplie ; Échap ferme le panneau.
- Replié : carte avec badge du nombre de subordonnés masqués (« +7 ») et bouton Développer ; les enfants disparaissent avec fondu et glissement.
- Chargement : squelettes de cartes. Erreur : message explicite avec action de nouvelle tentative. Vide : explication et lien pour rattacher les salariés.
- Hors période ou sorti : carte grisée avec mention de la date de sortie.
- Mouvement : durées de 200 à 400 ms ; ressort d'ouverture sans rebond excessif ; si l'utilisateur a demandé la réduction des animations (prefers-reduced-motion), remplace les ressorts par des transitions instantanées ou un simple fondu.

ACCESSIBILITÉ ET LANGUE
=======================
- Tout est en français ; dates au format jj/mm/aaaa.
- Le statut n'est jamais indiqué par la couleur seule (texte ou icône en plus).
- Contrastes conformes WCAG 2.2 AA en thème sombre et clair.
- Chaque nœud a un nom accessible (« Prénom Nom, poste, département, statut, N subordonnés »). Une vue « liste hiérarchique » accessible est disponible en alternative au graphique (arbre en liste dépliable), car un canevas n'est pas lisible à l'écran-lecteur.
- Cibles tactiles d'au moins 44 px sur mobile.

PERFORMANCE
===========
- Cible : 500 salariés affichables sans blocage perceptible ; déplacement fluide sur un poste standard.
- Utilise la virtualisation de React Flow (onlyRenderVisibleElements) et mémorise les nœuds (React.memo, identifiants stables).
- Calcule la disposition hors du fil principal si le temps dépasse 100 ms (worker) ; ne recalcule pas lors d'un simple déplacement ou zoom.
- Charge les avatars en différé avec des initiales de repli ; pas d'image distante non maîtrisée (stockage local uniquement).
- Mesure et consigne les temps (chargement, disposition, dépliage de 100 nœuds) dans docs/ORGANIGRAMME_DECISIONS.md.

DONNÉES SYNTHÉTIQUES (seed de démonstration)
============================================
Crée une seed idempotente de 10 salariés fictifs (noms clairement artificiels), avec plusieurs niveaux, un lien pointillé, un intérim, un responsable fonctionnel et deux équipes transverses. Exemple de structure à adapter à l'existant :

{
  "employees": [
    {"id":"e01","name":"Direction Générale (fictif)","role":"Directeur général","department":"Direction","managerId":null,"email":"dg@exemple.test","location":"Dakar","status":"actif","directReportsCount":4},
    {"id":"e02","name":"Responsable Exploitation","role":"Directeur d'exploitation","department":"Exploitation","managerId":"e01","location":"Matam","status":"actif","directReportsCount":3},
    {"id":"e03","name":"Responsable Finances","role":"Directeur financier","department":"Finances","managerId":"e01","location":"Dakar","status":"en congé","directReportsCount":1},
    {"id":"e04","name":"Responsable RH","role":"Responsable RH","department":"Ressources humaines","managerId":"e01","location":"Dakar","status":"actif","directReportsCount":1},
    {"id":"e05","name":"Responsable Maintenance","role":"Chef de maintenance","department":"Exploitation","managerId":"e02","location":"Matam","status":"actif","directReportsCount":1},
    {"id":"e06","name":"Chef de Sécurité","role":"Chef de sécurité","department":"Sécurité","managerId":"e02","location":"Matam","status":"actif","directReportsCount":0},
    {"id":"e07","name":"Comptable","role":"Comptable","department":"Finances","managerId":"e03","location":"Dakar","status":"actif","directReportsCount":0},
    {"id":"e08","name":"Gestionnaire Paie","role":"Gestionnaire de paie","department":"Ressources humaines","managerId":"e04","location":"Dakar","status":"actif","directReportsCount":0},
    {"id":"e09","name":"Technicien Maintenance","role":"Technicien","department":"Exploitation","managerId":"e05","location":"Matam","status":"en mission","directReportsCount":0},
    {"id":"e10","name":"Responsable Qualité (intérim)","role":"Responsable qualité par intérim","department":"Exploitation","managerId":"e02","location":"Matam","status":"intérim","directReportsCount":0}
  ],
  "relations": [
    {"employeeId":"e08","relatedEmployeeId":"e03","type":"dotted","allocationPct":30,"note":"Rattachement fonctionnel au financier pour la paie","startDate":"2026-01-01","endDate":null},
    {"employeeId":"e10","relatedEmployeeId":"e04","type":"interim","note":"Intérim jusqu'au recrutement","startDate":"2026-09-01","endDate":"2026-12-31"},
    {"employeeId":"e06","relatedEmployeeId":"e01","type":"functional","note":"Rapport direct à la direction pour les incidents","startDate":"2026-01-01","endDate":null}
  ],
  "teams": [
    {"id":"t01","name":"Comité de pilotage paie","kind":"committee","leadEmployeeId":"e04","members":[{"employeeId":"e03","role":"membre","allocationPct":10},{"employeeId":"e08","role":"membre","allocationPct":30}]},
    {"id":"t02","name":"Projet sécurité du site","kind":"project","leadEmployeeId":"e06","members":[{"employeeId":"e05","role":"membre","allocationPct":20},{"employeeId":"e09","role":"membre","allocationPct":20}]}
  ]
}

Aucun avatar réel : initiales colorées ou images génériques locales.

SQUELETTE DE RÉFÉRENCE (à adapter, pas à copier aveuglément)
=============================================================
Principe : disposition sur la hiérarchie directe seulement, nœuds visibles selon les nœuds repliés, arêtes hors hiérarchie ajoutées par-dessus.

import dagre from '@dagrejs/dagre';
import { ReactFlow, MiniMap, Controls } from '@xyflow/react';
import { motion, useReducedMotion } from 'motion/react';

const W = 240, H = 92;

function visibleIds(employees, collapsed) {
  const children = new Map();
  employees.forEach(e => {
    if (e.managerId) children.set(e.managerId, [...(children.get(e.managerId) ?? []), e.id]);
  });
  const out = new Set();
  const walk = id => { out.add(id); if (!collapsed.has(id)) (children.get(id) ?? []).forEach(walk); };
  employees.filter(e => !e.managerId).forEach(e => walk(e.id));
  return out;
}

function layout(employees, collapsed) {
  const ids = visibleIds(employees, collapsed);
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 72 });
  employees.filter(e => ids.has(e.id)).forEach(e => g.setNode(e.id, { width: W, height: H }));
  employees.filter(e => ids.has(e.id) && e.managerId).forEach(e => g.setEdge(e.managerId, e.id)); // hiérarchie seulement
  dagre.layout(g);
  return employees.filter(e => ids.has(e.id)).map(e => {
    const p = g.node(e.id);
    return { id: e.id, type: 'person', position: { x: p.x - W / 2, y: p.y - H / 2 }, data: e };
  });
}

function PersonCard({ data, selected }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="rounded-xl border bg-card shadow-sm focus-visible:ring-2"
      animate={{ scale: selected ? 1.04 : 1 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 28 }}
      tabIndex={0}
      aria-label={`${data.name}, ${data.role}, ${data.department}, ${data.status}, ${data.directReportsCount} subordonnés`}
    >
      {/* avatar ou initiales, nom, poste, pastille de statut avec texte, bouton Développer/Réduire */}
    </motion.div>
  );
}

CSS : .react-flow__node { transition: transform 350ms cubic-bezier(.2,.8,.2,1); } pour animer le déplacement des nœuds lors d'un dépli ; arête animée avec stroke-dasharray et stroke-dashoffset (le tracé s'anime sur la chaîne survolée) ; désactivé si prefers-reduced-motion. Après recherche : fitView sur le nœud avec duration 500 ms.

TESTS (obligatoires)
====================
1. Base : refus d'un cycle, d'un double manager valide, d'un lien vers soi-même, de dates incohérentes, d'une allocation totale supérieure à 100 % ; migration appliquée puis annulée.
2. RLS par rôle : un salarié ne voit aucune donnée de paie ni donnée interdite ; paie ne peut pas écrire ; une écriture hors rôle est refusée ; aucune lecture anonyme.
3. Vues : directReportsCount exact ; statut calculé correct pour congé, mission, intérim, sorti ; organigramme à une date passée correct.
4. Disposition : les arêtes hors hiérarchie ne modifient pas les positions ; repli et dépli donnent les bons nœuds visibles.
5. Interface : rendu avec seed ; recherche centre et ouvre la branche ; clavier (flèches, Entrée, Espace, Échap) ; thème sombre et clair ; prefers-reduced-motion ; vue liste accessible.
6. Accessibilité : contrôle automatisé (par exemple axe) sans violation critique ; contrastes vérifiés.
7. Performance : jeu de 500 salariés synthétiques, temps de chargement, de disposition et de dépliage consignés ; seuil à respecter ou écart justifié.
8. Non-régression : build, lint, tests existants et vérification de la paie d'août 2026 inchangés.

DÉFINITION DE « TERMINÉ »
=========================
- Migrations versionnées, réversibles, rejouables depuis zéro ; types de base régénérés.
- RLS testée pour chaque rôle ; aucune donnée de paie exposée.
- Écran intégré à la navigation « Équipes et managers », gabarits respectés, états chargement, erreur, vide, sans droit et session expirée traités.
- Tests ci-dessus exécutés avec preuve (commande, résultat, rapport).
- Build et lint sans erreur ; aucune dépendance non justifiée.
- Documentation : docs/ORGANIGRAMME_DECISIONS.md (choix, dépendances, mesures), docs/ORGANIGRAMME_TESTS.md (matrice), mise à jour du journal du projet et de la feuille de route.

CONTRÔLES DE SÉCURITÉ ET DE CONFORMITÉ
======================================
- Aucun secret, aucune donnée personnelle réelle dans Git ou les logs.
- L'export et toute modification de lien sont journalisés.
- Les photos et e-mails ne s'affichent que selon la règle de rôle documentée.
- L'interface ne contient aucune règle de sécurité qui ne soit pas aussi appliquée en base.
- Aucun appel à un service externe en exécution (CDN, polices, avatars distants).

RÈGLES DE CONDUITE
==================
1. Phase 1 d'abord : présente le rapport « existant / manque » et tes choix de dépendances, puis attends la validation avant d'écrire du code, sauf session non surveillée ; dans ce cas, prends l'hypothèse la plus raisonnable, écris-la en tête de docs/ORGANIGRAMME_DECISIONS.md et continue.
2. Ne déclare rien terminé sans preuve exécutée.
3. Ne modifie ni ne supprime aucun fichier existant en dehors de ce qui est nécessaire au module (navigation, types, migrations) ; liste chaque fichier modifié.
4. Ne change pas silencieusement une règle métier ambiguë : documente et demande.
5. Pas d'expression de présence en temps réel (« en ligne », « en réunion ») : SOMA-RH ne dispose pas de cette donnée.

FORMAT DE TA RÉPONSE FINALE
===========================
1. Résumé exécutif ;
2. Existant constaté et réutilisé ;
3. Modèle de données et migrations ;
4. Sécurité (RLS) et tests par rôle ;
5. Composants et fichiers créés ou modifiés ;
6. Dépendances ajoutées et justification ;
7. Tests exécutés avec résultats (tableau contrôle / commande / résultat attendu / obtenu / statut) ;
8. Mesures de performance ;
9. Accessibilité ;
10. Problèmes non résolus et décisions à prendre ;
11. Commandes pour lancer, tester, annuler la migration ;
12. Décision GO / NO-GO pour la mise en recette.
Aucune donnée personnelle réelle dans la réponse.
```

---

## 1. Décisions déjà prises

| Sujet | Valeur |
|---|---|
| Emplacement | Section « Équipes et managers » |
| Visualisation | React Flow (@xyflow/react) par défaut, disposition dagre ou elkjs, animation motion |
| Disposition | Calculée sur la hiérarchie directe uniquement ; liens hors hiérarchie dessinés par-dessus |
| Liens hors hiérarchie | Pointillé (matriciel), intérim, fonctionnel, équipes transverses ; datés, avec quote-part, journalisés |
| Statuts | Calculés à partir des données RH (actif, en congé, en mission, intérim, sorti) ; pas de présence en temps réel |
| Sécurité | RLS en base, aucune donnée de paie dans les vues, export journalisé |
| Données de test | Synthétiques uniquement |
| Périmètre | Mono-société, local, sans nouveau backend |

## 2. Points à valider par Moussa Diene avant exécution

1. **Visibilité par rôle** : un salarié simple voit-il tout l'organigramme (nom, poste) ou seulement son équipe ? (`PLAN_EVOLUTION_SOMA_RH.md` parle d'un organigramme « limité au périmètre autorisé » ; l'e-mail professionnel est-il visible de tous ?)
2. **Photos** : stockage local des avatars autorisé, ou initiales seulement dans un premier temps ?
3. **Manager** : le rôle « manager » existe-t-il déjà dans la base, ou faut-il le créer (avec périmètre limité à ses subordonnés) ? La feuille de route le présente aussi comme un chantier distinct (approbation manager).
4. **Historique** : la consultation de l'organigramme à une date passée est-elle nécessaire dès la première version (P2-03 le classe en priorité 2) ?
5. **Équipes de gardiens** : faut-il relier l'organigramme au planning 24 h/24 dans cette version ou plus tard ?

## 3. Image de référence

À copier dans `docs\captures-organigramme\reference-organigramme.png`. Éléments à retenir : cartes à avatar et pastille de statut, connecteurs fins colorés avec tracé animé, bouton Développer/Réduire sous chaque nœud, lien pointillé étiqueté « rattachement pointillé », mini-carte en bas à droite, contrôles de zoom, barre de recherche, fil d'Ariane, bouton Exporter. Les statuts « en ligne » et « en réunion » de l'image ne sont pas repris (donnée inexistante dans SOMA-RH).

---

## Évolutions v1.1 — navigabilité et gestion directe (4/11/2026)

À appliquer en plus du prompt initial ; elles remplacent les règles contraires (notamment le motif obligatoire).

1. **Chaque élément est interactif** : clic sur une carte (salarié, société, direction, secteur, section) = fiche latérale avec toutes les actions de rattachement et de détachement ; clic sur une ligne = menu (détacher, changer, terminer un lien, ouvrir les fiches) ; bouton « + » = menu d'actions de la carte. Vérifier que le canevas ne désactive pas les clics (cartes en `pointer-events: none` quand ni sélection ni déplacement ne sont activés).
2. **Liaison à la souris** : poignées visibles au survol (bas = rattacher un salarié sous cette carte, haut = choisir son manager ou sa direction, côtés = lien hors hiérarchie). Déposer sur le corps de la carte suffit. Toujours ouvrir une fenêtre de confirmation préremplie, jamais d'écriture directe.
3. **Motif toujours facultatif** (« information complémentaire ») ; toute action est journalisée avec ou sans motif.
4. **Rattachement à une direction** : proposer de rattacher aussi le salarié au responsable de la direction (coché par défaut s'il a déjà un manager) ; afficher et journaliser « de A à B » ; notifier le salarié concerné s'il a un compte.
5. **Retour visuel** : après toute création ou rattachement, message de confirmation visible (qui, où, ancien/nouveau manager) et bascule vers la vue où l'élément apparaît (« Directions » pour une unité). Aucune action ne doit réussir ou échouer en silence.
6. **Cohérence avec « Équipes et managers »** : états d'affectation À venir / Actif / Désaffecté ; clôturer = désaffecter dès aujourd'hui ; un manager n'a pas besoin de compte utilisateur.
7. **Aide intégrée** : une ligne d'astuce rappelle les gestes (pastilles, clic sur une ligne, clic sur une carte) pour les utilisateurs RH.
