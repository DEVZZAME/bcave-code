// 디자인 시스템 프로필 (DESIGN_SYSTEM_PLAYBOOK.md 이식판).
// 각 프로필은 실제 역할 기반 토큰(색·반경) + 레이아웃/타이포/금지 원칙을 담는다.
// 시각 결과물 생성 시 [공통 원칙 + 선택 프로필]을 프롬프트에 주입한다. (특정 회사 화면 복제 아님)

/** 어떤 프로필을 골라도 항상 지키는 공통 원칙 (플레이북 §3 + §13 요약). */
export const DESIGN_COMMON = `[디자인 공통 원칙 — 어떤 프로필이든 항상 지킬 것]
· 정보구조: 첫 화면에서 "무엇을 보고 무엇을 해야 하는지" 5초 안에 이해되게. 제목 → 조회범위 → 핵심 상태 → 상세 → 주요 행동 순. 모든 정보를 같은 크기·강조로 두지 말 것. 핵심 KPI 는 3~5개로 제한. 데이터가 많으면 요약과 상세를 분리. 의사결정에 불필요한 장식은 제거.
· 대시보드: 모든 요소를 카드로 감싸지 말 것(여백·구분선·명도차로도 그룹핑). 표가 핵심이면 차트보다 표 가독성 우선. 변화량에는 비교 기준을 명시. 실제 데이터가 없으면 가짜를 진짜처럼 표현하지 말고 "예시 데이터"로 표기.
· 접근성: 의미를 색만으로 전달 금지. 키보드 포커스 명확히. 클릭 영역 충분히. 텍스트 대비 확보(옅은 회색 글자 금지). 아이콘 버튼에 접근 가능한 이름. prefers-reduced-motion 존중. 오류 메시지는 원인+해결을 함께.
· 상태 처리: loading / empty / error / 검색결과 없음 / 부분 데이터 / 긴 텍스트 / 매우 큰 숫자 를 반드시 고려.
· 차트: 시간변화=line/area · 항목비교=bar · 긴 항목명 순위=horizontal bar · 전체비율=항목 5개 이하 donut · 분포=histogram. 차트마다 제목·기간·단위·범례·툴팁·"데이터 없음" 상태·색상 외 구분 방법을 제공. (3D·장식용·무지개색·축 왜곡·의미없는 gradient fill 금지)
· **차트 색은 선택한 프로필의 포인트 컬러 "단일 계열"만 사용** — 초록·주황·빨강 등 다른 색상을 섞지 말 것. 여러 항목은 같은 포인트색의 명도·채도 변형(진한→옅은 톤)으로 구분하고, 강조할 한 항목만 포인트색·나머지는 옅은 톤/중립 회색. 상태색(성공/경고/오류)은 의미가 있을 때만 예외적으로.
· 금지: 모든 영역을 둥근 흰 카드로 / 의미 없는 그라데이션 / 과한 glassmorphism·블러 / 모든 컴포넌트에 그림자 / 무지개색 차트 / 지나치게 작은 회색 글자 / 기능 없는 장식 버튼 / 화면 상단의 과도한 환영 문구 / 위계 없는 동일 크기 KPI 반복 / 여러 디자인 시스템 무분별 혼합 / 특정 회사의 로고·상표·고유 화면 복제.
· 토큰 우선: 색·반경·간격·그림자는 화면마다 흩뿌리지 말고 :root 역할 토큰(--ds-*)으로 정의해 재사용.`;

// ── 프로필별 지침 (플레이북 §4~§8) ──
// 글꼴은 프로젝트 전역 규칙(Pretendard)을 따르므로 여기서는 폰트 스택 대신 크기·굵기 원칙만 담는다.

