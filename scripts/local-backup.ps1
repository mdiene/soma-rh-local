param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $resolvedOutput "soma-rh-$stamp.dump"

docker exec soma-rh-local-postgres-1 pg_dump -U soma -d soma_rh -Fc --no-owner --file "/tmp/$stamp.dump"
if ($LASTEXITCODE -ne 0) { throw 'La sauvegarde PostgreSQL a échoué.' }
docker cp "soma-rh-local-postgres-1:/tmp/$stamp.dump" $archive
if ($LASTEXITCODE -ne 0) { throw 'La récupération de la sauvegarde a échoué.' }
docker exec soma-rh-local-postgres-1 rm "/tmp/$stamp.dump"
Write-Output "Sauvegarde créée: $archive"
