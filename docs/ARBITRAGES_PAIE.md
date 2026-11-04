# Arbitrages des règles de paie issues du classeur Excel (D10)

> Décision D10 (30/10/2026) : le classeur Excel reste la base ; si une meilleure règle existe, elle est arbitrée et mise en place.
> Chaque règle modifiée est pilotée par un paramètre de `payroll_settings` : la valeur « Excel » rétablit l'ancien calcul à l'identique.
> Appliqué par la migration `20261030220000_d10_arbitrages_regles_excel.sql`.
> **Aucun point ci-dessous n'est un avis juridique** : les points marqués « à confirmer » doivent être validés par votre juriste ou le comptable.

## Synthèse

| # | Point | Règle Excel | Décision | Paramètre (valeur par défaut) |
|---|---|---|---|---|
| 4 | Transport et indemnité kilométrique en cas d'absence | retranche « heures ÷ 8 » d'une base de 173,33 heures | **Corrigé** : proratisation par les heures d'absence | `allowance_absence_basis` = `hours` |
| 7 | IPM des prestataires | IPM appliquée à tous les contrats | **Corrigé** : pas d'IPM pour les prestataires | `ipm_on_contractors` = `false` |
| 8 | Indemnité de licenciement / retraite | calculée sur le salaire du mois de sortie | **Corrigé** : moyenne des 12 derniers mois | `severance_basis` = `average12` |
| 2 | Retenue pour absences | base = base + sursalaire + honoraires + autre fixe | **Conservé** | — |
| 6 | Arrondi du net | aucun arrondi, affichage au franc | **Conservé** | — |
| 1 | Indemnité maladie (taux) | taux ignoré dans le TABLEAU | **Déjà corrigé** (taux appliqué, 100 % par défaut) | — |

## Fiche 4 — Transport et indemnité kilométrique en cas d'absence

- **Règle Excel** : indemnité ÷ 173,33 × (173,33 − heures d'absence ÷ 8). On retire donc des *jours* (heures ÷ 8) d'une base exprimée en *heures*.
- **Problème** : l'absence est quasiment sans effet. Exemple (26 000 F de transport, 16 h d'absence, soit 2 jours) : Excel retient 300 F seulement.
- **Décision** : indemnité × (173,33 − heures d'absence) ÷ 173,33. Pour 16 h d'absence : 26 000 → **23 600 F** (−2 400 F, soit 9,2 %), ce qui correspond à 2 jours sur 21,7 jours ouvrés.
- **Effet attendu** : les salariés absents touchent une indemnité de transport plus faible, proportionnelle aux jours d'absence. Vérifié le 30/10/2026 par un calcul de test (annulé ensuite) sur le salarié S0002.
- **À confirmer** : la direction doit être d'accord pour retirer le transport proportionnellement aux jours d'absence (y compris pour maladie ou congé si ces heures sont saisies comme absences).
- **Retour arrière** : `update payroll_settings set allowance_absence_basis = 'excel';`

## Fiche 7 — IPM des prestataires

- **Règle Excel** : cotisation IPM (plafond 10 000 F, partagée 50/50) sur tous les contrats, prestataires compris.
- **Problème** : un prestataire facture ses honoraires et subit la retenue à la source (BRS, 5 %). Il n'est pas salarié, donc la prévoyance maladie d'entreprise ne le concerne pas ; le retenir l'IPM réduit son net sans fondement.
- **Décision** : IPM nulle pour la situation « PRESTATION ». Stagiaires et apprentis restent soumis comme dans le classeur.
- **Effet** : aucun prestataire dans vos données aujourd'hui, donc aucun montant modifié. Le jour où un prestataire est créé, son net est supérieur de sa part IPM.
- **À confirmer** : si SOMA couvre ses prestataires par l'IPM par contrat, remettre `true`.
- **Retour arrière** : `update payroll_settings set ipm_on_contractors = true;`

## Fiche 8 — Indemnité de licenciement et de départ à la retraite

- **Règle Excel** : coefficient par tranche d'ancienneté × (base + sursalaire + prime d'ancienneté **du mois de sortie**).
- **Problème** : le salaire du dernier mois peut être anormalement bas ou haut (absence, augmentation tardive). L'usage, et le Code du travail pour le licenciement, retiennent la **moyenne mensuelle sur les 12 derniers mois** (à confirmer pour votre convention collective).
- **Décision** : moyenne de (base + sursalaire + prime d'ancienneté) sur le mois de sortie et les 11 bulletins validés précédents (moins s'il y en a moins). Les coefficients par tranche ne changent pas.
- **Effet** : aucun aujourd'hui (aucune sortie de CDI avec indemnité, aucun bulletin validé dans la base). Les bulletins validés à partir de maintenant alimenteront la moyenne ; avant 12 mois d'historique la moyenne porte sur les mois disponibles.
- **Limite** : l'historique de 2026 (janvier à juin) n'a pas de bulletins enregistrés dans la base ; pour un départ proche, importer ou recalculer ces mois avant la sortie.
- **Retour arrière** : `update payroll_settings set severance_basis = 'month';`

