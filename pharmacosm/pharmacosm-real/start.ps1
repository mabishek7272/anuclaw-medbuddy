# PharmaCosm Real — Startup Script
# Run both the FastAPI backend and Next.js frontend

Write-Host "=== PharmaCosm Real ===" -ForegroundColor Cyan
Write-Host "Starting backend (FastAPI) and frontend (Next.js)..." -ForegroundColor Gray

# Start backend
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn main:app --reload --port 8005" -PassThru -WindowStyle Normal

Write-Host "Backend started (PID: $($backend.Id)) at http://localhost:8005" -ForegroundColor Green
Write-Host "API docs available at: http://localhost:8005/docs" -ForegroundColor Green

Start-Sleep -Seconds 2

# Start frontend
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev -- -p 3005" -PassThru -WindowStyle Normal

Write-Host "Frontend started (PID: $($frontend.Id)) at http://localhost:3005" -ForegroundColor Green
Write-Host ""
Write-Host "Open http://localhost:3005 in your browser" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to stop both processes..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
Write-Host "Stopped." -ForegroundColor Red
