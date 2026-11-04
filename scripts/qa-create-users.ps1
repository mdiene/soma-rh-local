# Crée les comptes de test (un par rôle) via l'API locale. Mots de passe jetables générés ici,
# écrits uniquement dans tests/.env.qa (ignoré par Git) et jamais affichés.
# Rejouable : supprime d'abord les comptes qa-*@example.test.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$api = 'http://localhost:8000'
$sql = { param($q) docker exec soma-rh-local-postgres-1 psql -U soma -d soma_rh -tA -c $q }

& $sql "delete from auth.users where email like 'qa-%@example.test'" | Out-Null

# rôle -> salarié QA rattaché (salarie et manager ont un dossier salarié)
$accounts = [ordered]@{ admin = $null; rh = $null; paie = $null; manager = 'QA0013'; salarie = 'QA0011'; salarie2 = 'QA0012' }
$lines = @("# Généré par scripts/qa-create-users.ps1 - ne jamais commiter", "QA_API_URL=$api")
foreach ($k in $accounts.Keys) {
  $role = $k -replace '\d+$',''
  $email = "qa-$k@example.test"
  $bytes = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pwd = 'Qa!' + [Convert]::ToBase64String($bytes).Replace('/','x').Replace('+','y')
  $body = @{ email = $email; password = $pwd } | ConvertTo-Json
  $res = Invoke-RestMethod -Method Post -Uri "$api/auth/v1/signup" -ContentType 'application/json' -Body $body
  $uid = $res.user.id
  & $sql "insert into user_roles(user_id, role) values ('$uid', '$role')" | Out-Null
  if ($accounts[$k]) { & $sql "update employees set user_id = '$uid' where employee_number = '$($accounts[$k])'" | Out-Null }
  $lines += "QA_$($k.ToUpper())_EMAIL=$email"
  $lines += "QA_$($k.ToUpper())_PASSWORD=$pwd"
}
$lines | Set-Content "$root\tests\.env.qa" -Encoding UTF8
Write-Output "Comptes créés : $($accounts.Keys -join ', '). Identifiants dans tests/.env.qa (hors Git)."
