> **보관 문서:** 초기 설계 기록이며 현재 구현을 설명하지 않습니다. 최신 설치·사용법은 저장소 루트의 README를 따르세요.

# BCave CLI — OpenAI GPT-4 기반 로컬 코딩 에이전트

## 개요

터미널에서 GPT-4와 대화하며 로컬 파일 읽기/쓰기, 명령 실행이 가능한 CLI 에이전트.
사내 GitHub 레포에 올려두고, 직원들이 npm install로 설치하여 Codex/Claude Code처럼 사용.

## 기술 스택

- **런타임**: Node.js + TypeScript
- **CLI UI**: ink (React for CLI)
- **LLM**: OpenAI API (`gpt-4o`) + Function Calling
- **패키징**: npm 패키지 (사내 GitHub Packages 또는 npm registry)

## 권한 모드 (3단계)

### Safe (기본, 플래그 없음)
- 모든 파일 변경/명령 실행 전 `[Y/n]` 확인 요청
- 사용자가 명시적으로 승인해야 실행

### Auto-approve (`--auto-approve`)
- 같은 카테고리 작업을 한 번 승인하면 이후 자동 승인
- 예: "파일 쓰기" 한 번 승인 → 이후 파일 쓰기는 묻지 않음
- 세션 단위로 리셋 (재실행하면 초기화)

### YOLO (`--dangerously-skip-permissions`)
- 모든 작업 무조건 자동 실행, 확인 없음
- 실행 시 경고 메시지 한 번 표시

## 승인 카테고리

| 카테고리 | 설명 | 예시 |
|---|---|---|
| `file_read` | 파일 내용 읽기 | `read_file("src/index.ts")` |
| `file_write` | 파일 생성/수정/삭제 | `write_file("README.md", ...)` |
| `shell_exec` | 터미널 명령 실행 | `shell_exec("npm install")` |

## 아키텍처

```
bcave "이 프로젝트에 테스트 추가해줘"
  │
  ├─ CLI Layer (ink + React)
  │   ├─ 입력 파싱 (인자, 플래그)
  │   ├─ 권한 확인 UI ([Y/n], [Y/always/n])
  │   └─ 출력 렌더링 (마크다운, diff, 스피너)
  │
  ├─ Agent Core
  │   ├─ ConversationManager — 대화 히스토리 관리, OpenAI 메시지 포맷 변환
  │   ├─ ToolExecutor — 도구 호출 실행, 결과 반환
  │   └─ PermissionManager — 승인 모드 관리, 카테고리별 승인 상태 추적
  │
  └─ OpenAI API
      └─ GPT-4o + Function Calling (tool_choice: auto)
```

## 도구 (GPT Function Calling)

### read_file
- **입력**: `path: string`
- **동작**: 파일 내용을 읽어서 반환
- **권한**: `file_read`

### write_file
- **입력**: `path: string, content: string`
- **동작**: 파일 생성 또는 덮어쓰기. 디렉토리가 없으면 생성.
- **권한**: `file_write`

### list_files
- **입력**: `path: string, pattern?: string`
- **동작**: 디렉토리 내 파일 목록 반환. glob 패턴 지원.
- **권한**: `file_read`

### search_files
- **입력**: `pattern: string, path?: string`
- **동작**: 파일 내용에서 정규식 검색
- **권한**: `file_read`

### shell_exec
- **입력**: `command: string`
- **동작**: 쉘 명령 실행, stdout/stderr 반환
- **권한**: `shell_exec`
- **제한**: 타임아웃 120초 (기본)

## 사용 흐름

```bash
# 설치
npm install -g @bcave/cli

# API 키 설정 (최초 1회, ~/.bcave/config.json에 저장)
bcave --set-api-key sk-xxxxx

# 기본 사용 (Safe 모드)
bcave "README.md를 한국어로 번역해줘"

# 자동 승인 모드
bcave --auto-approve "src 폴더의 모든 js를 ts로 변환해줘"

# 전체 스킵
bcave --dangerously-skip-permissions "프로젝트 초기 세팅해줘"

# 대화형 모드 (인자 없이 실행)
bcave
> 이 프로젝트 구조 설명해줘
```

## 설정 파일

`~/.bcave/config.json`:
```json
{
  "apiKey": "sk-xxxxx",
  "model": "gpt-4o",
  "baseUrl": "https://api.openai.com/v1"
}
```

- `apiKey`: OpenAI API 키
- `model`: 사용할 모델 (기본 gpt-4o, 변경 가능)
- `baseUrl`: API 엔드포인트 (사내 프록시 사용 시 변경 가능)

## 프로젝트 구조

```
bcave-code/
├── src/
│   ├── cli/
│   │   ├── index.tsx        # 진입점, 인자 파싱
│   │   ├── App.tsx          # ink 메인 컴포넌트
│   │   └── components/      # UI 컴포넌트 (프롬프트, 승인, 출력)
│   ├── agent/
│   │   ├── conversation.ts  # ConversationManager
│   │   ├── tools.ts         # ToolExecutor + 도구 정의
│   │   └── permissions.ts   # PermissionManager
│   ├── openai/
│   │   └── client.ts        # OpenAI API 클라이언트
│   └── config/
│       └── config.ts        # 설정 파일 읽기/쓰기
├── package.json
├── tsconfig.json
└── README.md
```

## 에러 처리

- **API 키 미설정**: 첫 실행 시 `bcave --set-api-key` 안내
- **API 에러 (429, 500 등)**: 재시도 로직 (3회, exponential backoff)
- **도구 실행 실패**: 에러 메시지를 GPT에 전달하여 자체 복구 시도
- **타임아웃**: shell_exec 120초 초과 시 중단 후 알림
