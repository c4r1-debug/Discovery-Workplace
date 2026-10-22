param([Parameter(Mandatory=$true)][string]$NodePath,[int]$AdoptPid=0)
$ErrorActionPreference='Stop'
$projectPath=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectPath
$workerPath=Join-Path $PSScriptRoot 'worker.mjs'
$logFolder=Join-Path $projectPath 'data\worker-logs'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
function Write-WorkerLog([string]$Message) {
    Add-Content -LiteralPath (Join-Path $logFolder 'supervisor.log') -Value ((Get-Date -Format o)+' '+$Message)
}
Write-WorkerLog 'Background supervisor started.'
# Keep a pre-existing interactive scrape intact; take over only after that process exits.
if($AdoptPid -gt 0){
    $existing=Get-CimInstance Win32_Process -Filter "ProcessId=$AdoptPid" -ErrorAction SilentlyContinue
    if($existing.Name -eq 'node.exe' -and $existing.CommandLine -match 'scripts[/\\]worker\.mjs'){
        Write-WorkerLog "Monitoring existing worker PID $AdoptPid; its active scrape is unchanged."
        $adopted=Get-Process -Id $AdoptPid -ErrorAction SilentlyContinue
        if($adopted){$adopted.WaitForExit()}
        Write-WorkerLog 'Previous worker exited. Waiting for its heartbeat lease to expire.'
        Start-Sleep -Seconds 60
    }
}
while($true){
    try{
        if(-not (Test-Path -LiteralPath $NodePath -PathType Leaf)){throw 'Configured Node executable is missing.'}
        $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdout=Join-Path $logFolder "$stamp-output.log"
        $stderr=Join-Path $logFolder "$stamp-errors.log"
        $child=Start-Process -FilePath $NodePath -ArgumentList ('"'+$workerPath+'"') -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        Write-WorkerLog "Worker started: PID $($child.Id). Logs: $stamp"
        $child.WaitForExit()
        Write-WorkerLog "Worker exited: PID $($child.Id), exit code $($child.ExitCode). Restart in 60 seconds."
    }catch{Write-WorkerLog ('Launch failed: '+$_.Exception.Message+'. Retry in 60 seconds.')}
    Start-Sleep -Seconds 60
}
