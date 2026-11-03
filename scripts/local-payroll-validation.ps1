$ErrorActionPreference = 'Stop'

$container = 'soma-rh-local-postgres-1'
$dbPassword = $env:POSTGRES_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPassword) -and (Test-Path '.env')) {
  $dbPassword = (Get-Content '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1) -replace '^POSTGRES_PASSWORD=', ''
}
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
  throw 'POSTGRES_PASSWORD est requis dans l’environnement ou le fichier .env local.'
}

function Invoke-DbScalar([string]$sql) {
  $value = docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "Échec SQL: $sql" }
  $result = @($value | Where-Object { $_ -notin @('BEGIN', 'COMMIT', 'ROLLBACK') } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($result.Count -eq 0) { return '' }
  return $result[$result.Count - 1].ToString().Trim()
}

function Invoke-Db([string]$sql) {
  docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -v ON_ERROR_STOP=1 -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "Échec SQL: $sql" }
}

function Assert-Equal([string]$name, [string]$actual, [string]$expected) {
  if ($actual -ne $expected) {
    Write-Host ("FAIL {0}: attendu={1}; obtenu={2}" -f $name, $expected, $actual)
    return $false
  }
  Write-Host ("PASS {0}: {1}" -f $name, $actual)
  return $true
}

Write-Output 'SOMA-RH — validation locale Phase 0'
Write-Output ("Base: {0}" -f (Invoke-DbScalar 'select current_database()'))

$employeeCount = Invoke-DbScalar 'select count(*) from public.employees'
$augustStored = Invoke-DbScalar @"
select count(*) || '|' ||
       coalesce(sum(gross_pay), 0) || '|' ||
       coalesce(sum(net_pay), 0) || '|' ||
       coalesce(sum(income_tax), 0) || '|' ||
       coalesce(sum(trimf), 0) || '|' ||
       coalesce(sum(total_employee_deductions), 0) || '|' ||
       coalesce(sum(employer_charges), 0)
from public.salary_slips
where period_start = date '2026-08-01' and status <> 'Annulé'
"@
$storedParts = $augustStored -split '\|'
Write-Output ("INFO salariés={0}; bulletins août={1}; brut={2}; net={3}" -f $employeeCount, $storedParts[0], $storedParts[1], $storedParts[2])
$inactiveStored = Invoke-DbScalar @"
select count(*)
from public.salary_slips s
join public.employees e on e.id = s.employee_id
where s.period_start = date '2026-08-01'
and s.status <> 'Annulé'
and e.status <> 'Active'
"@

$eligible = Invoke-DbScalar @"
select count(*)
from public.employees e
where e.status = 'Active'
and exists (
  select 1 from public.salary_structure_assignments a
  where a.employee_id = e.id and a.from_date <= date '2026-08-01'
)
"@
$inactiveEligible = Invoke-DbScalar @"
select count(*)
from public.employees e
where e.status <> 'Active'
and exists (
  select 1 from public.salary_structure_assignments a
  where a.employee_id = e.id and a.from_date <= date '2026-08-01'
)
"@
$missingStructure = Invoke-DbScalar @"
select count(*)
from public.employees e
where e.status = 'Active'
and not exists (
  select 1 from public.salary_structure_assignments a
  where a.employee_id = e.id and a.from_date <= date '2026-08-01'
)
"@
Write-Output ("INFO calcul août actifs éligibles={0}; actifs sans structure={1}; inactifs éligibles={2}" -f $eligible, $missingStructure, $inactiveEligible)
$scopePass = $true
$scopePass = (Assert-Equal 'PAY-000 bulletins selon le périmètre actif' $storedParts[0] $eligible) -and $scopePass
$scopePass = (Assert-Equal 'PAY-004 salarié inactif exclu du calcul' $inactiveEligible '0') -and $scopePass
$scopePass = (Assert-Equal 'PAY-006 bulletin inactif exclu du stockage' $inactiveStored '0') -and $scopePass
if ([int]$missingStructure -eq 0) {
  Write-Output 'PASS PAY-005 tous les salariés actifs éligibles ont une structure'
} else {
  Write-Output ("FAIL PAY-005 salariés actifs sans structure: {0}" -f $missingStructure)
  $scopePass = $false
}

$computed = Invoke-DbScalar @"
select count(*) || '|' ||
       coalesce(sum((public.compute_salary_slip(e.id, date '2026-08-01', date '2026-08-31')->'totals'->>'gross_pay')::numeric), 0) || '|' ||
       coalesce(sum((public.compute_salary_slip(e.id, date '2026-08-01', date '2026-08-31')->'totals'->>'net_pay')::numeric), 0)
