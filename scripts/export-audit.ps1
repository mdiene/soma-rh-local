# L1-05 : exporte le journal d'audit hors de la base (une ligne JSON par événement) et vérifie la chaîne.
# Le fichier contient des adresses de comptes et des motifs : il reste dans backups/ (ignoré par Git).
# Comparer l'empreinte de tête avec une exportation précédente prouve qu'aucune ligne ancienne n'a été modifiée.
$ErrorActionPreference = 'Stop'

$container = 'soma-rh-local-postgres-1'
$dbPassword = $env:POSTGRES_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPassword) -and (Test-Path '.env')) {
  $dbPassword = (Get-Content '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1) -replace '^POSTGRES_PASSWORD=', ''
}
if ([string]::IsNullOrWhiteSpace($dbPassword)) { throw 'POSTGRES_PASSWORD est requis dans l’environnement ou le fichier .env local.' }

function Invoke-Db([string]$sql) {
  $out = docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -v ON_ERROR_STOP=1 -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "Échec SQL: $sql" }
  return $out
}

$breaks = [int](Invoke-Db 'select count(*) from public.audit_verify()' | Select-Object -Last 1)
$head = (Invoke-Db 'select chain_pos || chr(124) || row_hash from public.audit_log where chain_pos is not null order by chain_pos desc limit 1' | Select-Object -Last 1).Split('|')

New-Item -ItemType Directory -Force backups | Out-Null
$file = Join-Path 'backups' ("audit-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Invoke-Db 'select row_to_json(l) from public.audit_log l order by chain_pos' | Set-Content -Encoding utf8 $file

Write-Output ("Export : {0}" -f $file)
Write-Output ("Lignes : {0} ; tête de chaîne : position {1}, empreinte {2}" -f (Get-Content $file | Measure-Object).Count, $head[0], $head[1])
if ($breaks -eq 0) { Write-Output 'PASS chaîne intacte' } else { Write-Output ("FAIL {0} rupture(s) détectée(s) (select * from audit_verify())" -f $breaks); exit 2 }
