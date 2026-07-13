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

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 기존 설치를 업데이트합니다..."
    cd "$HOME"
    npm unlink -g @bcave/cli 2>/dev/null || true
    rm -rf "$INSTALL_DIR"
fi

# 클론
echo "📦 BCave CLI를 다운로드합니다..."
git clone --depth 1 https://github.com/DEVZZAME/bcave-code.git "$INSTALL_DIR" 2>/dev/null

# 설치 + 빌드
cd "$INSTALL_DIR"
echo "📦 의존성을 설치합니다..."
npm install --silent 2>/dev/null
echo "🔨 빌드 중..."
npm run build --silent 2>/dev/null

# 실행 권한 부여
chmod +x dist/cli/index.js

# npm link (권한 문제 시 sudo로 재시도)
echo "🔗 bcave 명령어를 등록합니다..."
if npm link 2>/dev/null; then
    true
else
    echo "   관리자 권한이 필요합니다. 비밀번호를 입력해주세요."
    sudo npm link 2>/dev/null
fi

echo ""
echo "✅ BCave CLI 설치 완료!"
echo ""
echo "  다음 단계:"
echo "    bcave --set-api-key sk-xxxxx    # API 키 설정 (최초 1회, 사내 공유 키 입력)"
echo ""
echo "  설정 후 사용:"
echo "    bcave \"파일 정리해줘\""
echo ""
