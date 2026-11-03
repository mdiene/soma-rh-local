param(
  [switch]$Volumes
)

$ErrorActionPreference = 'Stop'
if (-not $Volumes) {
  Write-Output 'Arrêt des services sans supprimer les volumes PostgreSQL.'
  docker compose stop
  exit $LASTEXITCODE
}

$confirmation = Read-Host "Supprimer les volumes locaux PostgreSQL et pgAdmin ? Taper RESET-SOMA pour continuer"
if ($confirmation -cne 'RESET-SOMA') { throw 'Reset annulé.' }
docker compose down --volumes
if ($LASTEXITCODE -ne 0) { throw 'Le reset Docker a échoué.' }
docker compose up -d postgres postgrest api pgadmin
if ($LASTEXITCODE -ne 0) { throw 'Le redémarrage après reset a échoué.' }
Write-Output 'Reset terminé. Les migrations sont appliquées par l’image PostgreSQL au démarrage.'
