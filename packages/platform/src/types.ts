export type UserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type SessionInfo = {
  userId: string;
  email: string;
  expiresAt: string | null;
  valid: boolean;
};

export type VerifyTokenResponse = {
  valid: boolean;
  user: UserProfile | null;
  expiresAt: string | null;
};

export type PlanSlug = "free" | "pro" | "team";

export type SubscriptionResponse = {
  plan: PlanSlug;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  entitlements: {
    maxActionsPerMonth: number;
    allowedWorkers: string[];
    maxTokensPerMonth: number;
  };
};

export type ActionType =
  | "chat_message"
  | "ai_completion"
  | "document_generation"
  | "workflow_execution"
  | "search_request";

export type CheckAccessRequest = {
  workerSlug: string;
  actionType: ActionType;
  estimatedTokens?: number;
};

export type CheckAccessResponse = {
  allowed: boolean;
  reason?:
    | "no_subscription"
    | "worker_not_included"
    | "quota_exceeded"
    | "past_due";
  remaining?: { actions: number; tokens: number };
};

export type TrackUsageRequest = {
  workerSlug: string;
  actionType: ActionType;
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
};

export type TrackUsageResponse = {
  eventId: string;
  recordedAt: string;
};

export type UsageSummaryResponse = {
  periodStart: string;
  periodEnd: string;
  totals: {
    actions: number;
    tokensInput: number;
    tokensOutput: number;
    cost: number;
  };
  byWorker: Record<string, { actions: number; tokens: number; cost: number }>;
};

export type PlatformClientConfig = {
  apiUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  credentials?: RequestCredentials;
};

export type PlatformApiError = {
  error: {
    code: string;
    message: string;
  };
};
