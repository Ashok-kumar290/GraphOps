$ErrorActionPreference = 'Stop'
$eventRoot = $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $eventRoot '.runtime') | Out-Null
Push-Location $eventRoot
try {
    if (Get-Command go -ErrorAction SilentlyContinue) {
        & go build -C lab -o (Join-Path $eventRoot '.runtime/lab.exe') .
    } else {
        & docker run --rm --mount "type=bind,source=$eventRoot,target=/src" -w /src/lab -e GOOS=windows -e GOARCH=amd64 golang:1.25-alpine@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 go build -o /src/.runtime/lab.exe .
    }
    if ($LASTEXITCODE -ne 0) { throw 'Go lab build failed.' }
    Push-Location (Join-Path $eventRoot 'web')
    try {
        & npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }
