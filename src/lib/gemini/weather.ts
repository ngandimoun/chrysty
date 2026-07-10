import { getOpenWeatherApiKey } from '@/lib/gemini/config';

export interface WeatherResult {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  humidity: number;
  windSpeedMps: number;
}

export type WeatherLocationSelection =
  | { kind: 'named'; query: string }
  | { kind: 'coordinates'; query: string }
  | null;

export function selectWeatherLocation(options: {
  location?: string;
  latitude?: number;
  longitude?: number;
}): WeatherLocationSelection {
  const namedLocation = options.location?.trim();
  if (namedLocation) {
    return { kind: 'named', query: `q=${encodeURIComponent(namedLocation)}` };
  }

  const hasCoords =
    options.latitude !== undefined &&
    options.longitude !== undefined &&
    Number.isFinite(options.latitude) &&
    Number.isFinite(options.longitude);
  return hasCoords
    ? { kind: 'coordinates', query: `lat=${options.latitude}&lon=${options.longitude}` }
    : null;
}

export async function fetchCurrentWeather(options: {
  location?: string;
  latitude?: number;
  longitude?: number;
}): Promise<WeatherResult> {
  const apiKey = getOpenWeatherApiKey();
  if (!apiKey) {
    throw new Error('Weather API is not configured.');
  }

  const selectedLocation = selectWeatherLocation(options);

  if (!selectedLocation) {
    throw new Error('Provide a location name or latitude/longitude.');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?${selectedLocation.query}&appid=${apiKey}&units=metric`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather lookup failed (${response.status}).`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const main = data.main as Record<string, unknown> | undefined;
  const weather = Array.isArray(data.weather) ? (data.weather[0] as Record<string, unknown>) : undefined;
  const wind = data.wind as Record<string, unknown> | undefined;
  const name = typeof data.name === 'string' ? data.name : options.location ?? 'Unknown';

  return {
    location: name,
    temperatureC: typeof main?.temp === 'number' ? main.temp : 0,
    feelsLikeC: typeof main?.feels_like === 'number' ? main.feels_like : 0,
    description: typeof weather?.description === 'string' ? weather.description : 'Unknown',
    humidity: typeof main?.humidity === 'number' ? main.humidity : 0,
    windSpeedMps: typeof wind?.speed === 'number' ? wind.speed : 0,
  };
}
