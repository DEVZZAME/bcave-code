import { detectDeployTarget } from "./request-classification.js";

export type AppStack = "existing" | "nextjs" | "vue-vite-express" | "react-vite-fastify" | "react-vite-express";

export function inferAppStack(message: string, hasExistingStack: boolean): AppStack {
  if (hasExistingStack) return "existing";
  if (/vue/i.test(message)) return "vue-vite-express";
  if (/next(?:\.js|js)?|검색\s*(?:노출|최적화)|\bseo\b/i.test(message)) return "nextjs";
  if (/fastify|고성능|많은\s*요청|동시\s*사용자|고트래픽/i.test(message)) return "react-vite-fastify";
  return "react-vite-express";
}

export function inferDeployTarget(message: string): string {
  return detectDeployTarget(message) ?? "local";
}
