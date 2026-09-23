/**
 * @module Humidex
 * Canadian humidex and Environment Canada comfort bands for `measure_humidex`
 * and `level_humidex`. AirGradient does not report either.
 *
 * ECCC defines humidex from air temperature and the vapour pressure at the
 * dew point, not from relative humidity directly, so {@link calculateDewPoint} runs first.
 *
 *   e       = 6.11 × exp(5417.7530 × (1/273.15 − 1/T_dew_K))   (hPa)
 *   humidex = T + 0.5555 × (e − 10)
 *
 * 5417.7530 K is L/R for water in the Clausius–Clapeyron form ECCC publishes.
 * The 10 hPa term is their reference vapour pressure; 0.5555 turns the excess
 * into temperature-equivalent degrees. Comfort bands follow the published
 * ranges: below 30 little discomfort, 30–39 some, 40–45 great, above 45
 * dangerous. The top of "great discomfort" is closed (`≤ 45`) because ECCC
 * states that band as 40 to 45, not 40 to 44.
 *
 * @see https://www.canada.ca/en/environment-climate-change/services/climate-change/canadian-centre-climate-services/display-download/technical-documentation-climate-normals.html — ECCC humidex formula
 * @see https://www.canada.ca/en/services/environment/weather/severeweather/humidex.html — ECCC humidex comfort ranges
 */

import { calculateDewPoint } from './dewPoint';

/**
 * Humidex (°C) from temperature and relative humidity.
 * Returns null when dew point is undefined, so a non-positive humidity does not
 * become a numeric humidex.
 *
 * @param temperature - Air temperature in °C
 * @param relativeHumidity - Relative humidity as a percentage (0–100)
 */
export function calculateHumidex(
  temperature: number | undefined,
  relativeHumidity: number | undefined,
): number | null {
  if (temperature === undefined || relativeHumidity === undefined) {
    return null;
  }

  const dewPoint = calculateDewPoint(temperature, relativeHumidity);
  if (dewPoint === null) {
    return null;
  }

  const vaporPressure = 6.11 * Math.exp(5417.753 * (1 / 273.15 - 1 / (273.15 + dewPoint)));
  return Math.round((temperature + 0.5555 * (vaporPressure - 10)) * 10) / 10;
}

/**
 * Comfort category id for `level_humidex`.
 * 45 belongs to great discomfort; the dangerous band starts strictly above it.
 *
 * @param humidex - Humidex value, as returned by {@link calculateHumidex}
 * @see https://www.canada.ca/en/services/environment/weather/severeweather/humidex.html
 */
export function humidexComfortLevel(humidex: number | null): string | null {
  if (humidex === null) {
    return null;
  }

  if (humidex < 30) return 'little_discomfort';
  if (humidex < 40) return 'some_discomfort';
  if (humidex <= 45) return 'great_discomfort';
  return 'dangerous';
}
