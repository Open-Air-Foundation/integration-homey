/**
 * @module AbsoluteHumidity
 * Absolute humidity (g/m³) for `measure_absolute_humidity`.
 * AirGradient does not report it; it is derived from the same temperature and
 * relative humidity as dew point and humidex.
 *
 * Saturation vapour pressure uses the Alduchov & Eskridge (1996) Magnus fit,
 * a closer match to measured saturation pressure in the ambient range. Those
 * coefficients (17.67 / 243.5) are not the 17.27 / 237.7 pair used for dew
 * point: dew point needs the classic Tetens inversion, which is published as
 * a closed form. Mixing the two pairs would match neither reference.
 *
 *   e_s = 6.112 × exp(17.67 × T / (T + 243.5))     (hPa)
 *   AH  = (e_s × RH × 2.1674) / (273.15 + T)       (g/m³)
 *
 * 2.1674 is 1/100 of the usual ~216.7 g·K/(m³·hPa) factor
 * (100 × M_w / R, with M_w the molar mass of water). Relative humidity is a
 * percent, so the extra 100 in the hPa→Pa conversion cancels the ÷100 that
 * would otherwise turn RH into a fraction. One decimal matches the capability.
 * Negative humidity is rejected; a missing reading stays unset rather than 0,
 * which would look like perfectly dry air.
 *
 * @see https://doi.org/10.1175/BAMS-86-2-225 — Lawrence (2005), BAMS: Magnus form overview
 * @see https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2 — Alduchov & Eskridge (1996) Magnus coefficients
 */

/**
 * Absolute humidity (g/m³) from temperature and relative humidity.
 *
 * @param temperature - Air temperature in °C
 * @param relativeHumidity - Relative humidity as a percentage (0–100)
 */
export function calculateAbsoluteHumidity(
  temperature: number | undefined,
  relativeHumidity: number | undefined,
): number | null {
  if (temperature === undefined || relativeHumidity === undefined || relativeHumidity < 0) {
    return null;
  }

  const saturationVaporPressure = 6.112 * Math.exp((17.67 * temperature) / (temperature + 243.5));
  const absoluteHumidity = (saturationVaporPressure * relativeHumidity * 2.1674) / (273.15 + temperature);

  return Math.round(absoluteHumidity * 10) / 10;
}
