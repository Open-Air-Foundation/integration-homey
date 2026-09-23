/**
 * @module co2Calibration
 * Settle-window lockout and timeline notices for forced CO₂ calibration.
 * AirGradient exposes no progress API; ~10 minutes is their advised settle time.
 *
 * The window end is kept in the device store rather than an in-memory timer, so
 * an app restart neither bypasses the lockout nor loses the finish notice, and
 * a deleted device leaves nothing scheduled behind.
 */

import Homey from 'homey';
import {
  notifyCo2CalibrationFinished,
  notifyCo2CalibrationStarted,
} from './notifications';

const WINDOW_MS = 10 * 60 * 1000;

/**
 * Store key for the epoch ms when the settle window ends.
 * An absolute deadline still means the same thing after a restart; a remaining delay would not.
 */
const WINDOW_STORE = 'co2CalibrationUntil';

/**
 * Sends the calibration request, then blocks another until the settle window ends.
 * A second request in that window would recalibrate a sensor already being pulled toward 400 ppm.
 *
 * @param device - Homey device receiving timeline notices
 * @param request - Transport-specific API call that triggers calibration
 */
export async function runCo2Calibration(
  device: Homey.Device,
  request: () => Promise<void>,
): Promise<void> {
  const until = device.getStoreValue(WINDOW_STORE) as unknown;
  if (typeof until === 'number' && Date.now() < until) {
    const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
    throw new Error(device.homey.__('errors.co2CalibrationInProgress', { minutes }));
  }

  await request();

  await device.setStoreValue(WINDOW_STORE, Date.now() + WINDOW_MS);
  notifyCo2CalibrationStarted({ device, homey: device.homey }).catch((err) => {
    device.error('Failed to create CO₂ calibration started notification:', err);
  });
}

/**
 * Posts the finish notice once the settle window has elapsed.
 * Called from the poll path so the notice does not depend on a live timer.
 *
 * @param device - Homey device receiving timeline notices
 */
export async function finishCo2CalibrationIfDue(device: Homey.Device): Promise<void> {
  const until = device.getStoreValue(WINDOW_STORE) as unknown;
  if (typeof until !== 'number' || Date.now() < until) {
    return;
  }

  await device.unsetStoreValue(WINDOW_STORE);
  await notifyCo2CalibrationFinished({ device, homey: device.homey });
}
