import { configurePlatform } from '@chrysty/platform';

export function configurePlatformForToken(accessToken: string | null) {
  configurePlatform({
    apiUrl:
      process.env.CHYSTY_API_URL ??
      process.env.NEXT_PUBLIC_CHRYSTY_API_URL ??
      'https://api.chrysty.dev',
    getAccessToken: async () => accessToken,
    credentials: 'omit',
  });
}

export function configurePlatformForBrowser() {
  configurePlatform({
    apiUrl:
      process.env.NEXT_PUBLIC_CHRYSTY_API_URL ??
      process.env.CHYSTY_API_URL ??
      'https://api.chrysty.dev',
    credentials: 'include',
  });
}
