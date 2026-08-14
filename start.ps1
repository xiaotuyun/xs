$env:PYTHONUNBUFFERED = "1"

$baseDir = $PWD.Path

$networkProxyPort = "10808"
$networkProxyType = "socks5"
$pythonPort = "5000"
$nodePort = "3000"

$envFile = Join-Path $baseDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([^#=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim('"',"'")
            if ($key -eq "PORT") { $nodePort = $value }
            if ($key -eq "PROXY_PORT") { $pythonPort = $value }
            if ($key -eq "NETWORK_PROXY_PORT") { $networkProxyPort = $value }
            if ($key -eq "NETWORK_PROXY_TYPE") { $networkProxyType = $value }
            if ($key -eq "HTTP_PROXY") { $env:HTTP_PROXY = $value }
            if ($key -eq "HTTPS_PROXY") { $env:HTTPS_PROXY = $value }
        }
    }
    Write-Host "[INFO] Loaded config from .env" -ForegroundColor Green
}

if (-not $env:HTTP_PROXY) {
    $env:HTTP_PROXY = "$networkProxyType`://127.0.0.1`:$networkProxyPort"
}
if (-not $env:HTTPS_PROXY) {
    $env:HTTPS_PROXY = "$networkProxyType`://127.0.0.1`:$networkProxyPort"
}

$nodeDir = Join-Path $baseDir "node-v24.18.0-win-x64"
$nodeExe = Join-Path $nodeDir "node.exe"
$npmCmd = Join-Path $nodeDir "npm.cmd"
$tsxCli = Join-Path $baseDir "node_modules\tsx\dist\cli.mjs"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "         Novel Craft Studio Launcher" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Base Dir: $baseDir" -ForegroundColor White
Write-Host "Node.js Dir: $nodeDir" -ForegroundColor White
Write-Host "Network Proxy: $($env:HTTP_PROXY)" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[INFO] Checking for existing processes on ports..." -ForegroundColor Yellow
$ports = @([int]$nodePort, [int]$pythonPort, 24678)
foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $processes) {
        Write-Host "[INFO] Killing process PID $procId on port $port..." -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "[SUCCESS] Port cleanup completed" -ForegroundColor Green
Write-Host ""

if (-not (Test-Path $nodeExe)) {
    Write-Host "[ERROR] node.exe not found: $nodeExe" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $npmCmd)) {
    Write-Host "[ERROR] npm.cmd not found: $npmCmd" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[INFO] Checking Node.js version..." -ForegroundColor Yellow
& $nodeExe -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to execute Node.js" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[INFO] Checking dependencies..." -ForegroundColor Yellow
$nodeModulesDir = Join-Path $baseDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "[INFO] node_modules not found, installing dependencies..." -ForegroundColor Yellow
    Set-Location $baseDir
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[SUCCESS] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "[INFO] node_modules exists, skipping install" -ForegroundColor Green
}

if (-not (Test-Path $tsxCli)) {
    Write-Host "[ERROR] tsx CLI not found: $tsxCli" -ForegroundColor Red
    Write-Host "[INFO] Reinstalling dependencies..." -ForegroundColor Yellow
    Set-Location $baseDir
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "[INFO] Starting Python proxy service (port $pythonPort)..." -ForegroundColor Yellow
$pythonProcess = Start-Process -FilePath "python" -ArgumentList "gemini_proxy.py" -NoNewWindow -PassThru
Write-Host "[SUCCESS] Python proxy service started (PID: $($pythonProcess.Id))" -ForegroundColor Green

Write-Host ""
Write-Host "[INFO] Waiting 3 seconds for Python proxy to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[INFO] Starting development server (port $nodePort)..." -ForegroundColor Yellow
Write-Host ""

Set-Location $baseDir
& $nodeExe $tsxCli server.ts

Stop-Process -Id $pythonProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "[INFO] Python proxy service stopped" -ForegroundColor Yellow