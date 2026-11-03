$ErrorActionPreference = 'Stop'

$fixturePath = Join-Path (Get-Location) 'tests\fixtures\payroll\phase2-synthetic-cases.json'
$fixture = Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
$cases = @($fixture.cases)

if ($cases.Count -ne $fixture.test_matrix.case_count) {
  throw "Le nombre de cas synthétiques ($($cases.Count)) ne correspond pas à la matrice ($($fixture.test_matrix.case_count))."
}

$allowedTypes = @('CDI', 'CDD', 'COD', 'STAGE', 'APPRENTISSAGE', 'PRESTATION')
$invalidTypes = @($cases | Where-Object { $_.employment_type -notin $allowedTypes })
if ($invalidTypes.Count -gt 0) {
  throw 'La fixture contient un type de contrat invalide.'
}

$requiredKinds = @('absence_hours', 'sick_leave_hours', 'overtime_hours')
foreach ($kind in $requiredKinds) {
  if (@($cases | Where-Object { [decimal]$_.$kind -gt 0 }).Count -eq 0) {
    throw "La fixture ne couvre pas le scénario $kind."
  }
}

if (@($cases | Where-Object { [decimal]$_.ir_parts -lt 1 -or [decimal]$_.ir_parts -gt 5 }).Count -gt 0) {
  throw 'La fixture contient des parts IR hors limites.'
}
if (@($cases | Where-Object { [decimal]$_.trimf_parts -lt 1 }).Count -gt 0) {
  throw 'La fixture contient des parts TRIMF invalides.'
}

$container = 'soma-rh-local-postgres-1'
$dbPassword = $env:POSTGRES_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPassword) -and (Test-Path '.env')) {
  $dbPassword = (Get-Content '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1) -replace '^POSTGRES_PASSWORD=', ''
}
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
  throw 'POSTGRES_PASSWORD est requis dans l’environnement ou le fichier .env local.'
}
$pass = 0
$fail = 0
foreach ($case in $cases) {
  $index = [array]::IndexOf($cases, $case)
  $gross = 150000 + ($index * 25000)
  $parts = [decimal]$case.ir_parts
  $trimfParts = [decimal]$case.trimf_parts
  $partsSql = $parts.ToString([Globalization.CultureInfo]::InvariantCulture)
  $trimfPartsSql = $trimfParts.ToString([Globalization.CultureInfo]::InvariantCulture)
  $sql = @"
select
  (public.compute_income_tax($gross, $partsSql, date '2026-08-01')->>'monthly_tax')::numeric,
  public.compute_trimf($gross, $trimfPartsSql, date '2026-08-01')
"@
  $result = docker exec $container env "PGPASSWORD=$dbPassword" psql -w -U soma -d soma_rh -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "Échec du calcul fiscal pour $($case.case_id)." }
  $values = ($result | Select-Object -Last 1) -split '\|'
  if ($values.Count -ne 2 -or [decimal]$values[0] -lt 0 -or [decimal]$values[1] -lt 0) {
    Write-Output "FAIL $($case.case_id): sortie fiscale invalide"
    $fail++
  } else {
    $pass++
  }
}

$contractSummary = ($cases | Group-Object employment_type | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ', '
Write-Output "PASS fixture structure: $($cases.Count) cas; contrats: $contractSummary"
Write-Output "PASS couverture: absence, maladie, heures supplémentaires, IR 1..5 parts"
Write-Output "PASS calculs fiscaux non destructifs: $pass"
if ($fail -gt 0) {
  Write-Output "FAIL calculs fiscaux: $fail"
  exit 1
}
