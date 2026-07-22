export interface CliCommand {
  name: string;
  desc: string;
}

export const CLI_COMMANDS: readonly CliCommand[] = [
  { name: "/resume", desc: "이전 세션 다시 열기" },
  { name: "/model", desc: "모델 선택 (gpt-5.6-luna 기본 · auto 용도별 라우팅)" },
  { name: "/deploy", desc: "서비스를 사용할 장소 선택" },
  { name: "/verify", desc: "완료 전 오류 자동 확인 on/off" },
  { name: "/smoke", desc: "완성된 서비스 실제 실행 확인 on/off" },
  { name: "/usage", desc: "사용량/한도 확인" },
  { name: "/login", desc: "사내 계정 로그인" },
  { name: "/logout", desc: "로그아웃" },
  { name: "/mode", desc: "모드 전환" },
  { name: "/help", desc: "도움말 표시" },
  { name: "/reset", desc: "설정 초기화" },
];
