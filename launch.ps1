param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$eventRoot = $PSScriptRoot
$pythonPath = Join-Path $eventRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $pythonPath = Join-Path (Split-Path $eventRoot -Parent) '.venv/Scripts/python.exe'
}
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Create .venv and install requirements.txt first.' }
Push-Location $eventRoot
try { & $pythonPath -m graphops serve --port $Port; exit $LASTEXITCODE }
finally { Pop-Location }
