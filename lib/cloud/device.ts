import AirGradientCloud from './api';
import { AirGradientConnectStatus, SHOW_RAW_CAPABILITIES_SETTING } from '../common/types';
import AirGradientDevice from '../AirGradientDevice';
import AirGradientApp from '../AirGradientApp';
import Polling from '../common/polling';
import { finishCo2CalibrationIfDue } from '../common/co2Calibration';
import { DEFAULT_POLL_INTERVAL_MS } from './constants';

/**
 * Cloud device lifecycle: place token and polling by location id.
 * Capability mapping stays on {@link AirGradientDevice} so local and cloud share one mapping.
 */
export default class CloudDevice extends AirGradientDevice {

  private readonly polling = new Polling(this.homey);

  /**
   * Copies a pair-session token into app settings once Homey has created the device.
   * Until then the token only lives in memory, so closing the pair view leaves nothing behind.
   */
  onAdded(): void {
    this.commitStagedToken();
  }

  async onInit(): Promise<void> {
    this.commitStagedToken();

    this.log(
      `Device Init: ${this.getName()}`
      + ` with pollingInterval: ${this.getSetting('pollingInterval')}`
      + ` and locationId ${this.getSetting('locationId')}`,
    );

    await this.syncOptionalCapabilities(this.getSetting(SHOW_RAW_CAPABILITIES_SETTING) ?? false);
    this.startPolling();
  }

  async onSettings({
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    // Every changed key is handled: saving two settings at once must not drop one.
    if (changedKeys.includes(SHOW_RAW_CAPABILITIES_SETTING)) {
      await this.syncOptionalCapabilities(Boolean(newSettings[SHOW_RAW_CAPABILITIES_SETTING]));
    }

    this.setAvailable().catch(this.error);
    this.startPolling(Number(newSettings.pollingInterval) || undefined);
  }

  /**
   * Starts the poll loop on the given interval, or the stored one once Homey has saved it.
   *
   * @param pollIntervalOverride - Required before a settings change is persisted.
   *   The stored interval would still be the previous value.
   */
  startPolling(pollIntervalOverride?: number): void {
    const pollInterval = pollIntervalOverride
      || Number(this.getSetting('pollingInterval'))
      || DEFAULT_POLL_INTERVAL_MS;

    this.polling.start(async () => {
      await this.updateCapabilities();
    }, { pollInterval });
  }

  /**
   * One poll of this location.
   * Any non-success status marks the device unavailable, so a rejected token or a
   * server error cannot leave stale readings on screen while the device still looks online.
   */
  async updateCapabilities(): Promise<void> {
    const api = this.createApiClient();
    if (!api) {
      this.setUnavailable(this.homey.__('errors.cloudTokenNotConfigured')).catch(this.error);
      return;
    }

    const locationId = Number(this.getSetting('locationId'));
    const aqd = await api.getData(locationId);

    if (aqd.status !== AirGradientConnectStatus.SUCCESS) {
      const message = aqd.status === AirGradientConnectStatus.FAILED_AUTH
        ? this.homey.__('errors.cloudTokenRejected')
        : this.homey.__('errors.cloudUnreachable');
      this.setUnavailable(message).catch(this.error);
      return;
    }

    this.setAvailable().catch(this.error);
    await finishCo2CalibrationIfDue(this);

    await this.syncDeviceSettings(aqd);
    await this.setCapabilityValues(aqd);
  }

  /**
   * Asks the cloud API to calibrate CO₂, which assumes a 400 ppm environment.
   * Cloud has no config PUT; calibration is a serial-addressed route.
   */
  protected async requestCo2Calibration(): Promise<void> {
    const api = this.createApiClient();
    if (!api) {
      throw new Error(this.homey.__('errors.co2CalibrationNoToken'));
    }

    const triggered = await api.triggerCo2Calibration(this.getSetting('serialno') as string);
    if (!triggered) {
      throw new Error(this.homey.__('errors.co2CalibrationFailed'));
    }
  }

  /**
   * Writes a staged pair token into app settings.
   * The in-memory copy stays until the pair session closes, so every device
   * created in that session can still read it.
   */
  private commitStagedToken(): void {
    const placeKey = this.getStoreValue('placeKey') as string | undefined;
    if (!placeKey) return;

    const app = this.homey.app as AirGradientApp;
    const staged = app.getStagedCloudToken(placeKey);
    if (!staged) return;

    app.saveCloudToken(placeKey, staged);
    app.saveLastCloudToken(staged.token);
  }

  /**
   * Client for this device's place token.
   * Null when the key or token is missing, so the poll can mark the device unavailable
   * instead of requesting with an empty credential.
   */
  private createApiClient(): AirGradientCloud | null {
    const placeKey = this.getStoreValue('placeKey') as string | undefined;
    if (!placeKey) {
      this.error('Missing placeKey in device store');
      return null;
    }

    const app = this.homey.app as AirGradientApp;
    const token = app.getCloudToken(placeKey);
    if (!token) {
      this.error(`No cloud token stored for place ${placeKey}`);
      return null;
    }

    return new AirGradientCloud(token, this.log);
  }

  /**
   * Clears the shared place token only when no sibling cloud device still uses it.
   */
  private removeCloudTokenIfLastDevice(): void {
    const placeKey = this.getStoreValue('placeKey') as string | undefined;
    if (!placeKey) return;

    const thisDeviceId = this.getData().id;
    const drivers = this.homey.drivers.getDrivers();
    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        if (device.getData().id === thisDeviceId) continue;
        if (device.getStoreValue('placeKey') === placeKey) return;
      }
    }

    const app = this.homey.app as AirGradientApp;
    app.removeCloudToken(placeKey);
  }

  /**
   * Stops timers when Homey unloads the app.
   * Homey does not cancel `setInterval` on its own. Token cleanup stays in
   * {@link onDeleted} so an app restart does not drop a token siblings still use.
   */
  async onUninit(): Promise<void> {
    this.polling.stop();
  }

  onDeleted(): void {
    this.log(`Device ${this.getName()} deleted!`);
    this.polling.stop();
    this.removeCloudTokenIfLastDevice();
  }
}

module.exports = CloudDevice;
