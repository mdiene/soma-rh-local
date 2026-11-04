# SOMA-RH — Architecture cible, workflows et gabarits d'écran

Version 1.0 — 3 novembre 2026. Produit par `PROMPT_ANALYSE_ET_FEUILLE_DE_ROUTE_SOMA_RH.md` (§6.2 et §6.3).
Diagnostic de départ : [SYNTHESE_CORPUS_DOCS.md](./SYNTHESE_CORPUS_DOCS.md). Hypothèse H1 de ce document : le diagnostic n'est pas encore validé.

**Résumé**
1. Monolithe modulaire sur PostgreSQL, PostgREST, React (PWA) et un worker Node. Ni Kafka, ni Temporal (décision actée).
2. On **étend l'existant** (`payroll_entries`, `additional_salaries`, `payroll_snapshots`, `audit_log`…) au lieu de créer un second modèle : migrations Expand/Contract, noms de statuts actuels conservés.
3. Six objets métier manquent : constantes versionnées, régularisation, prêt/échéancier, registre de congés, sortie (solde de tout compte), bordereau d'heures supplémentaires.
4. Les 12 invariants de `ANALYSE_SAGE` sont repris et complétés (I13 à I20) avec, pour chacun, le lieu d'application et le test.
5. Une seule bibliothèque de gabarits d'écran (6 composants à créer au-dessus de `web/src/components/ui.tsx`).

## 1. Modèle de données cible

Légende : **Existe** = table trouvée dans les migrations · **Étendre** · **Nouveau**. `company_id` est conservé (D1) ; aucun `tenant_id`.

| Entité cible | État | Table(s) actuelle(s) | Migration nécessaire |
|---|---|---|---|
| Constantes légales datées | Étendre | `payroll_settings`, `tax_slab_at()`, `payroll_settings_at()` | Ajouter `rule_sets` (statut brouillon/approuvé/actif/retiré, source, approbateur, plage de dates) et `rule_values` ; **ne pas** brancher le moteur avant fixture et rollback |
| Rubriques base × taux × nombre | Étendre | composants des structures salariales (à relire) | Nommer la base, rattacher à une caisse, marquer « contribution employeur » et « statistique » (Frappe HR) |
| Caisses (IPRES, CSS, IPM, CFCE) | NC | non vérifié | Table `contribution_funds` + lien rubrique → caisse |
| Structures salariales | Existe | `salary_structures` | Aperçu avant affectation (écran) |
| Affectations datées | Existe | `salary_structure_assignments` | Aucune ; sert de base aux arriérés |
| Lot de paie | Existe (sous un autre nom) | `payroll_entries` + `payroll_periods` | Ajouter filtres (site, département) et idempotence de génération ; **ne pas** renommer |
| Bulletin | Existe | `salary_slips` | Colonnes de cumul par composant (YTD/MTD, vue `v_salary_slip_ytd` existe) |
| Salaire additionnel unifié | Étendre | `additional_salaries` | Ajouter `kind` (prime, retenue, acompte, prêt, heures sup., régularisation), `recurring`, `valid_from/to`, `overrides_structure`, `source_ref` |
| Régularisation | Nouveau | — | `payroll_corrections` : période d'origine, période d'application, avant/après, motif, approbateur ; génère des lignes `additional_salaries` |
| Présences | Existe | `attendance` | Unicité `(employee_id, date)` à vérifier ; lien vers la demande de congé |
| Registre de congés | Nouveau | `leave_applications`, `v_leave_balances` | `leave_ledger` (écritures : acquisition, prise, annulation, régularisation) ; `v_leave_balances` devient une vue sur le registre |
| Prêts et acomptes | Nouveau | via `employee_requests` | `loans`, `loan_installments` ; la retenue passe par `additional_salaries` (I7) |
| Heures supplémentaires | Nouveau | présences seulement | `overtime_sheets` (bordereau approuvé par la RH) → `additional_salaries` |
| Sortie | Nouveau | — | `employee_exits`, `exit_statement_lines` (dettes, créances, actifs ; statuts ligne et document) |
| Audit | Existe ×2 | `audit_log`, `audit_events` | **Choisir un journal** (Q2) ; ajouter hash précédent et empreinte SHA-256 |
| Snapshots | Existe | `payroll_snapshots` | Remplacer `md5` par SHA-256 (Expand) |
| Documents | Existe | `employee_documents` et migrations associées | Expirations, rétention (décision), versions |

