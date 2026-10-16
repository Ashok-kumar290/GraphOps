param([int]$Port = 8080, [switch]$Rebuild)
$ErrorActionPreference = 'Stop'
$eventRoot = $PSScriptRoot
Push-Location $eventRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 or newer, then run start.ps1 again.' }
    $nodeVersion = & node --version
    if ([int](($nodeVersion -replace '^v','').Split('.')[0]) -lt 24) { throw 'Node.js 24 or newer is required.' }
    $pythonPath = Join-Path $eventRoot '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $pythonPath)) { $pythonPath = Join-Path (Split-Path $eventRoot -Parent) '.venv/Scripts/python.exe' }
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        & python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.13+ is required to create the environment.' }
        $pythonPath = Join-Path $eventRoot '.venv/Scripts/python.exe'
    }
    & $pythonPath -m graphops.bootstrap dependencies
    if ($LASTEXITCODE -ne 0) {
        & $pythonPath -m pip install -r requirements.lock
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    $config = (& $pythonPath -m graphops.bootstrap configuration) | ConvertFrom-Json
    function Test-GraphOpsDatabase {
        & $pythonPath -m graphops.bootstrap database
        return $LASTEXITCODE -eq 0
    }
    function Test-GraphOpsDocker {
        # Windows PowerShell treats redirected native stderr as an error record.
        # An unavailable daemon is expected here; inspect the exit code instead.
        $previousErrorAction = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
            return $LASTEXITCODE -eq 0
        } finally { $ErrorActionPreference = $previousErrorAction }
    }
    if (-not (Test-GraphOpsDatabase)) {
        if ($config.db_host -notin @('localhost','127.0.0.1') -or $config.db_port -ne 6379) { throw 'The configured external database is unavailable. Restore that connection, then retry.' }
        if (-not (Test-GraphOpsDocker)) {
            $desktop = @(
                (Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe')
                (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe')
            ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
            if (-not $desktop) { throw 'Install Docker Desktop and start it, then retry.' }
            Start-Process -FilePath $desktop -WindowStyle Hidden
            Write-Host 'Waiting for Docker Desktop...'
            for ($attempt=0; $attempt -lt 60; $attempt++) {
                Start-Sleep -Seconds 2
                if (Test-GraphOpsDocker) { break }
            }
            if (-not (Test-GraphOpsDocker)) { throw 'Docker Desktop did not become ready.' }
        }
        $candidates = @(& docker ps -a --filter publish=6379 --format '{{.ID}}')
        $matching = @($candidates | Where-Object { ((& docker inspect --format '{{.Config.Image}}' $_) -like 'falkordb/falkordb*') })
        if ($matching.Count -eq 1) { & docker start $matching[0] | Out-Null }
        elseif ($matching.Count -gt 1) { throw 'Multiple existing FalkorDB containers use port 6379. Start the intended database manually to preserve its data.' }
        else {
            $occupied = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
            if ($occupied) { throw 'Port 6379 is occupied by another service. Configure the intended FalkorDB connection.' }
            $existing = & docker ps -a --filter name=^/graphops-local-db$ --format '{{.ID}}'
            if ($existing) { & docker start $existing | Out-Null }
            else { & docker run -d --name graphops-local-db -p 127.0.0.1:6379:6379 -v graphops-local-db:/var/lib/falkordb/data -e 'REDIS_ARGS=--save 60 1' falkordb/falkordb@sha256:107455e862a824e45e8e9f5a7fbfdf5e00a08b14e13eae2577c72fd9e3f59ba6 | Out-Null }
        }
        for ($attempt=0; $attempt -lt 30; $attempt++) { if (Test-GraphOpsDatabase) { break }; Start-Sleep -Seconds 1 }
        if (-not (Test-GraphOpsDatabase)) { throw 'FalkorDB did not become ready.' }
    }
    if ($config.provider -eq 'ollama') {
        $ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
        $ollamaPath = if ($ollamaCommand) { $ollamaCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe' }
        if (-not (Test-Path -LiteralPath $ollamaPath)) { throw 'Install Ollama from https://ollama.com, then retry. The selected local model needs no API key.' }
        try { $models = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 }
        catch {
            Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
            for ($attempt=0; $attempt -lt 20; $attempt++) { Start-Sleep -Seconds 1; try { $models = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; break } catch {} }
            if (-not $models) { throw 'Ollama did not become ready.' }
        }
        if ($config.model -notin @($models.models.name)) {
            Write-Host "Downloading local model $($config.model). This is a one-time download."
            & $ollamaPath pull $config.model
            if ($LASTEXITCODE -ne 0) { throw 'The model download failed.' }
        }
    } elseif (-not $config.configured) { throw 'Configure a provider first with: python -m graphops.cli configure --provider groq' }
    $existingApp = $null
    try { $existingApp = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3 } catch {}
    if ($existingApp -and $existingApp.ready) { Write-Host "GraphOps is already running at http://localhost:$Port"; return }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied. If GraphOps is reconnecting, wait a few seconds and refresh its page." }
    $webOutput = Join-Path $eventRoot 'web/dist/index.html'
    $binary = Join-Path $eventRoot '.runtime/lab.exe'
    $needsBuild = $Rebuild -or -not (Test-Path -LiteralPath $webOutput) -or -not (Test-Path -LiteralPath $binary)
    if (-not $needsBuild) {
        $latestWeb = Get-ChildItem -LiteralPath (Join-Path $eventRoot 'web/src') -File -Recurse | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        $needsBuild = $latestWeb.LastWriteTimeUtc -gt (Get-Item -LiteralPath $webOutput).LastWriteTimeUtc -or (Get-Item -LiteralPath (Join-Path $eventRoot 'lab/main.go')).LastWriteTimeUtc -gt (Get-Item -LiteralPath $binary).LastWriteTimeUtc
    }
    if ($needsBuild) { & (Join-Path $eventRoot 'build.ps1'); if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } }
    & (Join-Path $eventRoot 'launch.ps1') -Port $Port
} finally { Pop-Location }
