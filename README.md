# BCave CODE

```
 ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗   ██████╗ ██████╗ ██████╗ ███████╗
 ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝  ██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██████╔╝██║     ███████║██║   ██║█████╗    ██║     ██║   ██║██║  ██║█████╗
 ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝    ██║     ██║   ██║██║  ██║██╔══╝
 ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗  ╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

**OpenAI GPT-4 기반 로컬 코딩 에이전트 CLI**

터미널에서 AI와 대화하며 파일을 읽고, 쓰고, 명령을 실행할 수 있습니다. [Codex CLI](https://github.com/openai/codex)와 [Claude Code](https://claude.ai/code)에서 영감을 받아 만들었습니다.

---

## 주요 기능

- **파일 읽기/쓰기** — 로컬 파일을 읽고, 생성하고, 수정합니다
- **파일 검색** — 디렉토리 탐색 및 파일 내용 검색 (glob, regex)
- **터미널 명령 실행** — `npm install`, `git commit` 등 쉘 명령 실행
- **3단계 권한 모드** — Safe / Auto-approve / YOLO 모드로 안전하게 사용
- **대화형 인터페이스** — 한국어로 자연스럽게 대화하며 작업 지시
- **ASCII 아트 UI** — 터미널에서 보기 좋은 인터페이스 제공

---

## 설치

### 요구사항

- **Node.js 18 이상** ([다운로드](https://nodejs.org))
- **Git** ([다운로드](https://git-scm.com))
- **OpenAI API 키** (사내 공유 키 사용)

### 원라인 설치

터미널에 아래 명령어를 복사-붙여넣기 하세요:

```bash
curl -s https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash
```

설치가 완료되면 **터미널을 새로 열어주세요.**

> 설치 스크립트가 자동으로 레포 클론, 의존성 설치, 빌드, PATH 등록을 수행합니다.
> 설치 경로: `~/.bcave-cli`

### 수동 설치

```bash
git clone https://github.com/DEVZZAME/bcave-code.git ~/.bcave-cli
cd ~/.bcave-cli
npm install
npm run build
chmod +x dist/cli/index.js

# PATH에 추가 (~/.zshrc 또는 ~/.bashrc에 추가)
mkdir -p ~/.local/bin
ln -sf ~/.bcave-cli/dist/cli/index.js ~/.local/bin/bcave
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

### 업데이트

설치 스크립트를 다시 실행하면 자동으로 업데이트됩니다:

```bash
curl -s https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash
```

---

## 시작하기

### 1. BCave 실행

```bash
bcave
```

첫 실행 시 BCAVE CODE 배너와 함께 API 키 입력 화면이 나타납니다.

### 2. API 키 입력

화면의 안내에 따라 OpenAI API 키를 입력하세요. 키는 `~/.bcave/config.json`에 안전하게 저장됩니다.

> CLI 옵션으로도 설정 가능합니다: `bcave --set-api-key sk-xxxxx`

### 3. 사용 시작

API 키 설정 후 바로 대화형 모드로 진입합니다. 자연어로 작업을 지시하세요:

```
❯ 현재 디렉토리의 파일 구조를 보여줘
❯ src/index.ts에 에러 핸들링을 추가해줘
❯ 이 프로젝트에 Jest 테스트를 세팅해줘
```

---

## 사용법

### 대화형 모드

```bash
bcave
```

터미널에서 AI와 실시간으로 대화하며 작업할 수 있습니다.

### 원샷 모드

```bash
bcave "README.md를 한국어로 번역해줘"
```

프롬프트를 인자로 바로 전달하여 실행합니다.

### 모델 변경

```bash
bcave --model gpt-4o-mini "간단한 질문"
```

기본 모델은 `gpt-4o`이며, 필요에 따라 다른 모델로 변경할 수 있습니다.

---

## 권한 모드

BCave는 파일 변경이나 명령 실행 전에 사용자 승인을 요청합니다. 3가지 모드를 지원합니다:

### Safe (기본)

```bash
bcave
```

모든 파일 변경, 명령 실행 전에 `[Y/n]` 확인을 요청합니다. 가장 안전한 모드입니다.

### Auto-approve

```bash
bcave --auto-approve
```

같은 카테고리의 작업을 한 번 승인하면, 이후 같은 종류의 작업은 자동으로 승인됩니다.

| 카테고리 | 포함 도구 | 예시 |
|---|---|---|
| `file_read` | read_file, list_files, search_files | 파일 읽기, 디렉토리 탐색 |
| `file_write` | write_file | 파일 생성, 수정, 삭제 |
| `shell_exec` | shell_exec | 터미널 명령 실행 |

