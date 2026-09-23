import Homey from 'homey';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { AirGradientConnectStatus, AirQualityData, LogFunction } from '../common/types';
import { classifyRequestError } from '../common/request';
import {
  ALL_MEASURES_PATH,
  API_BASE_URL,
  CO2_CALIBRATION_PATH,
  HTTP_USER_AGENT,
  LOCATION_MEASURES_PATH,
  PLACE_PATH,
} from './constants';
import {
  CloudDeviceInfo,
  CloudMeasurePayload,
  CloudPlace,
  normalizeCloudMeasure,
  toCloudDeviceInfo,
} from './types';

export type { CloudDeviceInfo, CloudPlace } from './types';

/**
 * AirGradient cloud HTTP client.
 * Responses are normalized into {@link AirQualityData} so cloud and local devices share capability mapping.
 * The place token is sent as a query parameter because that is how the public API authenticates.
 */
export default class AirGradientCloud {

  log!: LogFunction;
  enableDebug!: boolean;
  token!: string;

  private http: AxiosInstance | null = null;
  private httpToken: string | null = null;

  /**
   * @param token - Place API token from the AirGradient dashboard
   * @param log - Homey log function
   */
  constructor(token: string, log: LogFunction = console.log) {
    this.token = token;
    this.log = log;
    this.enableDebug = Homey.env.DEBUG === 'true';
  }

  /**
   * Place id and name used to key the shared token.
   * Throws on HTTP or network failure so pairing can tell a rejected token from an outage.
   */
  async getPlace(): Promise<CloudPlace> {
    if (this.enableDebug) this.log('getPlace');
    const http = this.getHttp();
    const response = await http.get<CloudPlace>(PLACE_PATH);
    if (response.data?.id == null) {
      throw new Error('Place response missing id');
    }
    if (this.enableDebug) this.log(`Place: ${JSON.stringify(response.data)}`);
    return response.data;
  }

  /**
   * Every location in one request, used while pairing.
   * Throws on HTTP or network failure so pairing can tell a rejected token from an outage.
   */
  async getDevices(): Promise<CloudDeviceInfo[]> {
    if (this.enableDebug) this.log('getDevices');
    const http = this.getHttp();
    const response = await http.get<CloudMeasurePayload[]>(ALL_MEASURES_PATH);
    if (!Array.isArray(response.data)) {
      throw new Error('Measures response was not an array');
    }
    const devices = response.data
      .map((item) => toCloudDeviceInfo(item))
      .filter((item): item is CloudDeviceInfo => item != null);
    if (this.enableDebug) this.log(`Devices: ${devices.length}`);
    return devices;
  }

  /**
   * Current measures for one paired location.
   * Unreachable errors stay distinct from auth failures so Homey can mark the
   * device offline without treating a rejected token as a dead host.
   *
   * @param locationId - Dashboard location id stored on the device
   */
  async getData(locationId: number): Promise<AirQualityData> {
    if (this.enableDebug) this.log(`getData: ${locationId}`);
    try {
      const http = this.getHttp();
      const path = LOCATION_MEASURES_PATH.replace('{locationId}', String(locationId));
      const response = await http.get<CloudMeasurePayload>(path);
      if (response.data) {
        const airQualityData = normalizeCloudMeasure(response.data);
        airQualityData.status = AirGradientConnectStatus.SUCCESS;
        if (this.enableDebug) this.log(`AirQualityData: ${JSON.stringify(airQualityData)}`);
        return airQualityData;
      }
      this.log(`getData: empty response body for location ${locationId}`);
    } catch (error) {
      const status = classifyRequestError(error);
      if (status !== AirGradientConnectStatus.UNREACHABLE) {
        this.logApiError('getData', error);
      }
      return new AirQualityData({ status });
    }
    return new AirQualityData({ status: AirGradientConnectStatus.FAILED_UNKNOWN });
  }

  /**
   * Cloud CO₂ calibration for one serial.
   * The sensor must already be in a ~400 ppm environment; the API does not check that.
   * Failure returns false so the caller can show a translated error.
   *
   * @param serialno - Device serial number
   */
  async triggerCo2Calibration(serialno: string): Promise<boolean> {
    if (this.enableDebug) this.log(`triggerCo2Calibration: ${serialno}`);
    try {
      const http = this.getHttp();
      const path = CO2_CALIBRATION_PATH.replace('{serialno}', encodeURIComponent(serialno));
      const response = await http.post(path);
      if (this.enableDebug) this.log(`triggerCo2Calibration response: ${response.status}`);
      return true;
    } catch (error) {
      this.logApiError('triggerCo2Calibration', error);
    }
    return false;
  }

  /**
   * Reuses one axios instance per token so pairing and polling do not recreate clients.
   */
  private getHttp(): AxiosInstance {
    if (!this.http || this.httpToken !== this.token) {
      this.httpToken = this.token;
      this.http = axios.create({
        baseURL: API_BASE_URL,
        timeout: 15_000,
        params: { token: this.token },
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          Accept: 'application/json',
          'User-Agent': HTTP_USER_AGENT,
        },
      });
    }
    return this.http;
  }

  /**
   * Axios errors hide the HTTP status on `response`.
   * The status is what distinguishes a rejected token from an outage in the log.
   *
   * @param operation - Caller label for log context
   * @param error - Caught request error
   */
  private logApiError(operation: string, error: unknown): void {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const detail = error.response?.data ?? error.message;
      this.log(`${operation} failed${status ? ` (${status})` : ''}:`, detail);
      return;
    }
    this.log(`${operation} failed:`, error);
  }
}

module.exports = AirGradientCloud;
