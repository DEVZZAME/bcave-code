<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/auth-사내%20HUB%20로그인-blue" alt="auth">
  <img src="https://img.shields.io/badge/license-internal-red" alt="license">
</p>

<h1 align="center">

```
 ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗
 ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝
 ██████╔╝██║     ███████║██║   ██║█████╗
 ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝
 ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗
 ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝
  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
 ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
 ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
 ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
```

</h1>

<p align="center">
  <strong>사내 AI 코딩 에이전트</strong> · 사내 계정 로그인만으로 사용
</p>

---

# 설치

본인 컴퓨터에 맞춰 따라오세요 → **[🪟 Windows](#-windows)** · **[🍎 Mac](#-mac)**

<br>

## 🪟 Windows

### 1. Node.js 있는지 확인
시작 메뉴에서 **PowerShell** 을 열고 입력:
```
node --version
```
- `v20.x.x` 처럼 **v로 시작하는 숫자**가 나오면 → **3번으로**
- 빨간 에러가 나거나 아무것도 안 나오면 → **2번으로**

### 2. Node.js 설치
https://nodejs.org 접속 → 큰 **LTS** 버튼으로 다운로드 → 설치("Next" 계속) →
**PowerShell을 새로 열고** `node --version` 다시 확인 (이제 버전이 나옵니다)

### 3. Git 있는지 확인
```
git --version
```
- 버전이 나오면 → **5번으로**
- 안 나오면 → **4번으로**

### 4. Git 설치
https://git-scm.com/download/win 에서 다운로드 → 설치("Next" 계속) → **PowerShell을 새로** 열기

### 5. bcave 설치
PowerShell에 아래 한 줄을 붙여넣고 Enter (2~3분 걸립니다):
```powershell
irm https://raw.githubusercontent.com/DEVZZAME/bcave-agent/master/install.ps1 | iex
```

### 6. 실행
**새 PowerShell(또는 cmd) 창**을 열고:
```
bcave
```

<br>

## 🍎 Mac

### 1. Node.js 있는지 확인
**터미널**(Spotlight에서 `터미널` 검색)을 열고 입력:
```
node --version
```
- `v20.x.x` 처럼 **v로 시작하는 숫자**가 나오면 → **3번으로**
- `command not found` 가 나오면 → **2번으로**

### 2. Node.js 설치
https://nodejs.org 접속 → **LTS** 다운로드 → 설치 →
**터미널을 새로 열고** `node --version` 다시 확인

### 3. bcave 설치
터미널에 아래 한 줄을 붙여넣고 Enter (2~3분 걸립니다):
```bash
curl -s https://raw.githubusercontent.com/DEVZZAME/bcave-agent/master/install.sh | bash
```
> 중간에 "명령어 개발자 도구를 설치하시겠습니까?" 팝업이 뜨면 **설치**를 눌러주세요 (Git 설치).

### 4. 실행
**터미널을 새로 열고**:
```
bcave
```

---

# 처음 실행하면

1. **로그인 화면**이 뜹니다 → 사내 **이메일 / 비밀번호** 입력 _(비밀번호는 `*`로 표시)_
2. 로그인 후 하고 싶은 걸 그냥 입력하세요. 예: `이 폴더 구조 설명해줘`
3. 파일을 바꾸거나 명령을 실행하기 전 **`Allow? [Y/n]`** 로 물어봅니다 → `y` + Enter
4. 한 번 로그인하면 계속 유지됩니다.

> 로그인이 안 되면 → 관리자에게 **BCAVE_CODE 사용 승인**을 요청하세요.
> 계정/승인 문의: **AX팀 강한솔 대리**

---

# 자주 쓰는 명령

대화 중 `/` 를 입력하면 목록이 나옵니다.

| 명령 | 설명 |
|---|---|
| `/model` | 모델 선택 |
| `/usage` | 내 사용량 · 한도 확인 |
| `/logout` | 로그아웃 |
| `/help` | 전체 명령 보기 |

종료: **`Ctrl + C`**

---

# 안 될 때

| 증상 | 해결 |
|---|---|
| `bcave` 명령을 못 찾음 | 터미널을 **완전히 닫고 새로** 열기 |
| 설치 중 에러 | 설치 명령을 **다시 실행** |
| 로그인이 안 됨 | 관리자에게 **BCAVE_CODE 승인** 요청 |

<p align="center"><sub>UNLICENSED — 사내 전용</sub></p>
