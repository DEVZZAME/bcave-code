$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  B.CAVE CODE" -ForegroundColor Cyan
Write-Host "  ----------------------------" -ForegroundColor Cyan
Write-Host "  사내 AI 코딩 에이전트 - 안전 설치"
Write-Host ""

$InstallDir = Join-Path $env:USERPROFILE ".bcave-cli"
$BinDir = Join-Path $env:USERPROFILE ".bcave\bin"
$LockDir = Join-Path $env:USERPROFILE ".bcave-cli.install.lock"
$TempDir = Join-Path $env:USERPROFILE (".bcave-cli.tmp." + [Guid]::NewGuid().ToString("N"))
$BackupDir = Join-Path $env:USERPROFILE (".bcave-cli.backup." + [Guid]::NewGuid().ToString("N"))
$EntryRelative = "dist\cli\index.js"
$RepoUrl = if ($env:BCAVE_REPO_URL) { $env:BCAVE_REPO_URL } else { "https://github.com/DEVZZAME/bcave-code.git" }
$Activated = $false
$HasBackup = $false
$Succeeded = $false
$OwnsLock = $false

function Stop-Install([string]$Message) {
  throw $Message
}

try {
  if (Test-Path $LockDir) {
    $PidFile = Join-Path $LockDir "pid"
    $ExistingPid = if (Test-Path $PidFile) { Get-Content $PidFile -ErrorAction SilentlyContinue } else { $null }
    $Running = if ($ExistingPid) { Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue } else { $null }
    if ($Running) { Stop-Install "다른 BCave 설치 또는 업데이트가 진행 중입니다. (PID $ExistingPid)" }
    Remove-Item -Recurse -Force $LockDir
  }
  New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
  Set-Content -Path (Join-Path $LockDir "pid") -Value $PID -Encoding ASCII
  $OwnsLock = $true

  foreach ($CommandName in @("node", "npm.cmd", "git")) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
      Stop-Install "$CommandName 명령을 찾을 수 없습니다. Node.js LTS와 Git을 설치한 뒤 새 터미널에서 다시 시도하세요."
    }
  }

  $NodeVersion = (& node -p "process.versions.node").Trim()
  $NodeMajor = [int]$NodeVersion.Split('.')[0]
  if ($NodeMajor -lt 20) {
    Stop-Install "Node.js 20 이상이 필요합니다. (현재: v$NodeVersion)"
  }
  if ($NodeMajor -notin @(20, 22, 24)) {
    Write-Host "  ! Node.js v$NodeVersion 는 공식 LTS 검증 범위(20/22/24)가 아닙니다." -ForegroundColor Yellow
  }
  Write-Host "  OK Node.js v$NodeVersion" -ForegroundColor Green

  Write-Host "  > 새 버전 다운로드" -ForegroundColor Cyan
  & git clone --depth 1 --quiet $RepoUrl $TempDir
  if ($LASTEXITCODE -ne 0) { Stop-Install "git clone 실패 (exit $LASTEXITCODE)" }

  Push-Location $TempDir
  try {
    Write-Host "  > 의존성 설치" -ForegroundColor Cyan
    & npm.cmd ci --silent --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { Stop-Install "npm ci 실패 (exit $LASTEXITCODE)" }

    Write-Host "  > Session mode 프로젝트 준비" -ForegroundColor Cyan
    $SessionProjects = Join-Path $TempDir "assets\session-mode\projects"
    foreach ($ProjectDir in Get-ChildItem -Path $SessionProjects -Directory) {
      Push-Location $ProjectDir.FullName
      try {
        & npm.cmd ci --silent --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { Stop-Install "Session mode 프로젝트 의존성 설치 실패: $($ProjectDir.Name)" }
      } finally {
        Pop-Location
      }
    }

    Write-Host "  > 빌드" -ForegroundColor Cyan
    & npm.cmd run build --silent
    if ($LASTEXITCODE -ne 0) { Stop-Install "빌드 실패 (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }

  Write-Host "  > 설치본 검증" -ForegroundColor Cyan
  $TempEntry = Join-Path $TempDir $EntryRelative
  if (-not (Test-Path $TempEntry -PathType Leaf)) { Stop-Install "빌드 엔트리가 생성되지 않았습니다: $EntryRelative" }
  if (-not (Test-Path (Join-Path $TempDir "node_modules") -PathType Container)) { Stop-Install "node_modules가 생성되지 않았습니다." }
  if (-not (Test-Path (Join-Path $TempDir "assets\design-systems") -PathType Container)) { Stop-Install "디자인 시스템 자산이 누락됐습니다." }
  if (-not (Test-Path (Join-Path $TempDir "assets\session-mode\dashboards\bcave-dashboard.html") -PathType Leaf)) { Stop-Install "Session mode BCAVE 대시보드가 누락됐습니다." }
  if (-not (Test-Path (Join-Path $TempDir "assets\session-mode\dashboards\axis-dashboard.html") -PathType Leaf)) { Stop-Install "Session mode AXIS 대시보드가 누락됐습니다." }
  if (-not (Test-Path (Join-Path $TempDir "assets\session-mode\dashboard-updates\bcave-dashboard.html") -PathType Leaf)) { Stop-Install "Session mode BCAVE 수정본이 누락됐습니다." }
  if (-not (Test-Path (Join-Path $TempDir "assets\session-mode\dashboard-updates\axis-dashboard1.html") -PathType Leaf)) { Stop-Install "Session mode AXIS 수정본이 누락됐습니다." }
  foreach ($ProjectName in @("roundfit", "stylemetrics", "threadly")) {
    if (-not (Test-Path (Join-Path $TempDir "assets\session-mode\projects\$ProjectName\node_modules") -PathType Container)) {
      Stop-Install "Session mode 프로젝트 의존성이 누락됐습니다: $ProjectName"
    }
  }
  & node $TempEntry --help *> $null
  if ($LASTEXITCODE -ne 0) { Stop-Install "빌드된 CLI 실행 검증에 실패했습니다." }

  if (Test-Path $InstallDir) {
    Write-Host "  > 기존 설치본 보관" -ForegroundColor Cyan
    Move-Item -Path $InstallDir -Destination $BackupDir
    $HasBackup = $true
  }

  Write-Host "  > 새 버전 활성화" -ForegroundColor Cyan
  Move-Item -Path $TempDir -Destination $InstallDir
  $Activated = $true

  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $DistEntry = Join-Path $InstallDir $EntryRelative
  $LauncherTemp = Join-Path $BinDir ("bcave.tmp." + [Guid]::NewGuid().ToString("N") + ".cmd")
  $Launcher = @"
@echo off
set "BCAVE_ENTRY=$DistEntry"
if not exist "%BCAVE_ENTRY%" (
  echo BCAVE_ENTRY_MISSING: BCave 설치가 불완전합니다. 1^>^&2
  echo 복구: PowerShell에서 설치 명령을 다시 실행하세요. 1^>^&2
  exit /b 1
)
node "%BCAVE_ENTRY%" %*
"@
  Set-Content -Path $LauncherTemp -Value $Launcher -Encoding ASCII
  Move-Item -Force -Path $LauncherTemp -Destination (Join-Path $BinDir "bcave.cmd")

  & (Join-Path $BinDir "bcave.cmd") --help *> $null
  if ($LASTEXITCODE -ne 0) { Stop-Install "최종 런처 검증에 실패했습니다." }

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $PathParts = @($UserPath -split ';' | Where-Object { $_ })
  if ($PathParts -notcontains $BinDir) {
    [Environment]::SetEnvironmentVariable("Path", (($PathParts + $BinDir) -join ';'), "User")
  }

  if ($HasBackup -and (Test-Path $BackupDir)) {
    Remove-Item -Recurse -Force $BackupDir
    $HasBackup = $false
  }
  $Succeeded = $true
  Write-Host ""
  Write-Host "  OK BCave CLI 설치 완료!" -ForegroundColor Green
  Write-Host "  새 cmd 또는 PowerShell에서 bcave를 실행하세요."
  Write-Host "  문제가 있으면 bcave doctor를 실행하세요."
  Write-Host ""
} catch {
  Write-Host ""
  Write-Host ("  X 설치 실패: " + $_.Exception.Message) -ForegroundColor Red
  if ($Activated -and $HasBackup -and (Test-Path $BackupDir)) {
    if (Test-Path $InstallDir) {
      $FailedDir = Join-Path $env:USERPROFILE (".bcave-cli.failed." + [Guid]::NewGuid().ToString("N"))
      Move-Item -Path $InstallDir -Destination $FailedDir -ErrorAction SilentlyContinue
    }
    Move-Item -Path $BackupDir -Destination $InstallDir -ErrorAction SilentlyContinue
    $HasBackup = $false
    Write-Host "  이전 설치본으로 복구했습니다." -ForegroundColor Yellow
  } elseif ($Activated -and (Test-Path $InstallDir)) {
    $FailedDir = Join-Path $env:USERPROFILE (".bcave-cli.failed." + [Guid]::NewGuid().ToString("N"))
    Move-Item -Path $InstallDir -Destination $FailedDir -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $FailedDir -ErrorAction SilentlyContinue
  } else {
    Write-Host "  기존 BCave 설치본은 변경하지 않았습니다." -ForegroundColor Yellow
  }
} finally {
  if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue }
  if ($HasBackup -and $Succeeded -and (Test-Path $BackupDir)) { Remove-Item -Recurse -Force $BackupDir -ErrorAction SilentlyContinue }
  if ($OwnsLock -and (Test-Path $LockDir)) { Remove-Item -Recurse -Force $LockDir -ErrorAction SilentlyContinue }
}
if (-not $Succeeded) { throw "BCave installation failed" }
