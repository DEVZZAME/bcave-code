#!/bin/bash
set -Eeuo pipefail

if [ -t 1 ]; then
    B='\033[1m'; C='\033[36m'; G='\033[32m'; Y='\033[33m'; D='\033[2m'; R='\033[0m'
else
    B=''; C=''; G=''; Y=''; D=''; R=''
fi
step() { printf "  ${C}▸${R} %s\n" "$1"; }
ok()   { printf "  ${G}✓${R} %s\n" "$1"; }
warn() { printf "  ${Y}!${R} %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1" >&2; }

INSTALL_DIR="$HOME/.bcave-cli"
BIN_DIR="$HOME/.local/bin"
ENTRY_REL="dist/cli/index.js"
LOCK_DIR="$HOME/.bcave-cli.install.lock"
REPO_URL="${BCAVE_REPO_URL:-https://github.com/DEVZZAME/bcave-code.git}"
TEMP_DIR=""
BACKUP_DIR=""
FAILED_DIR=""
ACTIVATED=0
LOCK_OWNED=0

cleanup() {
    status=$?
    trap - EXIT INT TERM
    if [ "$status" -ne 0 ]; then
        fail "설치가 완료되지 않았습니다. 기존 BCave는 유지됩니다."
        if [ "$ACTIVATED" -eq 1 ] && [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
            FAILED_DIR="$HOME/.bcave-cli.failed.$$.${RANDOM:-0}"
            [ -d "$INSTALL_DIR" ] && mv "$INSTALL_DIR" "$FAILED_DIR" 2>/dev/null || true
            mv "$BACKUP_DIR" "$INSTALL_DIR" 2>/dev/null || true
            warn "이전 설치본으로 복구했습니다."
        elif [ "$ACTIVATED" -eq 1 ] && [ -d "$INSTALL_DIR" ]; then
            FAILED_DIR="$HOME/.bcave-cli.failed.$$.${RANDOM:-0}"
            mv "$INSTALL_DIR" "$FAILED_DIR" 2>/dev/null || true
        fi
    fi
    [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ] && rm -rf "$TEMP_DIR"
    [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ] && rm -rf "$BACKUP_DIR"
    [ -n "$FAILED_DIR" ] && [ -d "$FAILED_DIR" ] && rm -rf "$FAILED_DIR"
    if [ "$LOCK_OWNED" -eq 1 ]; then
        rm -f "$LOCK_DIR/pid" 2>/dev/null || true
        rmdir "$LOCK_DIR" 2>/dev/null || true
    fi
    exit "$status"
}
trap cleanup EXIT INT TERM

printf "\n  ${B}${C}B.CAVE${R} ${B}CODE${R}\n"
printf "  ${C}────────────────────────────${R}\n"
printf "  ${D}사내 AI 코딩 에이전트 · 안전 설치${R}\n\n"

if [ -d "$LOCK_DIR" ]; then
    LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        fail "다른 BCave 설치 또는 업데이트가 진행 중입니다. (PID $LOCK_PID)"
        exit 1
    fi
    rm -f "$LOCK_DIR/pid" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
fi
mkdir "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"
LOCK_OWNED=1

for command_name in node npm git; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        fail "$command_name 명령을 찾을 수 없습니다."
        if [ "$command_name" = "git" ] && [ "$(uname -s)" = "Darwin" ]; then
            fail "macOS에서는 'xcode-select --install' 실행 후 다시 설치하세요."
        else
            fail "Node.js LTS와 Git을 설치한 뒤 새 터미널에서 다시 시도하세요."
        fi
        exit 1
    fi
done

NODE_VERSION=$(node -p 'process.versions.node')
NODE_MAJOR=${NODE_VERSION%%.*}
if [ "$NODE_MAJOR" -lt 20 ]; then
    fail "Node.js 20 이상이 필요합니다. (현재: v$NODE_VERSION)"
    exit 1
fi
case "$NODE_MAJOR" in
    20|22|24) ;;
    *) warn "Node.js v${NODE_VERSION}는 공식 LTS 검증 범위(20/22/24)가 아닙니다." ;;
esac
ok "Node.js v$NODE_VERSION"
ok "Git $(git --version | awk '{print $3}')"

TEMP_DIR=$(mktemp -d "$HOME/.bcave-cli.tmp.XXXXXX")
step "새 버전 다운로드"
git clone --depth 1 --quiet "$REPO_URL" "$TEMP_DIR"

