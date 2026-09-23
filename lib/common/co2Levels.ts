/**
 * @module Co2Levels
 * Maps CO₂ (ppm) onto Homey's four-step `level_co2` scale.
 *
 * Homey exposes low / medium / high / critical. AirGradient's default LED
 * uses three colors (green, amber near 1000 ppm, red near 2000 ppm), so the
 * extra Homey step is placed at 1500 ppm: still elevated, short of the red
 * LED, and inside the range where indoor guidance already asks for ventilation.
 * ~1000 ppm remains the usual concern threshold, which is why it is the first
 * step up from low and not a midpoint.
 *
 * - ≤1000: low (outdoor through typical indoor)
 * - ≤1500: medium (elevated)
 * - ≤2000: high (poor indoor air, amber-to-red LED range)
 * - >2000: critical (red LED range)
 *
 * @see https://www.airgradient.com/documentation/kb/control-leds-display-airgradient-one — AirGradient CO₂ LED defaults
 * @see https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/62_1_2016_a_20180126.pdf — ASHRAE 62.1 indoor CO₂ context
 */

export type Co2Level = 'low' | 'medium' | 'high' | 'critical';

/** CO₂ breakpoints (ppm) mapped onto Homey's four-step `level_co2` scale. */
const CO2_THRESHOLDS = { medium: 1000, high: 1500, critical: 2000 } as const;

/**
 * `level_co2` band for a CO₂ concentration.
 * The comparisons are `<=`, so 1000 ppm stays low: that is the usual concern
 * threshold, and the medium band starts once it is exceeded.
 *
 * @param ppm - CO₂ concentration in parts per million
 */
export function co2Level(ppm: number | null | undefined): Co2Level | null {
  if (ppm === undefined || ppm === null) {
    return null;
  }

  if (ppm <= CO2_THRESHOLDS.medium) return 'low';
  if (ppm <= CO2_THRESHOLDS.high) return 'medium';
  if (ppm <= CO2_THRESHOLDS.critical) return 'high';
  return 'critical';
}
