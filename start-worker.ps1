$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$discoveryNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $discoveryNode) { $discoveryExe = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' } else { $discoveryExe = $discoveryNode.Source }
& $discoveryExe 'scripts/worker.mjs'
