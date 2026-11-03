$ErrorActionPreference = 'Stop'

docker compose ps

$checks = @(
  @{ Name = 'PostgreSQL'; Command = 'docker exec soma-rh-local-postgres-1 pg_isready -U soma -d soma_rh' },
  @{ Name = 'pgAdmin'; Command = 'Invoke-WebRequest -UseBasicParsing http://localhost:5051/misc/ping' },
  @{ Name = 'Frontend'; Command = 'Invoke-WebRequest -UseBasicParsing http://localhost:5173' }
)

foreach ($check in $checks) {
  try {
    Invoke-Expression $check.Command | Out-Null
    Write-Output ("PASS {0}" -f $check.Name)
  } catch {
    Write-Error ("FAIL {0}: {1}" -f $check.Name, $_.Exception.Message)
  }
}

$row = docker exec soma-rh-local-postgres-1 psql -U soma -d soma_rh -Atc "select current_database() || ':' || current_user || ':' || count(*) from public.employees;"
if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire la base locale.' }
Write-Output ("PASS Données locales: {0}" -f $row)
