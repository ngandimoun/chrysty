import type { TrackUsageRequest, TrackUsageResponse, UsageSummaryResponse } from "./types.js";
export declare const usage: {
    track: (event: TrackUsageRequest) => Promise<TrackUsageResponse>;
    getSummary: (params?: {
        workerSlug?: string;
        period?: "current";
    }) => Promise<UsageSummaryResponse>;
};
//# sourceMappingURL=usage.d.ts.map