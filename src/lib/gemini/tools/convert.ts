export type ConvertCategory = 'length' | 'mass' | 'temperature' | 'volume' | 'currency';

export interface ConvertInput {
  category: ConvertCategory;
  value: number;
  from: string;
  to: string;
}

export interface ConvertResult {
  category: ConvertCategory;
  value: number;
  from: string;
  to: string;
  result: number;
  rate?: number;
  date?: string;
}

type UnitMap = Record<string, number>;

const LENGTH_TO_METERS: UnitMap = {
  m: 1,
  meter: 1,
  meters: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
};

const MASS_TO_GRAMS: UnitMap = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
};

const VOLUME_TO_LITERS: UnitMap = {
  l: 1,
  liter: 1,
  liters: 1,
  ml: 0.001,
  milliliter: 0.001,
  milliliters: 0.001,
  gal: 3.785411784,
  gallon: 3.785411784,
  gallons: 3.785411784,
  floz: 0.0295735295625,
  'fl oz': 0.0295735295625,
};

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase();
}

function convertViaBase(value: number, from: string, to: string, table: UnitMap): number {
  const fromFactor = table[normalizeUnit(from)];
  const toFactor = table[normalizeUnit(to)];
  if (fromFactor === undefined || toFactor === undefined) {
    throw new Error(`Unsupported unit conversion from ${from} to ${to}.`);
  }

  const baseValue = value * fromFactor;
  return baseValue / toFactor;
}

function convertTemperature(value: number, from: string, to: string): number {
  const source = normalizeUnit(from);
  const target = normalizeUnit(to);

  const toCelsius = (input: number, unit: string): number => {
    if (unit === 'c' || unit === 'celsius') return input;
    if (unit === 'f' || unit === 'fahrenheit') return ((input - 32) * 5) / 9;
    if (unit === 'k' || unit === 'kelvin') return input - 273.15;
    throw new Error(`Unsupported temperature unit: ${from}`);
  };

  const fromCelsius = (input: number, unit: string): number => {
    if (unit === 'c' || unit === 'celsius') return input;
    if (unit === 'f' || unit === 'fahrenheit') return (input * 9) / 5 + 32;
    if (unit === 'k' || unit === 'kelvin') return input + 273.15;
    throw new Error(`Unsupported temperature unit: ${to}`);
  };

  const celsius = toCelsius(value, source);
  return fromCelsius(celsius, target);
}

async function convertCurrency(value: number, from: string, to: string): Promise<ConvertResult> {
  const fromCode = from.trim().toUpperCase();
  const toCode = to.trim().toUpperCase();

  const url = `https://api.frankfurter.app/latest?amount=${encodeURIComponent(String(value))}&from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Currency conversion failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    amount?: number;
    base?: string;
    date?: string;
    rates?: Record<string, number>;
  };

  const result = data.rates?.[toCode];
  if (typeof result !== 'number') {
    throw new Error('Currency conversion response was missing a result.');
  }

  const rate = value !== 0 ? result / value : undefined;

  return {
    category: 'currency',
    value,
    from: fromCode,
    to: toCode,
    result,
    ...(rate !== undefined ? { rate } : {}),
    ...(data.date ? { date: data.date } : {}),
  };
}

export async function convertUnits(input: ConvertInput): Promise<ConvertResult> {
  if (!Number.isFinite(input.value)) {
    throw new Error('Value must be a finite number.');
  }

  switch (input.category) {
    case 'length':
      return {
        category: input.category,
        value: input.value,
        from: input.from,
        to: input.to,
        result: convertViaBase(input.value, input.from, input.to, LENGTH_TO_METERS),
      };
    case 'mass':
      return {
        category: input.category,
        value: input.value,
        from: input.from,
        to: input.to,
        result: convertViaBase(input.value, input.from, input.to, MASS_TO_GRAMS),
      };
    case 'volume':
      return {
        category: input.category,
        value: input.value,
        from: input.from,
        to: input.to,
        result: convertViaBase(input.value, input.from, input.to, VOLUME_TO_LITERS),
      };
    case 'temperature':
      return {
        category: input.category,
        value: input.value,
        from: input.from,
        to: input.to,
        result: convertTemperature(input.value, input.from, input.to),
      };
    case 'currency':
      return convertCurrency(input.value, input.from, input.to);
    default:
      throw new Error('Unsupported conversion category.');
  }
}
