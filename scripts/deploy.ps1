$ErrorActionPreference = 'Stop'
# Keys stay in memory; never echo the environment file or CLI env-set responses.
$taskEnv = @{}
Get-Content -LiteralPath '.env.local' | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $taskEnv[$matches[1]] = $matches[2] }
}
$taskEnv['NEXT_PUBLIC_APP_URL'] = 'https://tyhutf3c.insforge.site'
$taskEnv['EMBEDDING_PROVIDER'] = 'hashed'
foreach ($envKey in @('NEXT_PUBLIC_INSFORGE_URL','NEXT_PUBLIC_INSFORGE_ANON_KEY','INSFORGE_API_KEY','NEXT_PUBLIC_APP_URL','EMBEDDING_PROVIDER','MATCH_MODE')) {
    if (-not $taskEnv[$envKey]) { throw "Missing deployment variable: $envKey" }
    $envOutput = & npx -y @insforge/cli deployments env set $envKey $taskEnv[$envKey] --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Could not set $envKey. CLI exit: $LASTEXITCODE" }
    Write-Output "Configured $envKey"
}
& npx -y @insforge/cli deployments deploy . --json
if ($LASTEXITCODE -ne 0) { throw 'Deployment did not finish successfully. Inspect deployments list/status before retrying.' }
