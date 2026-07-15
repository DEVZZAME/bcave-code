#!/bin/bash
set -e

# ── 색상 (미지원 터미널이면 무시됨) ──
if [ -t 1 ]; then
    B='\033[1m'; C='\033[36m'; G='\033[32m'; Y='\033[33m'; D='\033[2m'; R='\033[0m'
else
    B=''; C=''; G=''; Y=''; D=''; R=''
fi
step() { printf "  ${C}▸${R} %s\n" "$1"; }
ok()   { printf "  ${G}✓${R} %s\n" "$1"; }

printf "\n"
printf "  ${B}${C}B.CAVE${R} ${B}AGENT${R}\n"
printf "  ${C}────────────────────────────${R}\n"
printf "  ${D}사내 AI 코딩 에이전트 · 사내 계정 로그인${R}\n"
printf "\n"

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "   https://nodejs.org 에서 Node.js 18 이상을 설치해주세요."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 이상이 필요합니다. (현재: $(node -v))"
    exit 1
fi

ok "Node.js $(node -v)"

# 설치 경로
INSTALL_DIR="$HOME/.bcave-cli"
BIN_DIR="$HOME/.local/bin"

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    step "기존 설치 업데이트"
    rm -rf "$INSTALL_DIR"
fi

# 클론
step "다운로드"
git clone --depth 1 -q https://github.com/DEVZZAME/bcave-agent.git "$INSTALL_DIR"

# 설치 + 빌드
cd "$INSTALL_DIR"
step "의존성 설치 (1~2분 걸릴 수 있어요)"
npm install --silent
step "빌드"
npm run build --silent

# 실행 권한 부여
chmod +x dist/cli/index.js

# bcave 런처 생성 (심볼릭 링크 대신 래퍼 스크립트)
#
# 심볼릭 링크로 dist/cli/index.js 를 직접 가리키면, Windows(Git Bash)처럼
# 심링크가 "파일 복사"로 처리되는 환경에서 런처가 node_modules 와 분리되어
# ESM 이 의존성을 못 찾는다: "Cannot find package 'chalk' imported from
# .../.local/bin/bcave". 래퍼가 node 에게 설치 폴더 안의 실제 경로를 넘기면
# 의존성 해석이 항상 $INSTALL_DIR/node_modules 로 향해 모든 OS 에서 동작한다.
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/bcave" <<EOF
#!/bin/sh
exec node "$INSTALL_DIR/dist/cli/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/bcave"

# PATH에 ~/.local/bin 추가 (없으면)
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q '.local/bin' "$SHELL_RC" 2>/dev/null; then
        echo '' >> "$SHELL_RC"
        echo '# BCave CLI' >> "$SHELL_RC"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    fi
fi

# 현재 세션에도 즉시 적용
export PATH="$HOME/.local/bin:$PATH"

printf "\n"
printf "  ${G}${B}✓ 설치 완료!${R}\n\n"
printf "  ${B}다음 단계${R}\n"
printf "    ${C}1.${R} 터미널을 ${B}새로${R} 열기\n"
printf "    ${C}2.${R} ${B}bcave${R} 입력 후 실행\n"
printf "    ${C}3.${R} 사내 ${B}이메일 / 비밀번호${R}로 로그인\n\n"
printf "  ${D}로그인이 안 되면 관리자에게 BCAVE_CODE 승인을 요청하세요.${R}\n\n"
