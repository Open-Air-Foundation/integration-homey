import Homey from 'homey';
import {
  AirQualityData,
  CO2_ABC_DAYS_OPTIONS,
  deviceBrightnessToDim,
  DeviceConfig,
  DIM_DISPLAY_CAPABILITY,
  DIM_LED_BAR_CAPABILITY,
  isIndoorModel,
  LED_BAR_MODE_CAPABILITY,
  LEARNING_OFFSET_OPTIONS,
  RAW_GAS_CAPABILITIES,
  toAllowedSettingOption,
} from './common/types';
import { calculateAbsoluteHumidity } from './common/absoluteHumidity';
import { aqiLevelFromUsAqi, pm25ToUsAqi } from './common/aqi';
import { co2Level } from './common/co2Levels';
import { calculateDewPoint } from './common/dewPoint';
import { calculateGoIaqsScore, goIaqsLevel } from './common/goIaqs';
import { calculateHumidex, humidexComfortLevel } from './common/humidex';

import { noxLevel, tvocLevel } from './common/gasLevels';
import {
  notifyAqi,
  notifyCo2,
  notifyDeprecatedDriver,
  notifyGoIaqs,
  notifyHumidex,
  notifyTvoc,
} from './common/notifications';
import { onLevelChange } from './common/scheduleNotify';
import { runCo2Calibration } from './common/co2Calibration';
import { pm1Level, pm10Level, pm25Level } from './common/pmLevels';
import { applySunlightCompensation } from './common/sunlightCompensation';
import { vocIndexToTvocPpb } from './common/tvocPpb';

/** Legacy driver ids that should show a one-time migration notice. */
const DEPRECATED_DRIVER_IDS = new Set(['indoor', 'outdoor']);

/**
 * Level capability to its opt-in setting and timeline function.
 * Looked up together so a metric cannot notify without the checkbox that enables it.
 */
const LEVEL_NOTIFICATIONS: Record<string, {
  setting: string;
  notify: (device: Homey.Device) => Promise<void>;
}> = {
  level_go_iaqs: {
    setting: 'notify_go_iaqs',
    notify: (device) => notifyGoIaqs({
      deviceName: device.getName(),
      pm25: device.getCapabilityValue('measure_pm25') as number | null | undefined,
      co2: device.getCapabilityValue('measure_co2') as number | null | undefined,
      level: device.getCapabilityValue('level_go_iaqs') as string | null | undefined,
      homey: device.homey,
      enabled: device.getSetting('notify_go_iaqs') === true,
    }),
  },
  level_tvoc: {
    setting: 'notify_tvoc',
    notify: (device) => notifyTvoc({
      deviceName: device.getName(),
      level: device.getCapabilityValue('level_tvoc') as string | null | undefined,
      homey: device.homey,
      enabled: device.getSetting('notify_tvoc') === true,
    }),
  },
  level_humidex: {
    setting: 'notify_humidex',
    notify: (device) => notifyHumidex({
      deviceName: device.getName(),
      level: device.getCapabilityValue('level_humidex') as string | null | undefined,
      homey: device.homey,
      enabled: device.getSetting('notify_humidex') === true,
    }),
  },
  level_aqi: {
    setting: 'notify_aqi',
    notify: (device) => notifyAqi({
      deviceName: device.getName(),
      level: device.getCapabilityValue('level_aqi') as string | null | undefined,
      homey: device.homey,
      enabled: device.getSetting('notify_aqi') === true,
    }),
  },
  level_co2: {
    setting: 'notify_co2',
    notify: (device) => notifyCo2({
      deviceName: device.getName(),
      level: device.getCapabilityValue('level_co2') as string | null | undefined,
      homey: device.homey,
      enabled: device.getSetting('notify_co2') === true,
    }),
  },
};

/**
 * Shared Homey device base for local and cloud drivers.
 *
 * Centralizes capability mapping so each connection type only owns polling and transport.
 */
export default class AirGradientDevice extends Homey.Device {

  /**
   * Surfaces a one-time migration notice for devices still on the legacy indoor/outdoor drivers.
   */
  protected notifyDeprecatedDriverIfNeeded(): void {
    if (!DEPRECATED_DRIVER_IDS.has(this.driver.id)) {
      return;
    }

    notifyDeprecatedDriver({
      device: this,
      homey: this.homey,
    }).catch((err) => this.error('Failed to create deprecated driver notification:', err));
  }

  /**
   * Raw VOC and NOx stay off the device until the user opts in.
   * Models without an NOx index have no raw signal, so the capabilities are not added there.
   */
  async syncOptionalCapabilities(showRaw: boolean): Promise<void> {
    if (!this.hasCapability('measure_nox_idx')) {
      return;
    }

    for (const capability of RAW_GAS_CAPABILITIES) {
      if (showRaw && !this.hasCapability(capability)) {
        await this.addCapability(capability);
      } else if (!showRaw && this.hasCapability(capability)) {
        await this.removeCapability(capability);
      }
    }
  }

  /**
   * Mirrors firmware and on-device calibration options into Homey settings after a successful poll
   * so the settings UI stays aligned with device state without a separate fetch.
   */
  async syncDeviceSettings(aqd: AirQualityData, config?: DeviceConfig): Promise<void> {
    const settings: Record<string, unknown> = { firmware: aqd.firmware };

    if (config) {
      settings.postDataToAirGradient = config.postDataToAirGradient;

      const abcDays = toAllowedSettingOption(config.abcDays, CO2_ABC_DAYS_OPTIONS);
      if (abcDays !== undefined) settings.co2AbcDays = abcDays;

      const noxOffset = toAllowedSettingOption(config.noxLearningOffset, LEARNING_OFFSET_OPTIONS);
      if (noxOffset !== undefined) settings.noxLearningOffset = noxOffset;

      const tvocOffset = toAllowedSettingOption(config.tvocLearningOffset, LEARNING_OFFSET_OPTIONS);
      if (tvocOffset !== undefined) settings.tvocLearningOffset = tvocOffset;
    }

    await this.setSettings(settings);
  }

