import Homey from 'homey';
import axios, { AxiosInstance } from 'axios';
import {
  AirGradientConnectStatus, AirQualityData, DeviceConfig, LogFunction,
} from '../common/types';
import { classifyRequestError, isValidHost } from '../common/request';
import { CONFIG_PATH, HTTP_USER_AGENT, MEASURES_PATH } from './constants';

/**
 * On-device HTTP client.
 * Callers only see {@link AirQualityData} and {@link DeviceConfig}, so LAN transport stays in this class.
 */
export default class AirGradientLocal {

  log!: LogFunction;
  enableDebug!: boolean;
  ipAddress!: string;

  private http: AxiosInstance | null = null;
  private httpIp: string | null = null;

  /**
   * @param ipAddress - LAN address of the AirGradient device
   * @param log - Homey log function
   */
  constructor(ipAddress: string, log = console.log) {
    this.ipAddress = ipAddress;
    this.log = log;
    this.enableDebug = Homey.env.DEBUG === 'true';
  }

  /**
   * Current measures from the monitor.
   * Network failures are classified as unreachable so a dead host marks the device
   * unavailable without an exception log on every poll.
   */
  async getData(): Promise<AirQualityData> {
    if (this.enableDebug) this.log(`getData: ${this.ipAddress}`);
    try {
      const http = this.getHttp();
      const response = await http.get(MEASURES_PATH);
      if (response.data) {
        const airQualityData: AirQualityData = new AirQualityData(response.data);
        airQualityData.status = AirGradientConnectStatus.SUCCESS;
        if (this.enableDebug) this.log(`AirQualityData: ${JSON.stringify(airQualityData)}`);
        return airQualityData;
      }
      this.log(`getData: empty response body from ${this.ipAddress}`);
    } catch (error) {
      const status = classifyRequestError(error);
      if (status !== AirGradientConnectStatus.UNREACHABLE) {
        this.log('getData failed:', error);
      }
      return new AirQualityData({ status });
    }
    return new AirQualityData({ status: AirGradientConnectStatus.FAILED_UNKNOWN });
  }

  /**
   * On-device configuration, for settings and brightness sync.
   * A dead host returns a failed status instead of throwing, so the poll can continue.
   */
  async getDeviceConfig(): Promise<DeviceConfig> {
    if (this.enableDebug) this.log(`getDeviceConfig: ${this.ipAddress}`);
    try {
      const http = this.getHttp();
      const response = await http.get(CONFIG_PATH);
      if (response.data) {
        const deviceConfig: DeviceConfig = new DeviceConfig(response.data);
        deviceConfig.status = AirGradientConnectStatus.SUCCESS;
        if (this.enableDebug) this.log(`DeviceConfig: ${JSON.stringify(deviceConfig)}`);
        return deviceConfig;
      }
      this.log(`getDeviceConfig: empty response body from ${this.ipAddress}`);
    } catch (error) {
      const status = classifyRequestError(error);
      if (status !== AirGradientConnectStatus.UNREACHABLE) {
        this.log('getDeviceConfig failed:', error);
      }
      return new DeviceConfig({ status });
    }
    return new DeviceConfig({ status: AirGradientConnectStatus.FAILED_UNKNOWN });
  }

  /**
   * Partial config write.
   * Failures propagate so a capability change or settings save can show a translated
   * error; swallowing them would leave the tile and the monitor disagreeing.
   *
   * @param payload - Partial config object accepted by the device firmware
   */
  async setDeviceConfig(payload: Record<string, unknown>): Promise<void> {
    if (this.enableDebug) this.log(`setDeviceConfig: ${this.ipAddress} >> ${JSON.stringify(payload)}`);
    const http = this.getHttp();
    const response = await http.put(CONFIG_PATH, payload);
    if (this.enableDebug) this.log(`response: ${JSON.stringify(response.status)}`);
  }

  /**
   * Reuses one axios instance per IP so frequent polling does not recreate clients.
   * Rejects addresses that are not a bare host so a stored setting cannot point
   * requests somewhere other than the monitor.
   */
  private getHttp(): AxiosInstance {
    if (!isValidHost(this.ipAddress)) {
      throw new Error(`Invalid AirGradient host: ${this.ipAddress}`);
    }

    if (!this.http || this.httpIp !== this.ipAddress) {
      this.httpIp = this.ipAddress;
      this.http = axios.create({
        baseURL: `http://${this.ipAddress}`,
        // A monitor that answers SYN then stops responding would otherwise hang
        // until the OS gives up, stacking requests on short poll intervals.
        timeout: 10_000,
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Charset': 'utf-8',
          Accept: 'application/json',
          'User-Agent': HTTP_USER_AGENT,
        },
      });
    }
    return this.http;
  }
}

module.exports = AirGradientLocal;
