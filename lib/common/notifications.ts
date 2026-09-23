/**
 * @module notifications
 * Timeline excerpts for air-quality warnings and one-off device events.
 * Wording lives here so every metric uses the same sentence, and so a GO IAQS
 * warning can name the pollutant that pulled the score down. CO₂ has no indoor
 * timeline post of its own.
 */

import Homey from 'homey';
import { goIaqsMainPollutant } from './goIaqs';

type HomeyApi = Homey.Device['homey'];

async function createTimelineNotification(homey: HomeyApi, excerpt: string): Promise<void> {
  await homey.notifications.createNotification({ excerpt });
}

/**
 * Posts at most once per device.
 * The store flag survives restart; without it the deprecation notice would repeat on every init.
 */
async function createTimelineNotificationOnce(
  device: Homey.Device,
  homey: HomeyApi,
  excerpt: string,
  storeKey: string,
): Promise<boolean> {
  if (await device.getStoreValue(storeKey)) {
    return false;
  }

  await createTimelineNotification(homey, excerpt);
  await device.setStoreValue(storeKey, true);
  return true;
}

/**
 * GO IAQS warning, naming PM2.5, CO₂, or both.
 * CO₂ has no indoor post of its own, so this excerpt has to say which pollutant pulled the score down.
 */
export async function notifyGoIaqs({
  deviceName,
  pm25,
  co2,
  level,
  homey,
  enabled = true,
}: {
  deviceName: string;
  pm25: number | null | undefined;
  co2: number | null | undefined;
  level: string | null | undefined;
  homey: HomeyApi;
  enabled?: boolean;
}): Promise<void> {
  if (!enabled) {
    return;
  }

  const main = goIaqsMainPollutant(pm25, co2);
  let excerpt: string | null = null;
  if (main === 'pm25') {
    excerpt = homey.__('notifications.level_high_go_iaqs_pm25', { device: deviceName });
  } else if (main === 'co2') {
    excerpt = homey.__('notifications.level_high_go_iaqs_co2', { device: deviceName });
  } else if (main === 'both') {
    excerpt = homey.__('notifications.level_high_go_iaqs_both', { device: deviceName });
  } else if (level) {
    const levelKey = `notifications.levels.${level}`;
    const levelLabel = (homey.__(levelKey) !== levelKey ? homey.__(levelKey) : level).toLowerCase();
    excerpt = homey.__('notifications.level_high', {
      device: deviceName,
      metric: homey.__('notifications.metrics.go_iaqs'),
      level: levelLabel,
    });
  }
  if (!excerpt) {
    return;
  }

  await createTimelineNotification(homey, excerpt);
}

export async function notifyTvoc({
  deviceName,
  level,
  homey,
  enabled = true,
}: {
  deviceName: string;
  level: string | null | undefined;
  homey: HomeyApi;
  enabled?: boolean;
}): Promise<void> {
  if (!enabled || !level) {
    return;
  }

  const levelKey = `notifications.levels.${level}`;
  const levelLabel = (homey.__(levelKey) !== levelKey ? homey.__(levelKey) : level).toLowerCase();
  const excerpt = homey.__('notifications.level_high', {
    device: deviceName,
    metric: homey.__('notifications.metrics.tvoc'),
    level: levelLabel,
  });
  await createTimelineNotification(homey, excerpt);
}

export async function notifyHumidex({
  deviceName,
  level,
  homey,
  enabled = true,
}: {
  deviceName: string;
  level: string | null | undefined;
  homey: HomeyApi;
  enabled?: boolean;
}): Promise<void> {
  if (!enabled || !level) {
    return;
  }

  const levelKey = `notifications.levels.${level}`;
  const levelLabel = (homey.__(levelKey) !== levelKey ? homey.__(levelKey) : level).toLowerCase();
  const excerpt = homey.__('notifications.level_high', {
    device: deviceName,
    metric: homey.__('notifications.metrics.humidex'),
    level: levelLabel,
  });
  await createTimelineNotification(homey, excerpt);
}

export async function notifyAqi({
  deviceName,
  level,
  homey,
  enabled = true,
}: {
  deviceName: string;
  level: string | null | undefined;
  homey: HomeyApi;
  enabled?: boolean;
}): Promise<void> {
  if (!enabled || !level) {
    return;
  }

  const levelKey = `notifications.levels.${level}`;
  const levelLabel = (homey.__(levelKey) !== levelKey ? homey.__(levelKey) : level).toLowerCase();
  const excerpt = homey.__('notifications.level_high', {
    device: deviceName,
    metric: homey.__('notifications.metrics.aqi'),
    level: levelLabel,
  });
  await createTimelineNotification(homey, excerpt);
}

export async function notifyCo2({
  deviceName,
  level,
  homey,
  enabled = true,
}: {
  deviceName: string;
  level: string | null | undefined;
  homey: HomeyApi;
  enabled?: boolean;
}): Promise<void> {
  if (!enabled || !level) {
    return;
  }

  const levelKey = `notifications.levels.${level}`;
  const levelLabel = (homey.__(levelKey) !== levelKey ? homey.__(levelKey) : level).toLowerCase();
  const excerpt = homey.__('notifications.level_high', {
    device: deviceName,
    metric: homey.__('notifications.metrics.co2'),
    level: levelLabel,
  });
  await createTimelineNotification(homey, excerpt);
}

/**
 * Posts a one-time deprecation notice so users migrate off legacy indoor/outdoor drivers.
 */
export async function notifyDeprecatedDriver({
  device,
  homey,
}: {
  device: Homey.Device;
  homey: HomeyApi;
}): Promise<void> {
  await createTimelineNotificationOnce(
    device,
    homey,
    homey.__('notifications.driver_deprecated', { device: device.getName() }),
    'deprecated_driver_notified',
  );
}

/**
 * Tells the user a forced calibration has started.
 * During the settle window the sensor is being pulled toward 400 ppm, so the
 * live CO₂ reading is not the room concentration.
 */
export async function notifyCo2CalibrationStarted({
  device,
  homey,
}: {
  device: Homey.Device;
  homey: HomeyApi;
}): Promise<void> {
  await createTimelineNotification(
    homey,
    homey.__('notifications.co2_calibration_started', { device: device.getName() }),
  );
}

/**
 * Tells the user the calibration settle window has elapsed.
 * There is no firmware progress callback; the poll path decides when this is due.
 */
export async function notifyCo2CalibrationFinished({
  device,
  homey,
}: {
  device: Homey.Device;
  homey: HomeyApi;
}): Promise<void> {
  await createTimelineNotification(
    homey,
    homey.__('notifications.co2_calibration_finished', { device: device.getName() }),
  );
}
