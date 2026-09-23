/**
 * @module Types
 * Shared domain types for sensor readings and on-device configuration.
 * Used by both local and cloud transports so capability mapping stays connection-agnostic.
 */

export interface AirQualityDataType {
  status: AirGradientConnectStatus;
  serialno: string;
  wifi: number | undefined;
  pm01: number | undefined;
  pm02: number | undefined;
  pm10: number | undefined;
  pm02Compensated: number | undefined;
  rco2: number | undefined;
  pm003Count: number | undefined;
  atmp: number | undefined;
  atmpCompensated: number | undefined;
  rhum: number | undefined;
  rhumCompensated: number | undefined;
  tvocIndex: number | undefined;
  tvocRaw: number | undefined;
  noxIndex: number | undefined;
  noxRaw: number | undefined;
  boot: number;
  bootCount: number;
  ledMode: string;
  firmware: string;
  model: string;

  isOutdoor(): boolean;
  isIndoor(): boolean;
  getModelName(): string;
}

/**
 * Outcome of one transport call.
 *
 * `UNREACHABLE` and `FAILED_AUTH` are separated from `FAILED_UNKNOWN` so devices
 * can tell a user "the monitor is offline" or "your token is no longer valid"
 * instead of quietly keeping stale readings on screen.
 */
export enum AirGradientConnectStatus {
  SUCCESS,
  FAILED_UNKNOWN,
  UNREACHABLE,
  FAILED_AUTH,
}

/**
 * LED bar modes the firmware accepts on PUT `/config`.
 * Any other string is rejected, so the capability enum cannot grow ahead of the device.
 */
export type LedBarMode = 'co2' | 'pm' | 'off';

/** Outdoor models use an `O-` serial/model prefix in AirGradient firmware. */
export function isOutdoorModel(model: string): boolean {
  return model.startsWith('O-');
}

/** Indoor models use an `I-` serial/model prefix in AirGradient firmware. */
export function isIndoorModel(model: string): boolean {
  return model.startsWith('I-');
}

/**
 * CO₂ automatic baseline calibration periods (days) offered in local device settings.
 * Restricted to firmware-supported values so invalid options are never written back.
 */
export type Co2AbcDaysOption = '0' | '1' | '8' | '30' | '90' | '180';

/**
 * NOx/VOC index learning offsets (hours) offered in local device settings.
 * Restricted to firmware-supported values so invalid options are never written back.
 */
export type LearningOffsetOption = '12' | '60' | '120' | '360' | '720';

/**
 * Sub-capability ids for the two brightness controls.
 * Both are Homey `dim`; without a sub-id they would overwrite each other.
 */
export type DimSubCapabilityId = 'dim.display' | 'dim.led_bar';

export const DIM_DISPLAY_CAPABILITY: DimSubCapabilityId = 'dim.display';
export const DIM_LED_BAR_CAPABILITY: DimSubCapabilityId = 'dim.led_bar';
export const LED_BAR_MODE_CAPABILITY = 'led_bar_mode' as const;

/** Optional raw VOC/NOx capabilities; added only when the user opts in via settings. */
export const RAW_GAS_CAPABILITIES = ['measure_voc_raw', 'measure_nox_raw'] as const;

/**
 * Setting that adds or removes {@link RAW_GAS_CAPABILITIES} together.
 * One checkbox keeps the VOC and NOx raw capabilities from drifting apart.
 */
export const SHOW_RAW_CAPABILITIES_SETTING = 'showRawCapabilities' as const;

export const CO2_ABC_DAYS_OPTIONS: readonly Co2AbcDaysOption[] = [
  '0', '1', '8', '30', '90', '180',
];

export const LEARNING_OFFSET_OPTIONS: readonly LearningOffsetOption[] = [
  '12', '60', '120', '360', '720',
];

/**
 * Homey `dim` is 0–1; the device config API is 0–100.
 * Clamped so a firmware value outside that range cannot push the capability out of bounds.
 */
export function deviceBrightnessToDim(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100));
}

/**
 * Inverse of {@link deviceBrightnessToDim} for config writes.
 * Rounded because the firmware stores whole-percent brightness.
 */
export function dimToDeviceBrightness(dim: number): number {
  return Math.round(Math.min(1, Math.max(0, dim)) * 100);
}

/**
 * Dropdown id for a firmware number, when that number is one of the offered options.
 * An unknown value is left unset so the settings UI does not show a choice the dropdown cannot store.
 */
export function toAllowedSettingOption<T extends string>(
  value: number,
  allowed: readonly T[],
): T | undefined {
  const option = String(value) as T;
  return allowed.includes(option) ? option : undefined;
}

export interface LocalDeviceSettings {
  ipAddress: string;
  pollingInterval: string;
  postDataToAirGradient: boolean;
  co2AbcDays: Co2AbcDaysOption;
  noxLearningOffset: LearningOffsetOption;
  tvocLearningOffset: LearningOffsetOption;
  co2CalibrationRequested: boolean;
  pm02_uses_corrected?: boolean;
  temperature_uses_corrected?: boolean;
  humidity_uses_corrected?: boolean;
  firmware?: string;
  serialno?: string;
  model?: string;
}

