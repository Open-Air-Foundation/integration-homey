/**
 * @module GoIaqs
 * GO IAQS Starter score (PM2.5 + CO₂) for indoor Homey capabilities.
 *
 * Port of AirGradient's canonical TypeScript scorer so Homey matches the
 * dashboard and simulator. Each pollutant is scored 10 (best) to 0 (worst) by
 * piecewise-linear interpolation between the white-paper anchors, rounded half
 * up to an integer. The worse pollutant wins. When both scores are equal and
 * at most 7 (Moderate or Unhealthy), one extra point is deducted: two
 * concurrent problems in the same degraded band score worse than either alone.
 * Equal Good scores (8–10) are left as they are.
 *
 * Missing PM2.5 or CO₂ returns null. The reference substitutes 12 µg/m³ and
 * 950 ppm; those defaults would publish a score for a sensor that did not report.
 *
 * Attribution: Achim Haug (AirGradient) for GO AQS. License: CC BY-SA 4.0.
 *
 * @see https://www.airgradient.com/blog/go-iaqs-starter-score-technical-implementation
 */

type Anchor = {
  readonly x: number;
  readonly y: number;
};

/** Homey `level_go_iaqs` enum ids matching GO IAQS Good / Moderate / Unhealthy. */
export type GoIaqsLevel = 'good' | 'moderate' | 'unhealthy';

const PM25_MIN = 0;
const PM25_MAX = 100;
const CO2_MIN = 400;
const CO2_MAX = 5000;
const SCORE_MIN = 0;
const SCORE_MAX = 10;

/**
 * PM2.5 concentration→score anchors from the GO IAQS Starter white paper.
 *
 * The pairs (10, 8)/(11, 7) and (25, 4)/(26, 3) are one µg/m³ apart and one
 * score point apart. Interpolation across that gap is much steeper than inside
 * a band, so Good→Moderate and Moderate→Unhealthy change sharply instead of
 * being smeared over the whole range. The same shape is used for CO₂.
 */
const PM25_ANCHORS: readonly Anchor[] = [
  { x: 0, y: 10 },
  { x: 10, y: 8 },
  { x: 11, y: 7 },
  { x: 25, y: 4 },
  { x: 26, y: 3 },
  { x: 100, y: 0 },
];

/**
 * CO₂ concentration→score anchors from the GO IAQS Starter white paper.
 * The 1 ppm gaps at 800/801 and 1400/1401 are the same category steps as the
 * PM2.5 anchors at 10/11 and 25/26.
 */
const CO2_ANCHORS: readonly Anchor[] = [
  { x: 400, y: 10 },
  { x: 800, y: 8 },
  { x: 801, y: 7 },
  { x: 1400, y: 4 },
  { x: 1401, y: 3 },
  { x: 5000, y: 0 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Half-up rounding, matching the reference scorer.
 * A fractional score of n.5 must become n+1. Banker's rounding would leave an
 * even n unchanged and disagree with the dashboard by a point.
 */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Piecewise-linear interpolation between white-paper anchors, as an integer 0–10.
 * Values outside the anchor span clamp to the end scores. Extrapolating past
 * the last anchor would go negative, and the scale already ends at 0.
 */
function interpolateAnchors(value: number, anchors: readonly Anchor[]): number {
  if (value <= anchors[0].x) {
    return anchors[0].y;
  }

  const lastAnchor = anchors[anchors.length - 1];
  if (value >= lastAnchor.x) {
    return lastAnchor.y;
  }

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const left = anchors[i];
    const right = anchors[i + 1];

    if (value <= right.x) {
      const interpolated = left.y + ((value - left.x) * (right.y - left.y)) / (right.x - left.x);
      return clamp(roundHalfUp(interpolated), SCORE_MIN, SCORE_MAX);
    }
  }

  return SCORE_MIN;
}

/**
 * Scores one pollutant on 0–10.
 * Above the published maximum the score is 0. Extrapolating the last segment
 * would continue below 0, which is outside the scale.
 */
function computePollutantScore(
  value: number,
  min: number,
  max: number,
  anchors: readonly Anchor[],
): number {
  if (value > max) {
    return SCORE_MIN;
  }

  return interpolateAnchors(clamp(value, min, max), anchors);
}

/**
 * Combines the two pollutant scores.
 * When they differ, the minimum wins: the better pollutant does not pull the
 * total up. When they match and are ≤ 7, both are Moderate or Unhealthy and
 * the one-point deduction applies. The floor at 0 keeps a double-zero from
 * becoming −1, which is outside the scale.
 */
function getTotalScore(pm25Score: number, co2Score: number): number {
  if (pm25Score === co2Score) {
    if (pm25Score <= 7) {
      return Math.max(pm25Score - 1, SCORE_MIN);
    }

    return pm25Score;
  }

  return Math.min(pm25Score, co2Score);
}

/** Which pollutant pulled the GO IAQS score down. Equal scores count as both. */
export type GoIaqsMainPollutant = 'pm25' | 'co2' | 'both';

/**
 * Shared component scores so the total and the timeline cause use the same breakpoints.
 * A missing reading must not be scored as if the sensor reported zero.
 */
function componentScores(
  pm25: number | null | undefined,
  co2: number | null | undefined,
): { pm25Score: number; co2Score: number } | null {
  if (
    pm25 === undefined
    || pm25 === null
    || Number.isNaN(pm25)
    || co2 === undefined
    || co2 === null
    || Number.isNaN(co2)
  ) {
    return null;
  }

  return {
    pm25Score: computePollutantScore(pm25, PM25_MIN, PM25_MAX, PM25_ANCHORS),
    co2Score: computePollutantScore(co2, CO2_MIN, CO2_MAX, CO2_ANCHORS),
  };
}

/**
 * GO IAQS Starter total score (10 best → 0 worst) from PM2.5 and CO₂.
 *
 * @param pm25 - PM2.5 mass concentration in µg/m³
 * @param co2 - CO₂ concentration in ppm
 */
export function calculateGoIaqsScore(
  pm25: number | null | undefined,
  co2: number | null | undefined,
): number | null {
  const scores = componentScores(pm25, co2);
  if (!scores) {
    return null;
  }

  return getTotalScore(scores.pm25Score, scores.co2Score);
}

/**
 * Names the pollutant behind a GO IAQS warning.
 * CO₂ has no separate indoor timeline post, so the score notification has to say why it fired.
 *
 * @param pm25 - PM2.5 mass concentration in µg/m³
 * @param co2 - CO₂ concentration in ppm
 */
export function goIaqsMainPollutant(
  pm25: number | null | undefined,
  co2: number | null | undefined,
): GoIaqsMainPollutant | null {
  const scores = componentScores(pm25, co2);
  if (!scores) {
    return null;
  }

  if (scores.pm25Score === scores.co2Score) {
    return 'both';
  }

  return scores.pm25Score < scores.co2Score ? 'pm25' : 'co2';
}

/**
 * GO IAQS total score to the `level_go_iaqs` enum.
 * The cuts sit on the anchor scores: 8 is still Good (the score at the
 * Good/Moderate step) and 4 is still Moderate.
 *
 * @param score - Integer score 0–10
 */
export function goIaqsLevel(score: number | null | undefined): GoIaqsLevel | null {
  if (score === undefined || score === null || Number.isNaN(score)) {
    return null;
  }

  if (score >= 8) return 'good';
  if (score >= 4) return 'moderate';
  return 'unhealthy';
}
