# L0-03 : non-régression du moteur de paie (cohérence interne, sans classeur Excel).
#   -Save : enregistre l'empreinte actuelle comme référence (à faire après une évolution voulue du moteur)
#   sans option : recalcule la période et échoue (code 2) si l'empreinte diffère de la référence.
# La référence reste dans backups/ (ignoré par Git) : elle contient des montants par matricule.
param(
  [string]$Start = '2026-08-01',
  [string]$End = '2026-08-31',
  [switch]$Save
)
$ErrorActionPreference = 'Stop'

$container = 'soma-rh-local-postgres-1'
$dbPassword = $env:POSTGRES_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPassword) -and (Test-Path '.env')) {
  $dbPassword = (Get-Content '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1) -replace '^POSTGRES_PASSWORD=', ''
}
if ([string]::IsNullOrWhiteSpace($dbPassword)) { throw 'POSTGRES_PASSWORD est requis dans l’environnement ou le fichier .env local.' }

# Une seule passe de calcul ; l'empreinte couvre 17 montants par bulletin arrondis à 1e-6 F.
$sql = @"
with s as (
  select e.employee_number, public.compute_salary_slip(e.id, date '$Start', date '$End') as r
  from public.employees e
  where e.status = 'Active'
    and exists (select 1 from public.salary_structure_assignments a where a.employee_id = e.id and a.from_date <= date '$Start')
), t as (
  select employee_number,
         round((r->'totals'->>'gross_pay')::numeric, 6) as gross,
         round((r->'totals'->>'net_pay')::numeric, 6) as net,
         r->'totals' as totals
  from s
)
select count(*) || '|' || coalesce(sum(gross), 0) || '|' || coalesce(sum(net), 0) || '|' ||
       coalesce(md5(string_agg(employee_number || ':' || totals::text, ',' order by employee_number)), '')
from t
"@
$out = docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -v ON_ERROR_STOP=1 -Atc $sql
if ($LASTEXITCODE -ne 0) { throw 'Échec du calcul : la base locale est-elle démarrée ?' }
$p = ($out | Select-Object -Last 1).Trim() -split '\|'
$now = [ordered]@{ period = "$Start/$End"; slips = $p[0]; gross = $p[1]; net = $p[2]; fingerprint = $p[3] }
Write-Output ("Calcul {0} : {1} bulletins ; brut={2} ; net={3}" -f $now.period, $now.slips, $now.gross, $now.net)

$ref = Join-Path 'backups' ("payroll-baseline-{0}.json" -f $Start.Substring(0, 7))
if ($Save) {
  New-Item -ItemType Directory -Force backups | Out-Null
  $now | ConvertTo-Json | Set-Content -Encoding utf8 $ref
  Write-Output "Référence enregistrée : $ref"
  exit 0
}
if (-not (Test-Path $ref)) { Write-Warning "Aucune référence ($ref). Lancez d'abord : scripts\verify-payroll.ps1 -Save"; exit 3 }
$base = Get-Content $ref -Raw | ConvertFrom-Json
if ($base.fingerprint -eq $now.fingerprint) { Write-Output 'PASS aucun écart avec la référence'; exit 0 }
Write-Output ("FAIL écart : bulletins {0}->{1} ; brut {2}->{3} ; net {4}->{5}" -f $base.slips, $now.slips, $base.gross, $now.gross, $base.net, $now.net)
exit 2