## 2. Automates d'état

Les statuts de `payroll_entries` existent (`20261031190000…sql:35-43`) : **Brouillon, Calculée, En revue, Approuvée, Validée, Payée, Clôturée, Réouverte, Annulée**. `ANALYSE_SAGE` §5.1 en propose d'autres (ouverte, préparée, contrôlée, éditée) : **on ne les crée pas** — « contrôlée » est le résultat de la checklist et « éditée » un événement d'impression. Cela évite une migration risquée sur le moteur.

### 2.1 Période de paie / traitement

| De → Vers | Qui déclenche | Contrôle bloquant (message explicite) |
|---|---|---|
| Brouillon → Calculée | `rh`, `paie`, `admin` | « Le mois précédent n'est pas validé » · « Salarié sans structure salariale : S00xx » (jamais d'échec silencieux) |
| Calculée → En revue | préparateur | « Il reste N anomalies bloquantes : &lt;liste&gt; » |
| En revue → Approuvée | approbateur ≠ préparateur (I4) | « Vous avez préparé ce traitement : un autre rôle doit l'approuver » |
| Approuvée → Validée | `admin` | « Total des ordres de paiement ≠ total des nets » (I8) |
| Validée → Payée | `paie` ou `admin` | « Mode de règlement manquant pour N salariés » |
| Payée → Clôturée | `admin` | « Écart entre journal comptable et bulletins » (I9) |
| Clôturée → Réouverte | `admin`, motif obligatoire | « Motif requis » ; effet : régularisation préférée (I6) |
| tout → Annulée | `admin` | Refusée après paiement ; motif requis |

Existant : transitions par `transition_payroll_entry`, `UPDATE` direct de statut refusé (`payroll_entries_transition_guard`). **À vérifier** : que chaque refus renvoie un message en français (je n'ai pas relu les textes d'erreur).

### 2.2 Demande (congé, acompte, attestation, correction de présence, données personnelles)

`brouillon → soumise → approuvée | refusée | annulée → appliquée`. Annulation seulement avant décision ; refus avec motif obligatoire ; application = effet idempotent (présence créée, écriture au registre). Délégation et délai : lot ESS (dépend du modèle manager, ESS-008/012/013).

### 2.3 Sortie

`préavis → solde de tout compte en préparation → validé → payé → certificat remis`. Lignes : dettes (bulletin, indemnités, congés), créances (prêt, avance), actifs à restituer (hors périmètre : équipements gérés par le HSQE, D12 — la ligne n'est qu'un renvoi).

### 2.4 Prêt / acompte

`demandé → approuvé → décaissé → remboursé par retenues → soldé`. Échéancier modifiable après décaissement avec motif (congé sans solde).

## 3. Invariants

Les invariants **I1 à I12** viennent de `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` §5.2 ; **I13 à I20** sont ajoutés ici. Les identifiants de tests renvoient au [plan de contrôle](./PLAN_CONTROLE_QUALITE_SOMA_RH.md).

