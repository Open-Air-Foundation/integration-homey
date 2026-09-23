/**
 * @module DewPoint
 * Dew point (°C) for `measure_dew_point`.
 * AirGradient does not report it; it is derived from temperature and relative humidity.
 *
 * Magnus–Tetens inversion with the classic coefficients a = 17.27 and b = 237.7 °C:
 *
 *   γ   = ln(RH / 100) + a × T / (b + T)
 *   T_d = b × γ / (a − γ)
 *
 * Alduchov & Eskridge (17.625 / 243.04, or the 17.67 / 243.5 pair used for
 * absolute humidity) fit saturation pressure slightly better, but they are not
 * this inversion. Substituting them into the Tetens rearrangement would not be
 * the published dew-point formula. RH ≤ 0 is rejected because the log is
 * undefined, and this approximation has no finite dew point at zero humidity.
 * One decimal matches the capability. A missing temperature or humidity stays
 * unset, so the capability is not filled in from an assumed humidity.
 *
 * @see https://doi.org/10.1175/BAMS-86-2-225 — Lawrence (2005), BAMS: Magnus form and dew-point inversion
 * @see https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2 — Alduchov & Eskridge (1996) optimized Magnus coefficients
 */

/**
 * Dew point (°C) via the Magnus–Tetens inversion.
 *
 * @param temperature - Air temperature in °C
 * @param relativeHumidity - Relative humidity as a percentage (0–100)
 */
export function calculateDewPoint(
  temperature: number | undefined,
  relativeHumidity: number | undefined,
): number | null {
  if (temperature === undefined || relativeHumidity === undefined || relativeHumidity <= 0) {
    return null;
  }

  const a = 17.27;
  const b = 237.7;
  const alpha = (a * temperature) / (b + temperature) + Math.log(relativeHumidity / 100);
  return Math.round(((b * alpha) / (a - alpha)) * 10) / 10;
}
