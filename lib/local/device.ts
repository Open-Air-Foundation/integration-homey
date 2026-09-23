import Homey from 'homey';
import AirGradientLocal from './api';
import {
  AirGradientConnectStatus,
  DIM_DISPLAY_CAPABILITY,
  DIM_LED_BAR_CAPABILITY,
  dimToDeviceBrightness,
  LED_BAR_MODE_CAPABILITY,
  LedBarMode,
  SHOW_RAW_CAPABILITIES_SETTING,
} from '../common/types';
import AirGradientDevice from '../AirGradientDevice';
import Polling from '../common/polling';
import { finishCo2CalibrationIfDue } from '../common/co2Calibration';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DISCOVERY_POLL_JITTER_MS,
} from './constants';

/**
 * LAN device lifecycle: discovery, repair, and polling.
 * Capability mapping stays on {@link AirGradientDevice} so local and cloud share one mapping.
 */
export default class LocalDevice extends AirGradientDevice {

  private readonly polling = new Polling(this.homey);

  private discoveryRestart: NodeJS.Timeout | null = null;

  async onInit(): Promise<void> {
    this.log(
      `Device Init: ${this.getName()}`
      + ` with pollingInterval: ${this.getSetting('pollingInterval')}`
      + ` and ipAddress ${this.getSetting('ipAddress')}`,
    );

    await this.syncOptionalCapabilities(this.getSetting(SHOW_RAW_CAPABILITIES_SETTING) ?? false);
    this.notifyDeprecatedDriverIfNeeded();
    this.registerDeviceCapabilityListeners();

    if (this.getSetting('ipAddress')) {
      this.startPolling();
      return;
    }

    // Nothing to poll without an address, so offer Repair rather than leaving
    // the device available with frozen readings.
    this.setUnavailable(this.homey.__('device.ipAddressRequired')).catch(this.error);
  }

  /**
   * Homey uses this to bind an mDNS result to an already paired device.
   * The serial in the TXT record is stable; the address is not, because DHCP changes it.
   */
  onDiscoveryResult(discoveryResult: Homey.DiscoveryResultMDNSSD): boolean {
    const { serialno } = discoveryResult.txt as { serialno?: string };
    return serialno === this.getData().id;
  }

  /**
   * Homey calls this when a matched record becomes reachable.
   * A device that booted without a stored address starts polling from here.
   */
  onDiscoveryAvailable(discoveryResult: Homey.DiscoveryResultMDNSSD): void {
    this.applyDiscoveredAddress(discoveryResult).catch(this.error);
  }

  /**
   * Homey reports a new address for an already-available record here, not via
   * {@link onDiscoveryAvailable}. Polling has to follow that address or it
   * stays pointed at the previous DHCP lease.
   */
  onDiscoveryAddressChanged(discoveryResult: Homey.DiscoveryResultMDNSSD): void {
    this.applyDiscoveredAddress(discoveryResult).catch(this.error);
  }

  /**
   * Restarts polling against the address Homey just discovered, after a short jitter.
   * A burst of mDNS updates would otherwise open a request per update.
   */
  private async applyDiscoveredAddress(
    discoveryResult: Homey.DiscoveryResultMDNSSD,
  ): Promise<void> {
    await this.setSettings({ ipAddress: discoveryResult.address });
    this.setAvailable().catch(this.error);
    this.polling.stop();
    this.clearDiscoveryRestart();

    const { min, max } = DISCOVERY_POLL_JITTER_MS;
    const delayMs = Math.floor(Math.random() * (max - min + 1)) + min;
    this.discoveryRestart = this.homey.setTimeout(() => {
      this.discoveryRestart = null;
      this.startPolling();
    }, delayMs);
  }

  onDiscoveryLastSeenChanged(discoveryResult: Homey.DiscoveryResultMDNSSD): void {
    this.log(`onDiscoveryLastSeenChanged: ${discoveryResult.lastSeen}`);
  }

  /**
   * Cancels a pending post-discovery poll restart so a deleted or reconfigured
   * device cannot have polling started again behind it.
   */
  private clearDiscoveryRestart(): void {
    if (this.discoveryRestart) {
      this.homey.clearTimeout(this.discoveryRestart);
      this.discoveryRestart = null;
    }
  }

