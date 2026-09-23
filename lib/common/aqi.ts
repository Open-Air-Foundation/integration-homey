/**
 * @module Aqi
 * US EPA AQI from PM2.5, using AirGradient firmware breakpoints so Homey
 * `level_aqi` agrees with the monitor and the dashboard.
 *
 * The firmware table `PM_TO_AQI_US` still uses the pre-February 2024 EPA PM2.5
 * breakpoints (Good through 12.0 µg/m³, not the revised 9.0). The index edges
 * 50 / 100 / 150 / 200 / 300 / 500 are the EPA category scale and did not move
 * with that revision. Adopting the 2024 concentration cutoffs here would make
 * Homey disagree with every monitor that still runs the firmware table.
 *
 * Inside a band the index is the EPA piecewise-linear map
 *   I = (I_high − I_low) / (C_high − C_low) × (C − C_low) + I_low
 * truncated toward zero, because the firmware returns that expression as an `int`.
 * Nowcast and 24-hour averaging are intentionally not applied: the monitor
 * displays the nowcast-free conversion of the current concentration.
 *
 * @see https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf — EPA AQI Technical Assistance Document
 * @see https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html — EPA AQS AQI breakpoint table
 * @see https://github.com/airgradienthq/arduino/blob/master/examples/ONE_V9/ONE_V9.ino — AirGradient firmware `PM_TO_AQI_US`
 */

/**
 * Homey `level_aqi` enum ids on the EPA six-band scale.
 * Stock Homey values stop at four bands, so outdoor drivers override them;
 * these ids have to match that override or Flow conditions never hit.
 */
export type AqiLevel =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

/**
 * Piecewise-linear concentration→AQI bands from AirGradient firmware `PM_TO_AQI_US`.
 *
 * Shared edges (12.0, 35.4, …) belong to the lower band: lookup uses `<= cHigh`
 * and walks the table in firmware order, so a concentration sitting on a
 * breakpoint gets the lower index. The last band ends at 500.4 µg/m³; above
 * that the scale is already saturated at 500 and is not extrapolated.
 *
 * @see https://github.com/airgradienthq/arduino/blob/master/examples/ONE_V9/ONE_V9.ino
 */
const PM25_TO_AQI_BANDS: ReadonlyArray<{
  readonly cLow: number;
  readonly cHigh: number;
  readonly iLow: number;
  readonly iHigh: number;
}> = [
  {
    cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50,
  },
  {
    cLow: 12.0, cHigh: 35.4, iLow: 50, iHigh: 100,
  },
  {
    cLow: 35.4, cHigh: 55.4, iLow: 100, iHigh: 150,
  },
  {
    cLow: 55.4, cHigh: 150.4, iLow: 150, iHigh: 200,
  },
  {
    cLow: 150.4, cHigh: 250.4, iLow: 200, iHigh: 300,
  },
  {
    cLow: 250.4, cHigh: 350.4, iLow: 300, iHigh: 400,
  },
  {
    cLow: 350.4, cHigh: 500.4, iLow: 400, iHigh: 500,
  },
];

/**
 * Inclusive US AQI upper bounds for `level_aqi`.
 * EPA closes each category on the high side, so an index of exactly 50 stays Good.
 */
const AQI_TO_LEVEL: ReadonlyArray<{ readonly max: number; readonly level: AqiLevel }> = [
  { max: 50, level: 'good' },
  { max: 100, level: 'moderate' },
  { max: 150, level: 'unhealthy_sensitive' },
  { max: 200, level: 'unhealthy' },
  { max: 300, level: 'very_unhealthy' },
  { max: Infinity, level: 'hazardous' },
];

/**
 * PM2.5 (µg/m³) to a US AQI index that matches the firmware `int`.
 * Truncation toward zero is required: rounding half up would disagree with the
 * monitor by a point whenever the linear map lands on n.5 or above.
 * Negative concentrations are treated as zero; a missing reading stays unset
 * rather than becoming AQI 0, which is a real "good" value.
 *
 * @param pm25 - PM2.5 mass concentration in µg/m³
 */
export function pm25ToUsAqi(pm25: number | null | undefined): number | null {
  if (pm25 === undefined || pm25 === null || Number.isNaN(pm25)) {
    return null;
  }

  const concentration = Math.max(0, pm25);
  const band = PM25_TO_AQI_BANDS.find((entry) => concentration <= entry.cHigh);
  if (!band) {
    return 500;
  }

  const aqi = ((band.iHigh - band.iLow) / (band.cHigh - band.cLow)) * (concentration - band.cLow) + band.iLow;
  return Math.trunc(aqi);
}

/**
 * US AQI index to the `level_aqi` enum.
 * Flow cards and the capability store the band id, not the 0–500 index.
 *
 * @param aqi - US AQI index (0–500)
 */
export function aqiLevelFromUsAqi(aqi: number | null | undefined): AqiLevel | null {
  if (aqi === undefined || aqi === null || Number.isNaN(aqi)) {
    return null;
  }

  return AQI_TO_LEVEL.find((band) => aqi <= band.max)?.level ?? 'hazardous';
}
