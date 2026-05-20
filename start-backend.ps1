$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCandidates = @(
    (Join-Path $root ".venv\Scripts\python.exe"),
    "python"
)

$python = $null
foreach ($candidate in $pythonCandidates) {
    if ($candidate -eq "python") {
        $cmd = Get-Command python -ErrorAction SilentlyContinue
        if ($cmd) {
            $python = "python"
            break
        }
    } elseif (Test-Path $candidate) {
        $python = $candidate
        break
    }
}

if (-not $python) {
    Write-Host "Python not found. Please install Python or create .venv first." -ForegroundColor Red
    exit 1
}

$ports = @(8081, 18080, 18081, 19090)
$existing = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort }

if ($existing) {
    $existingInfo = $existing |
        Select-Object -First 1 |
        ForEach-Object {
            $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                Port = $_.LocalPort
                PID = $_.OwningProcess
                Process = if ($proc) { $proc.ProcessName } else { "Unknown" }
            }
        }

    Write-Host "Backend already listening on port $($existingInfo.Port) (PID $($existingInfo.PID), $($existingInfo.Process))." -ForegroundColor Yellow
    Write-Host "Open: http://127.0.0.1:$($existingInfo.Port)/"
    exit 0
}

$proc = Start-Process -FilePath $python -ArgumentList "backend/server.py" -WorkingDirectory $root -PassThru
Write-Host "Backend start requested. PID: $($proc.Id)"

Start-Sleep -Milliseconds 600

$listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -eq $proc.Id -and $ports -contains $_.LocalPort } |
    Select-Object -First 1

if ($listen) {
    Write-Host "Backend running at: http://127.0.0.1:$($listen.LocalPort)/" -ForegroundColor Green
} else {
    Write-Host "Backend process started (PID $($proc.Id)). If page is not reachable yet, wait 1-2 seconds and refresh." -ForegroundColor Yellow
    Write-Host "Try: http://127.0.0.1:8081/"
}