const apple = `[디자인 프로필: Apple] — 차분·정밀·절제·넓은 여백·낮은 시각 소음 (macOS형 데스크톱 대시보드/분석 도구에 적합). ※ apple.com 실측 기준.
토큰(:root[data-design-system="apple"] 로 정의 · apple.com 관측값):
  --ds-bg:#f5f5f7; --ds-surface:#ffffff; --ds-text:#1d1d1f; --ds-text-secondary:#6e6e73; --ds-text-tertiary:#86868b;
  --ds-border:rgba(0,0,0,.10); --ds-accent:#0071e3; --ds-link:#0066cc; --ds-positive:#248a3d; --ds-warning:#b25000; --ds-negative:#d70015;
  --ds-radius-sm:8px; --ds-radius-md:12px; --ds-radius-lg:16px;
글꼴(apple.com 실제 스택): font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Pretendard,sans-serif; (맥/iOS 에선 실제 SF Pro 로 렌더, 한글은 Pretendard 폴백)
차트 색(블루 단일 계열만): #0071e3 · #4a9cff · #86bdff · #b9d8ff · #dbebfc (진한→옅은 순). 다른 색상 혼합 금지.
레이아웃: 좌측 사이드바 + 상단 툴바 + 콘텐츠의 계층을 명확히. 8px 간격 체계. 카드로 다 감싸지 말고 여백·얇은 separator·배경 명도차로 그룹 구분. 툴바가 콘텐츠보다 시각적으로 앞서지 않게. 강조 버튼은 #0071e3 채움 + pill(둥근) 형태로 절제해서.
타이포: 큰 제목보다 정교한 크기·굵기 차이를 사용(제목 letter-spacing 살짝 음수). 본문 14px 이상. 숫자엔 단위·비교 기준 병기.
표면/깊이: 배경과 표면 사이 미세한 명도차. 반투명은 사이드바/툴바/popover 등 계층 표현에만(본문 카드 전체 블러 금지). 그림자는 작고 부드럽게. 모서리는 과하게 둥글게 하지 말 것(24px 이상 금지).
컴포넌트(이 프로필의 문법으로 구성): Sidebar · Toolbar · SearchField · SegmentedControl · InspectorPanel · SplitView(목록+상세) · DataTable · Popover · Sheet · ContextMenu · InlineStatus · EmptyState. 대시보드는 좌측 Sidebar + 상단 Toolbar + SplitView 로 구성하고, 정보 그룹은 카드가 아니라 여백·얇은 separator·SegmentedControl 로 나눈다.
피할 것: 모든 카드에 큰 blur / glossy 효과 / 제품 홍보 페이지 스타일을 업무 대시보드에 이식 / iOS·macOS 컴포넌트 문법 혼합.`;

const googleMaterial = `[디자인 프로필: Google Material 3] — 체계적·명확한 상태·역할 기반 컬러·반응형 (반응형 웹앱/B2C·B2B 서비스에 적합).
토큰(:root[data-design-system="google-material"] 로 정의):
  --ds-bg:#fef7ff; --ds-surface:#fffbfe; --ds-surface-container:#f3edf7; --ds-text:#1d1b20; --ds-text-secondary:#49454f;
  --ds-border:#79747e; --ds-accent:#6750a4; --ds-on-accent:#ffffff; --ds-accent-container:#eaddff; --ds-error:#b3261e;
  --ds-radius-sm:8px; --ds-radius-md:12px; --ds-radius-lg:16px;
레이아웃: compact/medium/expanded 너비 고려. 규모에 맞게 navigation rail·drawer·top app bar 선택. 주요/보조 행동 우선순위 명확. FAB 는 대표 행동이 하나일 때만(여러 개 금지). container 와 state layer 구분.
타이포: 역할 기반(page title/section title/card title/body/label/metric)으로 단순화해 위계 표현.
차트 색(퍼플 단일 계열만): #6750a4 · #8069c0 · #a08cd6 · #c4b6e8 · #e2d9f4 (진한→옅은 순). 다른 색상 혼합 금지.
글꼴: font-family:"Roboto",-apple-system,Pretendard,"Noto Sans KR",sans-serif; (한글은 Pretendard/Noto 폴백)
컬러: primary/surface/surface-container/outline/error 등 역할 토큰에 매핑. 컴포넌트 안에서 임의 hex 반복 금지. filled/outlined/elevated 표면 역할 구분, elevation 은 계층 설명에만.
컴포넌트(이 프로필의 문법으로 구성): TopAppBar · NavigationDrawer · NavigationRail · Tabs · Chips(필터/입력/선택 구분) · FilledButton · TonalButton · OutlinedButton · TextField · Select · Dialog · Snackbar · DataTable · Search · DatePicker · ProgressIndicator.
피할 것: 모든 요소에 elevation / primary color 를 모든 텍스트·아이콘에 / 과도한 색상 container / Material 2·3 혼합.`;

