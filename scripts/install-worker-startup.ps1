param([ValidateSet('enable','disable')][string]$Mode='enable',[string]$NodePath,[int]$AdoptPid=0)
$ErrorActionPreference='Stop'
$projectPath=Split-Path $PSScriptRoot -Parent
$startupFolder=[Environment]::GetFolderPath('Startup')
$launcherPath=Join-Path $startupFolder 'DiscoveryWorker.vbs'
$taskName='Discovery Workspace Worker'
$marker=Join-Path $projectPath 'data\background-worker.json'
if($Mode -eq 'disable') {
    $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if($task){Disable-ScheduledTask -TaskName $taskName | Out-Null}
    if(Test-Path -LiteralPath $launcherPath){Remove-Item -LiteralPath $launcherPath}
    if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker}
    exit
}
if(-not (Test-Path -LiteralPath $NodePath -PathType Leaf)){throw 'Node executable not found.'}
$supervisor=Join-Path $PSScriptRoot 'background-worker.ps1'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$supervisor+'" -NodePath "'+$NodePath+'" -AdoptPid '+$AdoptPid
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $projectPath
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Discovery background worker with automatic restart and logs in data\worker-logs. Starts at Windows sign-in.' -Force | Out-Null
if(Test-Path -LiteralPath $launcherPath){Remove-Item -LiteralPath $launcherPath}
New-Item -ItemType Directory -Path (Split-Path $marker -Parent) -Force | Out-Null
@{taskName=$taskName;installedAt=(Get-Date -Format o);logs=(Join-Path $projectPath 'data\worker-logs')} | ConvertTo-Json | Set-Content -LiteralPath $marker
Start-ScheduledTask -TaskName $taskName
