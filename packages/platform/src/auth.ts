import { platformFetch } from "./client.js";
import type { SessionInfo, UserProfile, VerifyTokenResponse } from "./types.js";

export const auth = {
  getUser: () => platformFetch<UserProfile>("/auth/me"),

  getSession: () => platformFetch<SessionInfo>("/auth/session"),

  verifyToken: (token?: string) =>
    platformFetch<VerifyTokenResponse>("/auth/verify-token", {
      method: "POST",
      body: token ? JSON.stringify({ token }) : undefined,
    }),
};
