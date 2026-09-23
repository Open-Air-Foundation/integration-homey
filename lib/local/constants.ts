/**
 * @module local/constants
 * Firmware routes and the mDNS strategy id.
 * These strings are fixed by the device HTTP API and the app manifest.
 */

/** Must match the discovery strategy id in the app manifest, or Homey returns no results. */
export const DISCOVERY_STRATEGY = 'airgradient';

/** Identifies this Homey app in on-device access logs. */
export const HTTP_USER_AGENT = 'AirGradient HomeyApp';

/** Firmware route for the current reading. Any other path 404s and is reported as an unreachable monitor. */
export const MEASURES_PATH = '/measures/current';

/** Firmware route for configuration. GET and PUT share it; settings and brightness are partial PUTs. */
export const CONFIG_PATH = '/config';

/**
 * Jitter applied after mDNS address updates before polling restarts.
 * Spreads concurrent rediscovery so multiple devices do not hit the LAN in lockstep.
 */
export const DISCOVERY_POLL_JITTER_MS = { min: 750, max: 1750 } as const;

export { DEFAULT_POLL_INTERVAL_MS } from '../common/polling';
