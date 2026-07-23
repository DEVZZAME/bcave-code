<p align="center">
  <img src="https://img.shields.io/badge/node-20%20%7C%2022%20%7C%2024-brightgreen" alt="Node.js 20, 22, 24">
  <img src="https://img.shields.io/badge/auth-사내%20HUB%20로그인-blue" alt="사내 HUB 로그인">
  <img src="https://img.shields.io/badge/license-internal-red" alt="사내 전용">
</p>

# BCave Code

사내 계정으로 로그인해 사용하는 터미널 기반 AI 코딩 에이전트입니다. 현재 폴더의 코드를 읽고 수정하며, 명령 실행과 결과 검증을 함께 수행합니다.

## 1. 설치

Node.js 20 이상과 Git이 필요합니다. 공식 검증 버전은 Node.js 20·22·24 LTS입니다.

### macOS

터미널에서 사전 조건을 확인합니다.

```bash
node --version
git --version
```

명령을 찾지 못하면 [Node.js LTS](https://nodejs.org/)를 설치하고, Git이 없다면 다음 명령으로 Apple 명령어 개발자 도구를 설치합니다.

```bash
xcode-select --install
```

BCave를 설치합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash
```

설치 후 터미널을 완전히 닫았다가 다시 열고 실행합니다.

```bash
bcave
```

### Windows

PowerShell에서 사전 조건을 확인합니다.

```powershell
node --version
git --version
```

명령을 찾지 못하면 [Node.js LTS](https://nodejs.org/)와 [Git for Windows](https://git-scm.com/download/win)를 설치한 뒤 PowerShell을 다시 엽니다.

BCave를 설치합니다.

```powershell
irm https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.ps1 | iex
```

설치 후 모든 PowerShell 또는 cmd 창을 닫고 새 창에서 실행합니다.

```powershell
bcave
```

### Linux

터미널에서 사전 조건을 확인합니다.

```bash
node --version
git --version
```

배포판 기본 Node.js가 20보다 오래된 경우 [Node.js LTS](https://nodejs.org/)나 NodeSource/nvm으로 LTS 버전을 설치합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash
```

새 터미널에서 실행합니다.

```bash
bcave
```

## 2. 처음 사용하기

작업하려는 프로젝트 폴더로 이동한 후 `bcave`를 실행합니다.

```bash
cd /path/to/project
bcave
```

처음 실행하면 사내 이메일과 비밀번호를 입력합니다. 비밀번호는 화면에 `*`로 표시되며, 로그인 정보는 이후 실행에도 유지됩니다.

로그인 후 원하는 작업을 자연어로 입력하면 됩니다.

```text
이 프로젝트 구조와 실행 방법을 파악해줘.
테스트 실패 원인을 찾아서 수정해줘.
회원가입 API에 입력 검증을 추가하고 테스트해줘.
이 CSV를 분석해서 단일 HTML 대시보드로 만들어줘.
```

한 번만 요청하고 종료하려면 프롬프트를 실행 인자로 전달할 수 있습니다.

```bash
bcave "이 프로젝트의 테스트를 실행하고 실패 원인을 설명해줘"
```

작업 중 `Esc`를 누르면 현재 작업을 취소하고, `Ctrl+C`를 누르면 BCave를 종료합니다.

### 서비스 생성 속도와 기본값

`서비스를 만들어줘`처럼 요청하면 별도의 스택·배포 선택 질문 없이 바로 작업을 시작합니다. 기존 프로젝트에서는 현재 스택을 유지하고, 새 프로젝트는 일반적인 React·Vite·Express 구성과 로컬 SQLite 빠른 검증을 기본으로 사용합니다.

원하는 구성이 있으면 첫 요청에 함께 적으면 됩니다.

```text
Next.js로 검색 노출이 중요한 예약 서비스를 만들어줘. Vercel에 배포할 거야.
Vue와 Express로 사내 재고 관리 서비스를 만들어줘.
PostgreSQL을 사용하는 Railway용 주문 관리 서비스를 만들어줘.
```

배포 환경은 대화 중 `/deploy`로도 바꿀 수 있습니다.

## 3. 권한 모드

기본값은 Auto mode입니다. 읽기·쓰기·명령 실행 같은 작업 종류별로 처음 한 번 확인한 뒤 같은 종류의 작업을 자동 승인합니다.

| 모드 | 실행 방법 | 동작 |
|---|---|---|
| Auto | `bcave` 또는 `bcave --auto-approve` | 작업 종류별 최초 한 번 확인 |
| Safe | `bcave --safe` | 모든 도구 작업 전에 확인 |
| Yolo | `bcave --dangerously-skip-permissions` | 확인 없이 실행하므로 신뢰할 수 있는 프로젝트에서만 사용 |
| Session | `bcave --session-mode` | 로그인·LLM 호출 없이 사전 준비된 전사 시연 실행 |

대화 중 `Shift+Tab`으로 모드를 전환할 수 있습니다.

### 전사 시연용 Session mode

시연할 작업 폴더에서 다음과 같이 실행합니다.

```bash
cd /Users/bcave/Desktop/0session
bcave --session-mode
```

Session mode는 외부 모델이나 HUB 로그인에 의존하지 않습니다.

- 파일 경로와 함께 대시보드 생성을 요청하면 BCAVE·AXIS 선택 화면을 표시합니다.
- BCAVE 선택 시 `/Users/bcave/Desktop/0session/dashboard/bcave-dashboard.html`을 약 30초 후 현재 폴더에 복사합니다.
- AXIS 선택 시 `/Users/bcave/Desktop/0session/dashboard/axis-dashboard.html`을 약 30초 후 현재 폴더에 복사합니다.
- 패션 회사용 서비스 개발을 요청하면 `/Users/bcave/Desktop/0session/project`의 준비된 프로젝트 중 하나를 무작위로 현재 폴더에 복사합니다.
- 그 밖의 요청은 실행하지 않으며 실제 LLM으로 전환되지 않습니다.

시연 전 준비 파일이 위 경로에 존재하는지 확인하세요.

## 4. 대화 중 명령

입력창에서 `/`를 누르면 명령 목록이 열립니다.

| 명령 | 설명 |
|---|---|
| `/resume` | 저장된 이전 세션 다시 열기 |
| `/model` | 모델 선택 또는 자동 라우팅 설정 |
| `/deploy` | 서비스 배포 대상 선택 |
| `/verify on\|off` | 완료 전 빌드·테스트 자동 검증 설정 |
| `/smoke on\|off` | 완성된 서비스 실제 실행 검사 설정 |
| `/usage` | 사용량과 한도 확인 |
| `/mode` | 권한 모드 전환 |
| `/login` | 다른 사내 계정으로 로그인 |
| `/logout` | 로그아웃 |
| `/reset` | 로컬 설정 초기화 |
| `/help` | 전체 명령과 단축키 표시 |

## 5. 터미널 명령

| 명령 | 설명 |
|---|---|
| `bcave login` | 로그인 |
| `bcave logout` | 로그아웃 |
| `bcave update` | 최신 버전을 안전하게 설치하고 재시작 |
| `bcave doctor` | 설치·Node.js·설정·의존성 진단 |
| `bcave --model <model>` | 이번 실행에 사용할 모델 지정 |
| `bcave --hub-url <url>` | 사내 HUB 주소 지정 |
| `bcave --session-mode` | 로그인·LLM 없는 사전 준비 시연 모드 |
| `bcave --help` | CLI 도움말 표시 |

## 6. 업데이트

```bash
bcave update
```

업데이트는 새 버전을 임시 폴더에서 다운로드하고 의존성 설치, 빌드, 실행 검증까지 통과한 뒤 기존 설치본과 교체합니다. 중간에 실패하거나 종료되면 기존 정상 버전을 유지하거나 자동 복구합니다.

## 7. 문제 해결

먼저 환경 진단을 실행합니다.

```bash
bcave doctor
```

| 증상 | 해결 방법 |
|---|---|
| `bcave: command not found` | 터미널을 완전히 닫고 다시 열기 |
| `BCAVE_ENTRY_MISSING` | 설치가 중단되어 실행 파일이 누락됨. 해당 운영체제의 설치 명령 재실행 |
| `Cannot find module .../.bcave-cli/dist/cli/index.js` | 손상된 이전 설치 상태. 설치 명령을 다시 실행하면 안전 설치 방식으로 복구 |
| `BCAVE_DEPENDENCIES_MISSING` | 의존성 설치 실패. 네트워크와 npm 접근을 확인한 뒤 재설치 |
| `BCAVE_CONFIG_INVALID` | 설정 JSON이 손상됨. `bcave`에서 `/reset` 실행 또는 설정 파일 점검 |
| `BCAVE_CONFIG_PERMISSIONS` | macOS/Linux 설정 권한이 넓음. `chmod 600 ~/.bcave/config.json` 실행 |
| `BCAVE_NODE_UNSUPPORTED` | Node.js 20·22·24 LTS 중 하나로 변경 권장 |
| 로그인이 안 됨 | 관리자에게 `BCAVE_CODE` 사용 승인을 요청 |

### 운영체제별 문제

| 운영체제 | 증상 | 해결 방법 |
|---|---|---|
| macOS | `xcrun` 또는 Git 개발자 도구 오류 | `xcode-select --install` 완료 후 재설치 |
| macOS | 설치 후 명령을 찾지 못함 | `source ~/.zshrc` 또는 새 터미널 실행; `~/.local/bin`이 PATH에 있는지 확인 |
| Windows | 스크립트 실행 정책 오류 | 위 설치 명령을 PowerShell에서 실행; 조직 정책 차단 시 관리자에게 문의 |
| Windows | 설치 후 명령을 찾지 못함 | 새 터미널 실행; 사용자 PATH에 `%USERPROFILE%\.bcave\bin`이 있는지 확인 |
| Windows | `npm.cmd` 또는 `git`을 찾지 못함 | Node.js/Git 설치 시 PATH 옵션 활성화 후 새 터미널에서 재설치 |
| Linux | Node.js 버전이 20 미만 | 배포판 기본 패키지 대신 Node.js LTS 설치 |
| Linux | 설치 후 명령을 찾지 못함 | `source ~/.profile` 또는 새 셸 실행; `~/.local/bin`이 PATH에 있는지 확인 |
| 공통 | GitHub/npm 연결 또는 인증서 오류 | 사내 VPN·프록시·인증서를 확인한 뒤 설치 명령 재실행 |

## 8. 개발 및 검증

```bash
npm ci
npm test
npm run build
node dist/cli/index.js --help
```

CI는 Ubuntu, macOS, Windows에서 Node.js 20·22·24 조합을 검증합니다.

## 지원

로그인이나 사용 승인 문제가 있으면 관리자에게 `BCAVE_CODE` 권한을 요청하세요.

<p align="center"><sub>UNLICENSED — 사내 전용</sub></p>
