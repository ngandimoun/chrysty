import type { PlatformApiError, PlatformClientConfig } from "./types.js";

let clientConfig: PlatformClientConfig = {
  credentials: "include",
};

export function configurePlatform(config: PlatformClientConfig) {
  clientConfig = { ...clientConfig, ...config };
}

function getApiUrl(): string {
  const apiUrl =
    clientConfig.apiUrl ??
    (typeof process !== "undefined"
      ? process.env.CHYSTY_API_URL
      : undefined) ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CHRYSTY_API_URL
      : undefined);

  if (!apiUrl) {
    throw new Error(
      "CHRYSTY_API_URL is not configured. Call configurePlatform({ apiUrl }) first."
    );
  }

  return apiUrl.replace(/\/$/, "");
}

async function resolveAuthHeader(): Promise<HeadersInit> {
  if (!clientConfig.getAccessToken) return {};

  const token = await clientConfig.getAccessToken();
  if (!token) return {};

  return { Authorization: `Bearer ${token}` };
}

export async function platformFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const authHeader = await resolveAuthHeader();
  Object.entries(authHeader).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers,
    credentials: clientConfig.credentials ?? "include",
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const apiError = data as PlatformApiError;
    const message = apiError.error?.message
      ? apiError.error.message
      : `Platform API error (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}
