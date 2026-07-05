import { getOpenWeatherApiKey } from '@/lib/gemini/config';

export interface WeatherResult {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  humidity: number;
  windSpeedMps: number;
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

  const hasCoords =
    options.latitude !== undefined &&
    options.longitude !== undefined &&
    Number.isFinite(options.latitude) &&
    Number.isFinite(options.longitude);

  const query = hasCoords
    ? `lat=${options.latitude}&lon=${options.longitude}`
    : options.location?.trim()
      ? `q=${encodeURIComponent(options.location.trim())}`
      : null;

  if (!query) {
    throw new Error('Provide a location name or latitude/longitude.');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?${query}&appid=${apiKey}&units=metric`;
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
