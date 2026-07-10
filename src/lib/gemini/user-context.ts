export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface UserContext {
  timezone: string;
  locale: string;
  clientTimestamp: string;
  localDateLabel: string;
  localTimeLabel: string;
  localDateTimeLabel: string;
  coordinates?: UserCoordinates;
  geolocationStatus?: 'granted' | 'denied' | 'timeout' | 'unavailable';
  geolocationTimestamp?: string;
}

export interface UserContextFormFields {
  userTimezone: string;
  userLocale: string;
  clientTimestamp: string;
  userLatitude?: string;
  userLongitude?: string;
  geoAccuracyMeters?: string;
  geolocationStatus?: UserContext['geolocationStatus'];
  geolocationTimestamp?: string;
}

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_LOCALE = 'en-US';

function parseFiniteNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function formatLocalLabels(
  instant: Date,
  timezone: string,
  locale: string,
): Pick<UserContext, 'localDateLabel' | 'localTimeLabel' | 'localDateTimeLabel'> {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const localDateLabel = dateFormatter.format(instant);
  const localTimeLabel = timeFormatter.format(instant);

  return {
    localDateLabel,
    localTimeLabel,
    localDateTimeLabel: `${localDateLabel}, ${localTimeLabel}`,
  };
}

export function buildUserContext(fields: UserContextFormFields): UserContext {
  const timezone = fields.userTimezone.trim();
  const locale = fields.userLocale.trim() || DEFAULT_LOCALE;
  const safeTimezone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

  const parsedTimestamp = Date.parse(fields.clientTimestamp);
  const instant = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp) : new Date();

  const labels = formatLocalLabels(instant, safeTimezone, locale);

  const latitude = parseFiniteNumber(fields.userLatitude);
  const longitude = parseFiniteNumber(fields.userLongitude);
  const accuracyMeters = parseFiniteNumber(fields.geoAccuracyMeters);

  const coordinates =
    latitude !== undefined && longitude !== undefined
      ? {
          latitude,
          longitude,
          ...(accuracyMeters !== undefined ? { accuracyMeters } : {}),
        }
      : undefined;
  const geolocationStatus = ['granted', 'denied', 'timeout', 'unavailable'].includes(
    fields.geolocationStatus ?? '',
  )
    ? fields.geolocationStatus
    : undefined;
  const geolocationTimestamp =
    fields.geolocationTimestamp && Number.isFinite(Date.parse(fields.geolocationTimestamp))
      ? new Date(fields.geolocationTimestamp).toISOString()
      : undefined;

  return {
    timezone: safeTimezone,
    locale,
    clientTimestamp: instant.toISOString(),
    ...labels,
    ...(coordinates ? { coordinates } : {}),
    ...(geolocationStatus ? { geolocationStatus } : {}),
    ...(geolocationTimestamp ? { geolocationTimestamp } : {}),
  };
}

export function parseUserContextFromFormData(formData: FormData): UserContext {
  return buildUserContext({
    userTimezone: String(formData.get('userTimezone') ?? DEFAULT_TIMEZONE),
    userLocale: String(formData.get('userLocale') ?? DEFAULT_LOCALE),
    clientTimestamp: String(formData.get('clientTimestamp') ?? new Date().toISOString()),
    userLatitude: String(formData.get('userLatitude') ?? ''),
    userLongitude: String(formData.get('userLongitude') ?? ''),
    geoAccuracyMeters: String(formData.get('geoAccuracyMeters') ?? ''),
    geolocationStatus:
      (String(formData.get('geolocationStatus') ?? '') as UserContext['geolocationStatus']) ||
      undefined,
    geolocationTimestamp: String(formData.get('geolocationTimestamp') ?? ''),
  });
}

export function buildUserTemporalContextBlock(userContext: UserContext): string {
  const lines = [
    'User context (authoritative for time, date, and locale):',
    `- Local date/time: ${userContext.localDateTimeLabel} (${userContext.timezone})`,
    `- Locale: ${userContext.locale}`,
    `- UTC timestamp: ${userContext.clientTimestamp}`,
  ];

  if (userContext.coordinates) {
    const { latitude, longitude, accuracyMeters } = userContext.coordinates;
    const accuracy =
      accuracyMeters !== undefined ? `, accuracy ~${Math.round(accuracyMeters)}m` : '';
    lines.push(`- Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}${accuracy}`);
  } else if (userContext.geolocationStatus) {
    lines.push(`- Device location: ${userContext.geolocationStatus} (no coordinates available)`);
  }

  lines.push('- Treat the local date/time above as "now" and "today" for the user.');

  return lines.join('\n');
}

