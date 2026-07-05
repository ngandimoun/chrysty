import type { CheckAccessRequest, CheckAccessResponse, SubscriptionResponse } from "./types.js";
export declare const billing: {
    getSubscription: () => Promise<SubscriptionResponse>;
    checkAccess: (input: CheckAccessRequest) => Promise<CheckAccessResponse>;
};
//# sourceMappingURL=billing.d.ts.map