import { platformFetch } from "./client.js";
export const billing = {
    getSubscription: () => platformFetch("/billing/subscription"),
    checkAccess: (input) => platformFetch("/billing/check-access", {
        method: "POST",
        body: JSON.stringify(input),
    }),
};
