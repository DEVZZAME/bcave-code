// 프론트엔드 "아트 디렉션" 메뉴 — 획일화(모델 디폴트 룩 회귀)를 깨기 위한 구체적 스타일 팩.
// frontend_design 도구가 매 호출마다 서로 다른 디렉션 하나를 강제 주입한다(폰트·팔레트·모양·모션까지).
// 각 디렉션은 "예쁘게"가 아니라 구체적 토큰으로 명세 → 약한 모델도 뚜렷하게 다른 결과를 낸다.

export interface Direction {
  id: string;
  name: string; // 한/영
  vibe: string; // 한 줄 분위기
  bestFor: string; // 어디에 어울리나
  fonts: string; // 폰트 + Google Fonts 링크
  palette: string; // 배경/표면/텍스트/보조/강조 (hex)
  shape: string; // 라운드·보더·그림자
  type: string; // 타이포 스케일·자간
  motion: string; // 모션/인터랙션
  signature: string; // 이 스타일만의 "시그니처 무브"
  avoid: string; // 하지 말 것
}

export const DIRECTIONS: Direction[] = [
  {
    id: "swiss",
    name: "스위스 / International Typographic",
    vibe: "엄격한 그리드·거대한 타이포·여백. 차갑고 정밀.",
    bestFor: "포트폴리오, 에이전시, 제품 소개, 디자인 도구",
    fonts: `Helvetica Neue 계열 — <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet"> (Inter, 700~900 활용)`,
    palette: "배경 #F4F4F2 · 텍스트 #0A0A0A · 강조 단 하나 #FF3B00(레드) 또는 #0A0A0A. 회색조만.",
    shape: "라운드 0. 보더 1px #0A0A0A 또는 없음. 그림자 없음. 완전 플랫.",
    type: "디스플레이 초대형(clamp(48px,8vw,120px)) 900, 자간 -0.04em. 본문 15px 400. 좌측정렬 강한 위계.",
    motion: "거의 없음. hover 시 밑줄/색 반전만.",
    signature: "거대한 섹션 번호(01/02), 기준선 그리드, 규칙(rule) 라인, 비대칭 컬럼.",
    avoid: "그라디언트·그림자·둥근 모서리·중앙정렬 카드.",
  },
  {
    id: "editorial",
    name: "에디토리얼 / 매거진",
    vibe: "세리프 디스플레이·넓은 여백·잡지 지면 같은 위계.",
    bestFor: "블로그, 브랜드 스토리, 랜딩, 뉴스레터",
    fonts: `세리프+산세리프 혼합 — <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Inter:wght@400;500&display=swap" rel="stylesheet">`,
    palette: "따뜻한 종이 #FBF9F4 · 텍스트 #1A1712 · 강조 #B4472B(테라코타) 또는 #2E5E4E(딥그린). 헤어라인 #E4DDCF.",
    shape: "라운드 최소(2~4px). 얇은 hairline 구분선. 그림자 없음.",
    type: "제목 Fraunces 900 clamp(40px,6vw,84px). 본문 세리프/산세리프 18px lh1.7. 드롭캡·풀쿼트.",
    motion: "부드러운 페이드/슬라이드(정도껏).",
    signature: "드롭캡, 큰 인용문(pull-quote), 비대칭 2~3단, 캡션 있는 이미지.",
    avoid: "SaaS 카드 그리드, 인디고 그라디언트, 꽉 찬 색면.",
  },
  {
    id: "brutalist",
    name: "뉴브루탈리즘",
    vibe: "두꺼운 검은 보더·하드 오프셋 그림자·원색. 날것·강렬.",
    bestFor: "스타트업 랜딩, 이벤트, 개발자 도구, 개성 강한 브랜드",
    fonts: `그로테스크/모노 — <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet">`,
    palette: "배경 #FFFDF5 또는 원색면. 텍스트 #000. 강조 원색 #FFDE00(옐로)/#4D5DFF(블루)/#FF5C00. 흰/검 대비.",
    shape: "라운드 0~6px. 보더 2~3px #000. 그림자 = 하드 오프셋 6px 6px 0 #000(블러 0).",
    type: "굵은 700, 큼직. 자간 타이트. 라벨 대문자 모노.",
    motion: "hover 시 그림자/위치 툭 이동(translate), 색 반전. 딱딱한 전환.",
    signature: "solid 오프셋 그림자, 두꺼운 보더 박스, 색면 블록, 살짝 기울인 배지.",
    avoid: "부드러운 그림자·파스텔·미묘한 그라디언트.",
  },
  {
    id: "luxe",
    name: "럭스 / 프리미엄 다크",
    vibe: "짙은 차콜·골드 헤어라인·얇은 세리프·넓은 정적. 고급.",
    bestFor: "브랜드/제품 프리미엄, 부동산, 뷰티, 하이엔드 서비스",
    fonts: `얇은 세리프+산세 — <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;500&family=Inter:wght@300;400&display=swap" rel="stylesheet">`,
    palette: "배경 #0E0E10 · 표면 #16161A · 텍스트 #EDEAE3 · 보조 #8A857B · 강조 #C6A664(골드)/#B08D57.",
    shape: "라운드 0~2px. 골드 1px 헤어라인 보더. 그림자 없음(정적).",
    type: "디스플레이 Cormorant 300 clamp(44px,7vw,96px). 라벨 대문자 자간 0.25em. 본문 얇게 300~400.",
    motion: "아주 느린 페이드(0.6s), 골드 언더라인 그로우.",
    signature: "얇은 골드 라인, 레터스페이스 캡션, 광활한 여백, 중앙 대칭 히어로.",
    avoid: "밝은 배경·굵은 폰트·채도 높은 색·큰 라운드.",
  },
  {
    id: "terminal",
    name: "레트로 터미널 / 사이버",
    vibe: "모노스페이스·다크·형광 포스포. 해커/CLI 감성.",
    bestFor: "개발자 도구, API, 대시보드, 테크 프로덕트",
    fonts: `모노 — <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">`,
    palette: "배경 #0A0E0A · 표면 #0F160F · 텍스트 #C8F7C5 · 보조 #4FA34A · 강조 #39FF14(그린) 또는 #FFB000(앰버).",
    shape: "라운드 0~4px. 보더 1px rgba(형광,.3). 그림자 = 형광 글로우.",
    type: "전부 모노스페이스. 대문자 라벨. 커서 깜빡임(_).",
    motion: "타이핑 효과, 스캔라인, 글로우 펄스.",
    signature: "프롬프트 기호($ >), 스캔라인 오버레이, 형광 테두리 글로우, ASCII 구분선.",
    avoid: "세리프·파스텔·부드러운 곡선·밝은 배경.",
  },
  {
    id: "soft",
    name: "소프트 / 오가닉",
    vibe: "파스텔·큰 라운드·부드러운 글로우·둥근 폰트. 다정·편안.",
    bestFor: "웰니스, 헬스, 교육, 커뮤니티, 소비자 앱",
    fonts: `둥근 산세 — <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&display=swap" rel="stylesheet">`,
    palette: "배경 #FBF7FF · 표면 #FFFFFF · 텍스트 #3B3550 · 강조 #8B7CFF(라벤더)/#FF9EC4(핑크)/#7DD3C0(민트).",
    shape: "라운드 큼(20~32px). 보더 없음. 그림자 부드럽게(0 12px 40px rgba(색,.18)).",
    type: "둥근 800 제목. 본문 16px lh1.7. 친근한 위계.",
    motion: "말랑한 스프링 hover(scale 1.03), 부드러운 페이드.",
    signature: "블롭(blob) 배경, 소프트 그림자 카드, 파스텔 그라디언트, 둥근 배지/칩.",
    avoid: "날카로운 모서리·검은 보더·고대비·모노.",
  },
  {
    id: "minimal",
    name: "미니멀 / 모노크롬",
    vibe: "거의 흑백·단 하나의 강조·극도의 절제·큰 여백.",
    bestFor: "제품/도구 랜딩, 개인 사이트, 문서, B2B",
    fonts: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`,
    palette: "배경 #FFFFFF · 텍스트 #111 · 보조 #6B7280 · 보더 #ECECEC · 강조 하나(예 #111 또는 #2563EB) 극소량.",
    shape: "라운드 8~10px. 보더 1px #ECECEC. 그림자 거의 없음(아주 옅게).",
    type: "제목 600 clamp(32px,4.5vw,56px). 본문 15~16px. 조용한 위계, 넓은 행간.",
    motion: "미묘한 페이드/이동만. 절제.",
    signature: "광활한 여백, 얇은 구분선, 한 가지 강조색을 아주 드물게.",
    avoid: "여러 색·그라디언트·큰 그림자·장식.",
  },
  {
    id: "playful",
    name: "플레이풀 / 팝",
    vibe: "쨍한 원색·큼직 라운드·굵은 폰트·에너지. 밝고 재밌게.",
    bestFor: "소비자 앱, 이벤트, 어린이/교육, 캠페인, 게임",
    fonts: `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800&display=swap" rel="stylesheet">`,
    palette: "배경 #FFF8E7 또는 색면. 강조 다색 #FF5470/#22C55E/#3B82F6/#FDB833. 텍스트 #1B1B3A.",
    shape: "라운드 큼(16~28px). 보더 2px 또는 없음. 컬러 그림자.",
    type: "800 두껍고 큼. 살짝 통통. 라벨 칩.",
    motion: "탄력 있는 hover(scale/tilt), 통통 튀는 전환.",
    signature: "색면 블록, 살짝 기울인 요소, 큰 이모지 대체 도형, 컬러풀 배지.",
    avoid: "다크·세리프·미묘한 회색조·플랫한 절제.",
  },
  {
    id: "glass",
    name: "글래스모피즘 / 오로라",
    vibe: "생동감 그라디언트 배경·프로스티드 유리 패널·블러.",
    bestFor: "핀테크, SaaS 히어로, 프로덕트, 대시보드 랜딩",
    fonts: `<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap" rel="stylesheet">`,
    palette: "배경 = 다채 그라디언트/오로라(#6D5BFF→#00C2FF→#FF7AD9). 패널 rgba(255,255,255,.12). 텍스트 #F5F7FF.",
    shape: "라운드 18~24px. 보더 1px rgba(255,255,255,.25). backdrop-filter: blur(20px). 은은한 그림자.",
    type: "제목 700 clamp(36px,5vw,72px). 본문 밝은 회백.",
    motion: "떠다니는 오브(orb) 애니, 부드러운 패럴랙스, 글로우 hover.",
    signature: "프로스티드 유리 카드, 배경 블러 오브, 그라디언트 텍스트/보더.",
    avoid: "플랫 화이트 배경·검은 보더·모노·종이 질감.",
  },
  {
    id: "warm",
    name: "웜 / 핸드크래프트",
    vibe: "흙빛 팔레트·휴머니스트 폰트·아늑하고 사람 냄새.",
    bestFor: "F&B, 로컬 브랜드, 공예/리테일, 커뮤니티, 포트폴리오",
    fonts: `<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Work+Sans:wght@400;600&display=swap" rel="stylesheet">`,
    palette: "배경 #F3EBDD · 표면 #FBF6EC · 텍스트 #3A2E22 · 강조 #C2703D(테라코타)/#5B6B4F(세이지)/#A8442A.",
    shape: "라운드 10~16px. 보더 1px #E0D4BF. 그림자 아주 옅게.",
    type: "제목 Fraunces 500 세리프. 본문 Work Sans 16px lh1.7. 따뜻한 위계.",
    motion: "잔잔한 페이드/이동.",
    signature: "흙빛 색면, 아치/둥근 이미지 마스크, 손그림 느낌 구분선, 넉넉한 여백.",
    avoid: "네온·다크 테크·차가운 블루·글래스.",
  },
];

