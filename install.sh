#!/bin/bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║        BCave CLI 설치 스크립트         ║"
echo "  ║   OpenAI GPT-4 기반 코딩 에이전트      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

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

echo "✅ Node.js $(node -v) 확인"

# 설치 경로
INSTALL_DIR="$HOME/.bcave-cli"
BIN_DIR="$HOME/.local/bin"

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 기존 설치를 업데이트합니다..."
    rm -rf "$INSTALL_DIR"
fi

# 클론
echo "📦 BCave CLI를 다운로드합니다..."
git clone --depth 1 https://github.com/DEVZZAME/bcave-agent.git "$INSTALL_DIR"

# 설치 + 빌드
cd "$INSTALL_DIR"
echo "📦 의존성을 설치합니다..."
npm install --silent
echo "🔨 빌드 중..."
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

echo ""
echo "✅ BCave CLI 설치 완료!"
echo ""
echo "  다음 단계:"
echo "    1. 터미널을 새로 열어주세요."
echo ""
echo "    2. 실행:"
echo "       bcave"
echo ""
echo "       (첫 실행 시 API 키를 직접 입력할 수 있습니다)"
echo ""
