import type { UserContext } from '@/lib/gemini/user-context';

export type DateAction = 'now' | 'format' | 'add' | 'diff' | 'convert_timezone';
export type DateUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
export type DateFormat = 'date' | 'time' | 'datetime' | 'weekday';

export interface ProcessDateInput {
  action: DateAction;
  reference?: string;
  amount?: number;
  unit?: DateUnit;
  timezone?: string;
  otherTimezone?: string;
  format?: DateFormat;
}

export interface ProcessDateResult {
  action: DateAction;
  result: string | number;
  label: string;
  timezone: string;
  reference?: string;
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function resolveTimezone(timezone: string | undefined, userContext: UserContext): string {
  const candidate = timezone?.trim() || userContext.timezone;
  return isValidTimezone(candidate) ? candidate : userContext.timezone;
}

function parseReference(reference: string | undefined, userContext: UserContext): Date {
  if (reference?.trim()) {
    const parsed = Date.parse(reference);
    if (Number.isFinite(parsed)) {
      return new Date(parsed);
    }
    throw new Error('Reference must be a valid ISO 8601 date/time string.');
  }

  const parsed = Date.parse(userContext.clientTimestamp);
  return Number.isFinite(parsed) ? new Date(parsed) : new Date();
}

function formatInTimezone(date: Date, timezone: string, format: DateFormat, locale: string): string {
  if (format === 'weekday') {
    return new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'long' }).format(date);
  }

  if (format === 'date') {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  if (format === 'time') {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function addToDate(date: Date, amount: number, unit: DateUnit): Date {
  const next = new Date(date);

  switch (unit) {
    case 'minutes':
      next.setMinutes(next.getMinutes() + amount);
      break;
    case 'hours':
      next.setHours(next.getHours() + amount);
      break;
    case 'days':
      next.setDate(next.getDate() + amount);
      break;
    case 'weeks':
      next.setDate(next.getDate() + amount * 7);
      break;
    case 'months':
      next.setMonth(next.getMonth() + amount);
      break;
    case 'years':
      next.setFullYear(next.getFullYear() + amount);
      break;
    default:
      throw new Error('Unsupported date unit.');
  }

  return next;
}

function diffInUnit(from: Date, to: Date, unit: DateUnit): number {
  const deltaMs = to.getTime() - from.getTime();

  switch (unit) {
    case 'minutes':
      return Math.round(deltaMs / (60 * 1000));
    case 'hours':
      return Math.round(deltaMs / (60 * 60 * 1000));
    case 'days':
      return Math.round(deltaMs / (24 * 60 * 60 * 1000));
    case 'weeks':
      return Math.round(deltaMs / (7 * 24 * 60 * 60 * 1000));
    case 'months':
      return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    case 'years':
      return to.getFullYear() - from.getFullYear();
    default:
      throw new Error('Unsupported date unit.');
  }
}

export function processDate(input: ProcessDateInput, userContext: UserContext): ProcessDateResult {
  const timezone = resolveTimezone(input.timezone, userContext);
  const locale = userContext.locale || 'en-US';
  const referenceDate = parseReference(input.reference, userContext);

  switch (input.action) {
    case 'now': {
      const label = formatInTimezone(referenceDate, timezone, input.format ?? 'datetime', locale);
      return {
        action: input.action,
        result: referenceDate.toISOString(),
        label,
        timezone,
        reference: referenceDate.toISOString(),
      };
    }
    case 'format': {
      const label = formatInTimezone(referenceDate, timezone, input.format ?? 'datetime', locale);
      return {
        action: input.action,
        result: label,
        label,
        timezone,
        reference: referenceDate.toISOString(),
      };
    }
    case 'add': {
      if (input.amount === undefined || !input.unit) {
        throw new Error('add requires amount and unit.');
      }
      const next = addToDate(referenceDate, input.amount, input.unit);
      const label = formatInTimezone(next, timezone, input.format ?? 'datetime', locale);
      return {
        action: input.action,
        result: next.toISOString(),
        label,
        timezone,
        reference: referenceDate.toISOString(),
      };
    }
    case 'diff': {
      if (!input.reference?.trim()) {
        throw new Error('diff requires a reference ISO date/time.');
      }
      const from = parseReference(undefined, userContext);
      const to = parseReference(input.reference, userContext);
      const unit = input.unit ?? 'days';
      const result = diffInUnit(from, to, unit);
      return {
        action: input.action,
        result,
        label: `${result} ${unit}`,
        timezone,
        reference: to.toISOString(),
      };
    }
    case 'convert_timezone': {
      const otherTimezone = input.otherTimezone?.trim();
      if (!otherTimezone || !isValidTimezone(otherTimezone)) {
        throw new Error('convert_timezone requires a valid otherTimezone.');
      }
      const sourceLabel = formatInTimezone(referenceDate, timezone, input.format ?? 'datetime', locale);
      const targetLabel = formatInTimezone(referenceDate, otherTimezone, input.format ?? 'datetime', locale);
      return {
        action: input.action,
        result: targetLabel,
        label: `${sourceLabel} -> ${targetLabel}`,
        timezone: otherTimezone,
        reference: referenceDate.toISOString(),
      };
    }
    default:
      throw new Error('Unsupported date action.');
  }
}
