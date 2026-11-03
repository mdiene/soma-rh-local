param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) {
  throw "Fichier de sauvegarde introuvable: $resolvedBackup"
}

$confirmation = Read-Host "Cette opération remplace les données locales de soma_rh. Taper RESTAURER pour continuer"
if ($confirmation -cne 'RESTAURER') { throw 'Restauration annulée.' }

$remote = '/tmp/soma-rh-restore.dump'
docker cp $resolvedBackup "soma-rh-local-postgres-1:$remote"
if ($LASTEXITCODE -ne 0) { throw 'Impossible de copier la sauvegarde dans le conteneur.' }
docker exec soma-rh-local-postgres-1 pg_restore -U soma -d soma_rh --clean --if-exists --no-owner $remote
$restoreExit = $LASTEXITCODE
docker exec soma-rh-local-postgres-1 rm $remote
if ($restoreExit -ne 0) { throw 'La restauration PostgreSQL a échoué.' }
Write-Output 'Restauration terminée.'