  /**
   * Applies one poll to the capabilities this driver registered.
   *
   * Corrected PM2.5, temperature, and humidity are preferred by default because AirGradient
   * compensation matches dashboard values; users can opt into raw readings via settings.
   * Pass config when the transport also fetched on-device settings. Display dimming stays
   * indoor-only so outdoor models are not updated from a brightness field they do not use.
   *
   * Capabilities the driver did not register are skipped so local, cloud, and legacy
   * devices can share this path. Null readings are skipped so a partial payload does
   * not clear the last good value.
   */
  async setCapabilityValues(aqd: AirQualityData, config?: DeviceConfig): Promise<void> {
    const corrected = (
      setting: string,
      compensated: number | undefined,
      raw: number | undefined,
    ): number | undefined => ((this.getSetting(setting) ?? true) ? compensated ?? raw : raw);

    const pm25 = corrected('pm02_uses_corrected', aqd.pm02Compensated, aqd.pm02);
    const temperature = await applySunlightCompensation(
      this,
      corrected('temperature_uses_corrected', aqd.atmpCompensated, aqd.atmp),
    );
    const humidity = corrected('humidity_uses_corrected', aqd.rhumCompensated, aqd.rhum);
    const aqi = pm25ToUsAqi(pm25);
    const goIaqs = calculateGoIaqsScore(pm25, aqd.rco2);
    const humidex = calculateHumidex(temperature, humidity);

    const values: Record<string, string | number | null | undefined> = {
      measure_pm1: aqd.pm01,
      level_pm1: pm1Level(aqd.pm01),
      measure_pm25: pm25,
      level_pm25: pm25Level(pm25),
      measure_aqi: aqi,
      level_aqi: aqiLevelFromUsAqi(aqi),
      measure_go_iaqs_score: goIaqs,
      level_go_iaqs: goIaqsLevel(goIaqs),
      measure_pm10: aqd.pm10,
      level_pm10: pm10Level(aqd.pm10),
      measure_pm03_cnt: aqd.pm003Count,
      measure_temperature: temperature,
      measure_humidity: humidity,
      measure_dew_point: calculateDewPoint(temperature, humidity),
      measure_absolute_humidity: calculateAbsoluteHumidity(temperature, humidity),
      measure_humidex: humidex,
      level_humidex: humidexComfortLevel(humidex),
      measure_co2: aqd.rco2,
      level_co2: co2Level(aqd.rco2),
      measure_voc: aqd.tvocRaw,
      measure_voc_raw: aqd.tvocRaw,
      measure_voc_idx: aqd.tvocIndex,
      measure_tvoc_index: aqd.tvocIndex,
      level_tvoc: tvocLevel(aqd.tvocIndex),
      measure_tvoc: vocIndexToTvocPpb(aqd.tvocIndex),
      measure_nox: aqd.noxRaw,
      measure_nox_raw: aqd.noxRaw,
      measure_nox_idx: aqd.noxIndex,
      level_nox: noxLevel(aqd.noxIndex),
      measure_signal_strength: aqd.wifi,
    };

    if (config) {
      if (isIndoorModel(aqd.model || config.model)) {
        values[DIM_DISPLAY_CAPABILITY] = deviceBrightnessToDim(config.displayBrightness);
      }
      values[DIM_LED_BAR_CAPABILITY] = deviceBrightnessToDim(config.ledBarBrightness);
      values[LED_BAR_MODE_CAPABILITY] = config.ledBarMode;
    }

    for (const [key, value] of Object.entries(values)) {
      if (!this.hasCapability(key)) continue;

      if (value === undefined || value === null) {
        if (Homey.env.DEBUG === 'true') {
          this.log(`value for capability '${key}' is undefined or null`);
        }
        continue;
      }

      await this.setCapabilityValue(key, value);

      const notification = LEVEL_NOTIFICATIONS[key];
      if (!notification || typeof value !== 'string') continue;

      onLevelChange({
        device: this,
        capability: key,
        level: value,
        enabled: this.getSetting(notification.setting) === true,
        notify: () => notification.notify(this),
      }).catch((err) => this.error(`Failed to create level notification for ${key}:`, err));
    }
  }

  /**
   * Dispatches forced CO₂ calibration to the transport.
   * The settle-window lockout and timeline notices live in co2Calibration, because
   * both transports share them and neither firmware reports calibration progress.
   */
  async triggerCo2Calibration(): Promise<void> {
    await runCo2Calibration(this, () => this.requestCo2Calibration());
  }

  /**
   * Transport-specific CO₂ calibration request.
   * The base implementation fails so a driver that forgot to override cannot report success.
   */
  protected async requestCo2Calibration(): Promise<void> {
    throw new Error(this.homey.__('errors.co2CalibrationFailed'));
  }

  /**
   * Dispatches the LED bar diagnostic to the transport.
   * Only local indoor monitors implement it; cloud and outdoor have no such command.
   */
  async triggerLedBarTest(): Promise<void> {
    await this.requestLedBarTest();
  }

  /**
   * Transport-specific LED bar test request.
   * The base implementation fails so an unsupported driver cannot report success.
   */
  protected async requestLedBarTest(): Promise<void> {
    throw new Error(this.homey.__('errors.ledBarTestFailed'));
  }

}

module.exports = AirGradientDevice;
