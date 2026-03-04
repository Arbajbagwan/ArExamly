param(
  [string]$AppDir = "D:\apps\arexamly",
  [string]$Branch = "main",
  [string]$ApiName = "arexamly-api"
)

$ErrorActionPreference = "Stop"

Write-Host "[deploy] app_dir=$AppDir branch=$Branch api_name=$ApiName"

Set-Location $AppDir

if (-not (Test-Path ".git")) {
  throw "[deploy] error: $AppDir is not a git repo"
}

Write-Host "[deploy] fetching latest code"
git fetch origin $Branch
git reset --hard "origin/$Branch"

Write-Host "[deploy] install backend deps"
Set-Location "$AppDir\server"
npm ci --omit=dev

Write-Host "[deploy] build frontend"
Set-Location "$AppDir\client"
npm ci
npm run build

Set-Location $AppDir
Write-Host "[deploy] restart pm2 app"

pm2 describe $ApiName *> $null
if ($LASTEXITCODE -eq 0) {
  pm2 reload $ApiName --update-env
} else {
  pm2 start ecosystem.config.js --only $ApiName --env production
}

pm2 save
Write-Host "[deploy] done"