| # | Règle | Base | API | UI | Test |
|---|---|:-:|:-:|:-:|---|
| I1 | Un congé/absence approuvé produit une présence ; la paie lit **uniquement** les présences | trigger | RPC d'application | — | T-I1 |
| I2 | Pas de présence avant l'embauche ni après la sortie ; une par salarié et par date | contrainte `unique` + trigger | — | message | T-I2 |
| I3 | Aucun calcul sur une période non ouverte ; aucune approbation avec anomalie bloquante, **avec message** | garde-fou existant | RPC | message | T-I3 |
| I4 | Préparateur ≠ approbateur ; seul `admin` clôture et rouvre (motif) | RPC | — | bouton masqué | T-I4 |
| I5 | Un bulletin approuvé est figé avec ses paramètres (snapshot) et se recalcule à l'identique | `payroll_snapshots` | — | — | T-I5 |
| I6 | Toute correction après clôture crée une régularisation datée sur une période ultérieure | RPC `apply_correction` | — | écran | T-I6 |
| I7 | Prime, retenue, prêt, heures sup., régularisation passent par **le même** mécanisme daté | `additional_salaries.kind` | — | — | T-I7 |
| I8 | Total des ordres de paiement = total des nets ; simulation avant génération | contrôle au passage en Validée | — | écran de simulation | T-I8 |
| I9 | Chaque rubrique porte ses comptes ; la passation comptable ne contient aucune règle propre | vue `v_accounting_journal` | — | — | T-I9 |
| I10 | Toute modification sensible est journalisée (auteur, avant/après, motif) | trigger d'audit | — | — | T-I10 |
| I11 | Les droits se vérifient en base (RLS), pas seulement à l'écran | politiques | — | — | T-I11 |
| I12 | Le coût employeur est calculé pour chaque bulletin, même hors bulletin | colonnes calculées | — | état | T-I12 |
| I13 | Le moteur reproduit la fixture de référence (25 cas) à moins de 1e-6 F avec les paramètres D10 à « excel » | script | — | — | T-I13 |
| I14 | Aucun taux ni plafond légal en dur : paramètre daté et versionné | `rule_sets` | — | écran | T-I14 |
| I15 | Aucun mois clos n'est modifiable | `payroll_entries_closed_guard`, `salary_slips_closed_guard` | — | bandeau | T-I15 |
| I16 | Un seul journal d'audit | schéma | — | — | T-I16 |
| I17 | Aucune donnée personnelle dans Git, les fixtures, les journaux ni les rapports | CI (scan) | — | — | T-I17 |
| I18 | Les snapshots sont hachés en SHA-256 et chaînés | trigger | — | — | T-I18 |
| I19 | Recalcul idempotent : ni doublon ni variation non expliquée | contrainte d'unicité | RPC | — | T-I19 |
| I20 | Somme des échéances d'un prêt = capital décaissé | contrainte différée | — | — | T-I20 |

## 4. Matrice rôles × actions

D2 (30/10/2026) : `rh` prépare et calcule ; `paie` gère paramètres, barèmes, structures et suivi des paiements ; `admin` valide, clôture, rouvre, annule. D7 : validation interne simple. Le rôle `manager` est dérivé des affectations (ESS-013). **La colonne « Approuve » est à confirmer** : D2 parle de « RH ou DAF », le périmètre révisé réserve la validation à `admin`.

| Action | admin | rh | paie | manager | salarié |
|---|:-:|:-:|:-:|:-:|:-:|
| Préparer, calculer un traitement | ✔ | ✔ | ✔ | — | — |
| Approuver | ✔ | à confirmer | à confirmer | — | — |
| Valider, clôturer, rouvrir, annuler | ✔ | — | — | — | — |
| Paramètres légaux, barèmes, structures | ✔ | — | ✔ | — | — |
| Suivi des paiements | ✔ | — | ✔ | — | — |
| Fiches salarié (écriture) | ✔ | ✔ | — | — | demande de modification |
| Présences, congés (saisie) | ✔ | ✔ | — | équipe, selon périmètre | ses demandes |
| Décider une demande | ✔ | ✔ | — | équipe | — |
| Consulter bulletins | tous | tous | tous | non | les siens validés |
| Documents d'un salarié | ✔ | ✔ | — | selon type | les siens |
| Journal d'audit | ✔ | lecture | — | — | — |

Test : un cas par case dans la suite RLS (T-I11), session `authenticated` avec JWT de chaque rôle.

## 5. Intégration des gabarits d'écran

Principe : s'inspirer de la **structure** (Frappe HR) ; ne copier ni écran ni libellé. Les captures de `captures-frappe-hr/` sont des pages de documentation en ligne (données de démonstration en roupies) : elles montrent la structure, pas une interface à reproduire. Les deux captures Sage sont inutilisables pour les champs.

