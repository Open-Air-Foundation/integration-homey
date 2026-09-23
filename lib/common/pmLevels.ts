/**
 * @module PmLevels
 * Maps PM mass (µg/m³) onto Homey's four-step `level_pm*` scale.
 *
 * Homey has four bands (low / medium / high / critical). PM2.5 and PM10 use the
 * US EPA 24-hour AQI breakpoints for Good, Moderate, and Unhealthy for
 * Sensitive Groups, which is as far as a four-step scale can follow the
 * six-step AQI without inventing extra Homey values. The Good/Moderate PM2.5
 * cut is 12.0 µg/m³ (2012–2024 EPA). The February 2024 revision to 9.0 µg/m³
 * is not used: `measure_aqi` follows AirGradient firmware, which still uses
 * 12.0, and the level capability has to agree with that index.
 *
 * PM1 has no WHO, EPA, or EU limit. Thresholds are the EPA PM2.5 breakpoints
 * scaled by 0.75, a central urban PM1/PM2.5 mass ratio (published range about
 * 0.6–0.9; Seoul about 0.75–0.8, European urban about 0.6–0.8). PM1 is a
 * subset of PM2.5 by mass, so an unscaled PM2.5 limit would leave the PM1
 * level stuck on low while PM2.5 had already left Good.
 *
 * @see https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf — EPA AQI Technical Assistance Document (24 h PM breakpoints)
 * @see https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html — EPA AQS AQI breakpoint table
 * @see https://doi.org/10.3390/atmos10110662 — Zajusz-Zubek et al. (2019): urban PM1/PM2.5 ≈ 0.75
 * @see https://www.who.int/publications/i/item/9789240034228 — WHO global air quality guidelines (2021); no PM1 guideline
 */

export type PmLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * EPA 24-hour PM2.5 breakpoints (µg/m³): Good ≤12, Moderate ≤35.4, Unhealthy
 * for Sensitive Groups ≤55.4. The next AQI categories do not fit Homey's four bands.
 *
 * @see https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf
 */
const PM25_THRESHOLDS = { medium: 12.0, high: 35.4, critical: 55.4 } as const;

/**
 * EPA 24-hour PM10 breakpoints (µg/m³): Good ≤54, Moderate ≤154, Unhealthy
 * for Sensitive Groups ≤254.
 *
 * @see https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf
 */
const PM10_THRESHOLDS = { medium: 54, high: 154, critical: 254 } as const;

/**
 * Central urban PM1/PM2.5 mass ratio used to derive PM1 thresholds from EPA PM2.5 breakpoints.
 * PM1 is always a subset of PM2.5 by mass; no WHO or EPA limit exists for PM1 alone.
 *
 * @see https://doi.org/10.3390/atmos10110662
 */
const PM1_TO_PM25_RATIO = 0.75;

/** PM1 breakpoints (µg/m³): EPA PM2.5 24h limits × {@link PM1_TO_PM25_RATIO} → ≤9, ≤26.6, ≤41.6. */
const PM1_THRESHOLDS = {
  medium: roundThreshold(PM25_THRESHOLDS.medium * PM1_TO_PM25_RATIO),
  high: roundThreshold(PM25_THRESHOLDS.high * PM1_TO_PM25_RATIO),
  critical: roundThreshold(PM25_THRESHOLDS.critical * PM1_TO_PM25_RATIO),
} as const;

/**
 * Rounds derived PM1 breakpoints to one decimal, matching `measure_pm*` capability precision.
 */
function roundThreshold(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Shared concentration→level mapper so PM1, PM2.5, and PM10 stay on Homey's four-step scale.
 */
function pmMassLevel(
  concentration: number | null | undefined,
  thresholds: { readonly medium: number; readonly high: number; readonly critical: number },
): PmLevel | null {
  if (concentration === undefined || concentration === null) {
    return null;
  }

  if (concentration <= thresholds.medium) return 'low';
  if (concentration <= thresholds.high) return 'medium';
  if (concentration <= thresholds.critical) return 'high';
  return 'critical';
}

/**
 * `level_pm1` from a PM1 concentration.
 * Thresholds are derived; see {@link PM1_TO_PM25_RATIO}. There is no regulatory PM1 limit to apply directly.
 *
 * @param concentration - PM1 mass concentration in µg/m³
 */
export function pm1Level(concentration: number | null | undefined): PmLevel | null {
  return pmMassLevel(concentration, PM1_THRESHOLDS);
}

/**
 * `level_pm25` from a PM2.5 concentration, on the EPA 24-hour breakpoints.
 * Kept on 12.0 µg/m³ so this band agrees with the US AQI index.
 *
 * @param concentration - PM2.5 mass concentration in µg/m³
 */
export function pm25Level(concentration: number | null | undefined): PmLevel | null {
  return pmMassLevel(concentration, PM25_THRESHOLDS);
}

/**
 * `level_pm10` from a PM10 concentration, on the EPA 24-hour breakpoints.
 *
 * @param concentration - PM10 mass concentration in µg/m³
 */
export function pm10Level(concentration: number | null | undefined): PmLevel | null {
  return pmMassLevel(concentration, PM10_THRESHOLDS);
}
