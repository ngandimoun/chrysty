import assert from 'node:assert/strict';

import { selectWeatherLocation } from '../../src/lib/gemini/weather';
import {
  buildLiveUserContextRefreshPayload,
  isLiveUserContextStale,
} from '../../src/lib/live/user-context-refresh';

const context = {
  timezone: 'Europe/Paris',
  locale: 'fr-FR',
  clientTimestamp: '2026-07-10T18:00:00.000Z',
  localDateLabel: 'vendredi 10 juillet 2026',
  localTimeLabel: '20:00',
  localDateTimeLabel: 'vendredi 10 juillet 2026, 20:00',
  coordinates: { latitude: 48.8566, longitude: 2.3522, accuracyMeters: 25 },
  geolocationStatus: 'granted' as const,
  geolocationTimestamp: '2026-07-10T18:00:00.000Z',
};

assert.deepEqual(buildLiveUserContextRefreshPayload(context), {
  type: 'user_context_update',
  user_context: context,
});
assert.equal(isLiveUserContextStale(context, Date.parse('2026-07-10T18:04:59.000Z')), false);
assert.equal(isLiveUserContextStale(context, Date.parse('2026-07-10T18:05:00.000Z')), true);
assert.equal(isLiveUserContextStale({ ...context, coordinates: undefined }), true);

assert.deepEqual(
  selectWeatherLocation({
    location: ' Lisbon, Portugal ',
    latitude: 48.8566,
    longitude: 2.3522,
  }),
  { kind: 'named', query: 'q=Lisbon%2C%20Portugal' },
);
assert.equal(selectWeatherLocation({}), null);