| Gabarit | Écran SOMA-RH | Sections, champs, actions, états | Image de référence |
|---|---|---|---|
| Fiche document avec statuts | Gabarit commun : période, bulletin, demande, prêt, sortie | En-tête (titre, badge d'état, actions), formulaire en sections, panneau latéral (historique, pièces) | `full-and-final-statement_01…`, `salary-slip_02…` |
| Lot de paie | `PayrollEntriesPage` + `PayrollEntryPage` | Date, mois, filtres (site, département) → liste des salariés → « Générer » (non destructif) → contrôle → soumission ; états : brouillon, calculée… | `payroll-entry_01…`, `payroll-entry_02…` |
| Bulletin | `SalarySlipPage`, `PrintSlipsPage` | Gains à gauche, retenues à droite, brut, total retenues, net, cumul annuel et du mois, bouton « Expliquer ce montant » (formule, base, taux) | `salary-slip_02…` |
| Éditeur de rubriques | Nouvel écran dans `SettingsPage` | Tableau : rubrique, abréviation, base, taux, caisse, case « statistique », formule ; aperçu avant affectation | `salary-structure_01…` |
| Demande de congé avec soldes | `LeavesPage`, `RequestsPage` | Tableau des soldes par type **au-dessus** du formulaire ; demi-journée ; motif | `leave-application_01…` |
| Salaire additionnel | `PayrollInputsPage` | Salarié, type, montant, date de paie, récurrent, remplace la structure | `additional-salary_01…` |
| Sortie | Nouvelle page | Trois blocs : dettes, créances, renvoi vers le HSQE ; statuts ligne et document | `full-and-final-statement_01…` |
| Paramètres de paie | `SettingsPage` | Cases explicites avec aide courte ; chaque règle D10 visible | `payroll-settings_01…` |
| Navigation du module | `Layout.tsx` | Menu latéral par domaine (paie, présences, demandes, états, paramètres) ; décision Q5 sur les menus Sage | `attendance_01…` |

### 5.1 Catalogue de composants (une seule bibliothèque)

Existant dans `web/src/components/ui.tsx` : `Button`, `TextField`, `PageHeader`, `Section`, `Empty`, `ErrorNote`, `Spinner`, `Modal`, `Figure`, `BADGE` ; et `DataTable.tsx`. À créer, dans cet ordre :

| # | Composant | Rôle | Dépend de |
|---|---|---|---|
| 1 | `StatusBadge` | Badge d'état unique pour tous les automates (étend `BADGE`) | — |
| 2 | `ActionBar` | Boutons d'action d'en-tête, désactivés avec **raison affichée** | `Button` |
| 3 | `SectionedForm` | Formulaire en sections repliables, erreurs par champ | `Section`, `TextField` |
| 4 | `DocumentSheet` | Fiche : en-tête + sections + panneau d'historique | 1, 2, 3 |
| 5 | `FilterList` | Liste filtrable avec états chargement, vide, erreur | `DataTable`, `Empty` |
| 6 | `EditableTable` | Tableau éditable (rubriques, échéanciers) | `DataTable` |

### 5.2 Règles transversales

- **Accessibilité** : navigation au clavier, libellés associés aux champs, contraste d'un badge indépendant de la couleur seule (texte + icône).
- **Mobile (PWA)** : une colonne sous 640 px ; boutons d'action en barre fixe ; tableaux défilants horizontalement avec en-tête figé ; aucune action destructrice sans confirmation.
- **Langue et montants** : français ; `fcfa()` de `web/src/lib/format.ts` ; chiffres tabulaires ; palette `ink / paper / river / phosphate / signal`, police Archivo.
- **États** : chaque écran gère chargement, vide, erreur, refus de rôle, session expirée (exigence de `FEUILLE_DE_ROUTE_NEXTGEN` §7).

## Fichiers sources

`SYNTHESE_CORPUS_DOCS.md` ; `ANALYSE_SAGE_PAIE_RH_VS_SOMA_RH.md` (§1-5, 9) ; `CADRE_DE_TRAVAIL_ET_PROPOSITION_TECHNIQUE.md` (§5) ; `PLAN_EVOLUTION_SOMA_RH.md` (§5) ; `FEUILLE_DE_ROUTE_SOMA_RH.md` (§10, décisions D1-D12) ; `ANALYSE_COMPARATIVE_CIBLE_VS_EXISTANT.md` ; migrations `20261028170100`, `20261031190000`, `20261031192000` ; `web/src/pages/` (noms de fichiers) ; `web/src/components/ui.tsx` (noms de composants, non relus ligne à ligne) ; 10 captures Frappe HR.
