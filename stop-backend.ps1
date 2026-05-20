$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = @(8081, 18080, 18081, 19090)

$targets = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort } |
    Select-Object -Property LocalPort, OwningProcess -Unique

if (-not $targets) {
    Write-Host "No backend listener found on ports: $($ports -join ', ')."
    exit 0
}

$stopped = @()
foreach ($target in $targets) {
    $processId = $target.OwningProcess
    if ($processId -and $processId -ne 0) {
        try {
            $proc = Get-Process -Id $processId -ErrorAction Stop
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $stopped += [PSCustomObject]@{
                PID = $processId
                Process = $proc.ProcessName
                Port = $target.LocalPort
            }
        } catch {
            Write-Host "Failed to stop PID $processId on port $($target.LocalPort): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "No process was stopped."
    exit 1
}

$stopped | ForEach-Object {
    Write-Host "Stopped $($_.Process) (PID $($_.PID)) on port $($_.Port)." -ForegroundColor Green
}
