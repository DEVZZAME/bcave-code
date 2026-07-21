import OpenAI from "openai";
import type { APIError } from "openai/error";
import type { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";
import type { BcaveConfig } from "../config/config.js";
import { TOOL_DEFINITIONS } from "../agent/tools.js";

/** 게이트웨이(로그인) 모드에서 사용할 baseURL */
export function gatewayBaseUrl(config: BcaveConfig): string {
  return `${config.hubUrl.replace(/\/+$/, "")}/api/v1`;
}

/**
 * 항상 HUB 게이트웨이를 경유한다 (로그인 필수).
 * apiKey 자리에 HUB Access Token 을 실어 보내며, 실제 OpenAI 키는 서버에만 존재한다.
 * → 직접 OpenAI 로 붙는 경로는 존재하지 않는다 (사용량 집계/쿼터/RBAC 우회 불가).
 */
export function createOpenAIClient(config: BcaveConfig): OpenAI {
  return new OpenAI({
    apiKey: config.accessToken,
    baseURL: gatewayBaseUrl(config),
    // 아래 chat()에서 Retry-After와 조직 쿨다운을 반영해 직접 재시도한다.
    // SDK 기본 재시도(2회)와 중첩되면 한 번의 호출이 요청 폭주로 이어질 수 있다.
    maxRetries: 0,
  });
}

export interface ChatOptions {
  /**
   * 401(인증 만료) 시 호출. 토큰을 갱신하고 새 client 를 반환하면 1회 재시도한다.
   * null 을 반환하면 갱신 실패로 간주하고 원래 에러를 던진다.
   */
  onAuthError?: () => Promise<OpenAI | null>;
  /** 사용자가 ESC 로 중단 시 진행 중인 요청을 취소하는 신호. */
  signal?: AbortSignal;
}

/**
 * TPM 산정 시 과도한 출력 예약으로 한도를 소진하지 않도록 제한한다.
 * 서비스 개발 응답과 도구 호출을 담기에 충분하면서도 Tier 1의 순간 부하를 낮춘다.
 */
export const MAX_COMPLETION_TOKENS = 8_192;

const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 8;
const MAX_TRANSIENT_RETRIES = 2;
const RATE_LIMIT_SAFETY_MS = 1_000;
let rateLimitBlockedUntil = 0;

function parseDurationMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2] ?? "s";
  return amount * (unit === "ms" ? 1 : unit === "m" ? 60_000 : 1_000);
}

/** 서버가 알려준 대기시간을 우선하고, 없을 때만 지수 백오프를 사용한다. */
export function retryDelayMs(err: APIError, attempt: number, jitterMs = Math.random() * 250): number {
  const retryAfter = err.headers?.get("retry-after");
  let serverDelay = parseDurationMs(retryAfter);
  if (retryAfter && serverDelay === null) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) serverDelay = Math.max(0, retryAt - Date.now());
  }
  const tokenReset = parseDurationMs(err.headers?.get("x-ratelimit-reset-tokens") ?? null);
  const requestedDelay = Math.max(serverDelay ?? 0, tokenReset ?? 0, 1_000 * 2 ** attempt);
  return Math.min(MAX_RETRY_DELAY_MS, requestedDelay + jitterMs);
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    if (!signal) return;
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export async function chat(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  opts: ChatOptions = {}
): Promise<ChatCompletion> {
  let activeClient = client;
  let refreshed = false;
  let rateLimitRetries = 0;
  let transientRetries = 0;

  while (true) {
    try {
      // 한 요청에서 받은 429 쿨다운을 같은 CLI 프로세스의 다른 요청도 공유한다.
      await wait(rateLimitBlockedUntil - Date.now(), opts.signal);
      return await activeClient.chat.completions.create(
        {
          model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          max_completion_tokens: MAX_COMPLETION_TOKENS,
        },
        { signal: opts.signal },
      );
    } catch (err) {
      // 사용자가 중단(ESC): 재시도하지 않고 즉시 던진다.
      if (opts.signal?.aborted || (err as Error)?.name === "AbortError") throw err;
      // 인증 만료: 토큰 갱신 후 1회 재시도
      if (
        err instanceof OpenAI.APIError &&
        err.status === 401 &&
        opts.onAuthError &&
        !refreshed
      ) {
        const newClient = await opts.onAuthError();
        refreshed = true;
        if (newClient) {
          activeClient = newClient;
          continue;
        }
      }

      if (!(err instanceof OpenAI.APIError)) throw err;

      if (err.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) throw err;
        // 분 단위 TPM 창이 완전히 비워질 때까지 최대 약 1분 이상 자동 대기한다.
        // 서버가 제시한 경계 직전에 다시 충돌하지 않도록 작은 안전 여유도 둔다.
        const delay = retryDelayMs(err, rateLimitRetries) + RATE_LIMIT_SAFETY_MS;
        rateLimitRetries++;
        rateLimitBlockedUntil = Math.max(rateLimitBlockedUntil, Date.now() + delay);
        await wait(delay, opts.signal);
        continue;
      }

      if (err.status !== 500 && err.status !== 503) throw err;
      if (transientRetries >= MAX_TRANSIENT_RETRIES) throw err;
      const delay = retryDelayMs(err, transientRetries);
      transientRetries++;
      await wait(delay, opts.signal);
    }
  }
}

export type { ChatCompletionMessageParam, ChatCompletion };