/** 이름/별칭 → 디렉션. 못 찾으면 null. */
export function findDirection(input?: string): Direction | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const alias: Record<string, string> = {
    "스위스": "swiss", swiss: "swiss", international: "swiss",
    "에디토리얼": "editorial", editorial: "editorial", magazine: "editorial", "매거진": "editorial",
    "브루탈": "brutalist", brutalist: "brutalist", brutalism: "brutalist", "뉴브루탈리즘": "brutalist",
    "럭스": "luxe", luxe: "luxe", luxury: "luxe", premium: "luxe", "프리미엄": "luxe",
    "터미널": "terminal", terminal: "terminal", cyber: "terminal", retro: "terminal", "레트로": "terminal",
    "소프트": "soft", soft: "soft", organic: "soft", pastel: "soft",
    "미니멀": "minimal", minimal: "minimal", mono: "minimal", monochrome: "minimal",
    "플레이풀": "playful", playful: "playful", pop: "playful", fun: "playful",
    "글래스": "glass", glass: "glass", glassmorphism: "glass", aurora: "glass",
    "웜": "warm", warm: "warm", handcraft: "warm", earthy: "warm",
  };
  const id = alias[s] ?? DIRECTIONS.find((d) => d.id === s || d.name.toLowerCase().includes(s))?.id;
  return DIRECTIONS.find((d) => d.id === id) ?? null;
}

