import { platformFetch } from "./client.js";
import type {
  TrackUsageRequest,
  TrackUsageResponse,
  UsageSummaryResponse,
} from "./types.js";

export const usage = {
  track: (event: TrackUsageRequest) =>
    platformFetch<TrackUsageResponse>("/usage/track", {
      method: "POST",
      body: JSON.stringify(event),
    }),

  getSummary: (params?: { workerSlug?: string; period?: "current" }) => {
    const search = new URLSearchParams();
    if (params?.workerSlug) search.set("workerSlug", params.workerSlug);
    if (params?.period) search.set("period", params.period);

    const query = search.toString();
    return platformFetch<UsageSummaryResponse>(
      `/usage${query ? `?${query}` : ""}`
    );
  },
};
