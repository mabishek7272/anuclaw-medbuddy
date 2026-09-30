@echo off
REM ============================================================
REM  ANUClaw v3 - one-click launcher (Windows)
REM  Starts the full stack (API + Dashboard + CDS), waits until
REM  it is healthy, prints ALL CLEAR and the links.
REM ============================================================
setlocal
title ANUClaw v3 - Launcher
cd /d "%~dp0"

echo.
echo  ============================================================
echo    ANUClaw v3  -  starting the full stack
echo  ============================================================
echo.

REM --- default ports (overridden by .env if present) ---
set "API_PORT=4000"
set "DASH_PORT=3722"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,2 delims==" %%a in (".env") do (
    if /i "%%a"=="API_PORT" set "API_PORT=%%b"
    if /i "%%a"=="DASHBOARD_PORT" set "DASH_PORT=%%b"
  )
)

REM --- Node.js check ---
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js is not installed or not on PATH.
  echo      Install it from https://nodejs.org/ and re-run this script.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [ok] Node %%v detected

REM --- backend dependencies ---
if not exist "node_modules" (
  echo  [..] Installing backend dependencies ^(first run, may take a minute^)...
  call npm install
  if errorlevel 1 ( echo  [X] npm install failed. & pause & exit /b 1 )
)
echo  [ok] Backend dependencies present

REM --- dashboard UI build ---
if not exist "dashboard\dist\index.html" (
  echo  [..] Building the dashboard UI ^(first run^)...
  pushd dashboard
  if not exist "node_modules" call npm install
  call npm run build
  if errorlevel 1 ( echo  [X] Dashboard build failed. & popd & pause & exit /b 1 )
  popd
)
echo  [ok] Dashboard UI built

REM --- launch the server in its own window ---
echo  [..] Launching ANUClaw server in a new window...
start "ANUClaw Server" cmd /k "npm run dev"

REM --- launch OCR server ---
echo  [..] Launching OCR microservice...
start "PaddleOCR Server" cmd /k "ocr_env\\Scripts\\python ocr_server.py"

REM --- wait for the API health endpoint ---
echo  [..] Waiting for services to become ready...
echo       ^(first run runs a database migration and can take up to ~2 minutes^)
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 ('http://localhost:%API_PORT%/health'); if($r.StatusCode -eq 200){ exit 0 } } catch {} ; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 goto :notready

echo.
echo  ============================================================
echo                        ALL CLEAR
echo  ------------------------------------------------------------
echo    Dashboard           http://127.0.0.1:%DASH_PORT%
echo    CDS console (UI)    http://127.0.0.1:%DASH_PORT%/cds
echo    API base            http://localhost:%API_PORT%/api/v1
echo    Health              http://localhost:%API_PORT%/health
echo    CDS Hooks discovery http://localhost:%API_PORT%/cds-services
echo    CDS review demo     http://localhost:%API_PORT%/cds/review/demo
echo  ============================================================
echo.
echo    Opening the dashboard in your browser...
start "" "http://127.0.0.1:%DASH_PORT%"
echo    The server keeps running in the "ANUClaw Server" window.
echo    Close that window (or press Ctrl+C in it) to stop ANUClaw.
echo.
pause
exit /b 0

:notready
echo.
echo  [!] The API did not respond on port %API_PORT% within the timeout.
echo      Open the "ANUClaw Server" window to see the real error. Common causes:
echo        - PostgreSQL is not running, or the DB settings in .env are wrong
echo        - Required keys are missing in .env  (copy from .env.example)
echo      Fix the issue shown there, then re-run this script.
echo.
pause
exit /b 1
