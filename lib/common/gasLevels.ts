/**
 * @module GasLevels
 * Maps Sensirion SGP41 Gas Index values to Homey `level_tvoc` and `level_nox` enum values.
 *
 * AirGradient monitors report relative indexes (1–500), not absolute TVOC ppb or NOx µg/m³.
 * Sensirion calibrates each index to the device's recent baseline: VOC Index 100 = 24 h average,
 * NOx Index 1 = recent oxidizing-gas baseline. There is no EPA/WHO limit for these unitless scales;
 * breakpoints follow Sensirion's integration guidance and commonly adopted SGP41 bands.
 *
 * @see https://sensirion.com/media/documents/02232963/6294E043/Info_Note_VOC_Index.pdf — Sensirion VOC Index
 * @see https://sensirion.com/media/documents/9F289B95/6294DFFC/Info_Note_NOx_Index.pdf — Sensirion NOx Index
 * @see https://sensirion.com/media/documents/ACD82D45/6294DFC0/Info_Note_Integration_VOC_NOx_Sensor.pdf — VOC/NOx integration (air-treatment trigger examples)
 * @see https://sensirion.com/media/documents/5FE8673C/61E96F50/Sensirion_Gas_Sensors_Datasheet_SGP41.pdf — SGP41 datasheet (index scales)
 */

export type GasLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * VOC Index breakpoints derived from Sensirion's air-treatment examples and SGP41 integration bands.
 *
 * - ≤100: at or below the 24 h rolling average (Sensirion "typical" / improved air).
 * - ≤150: mild elevation; Sensirion cites ~150 as a common air-purifier trigger.
 * - ≤250: clear VOC event where ventilation is recommended in integration literature.
 * - >250: strong event (Sensirion "elevated" / "poor" bands above 250–400).
 */
const TVOC_INDEX_THRESHOLDS = { medium: 100, high: 150, critical: 250 } as const;

/**
 * NOx Index breakpoints derived from Sensirion's SGP41 integration guidance.
 *
 * NOx Index uses 1 as the recent baseline (not 100). Sensirion fan-control examples start
 * reacting around index 30; community SGP41 bands commonly use 5 / 20 / 150 / 300 as step points.
 *
 * - ≤5: near clean-air baseline (index ≈ 1).
 * - ≤20: minor oxidizing-gas activity (e.g. cooking starting).
 * - ≤150: real NOx event — Sensirion's typical "trigger air treatment" band.
 * - >150: significant to major event (150–300 elevated, >300 major).
 */
const NOX_INDEX_THRESHOLDS = { medium: 5, high: 20, critical: 150 } as const;

/**
 * Shared index→level mapper so TVOC and NOx stay on Homey's four-step scale.
 * Separate copies of this ladder would let the two gases drift to different band counts.
 */
function gasIndexLevel(
  index: number | null | undefined,
  thresholds: { readonly medium: number; readonly high: number; readonly critical: number },
): GasLevel | null {
  if (index === undefined || index === null) {
    return null;
  }

  if (index <= thresholds.medium) return 'low';
  if (index <= thresholds.high) return 'medium';
  if (index <= thresholds.critical) return 'high';
  return 'critical';
}

/**
 * `level_tvoc` from the Sensirion VOC Index.
 * The index is not a concentration: 100 is the sensor's own 24 h baseline.
 * Passing ppb here would pin the level at low for every realistic reading.
 *
 * @param index - VOC Index (1–500)
 */
export function tvocLevel(index: number | null | undefined): GasLevel | null {
  return gasIndexLevel(index, TVOC_INDEX_THRESHOLDS);
}

/**
 * `level_nox` from the Sensirion NOx Index.
 * The baseline is 1, not 100. Reusing the VOC thresholds would call ordinary
 * oxidizing-gas activity "low" until the index reached 100.
 *
 * @param index - NOx Index (1–500)
 */
export function noxLevel(index: number | null | undefined): GasLevel | null {
  return gasIndexLevel(index, NOX_INDEX_THRESHOLDS);
}