step "의존성 설치"
(cd "$TEMP_DIR" && npm ci --silent --no-fund --no-audit)
step "Session mode 프로젝트 준비"
for session_project in "$TEMP_DIR"/assets/session-mode/projects/*; do
    [ -f "$session_project/package-lock.json" ] || continue
    (cd "$session_project" && npm ci --silent --no-fund --no-audit)
done
step "빌드"
(cd "$TEMP_DIR" && npm run build --silent)

step "설치본 검증"
[ -f "$TEMP_DIR/$ENTRY_REL" ] || { fail "빌드 엔트리가 생성되지 않았습니다: $ENTRY_REL"; exit 1; }
[ -d "$TEMP_DIR/node_modules" ] || { fail "node_modules가 생성되지 않았습니다."; exit 1; }
[ -d "$TEMP_DIR/assets/design-systems" ] || { fail "디자인 시스템 자산이 누락됐습니다."; exit 1; }
[ -f "$TEMP_DIR/assets/session-mode/dashboards/bcave-dashboard.html" ] || { fail "Session mode BCAVE 대시보드가 누락됐습니다."; exit 1; }
[ -f "$TEMP_DIR/assets/session-mode/dashboards/axis-dashboard.html" ] || { fail "Session mode AXIS 대시보드가 누락됐습니다."; exit 1; }
[ -f "$TEMP_DIR/assets/session-mode/dashboard-updates/bcave-dashboard.html" ] || { fail "Session mode BCAVE 수정본이 누락됐습니다."; exit 1; }
[ -f "$TEMP_DIR/assets/session-mode/dashboard-updates/axis-dashboard1.html" ] || { fail "Session mode AXIS 수정본이 누락됐습니다."; exit 1; }
for session_project in roundfit stylemetrics threadly; do
    [ -d "$TEMP_DIR/assets/session-mode/projects/$session_project/node_modules" ] || { fail "Session mode 프로젝트 의존성이 누락됐습니다: $session_project"; exit 1; }
done
node "$TEMP_DIR/$ENTRY_REL" --help >/dev/null
ok "실행 검증 통과"

if [ -d "$INSTALL_DIR" ]; then
    BACKUP_DIR="$HOME/.bcave-cli.backup.$(date +%s).$$"
    step "기존 설치본 보관"
    mv "$INSTALL_DIR" "$BACKUP_DIR"
fi

step "새 버전 활성화"
mv "$TEMP_DIR" "$INSTALL_DIR"
TEMP_DIR=""
ACTIVATED=1

mkdir -p "$BIN_DIR"
LAUNCHER_TMP="$BIN_DIR/.bcave.tmp.$$"
cat > "$LAUNCHER_TMP" <<EOF
#!/bin/sh
entry="$INSTALL_DIR/$ENTRY_REL"
if [ ! -f "\$entry" ]; then
  echo "BCAVE_ENTRY_MISSING: BCave 설치가 불완전합니다." >&2
  echo "복구: curl -fsSL https://raw.githubusercontent.com/DEVZZAME/bcave-code/master/install.sh | bash" >&2
  exit 1
fi
exec node "\$entry" "\$@"
EOF
chmod +x "$LAUNCHER_TMP"
mv "$LAUNCHER_TMP" "$BIN_DIR/bcave"

"$BIN_DIR/bcave" --help >/dev/null || { fail "최종 런처 검증에 실패했습니다."; exit 1; }

if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR"
    BACKUP_DIR=""
fi

SHELL_RC=""
case "${SHELL:-}" in
    */zsh) SHELL_RC="$HOME/.zshrc" ;;
    */bash) SHELL_RC="$HOME/.bashrc" ;;
esac
[ -z "$SHELL_RC" ] && [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
[ -z "$SHELL_RC" ] && SHELL_RC="$HOME/.profile"
touch "$SHELL_RC"
if ! grep -Fq '$HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
    printf '\n# BCave CLI\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$SHELL_RC"
fi

printf "\n  ${G}${B}✓ 설치 완료!${R}\n\n"
printf "  새 터미널에서 ${B}bcave${R}를 실행하세요.\n"
printf "  문제가 있으면 ${B}bcave doctor${R}로 진단할 수 있습니다.\n\n"
