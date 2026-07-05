const DEFAULT_LOCALE = 'en-US';

export function formatNumber(value: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatCurrency(value: number, currency: string, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value, locale)} ${currency.toUpperCase()}`;
  }
}

export function formatCompact(value: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

const CURRENCY_HINT = /\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL)\b/i;

export function looksLikeCurrencyLabel(label: string): boolean {
  return CURRENCY_HINT.test(label) || /^[$€£¥]/.test(label.trim());
}

export function guessCurrencyCode(label: string): string | null {
  const match = label.match(CURRENCY_HINT);
  if (match?.[1]) {
    return match[1].toUpperCase();
  }

  if (label.includes('€')) return 'EUR';
  if (label.includes('£')) return 'GBP';
  if (label.includes('¥')) return 'JPY';
  if (label.includes('$')) return 'USD';

  return null;
}
