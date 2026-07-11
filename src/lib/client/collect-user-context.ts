import type { UserContextFormFields } from '@/lib/gemini/user-context';

const GEOLOCATION_TIMEOUT_MS = 2_000;
const GEOLOCATION_MAX_AGE_MS = 300_000;

interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
}

type GeolocationStatus = 'granted' | 'denied' | 'timeout' | 'unavailable';

interface GeolocationResult {
  position: GeolocationPosition | null;
  status: GeolocationStatus;
}

function readBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function requestGeolocation(): Promise<GeolocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ position: null, status: 'unavailable' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: GeolocationResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = window.setTimeout(
      () => finish({ position: null, status: 'timeout' }),
      GEOLOCATION_TIMEOUT_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        finish({
          status: 'granted',
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            timestamp: position.timestamp,
          },
        });
      },
      (error) => {
        finish({
          position: null,
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        });
      },
      {
        enableHighAccuracy: false,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    );
  });
}

export async function collectUserContextForRequest(): Promise<UserContextFormFields> {
  const fields: UserContextFormFields = {
    userTimezone: readBrowserTimezone(),
    userLocale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
    clientTimestamp: new Date().toISOString(),
  };

  // Cross-origin iframes typically block geolocation via Permissions-Policy.
  if (typeof window !== 'undefined' && window.parent !== window) {
    fields.geolocationStatus = 'unavailable';
    return fields;
  }

  const geolocation = await requestGeolocation();
  fields.geolocationStatus = geolocation.status;
  if (geolocation.position) {
    const position = geolocation.position;
    fields.userLatitude = String(position.latitude);
    fields.userLongitude = String(position.longitude);
    fields.geoAccuracyMeters = String(position.accuracyMeters);
    fields.geolocationTimestamp = new Date(position.timestamp).toISOString();
  }

  return fields;
}

export function appendUserContextToFormData(
  formData: FormData,
  fields: UserContextFormFields,
): void {
  formData.append('userTimezone', fields.userTimezone);
  formData.append('userLocale', fields.userLocale);
  formData.append('clientTimestamp', fields.clientTimestamp);
  formData.append('geolocationStatus', fields.geolocationStatus ?? 'unavailable');

  if (fields.userLatitude !== undefined) {
    formData.append('userLatitude', fields.userLatitude);
  }
  if (fields.userLongitude !== undefined) {
    formData.append('userLongitude', fields.userLongitude);
  }
  if (fields.geoAccuracyMeters !== undefined) {
    formData.append('geoAccuracyMeters', fields.geoAccuracyMeters);
  }
  if (fields.geolocationTimestamp !== undefined) {
    formData.append('geolocationTimestamp', fields.geolocationTimestamp);
  }
}
