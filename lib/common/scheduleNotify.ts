/**
 * @module scheduleNotify
 * Holds back a timeline post until a high level has persisted, then keeps quiet
 * for a cooldown period.
 *
 * The dwell is tracked as a timestamp in the device store rather than a pending
 * timer: a timer would keep a deleted device alive, and would lose the pending
 * post whenever the app restarts. Progress is evaluated on each poll instead.
 */

import Homey from 'homey';

/** Level ids that warrant a timeline warning. Moderate and medium are omitted so a typical indoor reading does not notify. */
const HIGH_LEVELS = new Set([
  'high',
  'critical',
  'great_discomfort',
  'dangerous',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
]);

/** How long a metric must stay in a high band before a timeline notification. */
const LEVEL_HIGH_DELAY_MS = 5 * 60 * 1000;

/** Quiet period after a post so a brief dip does not notify again. */
const LEVEL_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Store key for the moment this capability entered a high band.
 * Cleared when the level leaves the band, so the next entry waits the full dwell again.
 */
function pendingKey(capability: string): string {
  return `notify_pending_${capability}`;
}

/**
 * Store key for the end of the quiet period.
 * Kept after the post so a brief dip back into the high band does not notify again.
 */
function cooldownKey(capability: string): string {
  return `notify_cooldown_${capability}`;
}

/**
 * Called on every poll, including polls where the level did not change.
 * A change-only hook would miss the dwell deadline: a high band often stays put for many polls.
 *
 * @param device - Device whose store tracks dwell and cooldown
 * @param capability - Level capability being evaluated
 * @param level - Current level id
 * @param enabled - Whether the user enabled notices for this metric
 * @param notify - Posts the timeline message
 */
export async function onLevelChange({
  device,
  capability,
  level,
  enabled = true,
  notify,
}: {
  device: Homey.Device;
  capability: string;
  level: string;
  enabled?: boolean;
  notify: () => Promise<void>;
}): Promise<void> {
  if (!enabled || !HIGH_LEVELS.has(level)) {
    await clearPending(device, capability);
    return;
  }

  const since = device.getStoreValue(pendingKey(capability)) as unknown;
  if (typeof since !== 'number') {
    await device.setStoreValue(pendingKey(capability), Date.now());
    return;
  }

  if (Date.now() - since < LEVEL_HIGH_DELAY_MS) {
    return;
  }

  const until = device.getStoreValue(cooldownKey(capability)) as unknown;
  if (typeof until === 'number' && until > Date.now()) {
    return;
  }

  await notify();
  await device.setStoreValue(cooldownKey(capability), Date.now() + LEVEL_COOLDOWN_MS);
}

/**
 * Drops the dwell marker so leaving the band restarts the wait next time.
 */
async function clearPending(device: Homey.Device, capability: string): Promise<void> {
  if (device.getStoreValue(pendingKey(capability)) == null) {
    return;
  }

  await device.unsetStoreValue(pendingKey(capability));
}
