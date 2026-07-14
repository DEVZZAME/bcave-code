import OpenAI from "openai";
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
  });
}

export interface ChatOptions {
  /**
   * 401(인증 만료) 시 호출. 토큰을 갱신하고 새 client 를 반환하면 1회 재시도한다.
   * null 을 반환하면 갱신 실패로 간주하고 원래 에러를 던진다.
   */
  onAuthError?: () => Promise<OpenAI | null>;
}

export async function chat(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  opts: ChatOptions = {}
): Promise<ChatCompletion> {
  const maxRetries = 3;
  let activeClient = client;
  let refreshed = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await activeClient.chat.completions.create({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
    } catch (err) {
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
          attempt--; // 이 시도는 재시도 횟수에서 제외
          continue;
        }
      }

      const isRetryable =
        err instanceof OpenAI.APIError &&
        (err.status === 429 || err.status === 500 || err.status === 503);
      if (!isRetryable || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error("Unreachable");
}

export type { ChatCompletionMessageParam, ChatCompletion };
