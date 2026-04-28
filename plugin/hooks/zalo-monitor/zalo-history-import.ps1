# Zalo History Import — Windows PowerShell version
# Tự cài Node + openzca + better-sqlite3, rồi chạy zalo-history-push.mjs
#
# Usage (Run as Administrator để cài Node nếu chưa có):
#   $env:BACKEND_URL='https://...'
#   $env:WEBHOOK_SECRET='...'
#   $env:TENANT_ID='...'
#   iwr -useb "$env:BACKEND_URL/api/setup/hook-files/zalo-history-import.ps1" | iex

$ErrorActionPreference = "Stop"

if (-not $env:BACKEND_URL -or -not $env:WEBHOOK_SECRET -or -not $env:TENANT_ID) {
  Write-Host ""
  Write-Host "Thieu env vars: BACKEND_URL, WEBHOOK_SECRET, TENANT_ID" -ForegroundColor Red
  Write-Host "Set truoc khi chay:" -ForegroundColor Yellow
  Write-Host "  `$env:BACKEND_URL='https://api.datthongdong.com'" -ForegroundColor White
  Write-Host "  `$env:WEBHOOK_SECRET='...'" -ForegroundColor White
  Write-Host "  `$env:TENANT_ID='...'" -ForegroundColor White
  exit 1
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Dong bo du lieu cu Zalo (Windows)" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# [1/3] Node.js
Write-Host "[1/3] Kiem tra Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  Dang cai Node qua winget..." -ForegroundColor White
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Khong cai Node tu dong duoc. Tai tai: https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}
Write-Host "  OK Node.js $(node --version)" -ForegroundColor Green

# [2/3] openzca + better-sqlite3
Write-Host "[2/3] Kiem tra openzca + better-sqlite3..." -ForegroundColor Yellow
$tmpDir = Join-Path $env:TEMP "zalo-history-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
Set-Location $tmpDir

if (-not (Get-Command openzca -ErrorAction SilentlyContinue)) {
  Write-Host "  Cai openzca..." -ForegroundColor White
  npm install -g openzca 2>&1 | Out-Null
  $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Host "  Cai better-sqlite3 (local)..." -ForegroundColor White
npm init -y 2>&1 | Out-Null
npm install better-sqlite3 --no-audit --no-fund 2>&1 | Out-Null
Write-Host "  OK" -ForegroundColor Green

# [3/3] Tai + chay
Write-Host "[3/3] Tai script + dong bo..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "$env:BACKEND_URL/api/setup/hook-files/zalo-history-push.mjs" -OutFile "zalo-history-push.mjs" -UseBasicParsing
node zalo-history-push.mjs

Set-Location ..
Remove-Item -Recurse -Force $tmpDir 2>&1 | Out-Null

Write-Host ""
Write-Host "OK Hoan tat." -ForegroundColor Green
