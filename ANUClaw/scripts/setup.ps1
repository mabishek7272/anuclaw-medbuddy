# ANUClaw Setup Script for Windows PowerShell
# Run: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ANUClaw Setup v1.0.0            ║" -ForegroundColor Cyan
Write-Host "║  Unified AI Research & Medical Assistant ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Prerequisites check
function Check-Command { param($name) return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host "Checking prerequisites..."

if (-not (Check-Command "node")) {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 20) {
    Write-Host "❌ Node.js 20+ required (found v$nodeVersion)" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js $(node --version)" -ForegroundColor Green

if (-not (Check-Command "docker")) {
    Write-Host "❌ Docker not found. Install Docker Desktop from https://docker.com" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker $(docker --version)" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing Node.js dependencies..."
npm install
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Environment setup
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "📝 Created .env — edit it and add:" -ForegroundColor Yellow
    Write-Host "   ANTHROPIC_API_KEY=your_key_here" -ForegroundColor Yellow
    Write-Host ""
    $open = Read-Host "Open .env in Notepad now? [y/N]"
    if ($open -eq 'y' -or $open -eq 'Y') { notepad .env }
} else {
    Write-Host "✅ .env exists" -ForegroundColor Green
}

# Build TypeScript
Write-Host ""
Write-Host "Building TypeScript..."
npm run build
Write-Host "✅ Build complete" -ForegroundColor Green

# Container build
Write-Host ""
$build = Read-Host "Build agent container now? (takes 5-10 min) [Y/n]"
if ($build -ne 'n' -and $build -ne 'N') {
    docker build -t anuclaw-agent:latest container/
    Write-Host "✅ Container built" -ForegroundColor Green
}

# Create directories
New-Item -ItemType Directory -Force -Path workspace, groups, logs | Out-Null

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         Setup Complete! ✅               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit .env with your API keys"
Write-Host "  2. Run: npm start"
Write-Host "  3. Open: http://localhost:3721"
Write-Host ""
