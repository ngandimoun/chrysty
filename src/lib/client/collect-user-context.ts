import type { UserContextFormFields } from '@/lib/gemini/user-context';

const GEOLOCATION_TIMEOUT_MS = 2_000;
const GEOLOCATION_MAX_AGE_MS = 300_000;

interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

function readBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function requestGeolocation(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => {
        window.clearTimeout(timeoutId);
        resolve(null);
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

  const position = await requestGeolocation();
  if (position) {
    fields.userLatitude = String(position.latitude);
    fields.userLongitude = String(position.longitude);
    fields.geoAccuracyMeters = String(position.accuracyMeters);
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

  if (fields.userLatitude !== undefined) {
    formData.append('userLatitude', fields.userLatitude);
  }
  if (fields.userLongitude !== undefined) {
    formData.append('userLongitude', fields.userLongitude);
  }
  if (fields.geoAccuracyMeters !== undefined) {
    formData.append('geoAccuracyMeters', fields.geoAccuracyMeters);
  }
}