예: 파일 읽기를 한 번 승인하면 이후 모든 파일 읽기는 자동 승인. 하지만 파일 쓰기는 별도로 승인 필요.

### YOLO

```bash
bcave --dangerously-skip-permissions
```

모든 권한 확인을 건너뜁니다. **주의: 파일 삭제, 임의 명령 실행이 확인 없이 수행됩니다.** 신뢰할 수 있는 환경에서만 사용하세요.

---

## 내장 명령어

대화형 모드에서 사용할 수 있는 특수 명령어:

| 명령어 | 설명 |
|---|---|
| `/config` | API 키를 변경합니다 |
| `Ctrl+C` | BCave를 종료합니다 |

---

## 도구 (Tools)

BCave가 GPT-4에게 제공하는 5가지 도구입니다. GPT-4가 필요에 따라 자동으로 선택하여 사용합니다.

| 도구 | 설명 | 권한 카테고리 |
|---|---|---|
| `read_file` | 파일 내용 읽기 | file_read |
| `write_file` | 파일 생성 또는 덮어쓰기 | file_write |
| `list_files` | 디렉토리 파일 목록 (glob 패턴 지원) | file_read |
| `search_files` | 파일 내용에서 정규식 검색 | file_read |
| `shell_exec` | 터미널 명령 실행 (타임아웃: 120초) | shell_exec |

---

## 설정

### 설정 파일

`~/.bcave/config.json`에 저장됩니다:

```json
{
  "apiKey": "sk-xxxxx",
  "model": "gpt-4o",
  "baseUrl": "https://api.openai.com/v1"
}
```

| 필드 | 설명 | 기본값 |
|---|---|---|
| `apiKey` | OpenAI API 키 | (없음) |
| `model` | 사용할 GPT 모델 | `gpt-4o` |
| `baseUrl` | API 엔드포인트 URL | `https://api.openai.com/v1` |

> `baseUrl`을 변경하면 사내 프록시 서버를 통해 API를 호출할 수 있습니다.

### CLI 옵션

| 옵션 | 설명 |
|---|---|
| `--set-api-key <key>` | API 키 설정 |
| `--model <model>` | 모델 변경 (세션 단위) |
| `--auto-approve` | Auto-approve 모드로 실행 |
| `--dangerously-skip-permissions` | 모든 권한 확인 건너뛰기 |
| `--help` | 도움말 표시 |

---

## 프로젝트 구조

```
bcave-code/
├── src/
│   ├── cli/
│   │   ├── index.tsx              # 진입점 — CLI 인자 파싱, 앱 실행
│   │   ├── App.tsx                # 메인 앱 — 화면 전환, 대화 루프
│   │   └── components/
│   │       ├── Banner.tsx         # ASCII 아트 배너
│   │       ├── ApiKeySetup.tsx    # API 키 입력 화면
│   │       ├── MessageOutput.tsx  # 메시지 출력 (유저/AI/도구)
│   │       └── PermissionPrompt.tsx # 권한 승인 프롬프트
│   ├── agent/
│   │   ├── conversation.ts        # ConversationManager — 에이전트 대화 루프
│   │   ├── tools.ts               # 5개 도구 정의 + 실행기
│   │   └── permissions.ts         # PermissionManager — 3단계 권한 관리
│   ├── openai/
│   │   └── client.ts              # OpenAI API 클라이언트 (재시도 로직 포함)
│   └── config/
│       └── config.ts              # 설정 파일 읽기/쓰기
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── install.sh                     # 원라인 설치 스크립트
└── README.md
```

---

## 기술 스택

| 기술 | 용도 |
|---|---|
| **Node.js + TypeScript** | 런타임 + 타입 안정성 |
| **ink** | React 기반 터미널 UI |
| **OpenAI SDK** | GPT-4 API + Function Calling |
| **meow** | CLI 인자 파싱 |
| **glob** | 파일 패턴 매칭 |
| **vitest** | 테스트 프레임워크 |

---

## 사용 예시

### 파일 정리

```
❯ 바탕화면에 있는 스크린샷 파일들을 날짜별로 폴더를 만들어서 정리해줘
```

### 코드 작성

```
❯ Express로 간단한 REST API 서버를 만들어줘. 유저 CRUD 기능이 필요해
```

### 프로젝트 분석

```
❯ 이 프로젝트의 구조를 분석하고, 개선할 점을 알려줘
```

### Git 작업

```
❯ 변경사항을 확인하고, 적절한 커밋 메시지로 커밋해줘
```

### 버그 수정

```
❯ src/api/handler.ts에서 발생하는 TypeError를 찾아서 수정해줘
```

---

## 라이선스

UNLICENSED — 사내 전용
