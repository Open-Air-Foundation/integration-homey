import { AirGradientConnectStatus, AirQualityData } from '../common/types';

/**
 * Place record from `GET /public/api/v1/place`.
 * The id keys the shared token; the name is stored alongside it for diagnostics.
 */
export interface CloudPlace {
  id: number;
  name: string;
  timezoneId: string;
  countryId: string;
  publicName?: string | null;
  publicUrl?: string | null;
}

/**
 * One location as pairing sees it.
 * `locationId` is the cloud address for later polls; the serial inside `data` is the Homey device id.
 */
export interface CloudDeviceInfo {
  locationId: number;
  locationName: string;
  locationType?: string;
  data: AirQualityData;
}

/**
 * Raw measure payload from the cloud API.
 *
 * Field names mix swagger `_corrected` suffixes with on-device camelCase; both are
 * accepted so normalization stays stable across API versions.
 */
export interface CloudMeasurePayload {
  locationId?: number;
  locationName?: string;
  locationType?: string;
  serialno?: string;
  model?: string;
  pm01?: number;
  pm02?: number;
  pm10?: number;
  pm01_corrected?: number;
  pm02_corrected?: number;
  pm10_corrected?: number;
  pm02Compensated?: number;
  pm003Count?: number;
  atmp?: number;
  atmp_corrected?: number;
  atmpCompensated?: number;
  rhum?: number;
  rhum_corrected?: number;
  rhumCompensated?: number;
  rco2?: number;
  rco2_corrected?: number;
  tvoc?: number;
  tvocIndex?: number;
  tvocRaw?: number;
  noxIndex?: number;
  noxRaw?: number;
  wifi?: number;
  boot?: number;
  bootCount?: number;
  ledMode?: string;
  firmware?: string;
  firmwareVersion?: string;
  timestamp?: string;
}

/**
 * Cloud measure fields in the shared {@link AirQualityData} shape.
 * Swagger uses `_corrected` and the device uses `*Compensated`; accepting both
 * keeps mapping stable when the API naming changes.
 *
 * @param raw - Cloud measure payload
 */
export function normalizeCloudMeasure(raw: CloudMeasurePayload): AirQualityData {
  return new AirQualityData({
    serialno: raw.serialno,
    model: raw.model,
    wifi: raw.wifi,
    pm01: raw.pm01,
    pm02: raw.pm02,
    pm10: raw.pm10,
    pm02Compensated: raw.pm02_corrected ?? raw.pm02Compensated,
    pm003Count: raw.pm003Count,
    atmp: raw.atmp,
    atmpCompensated: raw.atmp_corrected ?? raw.atmpCompensated,
    rhum: raw.rhum,
    rhumCompensated: raw.rhum_corrected ?? raw.rhumCompensated,
    rco2: raw.rco2_corrected ?? raw.rco2,
    tvocIndex: raw.tvocIndex,
    tvocRaw: raw.tvocRaw ?? raw.tvoc,
    noxIndex: raw.noxIndex,
    noxRaw: raw.noxRaw,
    boot: raw.boot,
    bootCount: raw.bootCount,
    ledMode: raw.ledMode,
    firmware: raw.firmwareVersion ?? raw.firmware,
  });
}

/**
 * Pairing view of one cloud measure record.
 * A missing `locationId` returns null because that record cannot be polled later.
 *
 * @param raw - Single element from `GET /locations/measures/current`
 */
export function toCloudDeviceInfo(raw: CloudMeasurePayload): CloudDeviceInfo | null {
  if (raw.locationId == null) {
    return null;
  }

  const data = normalizeCloudMeasure(raw);
  data.status = AirGradientConnectStatus.SUCCESS;
  return {
    locationId: raw.locationId,
    locationName: raw.locationName ?? '',
    locationType: raw.locationType,
    data,
  };
}