## Fiche 2 — Retenue pour absences (conservée)

- **Règle** : (base + sursalaire + honoraires + autre fixe) ÷ 173,33 × heures d'absence. Le bulletin Excel n'affichait que base + sursalaire.
- **Décision** : conserver la base complète du TABLEAU. C'est la plus cohérente : toute la rémunération fixe est proratisée.

## Fiche 6 — Arrondi du net (conservé)

- **Règle** : aucun arrondi, les montants sont affichés au franc près.
- **Décision** : conserver. La base garde la précision complète ; l'arrondi se fait à l'affichage. À noter : en paiement en espèces, la somme des nets arrondis peut différer de quelques francs du total ; le comptable arrondit au franc par salarié.

## Fiche 1 — Taux de l'indemnité maladie (déjà corrigé)

- Le TABLEAU ignorait le taux maladie alors que le bulletin l'appliquait. Le moteur applique le taux (100 % par défaut) sur la base du TABLEAU.

## Contrôle de non-régression

- Avec les trois paramètres à la valeur « Excel », le calcul d'août 2026 pour les 26 salariés actifs est **identique** à celui d'avant la modification (comparaison poste par poste, y compris brut 5 017 834,60 F et net 4 765 432,33 F au 30/10/2026).
- Le classeur de référence (25 bulletins, brut 4 929 179,09 F) ne peut plus être rejoué : la base actuelle compte 26 salariés actifs et aucun bulletin enregistré.

## Fiche 9 — Arrondi de la base imposable de l'IR (campagne QA, 4 novembre 2026)

- **Ancien comportement** : `compute_income_tax` tronquait au millier le montant `brut annuel − abattement`. Le brut calculé porte un bruit numérique (par exemple 609 000 − 4×10⁻¹⁶), donc un montant exact de 6 408 000 F devenait 6 407 999,99… puis 6 407 000 F.
- **Problème** : l'IR de 12 % des salariés CDI et CDD était sous-estimé de 19 à 25 F par mois. Le texte (CGI) arrondit le montant exact, pas son bruit de calcul.
- **Décision** : arrondir à 6 décimales avant la troncature (`trunc(round(x, 6), -3)`). Migration `20261104140000_ir_arrondi_base`, retour arrière dans `db/rollback/`.
- **Effet** : aucun sur les 26 bulletins d'août 2026 des salariés d'origine (`verify-payroll.ps1` : PASS sans `-Save`). Sur 939 salariés de test CDI et CDD, l'oracle et le moteur concordent à 0,001 F.
- **Cause racine non traitée** : le bruit vient de la division par le taux horaire (173,33 contre 173,3333…). Il ne touche que l'IR par effet de seuil ; une correction du calcul horaire demanderait une validation comptable.
- **Test** : `tests/sql/ir_arrondi.sql`.