from public.employees e
where e.status = 'Active'
and exists (
  select 1 from public.salary_structure_assignments a
  where a.employee_id = e.id and a.from_date <= date '2026-08-01'
)
"@
$computedParts = $computed -split '\|'
Write-Output ("INFO rejeu calcul pur={0} bulletins; brut={1}; net={2}" -f $computedParts[0], $computedParts[1], $computedParts[2])
$calculationPass = $true
$calculationPass = (Assert-Equal 'PAY-001 calcul pur: bulletins' $computedParts[0] $storedParts[0]) -and $calculationPass
$calculationPass = (Assert-Equal 'PAY-002 calcul pur: brut' $computedParts[1] $storedParts[1]) -and $calculationPass
$calculationPass = (Assert-Equal 'PAY-003 calcul pur: net' $computedParts[2] $storedParts[2]) -and $calculationPass

<#
  Diagnostic limité aux identifiants techniques. Il est exécuté uniquement
  lorsque le périmètre actif ne correspond pas aux bulletins stockés.
#>
if (-not $scopePass) {
  Write-Output 'DIAGNOSTIC salariés actifs éligibles (matricules uniquement, sans données nominatives):'
  Invoke-Db @"
select e.employee_number
from public.employees e
where exists (
  select 1 from public.salary_structure_assignments a
  where a.employee_id = e.id and a.from_date <= date '2026-08-01'
)
and e.status = 'Active'
order by e.employee_number;
"@
}

$adminId = Invoke-DbScalar "select u.id::text from auth.users u where lower(u.email) = lower('mdiene@gmail.com')"
$noRoleId = Invoke-DbScalar "select gen_random_uuid()::text"
$employeeId = Invoke-DbScalar "select e.user_id::text from public.employees e where e.user_id is not null order by e.employee_number limit 1"
if ([string]::IsNullOrWhiteSpace($adminId) -or [string]::IsNullOrWhiteSpace($noRoleId) -or [string]::IsNullOrWhiteSpace($employeeId)) {
  throw 'Impossible de préparer les identités synthétiques pour les tests RLS.'
}

$rlsAdmin = Invoke-DbScalar @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', true);
select count(*) from public.employees;
rollback;
"@
if ([int]$rlsAdmin -gt 0) { Write-Output ("PASS SEC-ADMIN lecture RH: {0} lignes" -f $rlsAdmin) } else { throw 'SEC-ADMIN: l’administrateur ne voit aucune donnée.' }

docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -v ON_ERROR_STOP=1 -Atc @"
begin;
set local role anon;
select count(*) from public.employees;
rollback;
"@
if ($LASTEXITCODE -ne 0) {
  Write-Output 'PASS SEC-001 lecture anonyme refusée par PostgreSQL'
} else {
  $rlsAnon = Invoke-DbScalar @"
begin;
set local role anon;
select count(*) from public.employees;
rollback;
"@
  if ([int]$rlsAnon -eq 0) { Write-Output 'PASS SEC-001 lecture anonyme masquée par RLS' } else { Write-Output ("FAIL SEC-001 lecture anonyme: {0} lignes" -f $rlsAnon) }
}

$rlsNoRole = Invoke-DbScalar @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$noRoleId', true);
select count(*) from public.employees;
rollback;
"@
if ([int]$rlsNoRole -eq 0) { Write-Output 'PASS SEC-003 utilisateur sans rôle isolé' } else { Write-Output ("FAIL SEC-003 utilisateur sans rôle: {0} lignes" -f $rlsNoRole) }

$rlsEmployee = Invoke-DbScalar @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$employeeId', true);
select count(*) from public.employees;
rollback;
"@
if ([int]$rlsEmployee -le 1) { Write-Output ("PASS SEC-002 salarié limité à son périmètre: {0} ligne(s)" -f $rlsEmployee) } else { Write-Output ("FAIL SEC-002 salarié voit {0} lignes" -f $rlsEmployee) }

Write-Output ("SUMMARY calculation_pass={0}; scope_pass={1}; active_eligible={2}; missing_structure={3}; inactive_eligible={4}; inactive_stored={5}" -f $calculationPass, $scopePass, $eligible, $missingStructure, $inactiveEligible, $inactiveStored)
if (-not $calculationPass -or -not $scopePass) {
  Write-Warning 'La validation paie échoue: le périmètre actif et les bulletins stockés ne sont pas cohérents.'
  exit 2
}
