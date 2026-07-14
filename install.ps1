# ============================================================
#  BCave CLI 설치 스크립트 (Windows — PowerShell / cmd)
#  실행: PowerShell 에서
#    irm https://raw.githubusercontent.com/DEVZZAME/bcave-agent/master/install.ps1 | iex
#  설치 후 cmd·PowerShell 어디서나 `bcave` 로 실행됩니다.
# ============================================================

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║        BCave CLI 설치 (Windows)       ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# --- Node.js 확인 ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  X Node.js 가 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "    https://nodejs.org 에서 LTS 버전 설치 후 다시 실행하세요."
  return
}
$nodeMajor = ((node -v) -replace 'v','').Split('.')[0] -as [int]
if ($nodeMajor -lt 18) {
  Write-Host ("  X Node.js 18 이상이 필요합니다 (현재: " + (node -v) + ")") -ForegroundColor Red
  return
}
Write-Host ("  OK  Node.js " + (node -v)) -ForegroundColor Green

# --- Git 확인 ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "  X Git 이 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "    https://git-scm.com/download/win 에서 설치 후 다시 실행하세요."
  return
}

$InstallDir = Join-Path $env:USERPROFILE ".bcave-cli"
$BinDir     = Join-Path $env:USERPROFILE ".bcave\bin"

# --- 기존 설치 제거 ---
if (Test-Path $InstallDir) {
  Write-Host "  기존 설치를 업데이트합니다..."
  Remove-Item -Recurse -Force $InstallDir
}

# --- 클론 ---
Write-Host "  다운로드 중..."
git clone --depth 1 --quiet https://github.com/DEVZZAME/bcave-agent.git $InstallDir
if ($LASTEXITCODE -ne 0) { Write-Host "  X git clone 실패" -ForegroundColor Red; return }

# --- 설치 + 빌드 ---
Push-Location $InstallDir
try {
  Write-Host "  의존성 설치 중... (수 분 소요될 수 있습니다)"
  npm install --silent --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Write-Host "  X npm install 실패" -ForegroundColor Red; return }
  Write-Host "  빌드 중..."
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host "  X 빌드 실패" -ForegroundColor Red; return }
} finally {
  Pop-Location
}

# --- 런처(.cmd) 생성 ---
# 심볼릭 링크/복사 대신 래퍼(.cmd)가 node 에게 설치 폴더 내부의 실제 경로를 넘긴다.
# → 의존성 해석이 항상 InstallDir\node_modules 로 향해 안정적으로 동작.
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$distEntry = Join-Path $InstallDir "dist\cli\index.js"
$cmd = "@echo off`r`nnode `"$distEntry`" %*`r`n"
Set-Content -Path (Join-Path $BinDir "bcave.cmd") -Value $cmd -Encoding ASCII

# --- 사용자 PATH 에 등록 (setx 미사용 — PATH 잘림 방지) ---
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
if ($userPath -notlike "*$BinDir*") {
  $newPath = ($userPath.TrimEnd(';') + ";" + $BinDir).TrimStart(';')
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host ("  PATH 등록: " + $BinDir) -ForegroundColor Green
}

Write-Host ""
Write-Host "  OK  BCave CLI 설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "  다음 단계:"
Write-Host "    1. 터미널(cmd 또는 PowerShell)을 '새로' 열어주세요. (PATH 적용)"
Write-Host "    2. 실행:  bcave"
Write-Host ""
