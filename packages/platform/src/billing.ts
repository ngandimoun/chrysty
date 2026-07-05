import { platformFetch } from "./client.js";
import type {
  CheckAccessRequest,
  CheckAccessResponse,
  SubscriptionResponse,
} from "./types.js";

export const billing = {
  getSubscription: () =>
    platformFetch<SubscriptionResponse>("/billing/subscription"),

  checkAccess: (input: CheckAccessRequest) =>
    platformFetch<CheckAccessResponse>("/billing/check-access", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