const CONTEXT_ALIGNMENT =
  "Location precedence: use an explicit place named by the user or established in the current conversation first. Use device coordinates only for genuine current-location intent such as “near me”. If a required location remains ambiguous, ask one concise clarification; if location is optional, proceed without it. Never invent or select a default city, and never discard a named place because device location is unavailable.";

export function buildGoogleSearchToolBlock(): string {
  return [
    'Google Search tool (available but use sparingly):',
    '- DEFAULT: do NOT search. Most voice requests do not need the web.',
    `- ${CONTEXT_ALIGNMENT}`,
    '- Only search when the answer would be wrong, outdated, or unknowable without live web data.',
    '',
    'Search when the user clearly needs current/live facts, for example:',
    '- News, weather, sports scores, stock prices, exchange rates',
    '- Store hours, event schedules, product availability, release dates',
    '- "What happened today/recently", breaking news, election results',
    '',
    'Do NOT search for:',
    '- Greetings, small talk, emotional support, yes/no, or very short replies',
    '- Describing or analyzing attached camera images (use the image instead)',
    '- Stable general knowledge: definitions, history, math, coding, translations, how-to',
    '- Questions you can answer confidently from the audio/images alone',
    '',
    'When you do search time-sensitive topics, include the user\'s local date or year in queries when recency matters.',
    'Prefer recent sources when freshness matters.',
    'When search informs the answer and needs_visual_explanation is true, summarize key facts in explanation_text (sources are appended separately).',
    'When the user names sites or topics but not exact URLs, Search may discover pages — then use URL context to deep-read or compare those pages.',
  ].join('\n');
}

/** @deprecated Use buildUserTemporalContextBlock + buildGoogleSearchToolBlock + buildGoogleMapsToolBlock */
export function buildUserContextSystemBlock(userContext: UserContext): string {
  return `${buildUserTemporalContextBlock(userContext)}\n\n${buildGoogleSearchToolBlock()}\n\n${buildGoogleMapsToolBlock()}`;
}

export function buildGoogleMapsToolBlock(): string {
  return [
    'Google Maps tool (available but use sparingly):',
    '- DEFAULT: do NOT use Maps. Most voice requests do not need location data.',
    `- ${CONTEXT_ALIGNMENT}`,
    '- Only use Maps when the answer requires real place data from Google Maps.',
    '',
    'Use Maps for:',
    '- Near me, nearby, or local recommendations (restaurants, cafes, shops, parks)',
    '- Directions, opening hours, addresses, place-specific questions',
    '- Itinerary planning and points of interest in a city or area',
    '',
    'Do NOT use Maps for:',
    '- Greetings, small talk, emotional support, yes/no, or very short replies',
    '- Describing or analyzing attached camera images (use the image instead)',
    '- General knowledge, news, weather, prices, or events (use Google Search instead)',
    '- Questions you can answer without place data',
    '',
    'Maps vs Search: Maps = places and locations. Search = live facts, news, weather, events, prices.',
    '- Camera evidence remains available when Maps is used. Use both when the request needs visible-scene evidence plus geographic results; never suppress image analysis merely because location data or search is also required.',
    'Maps grounding works best in English — keep place names and categories in English in explanation_text, but keep spoken_transcript in the user\'s language.',
    'When Maps informs your answer: set needs_visual_explanation true and keep explanation_text as a brief intro that states the recommendation; full place cards follow separately — do not duplicate long place lists in explanation_text.',
  ].join('\n');
}