/**
 * Normalized sensor payload shared by local and cloud clients.
 * Omitting absent sensors (rather than coercing to 0) keeps Homey capabilities honest.
 */
export class AirQualityData implements AirQualityDataType {
  status: AirGradientConnectStatus;
  serialno: string;
  wifi: number | undefined;
  pm01: number | undefined;
  pm02: number | undefined;
  pm10: number | undefined;
  pm02Compensated: number | undefined;
  rco2: number | undefined;
  pm003Count: number | undefined;
  atmp: number | undefined;
  atmpCompensated: number | undefined;
  rhum: number | undefined;
  rhumCompensated: number | undefined;
  tvocIndex: number | undefined;
  tvocRaw: number | undefined;
  noxIndex: number | undefined;
  noxRaw: number | undefined;
  boot: number;
  bootCount: number;
  ledMode: string;
  firmware: string;
  model: string;

  /**
   * Leaves omitted sensor fields `undefined` so absent sensors surface as unset
   * capabilities rather than a misleading `0` reading.
   */
  constructor(data: Partial<AirQualityDataType>) {
    this.status = data.status ?? AirGradientConnectStatus.FAILED_UNKNOWN;
    this.serialno = data.serialno || '';
    this.wifi = data.wifi;
    this.pm01 = data.pm01;
    this.pm02 = data.pm02;
    this.pm10 = data.pm10;
    this.pm02Compensated = data.pm02Compensated;
    this.rco2 = data.rco2;
    this.pm003Count = data.pm003Count;
    this.atmp = data.atmp;
    this.atmpCompensated = data.atmpCompensated;
    this.rhum = data.rhum;
    this.rhumCompensated = data.rhumCompensated;
    this.tvocIndex = data.tvocIndex;
    this.tvocRaw = data.tvocRaw;
    this.noxIndex = data.noxIndex;
    this.noxRaw = data.noxRaw;
    this.boot = data.boot || 0;
    this.bootCount = data.bootCount || 0;
    this.ledMode = data.ledMode || '';
    this.firmware = data.firmware || '';
    this.model = data.model || '';
  }

  isOutdoor(): boolean {
    return isOutdoorModel(this.model);
  }

  isIndoor(): boolean {
    return isIndoorModel(this.model);
  }

  /** Human-readable product name for pair-list labels. */
  getModelName(): string {
    if (this.isOutdoor()) return 'Open Air Outdoor';
    if (this.isIndoor()) return 'ONE Indoor';
    return 'unknown';
  }
}

export interface Configuration {
  status: AirGradientConnectStatus;
  country: string;
  /** Present on GET `/config` responses only; omitted from PUT payloads. */
  model?: string;
  pmStandard: 'ugm3' | 'us-aqi';
  ledBarMode: LedBarMode;
  displayBrightness: number;
  ledBarBrightness: number;
  abcDays: number;
  mqttBrokerUrl: string;
  temperatureUnit: 'c' | 'C' | 'f' | 'F';
  configurationControl: 'both' | 'local' | 'cloud';
  postDataToAirGradient: boolean;
  noxLearningOffset: number;
  tvocLearningOffset: number;
  offlineMode: boolean;
}

/**
 * Normalized on-device configuration with defaults for missing fields.
 * Defaults avoid undefined settings UI values when a partial `/config` payload arrives.
 */
export class DeviceConfig implements Configuration {
  status: AirGradientConnectStatus;
  country: string;
  pmStandard: 'ugm3' | 'us-aqi';
  ledBarMode: LedBarMode;
  abcDays: number;
  tvocLearningOffset: number;
  noxLearningOffset: number;
  mqttBrokerUrl: string;
  temperatureUnit: 'c' | 'C' | 'f' | 'F';
  configurationControl: 'both' | 'local' | 'cloud';
  postDataToAirGradient: boolean;
  ledBarBrightness: number;
  displayBrightness: number;
  offlineMode: boolean;
  model: string;

  constructor(data: Partial<Configuration>) {
    this.status = data.status ?? AirGradientConnectStatus.FAILED_UNKNOWN;
    this.country = data.country || '';
    this.pmStandard = data.pmStandard || 'ugm3';
    this.ledBarMode = data.ledBarMode || 'off';
    this.abcDays = data.abcDays || 0;
    this.tvocLearningOffset = data.tvocLearningOffset || 0;
    this.noxLearningOffset = data.noxLearningOffset || 0;
    this.mqttBrokerUrl = data.mqttBrokerUrl || '';
    this.temperatureUnit = data.temperatureUnit || 'c';
    this.configurationControl = data.configurationControl || 'both';
    this.postDataToAirGradient = data.postDataToAirGradient ?? false;
    this.ledBarBrightness = data.ledBarBrightness || 0;
    this.displayBrightness = data.displayBrightness || 0;
    this.offlineMode = data.offlineMode ?? false;
    this.model = data.model || '';
  }
}

export type LogFunction = (message?: any, ...optionalParams: any[]) => void;