/** 디렉션 하나를 상세 명세 텍스트로. */
export function renderDirection(d: Direction): string {
  return (
    `## 이번 디자인 디렉션: ${d.name}\n` +
    `분위기: ${d.vibe}\n어울림: ${d.bestFor}\n\n` +
    `- 폰트: ${d.fonts}\n` +
    `- 팔레트: ${d.palette}\n` +
    `- 모양(라운드·보더·그림자): ${d.shape}\n` +
    `- 타이포: ${d.type}\n` +
    `- 모션: ${d.motion}\n` +
    `- 시그니처(꼭 살릴 것): ${d.signature}\n` +
    `- 금지: ${d.avoid}`
  );
}

/** 전체 디렉션 이름+한줄 목록. */
export function directionMenu(): string {
  return DIRECTIONS.map((d, i) => `${i + 1}. ${d.id} — ${d.name}: ${d.vibe}`).join("\n");
}

// 세션 내에서 직전과 다른 디렉션을 배정(획일화 방지). 프로세스 메모리 기반.
let _lastId = "";
export function rotateDirection(): Direction {
  const pool = DIRECTIONS.filter((d) => d.id !== _lastId);
  const d = pool[Math.floor(Math.random() * pool.length)] ?? DIRECTIONS[0];
  _lastId = d.id;
  return d;
}

