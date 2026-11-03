$ErrorActionPreference = 'Stop'

if (-not $env:SOURCE_DATABASE_URL) {
  throw 'SOURCE_DATABASE_URL est requis.'
}
if (-not $env:TARGET_DATABASE_URL) {
  throw 'TARGET_DATABASE_URL est requis.'
}

$dumpPath = Join-Path (Get-Location) '.migration-data.dump'
Write-Host 'Vérification de la base source...'
& pg_isready -d $env:SOURCE_DATABASE_URL
if ($LASTEXITCODE -ne 0) {
  throw 'La base source est inaccessible. Vérifiez la chaîne de connexion et le mot de passe.'
}

Write-Host 'Export des données source...'
& pg_dump --format=custom --data-only --no-owner --no-acl `
  --schema=public --dbname=$env:SOURCE_DATABASE_URL --file=$dumpPath
if ($LASTEXITCODE -ne 0) {
  throw 'pg_dump a échoué.'
}

Write-Host 'Import vers la base cible...'
& pg_restore --clean --if-exists --no-owner --no-acl --dbname=$env:TARGET_DATABASE_URL $dumpPath
if ($LASTEXITCODE -ne 0) {
  throw 'pg_restore a échoué.'
}

Remove-Item -LiteralPath $dumpPath -Force
Write-Warning 'Les comptes d’authentification ne sont pas exportés par pg_dump public. Recréez-les via la passerelle JWT.'
Write-Host 'Migration des données publiques terminée. Le fichier temporaire a été supprimé.'
