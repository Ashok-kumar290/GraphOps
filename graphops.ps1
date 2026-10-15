# Connected CLI for this checkout. Keep start.ps1 running in another terminal.
$ErrorActionPreference = 'Stop'
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    $taskPython = Join-Path (Split-Path $PSScriptRoot -Parent) '.venv/Scripts/python.exe'
}
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run start.ps1 once to set up Python dependencies.' }
$taskArguments = @($args)
if ($taskArguments.Count -eq 0) { $taskArguments = @('--help') }
$taskPreviousPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = $PSScriptRoot
    if ($taskPreviousPythonPath) { $env:PYTHONPATH += [IO.Path]::PathSeparator + $taskPreviousPythonPath }
    & $taskPython -m graphops.cli @taskArguments
    $taskExit = $LASTEXITCODE
} finally { $env:PYTHONPATH = $taskPreviousPythonPath }
exit $taskExit
