export interface DeployChoice {
  label: string;
  dimLabel: string;
  answer: string;
}

const STANDALONE: DeployChoice[] = [
  { label: "내 컴퓨터에서 먼저 사용", dimLabel: "1. 내 컴퓨터에 저장 ✦ 빠르게 확인하고 나중에 온라인 전환", answer: "local" },
  { label: "검색 노출 중심으로 공개", dimLabel: "2. 검색 노출 중심으로 인터넷에 공개 (Vercel)", answer: "vercel" },
  { label: "간편하게 인터넷에 공개  ✦ 추천", dimLabel: "3. 화면과 데이터 기능을 한 번에 공개 (Railway)", answer: "railway" },
  { label: "여러 지역에서 안정적으로 운영", dimLabel: "4. 이용자와 가까운 지역에서 운영 (Fly.io)", answer: "fly" },
  { label: "큰 규모의 회사 서비스", dimLabel: "5. 많은 사용자를 위한 회사용 운영 환경 (AWS)", answer: "aws" },
  { label: "회사 서버에서 직접 운영", dimLabel: "6. 보유한 서버에서 직접 관리", answer: "vps" },
];

const POST_STACK: DeployChoice[] = [
  { label: "내 컴퓨터에서 먼저 사용  ✦ 추천", dimLabel: "1. 내 컴퓨터에 저장 ✦ 빠르게 확인하고 나중에 온라인 전환", answer: "1" },
  { label: "간편하게 인터넷에 공개", dimLabel: "2. 화면과 데이터 기능을 한 번에 공개", answer: "2" },
  { label: "검색 노출 중심으로 공개", dimLabel: "3. 검색 결과 노출과 첫 화면 속도 중심", answer: "3" },
  { label: "여러 지역에서 안정적으로 운영", dimLabel: "4. 이용자와 가까운 지역에서 운영", answer: "4" },
  { label: "회사 서버에서 직접 운영", dimLabel: "5. 회사가 보유한 운영 환경 사용", answer: "5" },
];

export function deployChoices(context: "standalone" | "post-stack" = "standalone"): DeployChoice[] {
  return (context === "post-stack" ? POST_STACK : STANDALONE).map((choice) => ({ ...choice }));
}
