# Captures Frappe HR (référentiel d'écrans)

Source : https://docs.frappe.io/hr (captures du 3 novembre 2026, données de démonstration en roupies, localisation indienne). Usage : inspiration de structure d'écrans et de workflows pour SOMA-RH ; ne rien copier tel quel.

| Fichier | Page source | Ce qu'on y voit | Enseignement pour SOMA-RH |
|---|---|---|---|
| salary-slip_01 | /hr/salary-slip | Fiche employé avec bouton « Create Salary Slip » | Action contextuelle depuis la fiche source |
| salary-slip_02 | /hr/salary-slip | Bulletin : gains / retenues en deux tables, brut, total retenues, net, arrondi, cumul annuel (YTD) et du mois (MTD) | Bulletin en 2 colonnes + bloc « Net à payer » + cumuls |
| payroll-entry_01 | /hr/payroll-entry | Saisie de paie : date, fréquence, filtres (succursale, désignation, département), liste des employés, bouton « Create Salary Slips » | Écran « lot de paie » |
| payroll-entry_02 | /hr/payroll-entry | Même écran en version récente : « Get Employees », statut Brouillon, compte à payer | Boutons d'action dans l'en-tête, statut visible |
| salary-structure_01 | /hr/salary-structure | Gains/retenues avec abréviation, case « statistique », formule | Éditeur de rubriques par formule |
| leave-application_01 | /hr/leave-application | Tableau des soldes par type de congé (alloué, pris, en attente, disponible) au-dessus du formulaire | Solde visible avant de demander |
| attendance_01 | /hr/attendance | Liste des présences + menu du module (Roster, Tableau de bord, Pointage, Demande de poste, Heures sup., Rapports, Paramètres) | Squelette de navigation du module RH |
| additional-salary_01 | /hr/additional-salary | Fiche : salarié, composant, montant, date de paie, case « récurrent », « remplace le montant de la structure » | Mécanisme unique pour primes, retenues, acomptes |
| full-and-final-statement_01 | /hr/full-and-final-statement | Solde de tout compte : dettes (bulletin, frais, prime, congés), créances (avance), actifs à restituer ou à recouvrer, statut | Écran « sortie » en trois blocs |
| payroll-settings_01 | /hr/payroll-settings | Paramètres : jours ouvrés selon présences ou congés, statut des jours non pointés, fériés, fraction de demi-journée | Règles de calcul explicites et paramétrables |

Pages sans écran (texte seul) : correction de paie (/hr/payroll-correction), non capturée.
