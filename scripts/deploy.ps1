$ErrorActionPreference = 'Stop'
# Keys stay in memory; never echo the environment file or CLI env-set responses.
$taskEnv = @{}
Get-Content -LiteralPath '.env.local' | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $taskEnv[$matches[1]] = $matches[2] }
}
$taskEnv['NEXT_PUBLIC_APP_URL'] = 'https://tyhutf3c.insforge.site'
if ($taskEnv['EMBEDDING_PROVIDER'] -notin @('minilm','hashed')) { throw 'EMBEDDING_PROVIDER must explicitly be minilm or hashed' }
# Production provider is managed in deployment settings, never overwritten here.
$live = Invoke-RestMethod -Uri ($taskEnv['NEXT_PUBLIC_APP_URL'] + '/api/health/embedding')
if ($live.provider -ne $taskEnv['EMBEDDING_PROVIDER']) { throw "Provider mismatch: local=$($taskEnv['EMBEDDING_PROVIDER']); production=$($live.provider). Configure and verify a deliberate provider transition first." }
if (-not $taskEnv.ContainsKey('SHOW_MATCH_PERCENT')) { $taskEnv['SHOW_MATCH_PERCENT'] = 'true' }
foreach ($envKey in @('NEXT_PUBLIC_INSFORGE_URL','NEXT_PUBLIC_INSFORGE_ANON_KEY','INSFORGE_API_KEY','NEXT_PUBLIC_APP_URL','SHOW_MATCH_PERCENT','HEALTH_TOKEN','EMBEDDING_WRITES_PAUSED')) {
    if (-not $taskEnv[$envKey]) { throw "Missing deployment variable: $envKey" }
    $envOutput = & npx -y @insforge/cli deployments env set $envKey $taskEnv[$envKey] --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Could not set $envKey. CLI exit: $LASTEXITCODE" }
    Write-Output "Configured $envKey"
}
& npx -y @insforge/cli deployments deploy . --json
if ($LASTEXITCODE -ne 0) { throw 'Deployment did not finish successfully. Inspect deployments list/status before retrying.' }

$after = Invoke-RestMethod -Uri ($taskEnv['NEXT_PUBLIC_APP_URL'] + '/api/health/embedding')
if ($after.provider -ne $taskEnv['EMBEDDING_PROVIDER']) { throw 'Deployed provider differs from .env.local; keep embedding writes paused.' }
