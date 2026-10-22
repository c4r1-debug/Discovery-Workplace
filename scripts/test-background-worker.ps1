param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('discovery-supervisor-test-'+[guid]::NewGuid())
$testScripts=Join-Path $testRoot 'scripts'
New-Item -ItemType Directory -Path $testScripts -Force | Out-Null
# Exercise the actual supervisor with an isolated crashing worker and a shorter test-only delay.
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'background-worker.ps1') -Raw
if(-not $source.Contains('Start-Sleep -Seconds 60')){throw 'Production restart delay changed; update this check.'}
$source.Replace('Start-Sleep -Seconds 60','Start-Sleep -Seconds 1') | Set-Content -LiteralPath (Join-Path $testScripts 'background-worker.ps1')
'console.log("synthetic worker output"); console.error("synthetic worker failure"); process.exit(7);' | Set-Content -LiteralPath (Join-Path $testScripts 'worker.mjs')
$scriptPath=Join-Path $testScripts 'background-worker.ps1'
$runner=Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$scriptPath+'" -NodePath "'+$NodePath+'"') -WindowStyle Hidden -PassThru
try{
    $logFolder=Join-Path $testRoot 'data\worker-logs'
    $deadline=(Get-Date).AddSeconds(20)
    do{Start-Sleep -Milliseconds 500;$outputs=@(Get-ChildItem -LiteralPath $logFolder -Filter '*-output.log' -ErrorAction SilentlyContinue)}while($outputs.Count -lt 2 -and (Get-Date) -lt $deadline)
    if($outputs.Count -lt 2){throw 'Worker was not restarted after its simulated crash.'}
    $errors=Get-ChildItem -LiteralPath $logFolder -Filter '*-errors.log'
    if(-not (Get-Content -LiteralPath $errors[0].FullName -Raw).Contains('synthetic worker failure')){throw 'Worker error was not persisted.'}
    if(-not (Get-Content -LiteralPath $outputs[0].FullName -Raw).Contains('synthetic worker output')){throw 'Worker output was not persisted.'}
    if(-not (Get-Content -LiteralPath (Join-Path $logFolder 'supervisor.log') -Raw).Contains('Worker exited:')){throw 'Exit was not logged.'}
    Write-Output 'PASS: isolated worker crash triggers restart; stdout, stderr and lifecycle logs persist.'
}finally{
    # This PID is the supervisor just created for the temporary test fixture, never the live worker.
    if(-not $runner.HasExited){& taskkill.exe /PID $runner.Id /T /F | Out-Null}
}
