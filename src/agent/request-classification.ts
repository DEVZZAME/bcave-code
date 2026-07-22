const APP_NOUN =
  /(서비스|애플리케이션|어플리케이션|어플\b|백엔드|backend|서버\b|\bserver\b|\bapi\b|엔드포인트|endpoint|데이터베이스|\bdb\b|회원가입|회원 ?관리|로그인 ?기능|인증 ?기능|\bauth\b|계정|crud|결제|주문 ?관리|재고|예약 ?(시스템|기능|서비스)|게시판|커뮤니티|채팅|메시지|실시간|알림|쇼핑몰|풀스택|full[- ]?stack|\bsaas\b|웹\s?서비스|웹앱|웹\s?애플리케이션|백오피스|관리자 ?(시스템|페이지|도구))/i;

/** 정적 목업이 아니라 실제 백엔드/데이터가 있는 애플리케이션을 만들라는 요청인가. */
export function isAppBuild(message?: string): boolean {
  if (!message) return false;
  if (/(목업|mockup|mock-up|시안|정적|static|한 ?페이지|단일 ?html|프로토타입 ?화면)/i.test(message)) return false;
  return APP_NOUN.test(message);
}

export type UiSurface = "auth" | "dashboard" | "platform";

/** 같은 디자인 시스템 안에서도 화면의 제품 성격에 맞는 구성을 선택한다. */
export function classifyUiSurface(message?: string): UiSurface {
  if (message && /(로그인|회원가입|가입 ?화면|비밀번호|인증 ?화면|sign[ -]?in|sign[ -]?up|forgot password|reset password|\bauth\b)/i.test(message)) {
    return "auth";
  }
  if (message && /(대시보드|dashboard|kpi|지표|차트|분석|analytics|리포트|보고서|통계)/i.test(message)) {
    return "dashboard";
  }
  return "platform";
}

/**
 * 단독 HTML 대시보드/리포트 산출물인가 (디자인시스템 파이프라인을 강제하는 경우).
 * 단순 화면 요청("화면 만들어줘", "페이지 만들어줘")은 해당하지 않는다.
 * 디자인시스템 제약은 대시보드/리포트와 서비스 맥락의 앱 UI에만 적용한다.
 */
export function isDashboardArtifactRequest(message: string): boolean {
  if (isPresentationRequest(message)) return false;
  return /(대시보드|dashboard|리포트|보고서|report|analytics\s*화면)/i.test(message);
}

/** PowerPoint/발표자료 요청은 보고서라는 단어가 있어도 HTML 대시보드가 아니다. */
export function isPresentationRequest(message: string): boolean {
  return /(피피티|파워포인트|프레젠테이션|발표\s*자료|슬라이드|\bpptx?\b|power\s*point)/i.test(message);
}

/** 배포 플랫폼이 메시지에 명시됐으면 그 이름을 반환. 없으면 null. */
export function detectDeployTarget(message: string): string | null {
  const m = message.toLowerCase();
  // SQLite/better-sqlite3 명시는 빠른 로컬 검증 모드로 취급한다.
  if (/sqlite|better-sqlite3|로컬\s*(?:db|데이터베이스)|빠른\s*로컬\s*검증/i.test(m)) return "local";
  if (/vercel/i.test(m)) return "vercel";
  if (/railway/i.test(m)) return "railway";
  if (/fly\.io|flyio/i.test(m)) return "fly";
  if (/\baws\b|ec2|ecs|elastic\s*beanstalk/i.test(m)) return "aws";
  if (/heroku/i.test(m)) return "heroku";
  if (/vps|ubuntu|nginx|자체\s*서버|온프레미스|on.?prem/i.test(m)) return "vps";
  if (/로컬|local|개발용|테스트용|나중에\s*배포|지금은\s*로컬/i.test(m)) return "local";
  return null;
}
