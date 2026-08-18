@echo off
chcp 65001 >nul 2>&1

set "BASE_DIR=%~dp0"
set "NODE_DIR=%BASE_DIR%node-v24.18.0-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "TSX_CLI=%BASE_DIR%node_modules\tsx\dist\cli.mjs"

set "NETWORK_PROXY_PORT=10808"
set "NETWORK_PROXY_TYPE=socks5"
set "PYTHON_PORT=5000"
set "NODE_PORT=3000"

if exist "%BASE_DIR%.env" (
    for /f "tokens=1,2 delims==" %%a in (%BASE_DIR%.env) do (
        if "%%a"=="PORT" set "NODE_PORT=%%b"
        if "%%a"=="PROXY_PORT" set "PYTHON_PORT=%%b"
        if "%%a"=="NETWORK_PROXY_PORT" set "NETWORK_PROXY_PORT=%%b"
        if "%%a"=="NETWORK_PROXY_TYPE" set "NETWORK_PROXY_TYPE=%%b"
    )
    echo [INFO] Loaded config from .env
)

set "HTTP_PROXY=%NETWORK_PROXY_TYPE%://127.0.0.1:%NETWORK_PROXY_PORT%"
set "HTTPS_PROXY=%NETWORK_PROXY_TYPE%://127.0.0.1:%NETWORK_PROXY_PORT%"

echo ============================================
echo Novel Craft Studio Launcher
echo ============================================
echo Base Dir: %BASE_DIR%
echo Node.js Dir: %NODE_DIR%
echo Network Proxy: %HTTP_PROXY%
echo ============================================
echo.

echo [INFO] Checking for existing processes on ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
    echo [INFO] Killing process PID %%a on port 3000...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 "') do (
    echo [INFO] Killing process PID %%a on port 5000...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":24678 "') do (
    echo [INFO] Killing process PID %%a on port 24678...
    taskkill /F /PID %%a >nul 2>&1
)
echo [SUCCESS] Port cleanup completed
echo.

if not exist "%NODE_EXE%" (
    echo [ERROR] node.exe not found: %NODE_EXE%
    pause
    exit /b 1
)

if not exist "%NPM_CMD%" (
    echo [ERROR] npm.cmd not found: %NPM_CMD%
    pause
    exit /b 1
)

echo [INFO] Checking Node.js version...
"%NODE_EXE%" -v
if %errorlevel% neq 0 (
    echo [ERROR] Failed to execute Node.js
    pause
    exit /b 1
)

echo.
echo [INFO] Checking dependencies...
if not exist "%BASE_DIR%node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    cd /d "%BASE_DIR%"
    "%NPM_CMD%" install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed
) else (
    echo [INFO] node_modules exists, skipping install
)

if not exist "%TSX_CLI%" (
    echo [ERROR] tsx CLI not found: %TSX_CLI%
    echo [INFO] Reinstalling dependencies...
    cd /d "%BASE_DIR%"
    "%NPM_CMD%" install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Starting Python proxy service (port %PYTHON_PORT%)...
start "Python Proxy" cmd /k "set HTTP_PROXY=%HTTP_PROXY% && set HTTPS_PROXY=%HTTPS_PROXY% && python gemini_proxy.py"
if %errorlevel% neq 0 (
    echo [WARN] Failed to start Python proxy, continuing anyway...
) else (
    echo [SUCCESS] Python proxy service started
)

timeout /t 3 /nobreak >nul

echo.
echo [INFO] Starting development server (port %NODE_PORT%)...
cd /d "%BASE_DIR%"
"%NODE_EXE%" "%TSX_CLI%" server.ts

if %errorlevel% neq 0 (
    echo [ERROR] Server failed to start
    pause
    exit /b 1
)