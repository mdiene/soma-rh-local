# Analyse de périmètre paie — août 2026

## Objectif

Définir le périmètre de paie du projet sans exposer de nom, matricule, email,
RIB ou identifiant salarié. Le fichier Excel d'août 2026 est conservé comme
référence historique fonctionnelle, mais ne constitue plus l'oracle des tests
actuels.

## Preuves reproductibles

Commande :

```powershell
.\scripts\local-payroll-validation.ps1
```

| Contrôle | Résultat local |
|---|---:|
| Fiches salariés totales | 27 |
| Fiches actives au 01/08/2026 | 26 |
| Fiches actives avec structure au 01/08/2026 | 26 |
| Fiches inactives sans bulletin août | 1 |
| Bulletins août non annulés | 26 |
| Répartition active août | 15 CDI / 11 CDD |
| Brut local observé | 5 017 834,60 F |
| Net local observé | 4 765 432,33 F |
| Base de validation actuelle | Salariés actifs avec structure applicable au 01/08/2026 |

Le calcul pur `compute_salary_slip` reproduit les agrégats des bulletins stockés
pour les salariés actifs éligibles. Il n'y a donc pas d'écart entre calcul et
persistance sur ce lot.

## Contrôles de périmètre

Les 26 salariés actifs disposent tous d'une structure salariale applicable au
1er août. Le salarié inactif ajouté pendant les tests doit rester exclu du
calcul et ne doit pas produire de bulletin non annulé.

## Règles à vérifier, dans l'ordre

1. **Statut métier :** un salarié inactif ne doit pas être éligible au calcul.
2. **Date d'effet :** chaque salarié actif doit disposer d'une structure
   applicable au premier jour de la période.
3. **Règle de paie :** les agrégats calculés doivent être identiques aux
   bulletins stockés, sans arrondi intermédiaire.

## Fixtures anonymisées créées

[`tests/fixtures/payroll/phase2-synthetic-cases.json`](../tests/fixtures/payroll/phase2-synthetic-cases.json)
contient 25 cas synthétiques (`SYN-001` à `SYN-025`) avec types CDI/CDD,
parts fiscales et scénarios absence/maladie/heures supplémentaires. Aucun cas
ne contient une identité ou une valeur copiée depuis un salarié réel.

Cette fixture est une matrice de couverture technique uniquement. Elle ne
contient plus de totaux Excel et ne sert pas à reconstruire les salariés
actuels.

La commande suivante exécute les fonctions `compute_income_tax` et
`compute_trimf` sur ces 25 cas, sans insertion en base :

```powershell
.\scripts\local-synthetic-fixture-validation.ps1
```

## Plan de consolidation

1. figer la définition du périmètre actif et la règle d'exclusion des inactifs ;
2. compléter la matrice par les paramètres de calcul, jamais par les données
   nominatives ;
3. rejouer le moteur sur une base neuve et une base restaurée ;
4. comparer les résultats calculés et stockés avec une tolérance documentée ;
5. intégrer le contrôle dans la CI avant de passer à la Phase 1 de gouvernance.

**Décision actuelle : périmètre recalibré ; la validation porte désormais sur
la cohérence interne de la base mono-entreprise.**
