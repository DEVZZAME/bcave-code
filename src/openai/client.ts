import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";
import type { BcaveConfig } from "../config/config.js";
import { TOOL_DEFINITIONS } from "../agent/tools.js";

export function createOpenAIClient(config: BcaveConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

export async function chat(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string
): Promise<ChatCompletion> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.chat.completions.create({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
    } catch (err) {
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