  async onSettings({
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    // Homey persists settings only after this resolves, so config writes and the
    // poll restart must use the incoming values rather than the stored ones.
    const ipAddress = (newSettings.ipAddress as string | undefined)
      ?? (this.getSetting('ipAddress') as string);

    // Every changed key is handled: saving two settings at once must not drop one.
    if (changedKeys.includes('postDataToAirGradient')) {
      await this.writeDeviceConfig({
        postDataToAirGradient: newSettings.postDataToAirGradient as boolean,
      }, ipAddress);
    }

    if (changedKeys.includes('co2AbcDays')) {
      await this.writeDeviceConfig({ abcDays: Number(newSettings.co2AbcDays) }, ipAddress);
    }

    if (changedKeys.includes('noxLearningOffset')) {
      await this.writeDeviceConfig({
        noxLearningOffset: Number(newSettings.noxLearningOffset),
      }, ipAddress);
    }

    if (changedKeys.includes('tvocLearningOffset')) {
      await this.writeDeviceConfig({
        tvocLearningOffset: Number(newSettings.tvocLearningOffset),
      }, ipAddress);
    }

    if (changedKeys.includes(SHOW_RAW_CAPABILITIES_SETTING)) {
      await this.syncOptionalCapabilities(Boolean(newSettings[SHOW_RAW_CAPABILITIES_SETTING]));
    }

    this.clearDiscoveryRestart();
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
   * One poll of measures and, when it succeeds, configuration.
   * Any non-success measures status marks the device unavailable, so an HTTP error
   * cannot leave stale readings on screen while the device still looks online.
   */
  async updateCapabilities(): Promise<void> {
    const air = this.createApiClient();
    const aqd = await air.getData();

    if (aqd.status !== AirGradientConnectStatus.SUCCESS) {
      this.setUnavailable(
        this.homey.__('errors.deviceUnreachableAt', { ipAddress: this.getSetting('ipAddress') }),
      ).catch(this.error);
      return;
    }

    this.setAvailable().catch(this.error);
    await finishCo2CalibrationIfDue(this);

    // A failed /config read returns defaults, which would switch off the user's
    // cloud-upload setting and zero both brightness values; only use it on success.
    const config = await air.getDeviceConfig();
    const usableConfig = config.status === AirGradientConnectStatus.SUCCESS ? config : undefined;

    await this.syncDeviceSettings(aqd, usableConfig);
    await this.setCapabilityValues(aqd, usableConfig);
  }

  /**
   * Asks the firmware to calibrate CO₂, which assumes a 400 ppm environment.
   * The local API takes that as a one-shot config flag; there is no separate route.
   */
  protected async requestCo2Calibration(): Promise<void> {
    await this.writeDeviceConfig({ co2CalibrationRequested: true });
  }

  /**
   * Asks the firmware to run its LED diagnostic.
   * Like CO₂ calibration, the local API takes this as a one-shot config flag.
   */
  protected async requestLedBarTest(): Promise<void> {
    await this.writeDeviceConfig({ ledBarTestRequested: true });
  }

  /**
   * Points polling at a repaired address.
   * The current loop is stopped first so a tick cannot keep using the previous host.
   *
   * @param ipAddress - IP or hostname confirmed to belong to this device
   */
  async repair(ipAddress: string): Promise<void> {
    this.polling.stop();
    await this.setSettings({ ipAddress });
    this.setAvailable().catch(this.error);
    this.startPolling();
  }

  /**
   * Writes tile and Flow changes back to the monitor.
   * Listeners are registered only for capabilities this device has, so an outdoor
   * model does not subscribe to a display dimmer it cannot set.
   */
  private registerDeviceCapabilityListeners(): void {
    if (this.hasCapability(DIM_DISPLAY_CAPABILITY)) {
      this.registerCapabilityListener(DIM_DISPLAY_CAPABILITY, async (value: number) => {
        await this.writeDeviceConfig({ displayBrightness: dimToDeviceBrightness(value) });
      });
    }

    if (this.hasCapability(DIM_LED_BAR_CAPABILITY)) {
      this.registerCapabilityListener(DIM_LED_BAR_CAPABILITY, async (value: number) => {
        await this.writeDeviceConfig({ ledBarBrightness: dimToDeviceBrightness(value) });
      });
    }

    if (this.hasCapability(LED_BAR_MODE_CAPABILITY)) {
      this.registerCapabilityListener(LED_BAR_MODE_CAPABILITY, async (value: LedBarMode) => {
        await this.writeDeviceConfig({ ledBarMode: value });
      });
    }
  }

  /**
   * Writes a config change to the device, surfacing failures as a translated error
   * so capability listeners and settings changes report the failure to the user.
   *
   * @param payload - Partial config accepted by the on-device API
   * @param ipAddress - Address to write to, when it differs from the stored setting
   */
  private async writeDeviceConfig(
    payload: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.createApiClient(ipAddress).setDeviceConfig(payload);
    } catch (error) {
      this.error('writeDeviceConfig failed:', error);
      throw new Error(this.homey.__('errors.setDeviceConfigFailed'));
    }
  }

  /**
   * Client for the address this poll should use.
   *
   * @param ipAddress - Override while a settings change is not persisted yet.
   *   The stored address would still be the previous value.
   */
  private createApiClient(ipAddress?: string): AirGradientLocal {
    return new AirGradientLocal(
      ipAddress ?? this.getSetting('ipAddress'),
      this.log,
    );
  }

  /**
   * Stops timers when Homey unloads the app.
   * Homey does not cancel `setInterval` or `setTimeout` on its own.
   */
  async onUninit(): Promise<void> {
    this.polling.stop();
    this.clearDiscoveryRestart();
  }

  onDeleted(): void {
    this.log(`Device ${this.getName()} deleted!`);
    this.polling.stop();
    this.clearDiscoveryRestart();
  }
}

module.exports = LocalDevice;
