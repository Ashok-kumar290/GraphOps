# Connected CLI for this checkout. Keep start.ps1 running in another terminal.
$ErrorActionPreference = 'Stop'
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    $taskPython = Join-Path (Split-Path $PSScriptRoot -Parent) '.venv/Scripts/python.exe'
}
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run start.ps1 once to set up Python dependencies.' }
$taskArguments = @($args)
if ($taskArguments.Count -eq 0) { $taskArguments = @('--help') }
Push-Location -LiteralPath $PSScriptRoot
try {
    & $taskPython -m graphops.cli @taskArguments
    $taskExit = $LASTEXITCODE
} finally { Pop-Location }
exit $taskExit