export function buildCodeExecutionToolBlock(): string {
  return [
    'Code execution tool (available but use sparingly):',
    '- DEFAULT: do NOT run code. Most voice requests do not need Python.',
    '- Only run code when precise computation, data processing, or numeric analysis is required.',
    '',
    'Use code_execution for:',
    '- Receipt totals, line-item sums, counting objects in attached images',
    '- Statistics over many data points, multi-step data transforms, comparisons needing charts[]',
    '- Complex analysis that custom tools (calculator, convert, processDate) cannot handle alone',
    '',
    'Do NOT use code for:',
    '- Simple arithmetic — use calculator instead',
    '- Unit or currency conversion — use convert instead',
    '- Date/time math — use processDate instead',
    '- Random picks — use randomChoice instead',
    '- Greetings, small talk, yes/no, or very short replies',
    '- Geo/place questions (use Google Maps) or live news/weather (use Google Search)',
    '- Simple facts answerable without computation',
    '',
    'When code produces visualizable results:',
    '- Set needs_visual_explanation true',
    '- Keep explanation_text as a clear summary with key numbers; use charts[] for tables.',
    '- Populate charts[] with Recharts-ready data using exact values from your Python output',
    '- Chart kinds: bar, line, pie, area — each chart needs id, title, kind, series (key/label), and data rows',
    '- For bar/line/area set xKey; for pie set nameKey and valueKey',
    '- Every data row must include the xKey/nameKey AND numeric values for each series key (no empty objects)',
    '- Example bar chart row: { "quarter": "Q1", "sales": 120 } with series key "sales" and xKey "quarter"',
    '- Do not duplicate full data tables in explanation_text — use charts[] instead',
    '- Matplotlib is fallback only; prefer charts[] for the on-screen visualization',
  ].join('\n');
}

export function buildUrlContextToolBlock(): string {
  return [
    'URL context tool (available but use sparingly):',
    '- DEFAULT: do NOT fetch URLs. Most voice requests do not need web page content.',
    '- Only use when specific public URLs are available and deep reading is required.',
    '',
    'Use url_context when:',
    '- User speaks explicit public URL(s) or speakable addresses ("w w w dot example dot com slash docs")',
    '- User asks to compare, summarize, or extract data from specific named pages',
    '- Camera image shows a readable URL on screen, printout, or label',
    '- Combined with Search: Search finds candidate pages; URL context reads them for deep comparison or synthesis (recipes, docs, articles, PDFs)',
    '',
    'Do NOT use url_context for:',
    '- Greetings, small talk, yes/no, or very short replies',
    '- Questions answerable from audio or images alone without fetching pages',
    '- Place/location queries (use Google Maps) or broad live facts without specific pages (Search alone may suffice)',
    '- Paywalled, login-required, YouTube, or Google Workspace URLs',
    '',
    'Voice-first rules:',
    '- Parse spoken URLs carefully (e.g. "w w w dot example dot com slash docs")',
    '- Keep voice concise; state the main finding aloud — never read long URLs; say "I read those two pages" instead',
    '- Put comparisons, lists, and detailed excerpts in explanation_text (Sources are appended separately)',
    '- Set needs_visual_explanation true when page content is easier to read on screen (comparisons, multi-item lists, doc excerpts)',
    '- Prefer only the most relevant URLs (max 20 per request)',
    `- ${CONTEXT_ALIGNMENT}`,
  ].join('\n');
}

export function buildCustomToolsBlock(): string {
  return [
    'Custom function tools (available but use sparingly):',
    '- DEFAULT: do NOT call custom tools unless strictly required.',
    `- ${CONTEXT_ALIGNMENT}`,
    '',
    'Automatic execution (critical):',
    '- Custom tools run automatically on the server in the same voice turn — results return without user action.',
    '- NEVER ask the user to confirm, retry, or run a tool manually.',
    '- After tool results arrive, use the computed values directly in spoken_transcript and explanation_text.',
    '- In explanation_text, surface tool results in **bold** and use tables when comparing multiple values.',
    '',
    'Prefer custom tools over code_execution for single-step tasks:',
    '- calculator: basic arithmetic and percentages (e.g. 280 * 0.15, sqrt(144))',
    '- processDate: now, format, add, diff, convert_timezone using user timezone',
    '- convert: length, mass, temperature, volume, and live currency (Frankfurter rates)',
    '- randomChoice: pick randomly from 2–20 options',
    '',
    'getUserContext:',
    '- Returns timezone, locale, local date/time, and optional GPS from this request.',
    '- Use only when explicit device/time/location info is required beyond the audio.',
    '',
    'getWeather (when available):',
    '- Returns current weather for a location or coordinates.',
    '- Use when the user asks about weather and precise conditions are needed.',
    '- Pass a named location whenever the user or current conversation provides one. Set use_current_location=true only for genuine current-location wording. Never make up a city.',
    '',
    'Voice-first rules:',
    '- Keep voice concise; state the computed result or main finding aloud; put lists, tables, and conversions in explanation_text.',
    '- Set needs_visual_explanation true when results are easier to read on screen.',
  ].join('\n');
}