// 사용자가 말한 "느낌/스타일" 단어 → 디렉션 (한/영)
const STYLE_WORDS: Array<[RegExp, string]> = [
  [/부드럽|파스텔|따뜻하게|친근|말랑|포근|은은|soft|pastel/i, "soft"],
  [/심플|미니멀|깔끔|단순|간결|정갈|담백|미니멀리즘|minimal|simple|clean/i, "minimal"],
  [/고급|럭셔리|럭스|프리미엄|우아|다크|어둡|블랙|luxe|luxury|premium|elegant|dark/i, "luxe"],
  [/레트로|터미널|개발자|해커|콘솔|사이버|모노스페이스|retro|terminal|cyber|hacker/i, "terminal"],
  [/강렬|브루탈|대담|볼드|과감|투박|힙하게|brutal|bold/i, "brutalist"],
  [/잡지|에디토리얼|매거진|세리프|출판|저널|editorial|magazine/i, "editorial"],
  [/스위스|그리드|타이포|기하학|정밀|swiss|grid/i, "swiss"],
  [/팝|경쾌|컬러풀|화려|발랄|재밌|톡톡|playful|pop|colorful|fun/i, "playful"],
  [/유리|글래스|투명|오로라|글래스모피즘|glass|aurora/i, "glass"],
  [/흙|자연|오가닉|아늑|공예|웜하게|따뜻한 색|handcraft|organic|earthy|warm/i, "warm"],
];

/** 문장에서 스타일/느낌 단어를 찾아 해당 디렉션을 반환. 없으면 null. */
export function styleFromText(text: string): Direction | null {
  const t = text || "";
  for (const [re, id] of STYLE_WORDS) if (re.test(t)) return DIRECTIONS.find((d) => d.id === id) ?? null;
  return findDirection(t.trim());
}

const UI_NOUN =
  /(대시보드|dashboard|화면|페이지|컴포넌트|랜딩|폼\b|모달|사이트|웹\s?ui|\bui\b|앱\s?화면|리포트|보고서|카드\s?레이아웃|테이블\s?뷰|메뉴바|네비게이션|히어로|섹션|랜딩페이지|landing|screen|page|component)/i;
const CHANGE_HINT = /(다르게|새롭게|다른 느낌|다른 스타일|다시 만들|다시 해|바꿔|바꿔봐|바꿔줘|재구성|리디자인|redesign)/;

/** 이 요청이 UI/대시보드 제작이면 적용할 아트 디렉션을 결정.
 *  명시적 스타일 언급 → 그 디렉션, 아니면 회전(매번 다르게). lastWasUi 로 짧은 후속 수정도 UI 로 인식. */
export function directionForRequest(
  message: string,
  lastWasUi: boolean,
): { direction: Direction | null; isUi: boolean } {
  const style = styleFromText(message);
  let isUi = UI_NOUN.test(message) || !!style;
  if (!isUi && lastWasUi && CHANGE_HINT.test(message)) isUi = true; // 대시보드 만든 직후 "다르게 해줘" 등
  if (!isUi) return { direction: null, isUi: false };
  return { direction: style ?? rotateDirection(), isUi: true };
}
