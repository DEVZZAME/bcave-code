import type { BcaveConfig } from "../config/config.js";
import { hubLogin, hubLogout, type LoginResult } from "../auth/hub.js";

export interface AuthenticatedSession {
  config: Partial<BcaveConfig>;
  user: LoginResult["user"];
  hasCliAccess: boolean;
}

export async function authenticate(
  config: Pick<BcaveConfig, "hubUrl">,
  email: string,
  password: string,
  login: typeof hubLogin = hubLogin,
): Promise<AuthenticatedSession> {
  const result = await login(config.hubUrl, email, password);
  return {
    config: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userEmail: result.user.email,
      userName: result.user.name,
      apiKey: "",
    },
    user: result.user,
    hasCliAccess: result.user.services.includes("BCAVE_CODE"),
  };
}

export async function endSession(
  config: Pick<BcaveConfig, "hubUrl" | "accessToken" | "refreshToken">,
  logout: typeof hubLogout = hubLogout,
): Promise<Partial<BcaveConfig>> {
  await logout(config.hubUrl, config.accessToken, config.refreshToken);
  return { accessToken: "", refreshToken: "", userEmail: "", userName: "" };
}
