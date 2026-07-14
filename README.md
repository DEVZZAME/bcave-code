<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/auth-사내%20HUB%20로그인-blue" alt="auth">
  <img src="https://img.shields.io/badge/license-internal-red" alt="license">
</p>

<h1 align="center">

```
 ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗   ██████╗ ██████╗ ██████╗ ███████╗
 ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝  ██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██████╔╝██║     ███████║██║   ██║█████╗    ██║     ██║   ██║██║  ██║█████╗
 ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝    ██║     ██║   ██║██║  ██║██╔══╝
 ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗  ╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

</h1>

<p align="center">
  <strong>사내 AI 코딩 에이전트</strong><br>
  <sub>터미널에서 AI에게 지시하면 파일을 읽고, 쓰고, 명령을 실행합니다.</sub><br>
  <sub>API 키 없이 <b>사내 계정 로그인</b>만으로 사용합니다.</sub>
</p>

---

## 필요 조건

| 항목 | 내용 |
|---|---|
| **Node.js** | 18 이상 (없으면 아래 1단계에서 설치) |
| **사내 계정** | HUB 회원가입 + `BCAVE_CODE` 접근 승인 |
| **Windows** | **Git Bash** 필요 (cmd·PowerShell은 현재 미지원) |

---

## 설치 — 처음이신 분도 순서대로 따라 하시면 됩니다

### 1단계. Node.js 설치

bcave는 Node.js 위에서 동작합니다. 먼저 설치돼 있는지 확인하세요.
터미널(Mac은 **터미널.app**, Windows는 아래 2단계의 **Git Bash**)에서:

```bash
node -v
```

- `v18...` 이상이 보이면 → 이미 설치됨. **2단계로.**
- `command not found` 가 보이면 → 아래에서 설치:
  - **Windows / Mac 공통**: https://nodejs.org 에서 **LTS** 버전 다운로드 → 설치 마법사 실행("다음" 계속) → 완료
  - **Mac(Homebrew 사용 시)**: `brew install node`

설치 후 터미널을 **새로 열고** `node -v` 로 다시 확인하세요.

### 2단계 (Windows 사용자만). Git Bash 설치

설치 스크립트가 bash 기반이라 Windows에선 **Git Bash**에서 실행해야 합니다.
> ⚠️ Windows의 **cmd·PowerShell에서는 현재 동작하지 않습니다.** 반드시 Git Bash를 사용하세요.

1. https://git-scm.com/download/win 에서 다운로드 → 설치(기본 옵션 그대로 "다음")
2. 시작 메뉴에서 **"Git Bash"** 실행 → 앞으로 모든 명령은 이 창에서 입력
3. (Mac 사용자는 기본 **터미널.app** 을 사용하시면 됩니다. Git Bash 불필요.)

### 3단계. bcave 설치

터미널(Windows는 **Git Bash**)에 아래 한 줄을 붙여넣고 Enter:

```bash
curl -s https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash
```

설치가 끝나면 **터미널을 새로 열어주세요** (PATH 적용을 위해).

### 4단계. 접근 권한 받기 (최초 1회)

bcave는 **사내 HUB 계정**으로 로그인합니다. 아직 계정/권한이 없다면:

1. 사내 HUB( http://3.36.247.93:3000 )에서 **회원가입**
2. **BCAVE_CODE** 서비스 **접근 신청**
3. 관리자 **승인** 후 사용 가능

> 계정/승인 문의: **AX팀 강한솔 대리**

---

## 사용법

터미널(Windows는 Git Bash)에서:

```bash
bcave
```

- 처음이면 **로그인 화면**이 뜹니다 → 사내 이메일/비밀번호 입력 (비밀번호는 `*`로 표시됩니다)
- 로그인 후 하고 싶은 작업을 자연어로 입력하면, AI가 파일을 읽고·쓰고·명령을 실행합니다
- 로그인은 **로그아웃 전까지 유지**됩니다 (매번 로그인 불필요)

```
──────────────────────────────────────────────────────────────
Safe mode ~/my-project > 이 프로젝트에 테스트를 추가해줘

  ⚡ read_file(path=src/index.ts)
  Allow? [Y/n] y
  ...
  ⚡ write_file(path=tests/index.test.ts)
  Allow? [Y/n] y

  테스트 파일을 생성했습니다. `npm test`로 실행할 수 있습니다.
──────────────────────────────────────────────────────────────
Safe mode ~/my-project >
```

---

## 명령어

대화 중 `/` 를 입력하면 명령어 선택 화면이 나타납니다.

| 명령 | 설명 |
|---|---|
| `/login` | 사내 계정 로그인 |
| `/logout` | 로그아웃 |
| `/model` | 모델 선택 (내 등급에서 사용 가능한 모델만 표시) |
| `/usage` | 내 사용량 / 한도 확인 (일·주·월) |
| `/mode` | 권한 모드 전환 |
| `/help` | 도움말 |
| `/reset` | 설정 초기화 |

| 단축키 | 동작 |
|---|---|
| `Shift+Tab` | 권한 모드 전환 |
| `Ctrl+C` | 종료 |

---

## 권한 모드

`Shift+Tab` 또는 `/mode` 로 전환합니다.

| 모드 | 설명 | 플래그 |
|---|---|---|
| 🟢 **Safe** | 모든 작업 전 확인 _(기본)_ | — |
| 🟡 **Auto** | 카테고리별 한 번 승인 후 자동 | `--auto-approve` |
| 🔴 **YOLO** | 확인 없이 모두 실행 | `--dangerously-skip-permissions` |

---

## CLI 옵션

```bash
bcave                                  # 대화형 실행 (로그인 필요)
bcave "이 코드 리뷰해줘"                 # 원샷 실행
bcave login                            # 로그인
bcave logout                           # 로그아웃
bcave --model gpt-4o-mini "테스트 추가"  # 모델 지정
bcave --auto-approve "리팩터링 해줘"      # Auto 모드
bcave --hub-url http://호스트:3000       # HUB 주소 지정 (기본값 내장)
```

---

## 문제 해결 (FAQ)

| 증상 | 해결 |
|---|---|
| `command not found: bcave` | 터미널을 **새로 열기**. 그래도 안 되면 3단계 재설치 |
| Windows에서 실행이 안 됨 | cmd·PowerShell이 아니라 **Git Bash**에서 실행 |
| `Cannot find package 'chalk'` | 설치가 깨진 것 → 3단계 설치 스크립트 재실행 |
| 로그인이 안 됨 | `BCAVE_CODE` 승인이 났는지 관리자에게 확인 |
| "사용 권한이 없습니다" | HUB에서 BCAVE_CODE 접근 신청 → 관리자 승인 필요 |
| "한도를 모두 사용했습니다" | `/usage` 로 한도 확인, 필요 시 관리자에게 상향 요청 |

---

## 설정 파일

`~/.bcave/config.json` (로그인 시 자동 생성/갱신)

| 필드 | 설명 |
|---|---|
| `hubUrl` | 사내 HUB 주소 (기본값 내장) |
| `accessToken` / `refreshToken` | 로그인 토큰 (자동 관리, 직접 수정 불필요) |
| `model` | 현재 선택한 모델 |

---

<p align="center">
  <sub>UNLICENSED — 사내 전용</sub>
</p>
