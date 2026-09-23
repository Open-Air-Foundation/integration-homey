'use strict';

/**
 * Finds a Homey device by id across all drivers.
 * Widget queries only supply a device id, not a driver id.
 *
 * @param {import('homey').Homey} homey
 * @param {string} deviceId - Homey device id from `Homey.getDeviceIds()`
 * @returns {import('homey').Device | null}
 */
function getDevice(homey, deviceId) {
  for (const driver of Object.values(homey.drivers.getDrivers())) {
    const device = driver.getDevices().find((d) => d.__id === deviceId);
    if (device) return device;
  }

  return null;
}

/**
 * Homey Pro widget API for the outdoor AQI card.
 * Presentation (theme, label, Lottie) stays in the widget page; this only supplies capability values.
 */
module.exports = {
  /**
   * Capability snapshot for the widget.
   * A missing `level_aqi` is reported as an error so the card does not render a
   * default band before the first successful poll.
   *
   * @param {object} args
   * @param {import('homey').Homey} args.homey
   * @param {Record<string, string>} args.query
   */
  async getStatus({ homey, query }) {
    const { deviceId } = query;
    if (!deviceId) {
      return { ok: false, error: 'no_device' };
    }

    const device = getDevice(homey, deviceId);
    if (!device) {
      return { ok: false, error: 'device_not_found' };
    }

    const name = device.getName();
    const pm25 = device.getCapabilityValue('measure_pm25');
    const levelAqi = device.getCapabilityValue('level_aqi');

    if (!levelAqi) {
      return {
        ok: false, error: 'no_aqi', name, pm25,
      };
    }

    return {
      ok: true,
      name,
      pm25,
      level_aqi: levelAqi,
    };
  },
};
