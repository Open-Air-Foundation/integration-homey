/**
 * @module TvocPpb
 * Ethanol-equivalent TVOC (ppb) for Homey's `measure_tvoc` capability.
 *
 * The SGP41 does not report a concentration. It reports a 1–500 VOC Index
 * relative to the sensor's own 24 h baseline (index 100). Sensirion's
 * building-standards note still defines a display value in ethanol-equivalent
 * ppb, and that is what AirGradient dashboards show as "TVOC (ppb)":
 *
 *   TVOC [ppb] = (ln(501 − index) − 6.24) × (−381.97)
 *
 * The log falls as the index rises; the negative factor turns that into a
 * rising concentration. Index 100 lands near 94 ppb. Index 500, the top of
 * the scale, is about 2380 ppb. This is a display mapping, not a calibrated
 * mass measurement, so it must not be compared with an absolute TVOC limit.
 *
 * The log argument is `501 − index`, so the published domain is 1…500.
 * Index 0 is outside that domain, and index ≥ 501 makes the log undefined
 * (`ln` of 0 or a negative). Out-of-range samples are clamped into the domain
 * rather than left unset: a one-sample glitch of 0 or 501 should not blank
 * the capability. Two decimal places match `measure_tvoc`.
 *
 * @see https://sensirion.com/media/documents/4B4D0E67/6520038C/GAS_AN_SGP4x_BuildingStandards_D1_1.pdf
 * @see https://www.airgradient.com/documentation/air-quality-parameters/
 */

/**
 * Ethanol-equivalent TVOC (ppb) from a Sensirion VOC Index.
 * A missing index stays unset; 0 ppb would look like clean air.
 *
 * @param vocIndex - Sensirion VOC Index points, nominally 1–500
 */
export function vocIndexToTvocPpb(vocIndex: number | undefined): number | null {
  if (vocIndex === undefined || Number.isNaN(vocIndex)) {
    return null;
  }

  const clamped = Math.min(500, Math.max(1, vocIndex));
  const ppb = (Math.log(501 - clamped) - 6.24) * -381.97;
  return Math.round(ppb * 100) / 100;
}
