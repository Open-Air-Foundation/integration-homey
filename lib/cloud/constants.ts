/**
 * @module cloud/constants
 * Routes on the AirGradient public API.
 * Path strings stay relative to {@link API_BASE_URL} so the host is set in one place.
 */

/** Cloud API host; path constants stay relative so the host can change in one place. */
export const API_BASE_URL = 'https://api.airgradient.com';

/** Identifies this Homey app in AirGradient access logs. */
export const HTTP_USER_AGENT = 'AirGradient HomeyApp';

/** Every location in one response, so pairing does not request each monitor separately. */
export const ALL_MEASURES_PATH = '/public/api/v1/locations/measures/current';

/** Place id and name. The id is the key for a token shared by every device at that place. */
export const PLACE_PATH = '/public/api/v1/place';

/** Per-location poll path. Steady-state polling uses this so it does not re-list the whole place. */
export const LOCATION_MEASURES_PATH = '/public/api/v1/locations/{locationId}/measures/current';

/** Cloud calibration route, addressed by serial. Local monitors use PUT `/config` instead. */
export const CO2_CALIBRATION_PATH = '/public/api/v1/sensors/{serialno}/co2/calibration';

/**
 * Default cloud poll interval when settings omit `pollingInterval`.
 * Longer than local polling to stay within cloud API rate expectations.
 */
export const DEFAULT_POLL_INTERVAL_MS = 180_000;

/**
 * App-settings key for place tokens.
 * Stored on the app so every device at a place shares one credential.
 */
export const CLOUD_TOKENS_SETTING = 'cloudPlaceTokens';

/** App settings key for the most recently entered token (pair view prefill). */
export const LAST_CLOUD_TOKEN_SETTING = 'lastCloudToken';

/**
 * Settings key for one place.
 * Place ids are numbers; the prefix keeps them from colliding with other app-settings keys.
 *
 * @param placeId - Place id from `GET /public/api/v1/place`
 */
export function placeKeyFromId(placeId: number): string {
  return `place_${placeId}`;
}
