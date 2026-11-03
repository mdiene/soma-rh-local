# SOMA-RH — rapport de validation paie locale

## 1. Périmètre

Ce rapport sépare les preuves historiques déjà obtenues des contrôles à rejouer dans la Phase 0. Il ne contient aucune donnée nominative.

## 2. Référence fonctionnelle historique

Le classeur de paie d'août 2026 documenté dans [`ANALYSE_EXCEL.md`](./ANALYSE_EXCEL.md)
reste une référence historique. Il n'est plus l'oracle obligatoire des tests,
car le périmètre et les données du projet ont évolué.

| Indicateur | Attendu |
|---|---:|
| Bulletins de référence | 25 |
| Tolérance maximale | `0,000001 F` |
| Brut total | `4 929 179,09 F` |
| Net total | `4 662 739,89 F` |
| IR total | `527 429,79 F` |
| TRIMF total | `31 600 F` |
| Retenues totales | `916 439,21 F` |
| Charges patronales | `810 489,50 F` |

## 3. Preuves déjà disponibles

La documentation fonctionnelle indique :

- écart maximal historique inférieur à `0,000001 F` sur les 25 bulletins ;
- totaux brut et net conformes ;
- 720 cas IR/TRIMF comparés ;
- journaux comptables équilibrés ;
- contrôle effectué après les lots précédents avec écart brut et net inférieur à `0,000001 F`.

Ces résultats sont une preuve de référence du moteur, mais ne remplacent pas une commande reproductible dans la nouvelle matrice de tests.

## 4. Contrôles Phase 0

| Contrôle | Résultat | Statut |
|---|---|---|
| PostgreSQL local disponible | `soma_rh:soma:27` | PASS |
| Services Docker | PostgreSQL, PostgREST, API et pgAdmin actifs | PASS |
| Auth locale | signup/login local validé précédemment | PASS |
| Build frontend | `npm run build` validé précédemment | PASS |
| Lint frontend | 0 erreur, 2 avertissements Fast Refresh préexistants | PASS avec avertissements |
| Sauvegarde locale | dump créé hors Git | PASS |
| Restauration contrôlée | base temporaire restaurée, 27 salariés lisibles | PASS |
| Rejeu automatisé des bulletins | `.\scripts\local-payroll-validation.ps1` | À rejouer avec le périmètre recalibré |

## 5. Résultats du rejeu Phase 2

Commande exécutée le 2 novembre 2026 :

```powershell
.\scripts\local-payroll-validation.ps1
```

| Contrôle | Résultat actuel |
|---|---:|
| Bulletins correspondant aux salariés actifs éligibles | 26 |
| Salariés actifs avec structure au 01/08/2026 | 26 |
| Salariés actifs sans structure au 01/08/2026 | 0 |
| Salariés inactifs éligibles | 0 |
| Bulletins stockés pour des salariés inactifs | 0 |

Le calcul pur (`compute_salary_slip`) doit reproduire les agrégats des bulletins
stockés pour les salariés actifs éligibles. Le contrôle ne compare plus ces
résultats aux anciens totaux Excel.

Le harnais vérifie séparément le périmètre actif (`PAY-000`), l'exclusion des
inactifs (`PAY-004` et `PAY-006`) et l'existence d'une structure (`PAY-005`). En cas d'écart,
il affiche uniquement les matricules techniques du périmètre actif, sans copier
de données personnelles dans Git.

Les contrôles RLS exécutés dans des sessions `anon` et `authenticated` sont
validés : lecture anonyme refusée, utilisateur sans rôle isolé, salarié limité
à sa fiche et administrateur capable de lire le périmètre RH.

## 6. Décision

**Phase 0 recalibrée : validation interne du périmètre en cours.**

Le socle local et les contrôles RLS sont utilisables. Avant de passer à la
Phase 1, il faut :

1. valider le contrôle sur une base neuve et une base restaurée ;
2. intégrer le contrôle dans la CI ;
3. compléter les cas absence, maladie, congé, heures supplémentaires, sortie
   et retraite ;
4. documenter les résultats attendus de la matrice actuelle.

## 6. Impact Phase 1

La gouvernance de période ne modifie pas les fonctions de calcul ni les paramètres de paie. Le harnais Phase 2 ne modifie aucune donnée ; ses tests RLS utilisent des transactions annulées.
