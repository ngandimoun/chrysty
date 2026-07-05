import { platformFetch } from "./client.js";
export const auth = {
    getUser: () => platformFetch("/auth/me"),
    getSession: () => platformFetch("/auth/session"),
    verifyToken: (token) => platformFetch("/auth/verify-token", {
        method: "POST",
        body: token ? JSON.stringify({ token }) : undefined,
    }),
};
