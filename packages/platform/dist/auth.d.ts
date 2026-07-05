import type { SessionInfo, UserProfile, VerifyTokenResponse } from "./types.js";
export declare const auth: {
    getUser: () => Promise<UserProfile>;
    getSession: () => Promise<SessionInfo>;
    verifyToken: (token?: string) => Promise<VerifyTokenResponse>;
};
//# sourceMappingURL=auth.d.ts.map