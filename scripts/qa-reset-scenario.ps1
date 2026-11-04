param(
  [Parameter(Mandatory)][ValidateSet('pme-25','pme-80','eti-200','grande-1000')][string]$Scenario,
  [switch]$NoBackup,
  [switch]$ResetOnly   # supprime les données QA sans en recréer
)
# Recharge un scénario de test fictif (salariés QA*). Les salariés d'origine ne sont jamais modifiés.
# Rejouable : deux exécutions produisent la même empreinte (affichée à la fin).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = @{ 'pme-25' = @(25,0); 'pme-80' = @(80,1); 'eti-200' = @(210,1); 'grande-1000' = @(1050,1) }
$n, $extras = $cfg[$Scenario]
$psql = @('exec','-i','soma-rh-local-postgres-1','psql','-U','soma','-d','soma_rh','-q','-v','ON_ERROR_STOP=1')

if (-not $NoBackup) { & "$PSScriptRoot\local-backup.ps1" | Out-Host }

$reset = Get-Content "$root\tests\fixtures\qa\reset.sql" -Raw -Encoding UTF8
if ($ResetOnly) { $reset | docker @psql; Write-Output "Données QA supprimées."; exit 0 }

$gen = (Get-Content "$root\tests\fixtures\qa\generate.sql" -Raw -Encoding UTF8) -replace '(?m)^\\i .*$', ''
($reset + "`n" + $gen) | docker @psql -v "n=$n" -v "extras=$extras" -v "scenario=$Scenario"
if ($LASTEXITCODE -ne 0) { throw "Le chargement du scénario a échoué." }

$fp = "select md5(string_agg(employee_number||first_name||last_name||employment_type||ir_parts,',' order by employee_number)) from employees where employee_number like 'QA%'"
$print = docker exec soma-rh-local-postgres-1 psql -U soma -d soma_rh -tAc $fp
Write-Output "Scénario $Scenario chargé ($n salariés QA). Empreinte : $print"