const microsoftFluent = `[디자인 프로필: Microsoft Fluent 2] — 생산성·높은 정보 밀도·명확한 계층·조용한 표면 (사내 업무 시스템/관리자·데이터 테이블 중심에 적합). ※ microsoft.com·Fluent 2 기준.
토큰(:root[data-design-system="microsoft-fluent"] 로 정의 · Fluent 2 / microsoft.com):
  --ds-bg:#f5f5f5; --ds-surface:#ffffff; --ds-surface-subtle:#fafafa; --ds-text:#242424; --ds-text-secondary:#616161;
  --ds-border:#d1d1d1; --ds-accent:#0f6cbd; --ds-link:#0067b8; --ds-positive:#0e7a0d; --ds-warning:#f7630c; --ds-negative:#c50f1f;
  --ds-radius-sm:4px; --ds-radius-md:6px; --ds-radius-lg:8px;
글꼴(microsoft.com 실제 스택): font-family:"Segoe UI","Segoe UI Web (West European)",-apple-system,Pretendard,sans-serif; (윈도우에선 실제 Segoe UI 로 렌더, 한글은 Pretendard 폴백)
차트 색(블루 단일 계열만): #0f6cbd · #2886de · #5ba3e8 · #8fc1f0 · #bcdcf7 (진한→옅은 순). 다른 색상 혼합 금지.
레이아웃: 정보 밀도·작업 효율 우선. 좌측 nav + command bar + 콘텐츠 구조. 목록+세부 패널의 master-detail 적극 활용. 넓은 데스크톱에서 공간 낭비 금지. 명령은 command bar 와 contextual menu 로 분리, 설정·필터는 side panel/drawer.
타이포: 업무 화면이므로 과도한 큰 제목 지양. 짧은 라벨·명확한 열 제목·일정한 숫자 정렬(tabular numbers). 보조 텍스트도 읽히는 대비.
표면/밀도: 모서리 절제. 그림자보다 border·배경 차이 우선. dense/comfortable 행 높이. 선택 상태는 배경+indicator+텍스트를 함께.
컴포넌트(이 프로필의 문법으로 구성): AppShell · NavDrawer · CommandBar · Toolbar · DataGrid · DetailsList(master-detail) · Tree · Breadcrumb · Pivot 또는 Tabs · Combobox · Persona · MessageBar · TeachingPopover · Drawer · Dialog. 대시보드는 AppShell + 좌측 NavDrawer + CommandBar + DataGrid(고밀도) 중심으로.
피할 것: 소비자 앱처럼 큰 카드·버튼 / 모든 명령 동시 노출 / 테이블 키보드 탐색 누락 / 선택 상태를 색 하나로만 / 과한 둥근 모서리·glassmorphism / 낮은 정보 밀도.`;

const toss = `[디자인 프로필: Toss-inspired] — 쉬움·명확함·친절함·행동 중심·강한 핵심 위계 (모바일 중심 생활/금융·쉬운 UX 에 적합). ※ tosspayments.com 실측 기준. Toss 브랜드·화면 복제 금지, 공식 TDS 라고 표현하지 말 것.
토큰(:root[data-design-system="toss"] 로 정의 · tosspayments.com 관측값):
  --ds-bg:#f2f4f6; --ds-surface:#ffffff; --ds-text:#191f28; --ds-text-secondary:#4e5968; --ds-text-tertiary:#6b7684; --ds-text-quaternary:#8b95a1;
  --ds-border:#d1d6db; --ds-border-soft:#e5e8eb; --ds-accent:#3182f6; --ds-accent-hover:#2272eb; --ds-accent-soft:#e8f3ff; --ds-positive:#00a878; --ds-warning:#f59f00; --ds-negative:#f04452;
  --ds-radius-sm:8px; --ds-radius-md:12px; --ds-radius-lg:16px;
글꼴: font-family:-apple-system,BlinkMacSystemFont,Pretendard,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; (Toss Product Sans 는 비공개이므로 Pretendard 로 대체 — 가장 유사)
차트 색(블루 단일 계열만 · 실제 Toss blue scale): #1b64da · #2272eb · #3182f6 · #64a8ff · #90c2ff · #c9e2ff. **초록·주황·빨강 등 절대 혼합 금지** — 토스는 블루 톤만 쓴다. 여러 항목은 위 진한→옅은 톤으로 구분.
정보구조: 한 화면에서 하나의 핵심 질문·행동을 우선. 지금 알아야 할 정보만 먼저, 나머지는 펼치기/상세/다음 단계로(progressive disclosure). 숫자는 판단 가능한 문맥과 함께. 어려운 용어는 일상어로. 중요한 상태는 상단에서 즉시 이해되게.
타이포: 한국어 가독성 최우선. 큰 핵심 숫자(굵게) + 짧은 제목 + 읽기 쉬운 본문. 굵기를 과하게 다양화하지 말 것. 강조 버튼은 #3182f6 채움.
UX 라이팅: 일상 언어, 행동·결과가 보이는 문장. 오류를 사용자 잘못처럼 쓰지 말고 다음 행동을 구체적으로. (나쁨: "유효하지 않은 파라미터입니다" / 좋음: "입력한 기간을 확인해 주세요. 종료일은 시작일보다 빠를 수 없어요")
컴포넌트(이 프로필의 문법으로 구성): LargeTitle · KeyMetric(큰 핵심 숫자) · SummaryCard · ListRow · PrimaryButton · BottomAction · InlineNotice · Tooltip 또는 HelpSheet · Stepper · SimpleTabs · AmountInput · Confirmation · EmptyState. 핵심 지표는 KeyMetric 으로 크게, 상세는 ListRow 로.
피할 것: 파란색+큰 버튼만 적용 / 모든 내용을 큰 글자로 / PC 대시보드를 모바일 카드처럼 / 중요한 정보를 여러 탭에 숨김 / 지나친 존댓말·긴 설명.`;

