import type { BcaveConfig } from "../config/config.js";
import { hubListModels, type HubModel } from "../auth/hub.js";

export const FALLBACK_MODELS: HubModel[] = [
  { id: "gpt-5.6-luna", displayName: "gpt-5.6-luna (기본)", description: "OpenAI GPT-5.6-luna · 고품질 코딩/추론" },
];

export async function availableModels(
  config: Pick<BcaveConfig, "hubUrl" | "accessToken">,
  loader: typeof hubListModels = hubListModels,
): Promise<{ models: HubModel[]; usedFallback: boolean }> {
  if (!config.accessToken) return { models: [...FALLBACK_MODELS], usedFallback: true };
  try {
    const models = await loader(config.hubUrl, config.accessToken);
    return models.length ? { models, usedFallback: false } : { models: [...FALLBACK_MODELS], usedFallback: true };
  } catch {
    return { models: [...FALLBACK_MODELS], usedFallback: true };
  }
}
