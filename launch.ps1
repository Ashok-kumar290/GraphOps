param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$eventRoot = $PSScriptRoot
$pythonPath = Join-Path $eventRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $pythonPath = Join-Path (Split-Path $eventRoot -Parent) '.venv/Scripts/python.exe'
}
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Create .venv and install requirements.lock first.' }
Push-Location $eventRoot
try {
    $env:GRAPHOPS_PYTHON = $pythonPath
    $env:PORT = "$Port"
    & node (Join-Path $eventRoot 'web/server.ts')
    exit $LASTEXITCODE
}
finally { Pop-Location }