const kakao = `[디자인 프로필: Kakao-inspired] — 친근함·즉시 이해·생활 서비스다운 실용성·부드러운 형태·따뜻한 중립색 (생활 밀착/커뮤니케이션·B2C 에 적합). ※ kakaocorp.com 실측 기준. Kakao 브랜드·말풍선·캐릭터·특정 화면 복제 금지, 공식 디자인 시스템이라 표현하지 말 것.
토큰(:root[data-design-system="kakao"] 로 정의 · kakaocorp.com 관측값):
  --ds-bg:#f9f9f9; --ds-surface:#ffffff; --ds-surface-warm:#f7f7f5; --ds-text:#191919; --ds-text-secondary:#666666; --ds-text-tertiary:#8e8e8e;
  --ds-border:#e5e5e5; --ds-accent:#fee500; --ds-accent-deep:#ffcd00; --ds-accent-text:#191919; --ds-positive:#2e8b57; --ds-warning:#e68a00; --ds-negative:#ff0919;
  --ds-radius-sm:8px; --ds-radius-md:12px; --ds-radius-lg:16px;
글꼴: font-family:-apple-system,BlinkMacSystemFont,Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; (KakaoBig 는 비공개이므로 Pretendard 로 대체)
차트 색(옐로/앰버 단일 계열만): #ffb200 · #ffcd00 · #fee500 · #ffef7a · #fff6b8 (진한→옅은 순). 다른 색상 혼합 금지. 배경이 흰색이라 옅은 노랑은 진한 앰버(#ffb200)를 기본으로 대비 확보, 강조 항목만 순수 #fee500.
정보구조: 자주 하는 행동(탐색·알림·메시지·최근 기록)을 첫 화면에서 빠르게. 제목·주요 행동은 단순하게. 친근함을 위해 정보 위계를 희생하지 말 것. 실제 kakaocorp 은 흑백 위주에 옐로를 아주 절제해서 씀.
컬러: Kakao Yellow(#fee500)는 강조·핵심 행동 등 꼭 필요한 곳에만 신중히(전체를 노란색으로 채우지 말 것). 강조색 위 텍스트는 --ds-accent-text(어두운색) 사용.
타이포: 짧은 한국어 제목 + 읽기 쉬운 본문. 지나치게 얇은 굵기 금지. 친근함을 이유로 모든 텍스트를 둥글고 크게 만들지 말 것.
레이아웃: 리스트+카드 조합(모든 항목을 카드로 만들지 말 것). 알림·상태·최근 활동은 시간 정보와 함께. 일러스트는 empty state·onboarding 등 필요한 곳에만.
컴포넌트(이 프로필의 문법으로 구성): TopBar · BottomNavigation · SearchField · CategoryTabs · ListRow · Profile 또는 Avatar · ChatBubble · NotificationItem · ActionCard · InlineBanner · BottomSheet · EmptyState. (KakaoLoginButton 은 공식 연동 시에만 공식 가이드대로.)
피할 것: 전체 화면을 노란색으로 / 채팅 UI 를 모든 서비스에 / 이모지·캐릭터를 기본 UI 처럼 남용 / 친근함을 이유로 정보 밀도·가독성 저하.`;

/** 프로필 id → 프롬프트 지침. "auto"(알아서 잘)는 공통 원칙만 적용하므로 여기에 없음. */
export const DESIGN_PROFILES: Record<string, string> = {
  apple,
  "google-material": googleMaterial,
  "microsoft-fluent": microsoftFluent,
  toss,
  kakao,
};
