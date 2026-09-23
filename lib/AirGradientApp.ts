import Homey from 'homey';
import {
  CLOUD_TOKENS_SETTING,
  LAST_CLOUD_TOKEN_SETTING,
} from './cloud/constants';
import {
  DIM_DISPLAY_CAPABILITY,
  DIM_LED_BAR_CAPABILITY,
  LED_BAR_MODE_CAPABILITY,
} from './common/types';
import type AirGradientDevice from './AirGradientDevice';

/**
 * Token and metadata for one AirGradient place.
 * Shared by all cloud devices at that place so siblings do not store duplicate credentials.
 */
export interface CloudPlaceTokenEntry {
  token: string;
  placeId: number;
  placeName: string;
  updatedAt: number;
}

type CloudTokenMap = Record<string, CloudPlaceTokenEntry>;

/**
 * App entry logic for AirGradient.
 * Keeps `app.ts` as a one-line Homey shim so shared state lives under `lib/`.
 */
export default class AirGradientApp extends Homey.App {

  /**
   * Place credentials accepted during pairing but not yet attached to a device.
   * Kept on the app instance so a cancelled pair session never writes them to settings.
   */
  private readonly stagedCloudTokens = new Map<string, CloudPlaceTokenEntry>();

  async onInit(): Promise<void> {
    this.log('AirGradientApp has been initialized');
    this.registerFlowCards();
  }

  /**
   * Registers listeners for custom Flow cards that Homey does not auto-wire from the manifest.
   */
  private registerFlowCards(): void {
    this.homey.flow
      .getConditionCard('level_humidex_is')
      .registerRunListener((args: { device: Homey.Device; level: string | { id: string } }) => {
        const selected = args.level;
        const expected = selected != null && typeof selected === 'object' ? selected.id : selected;
        return args.device.getCapabilityValue('level_humidex') === expected;
      });

    this.homey.flow
      .getConditionCard('level_go_iaqs_is')
      .registerRunListener((args: { device: Homey.Device; level: string | { id: string } }) => {
        const selected = args.level;
        const expected = selected != null && typeof selected === 'object' ? selected.id : selected;
        return args.device.getCapabilityValue('level_go_iaqs') === expected;
      });

    this.homey.flow
      .getActionCard('request_co2_calibration')
      .registerRunListener(async (args: { device: AirGradientDevice }) => {
        await args.device.triggerCo2Calibration();
      });

    this.homey.flow
      .getActionCard('request_led_bar_test')
      .registerRunListener(async (args: { device: AirGradientDevice }) => {
        await args.device.triggerLedBarTest();
      });

    this.homey.flow
      .getActionCard('set_led_bar_mode')
      .registerRunListener(async (args: {
        device: Homey.Device;
        mode: string | { id: string };
      }) => {
        const mode = args.mode != null && typeof args.mode === 'object' ? args.mode.id : args.mode;
        await args.device.triggerCapabilityListener(LED_BAR_MODE_CAPABILITY, mode);
      });

    this.homey.flow
      .getActionCard('set_display_brightness')
      .registerRunListener(async (args: { device: Homey.Device; brightness: number }) => {
        await args.device.triggerCapabilityListener(DIM_DISPLAY_CAPABILITY, args.brightness);
      });

    this.homey.flow
      .getActionCard('set_led_bar_brightness')
      .registerRunListener(async (args: { device: Homey.Device; brightness: number }) => {
        await args.device.triggerCapabilityListener(DIM_LED_BAR_CAPABILITY, args.brightness);
      });
  }

  /**
   * Stored token for a paired place.
   * Null means that place entry is gone; callers treat that as "not configured".
   *
   * @param placeKey - Key from {@link placeKeyFromId}
   */
  getCloudToken(placeKey: string): string | null {
    const entry = this.getCloudTokenMap()[placeKey];
    return entry?.token ?? null;
  }

  /**
   * Persists or updates the token for a place so sibling devices share one credential.
   */
  saveCloudToken(placeKey: string, entry: CloudPlaceTokenEntry): void {
    const map = this.getCloudTokenMap();
    map[placeKey] = entry;
    this.homey.settings.set(CLOUD_TOKENS_SETTING, map);
  }

  /**
   * Most recently entered token, used to prefill the pair/repair view across drivers.
   */
  getLastCloudToken(): string | null {
    return this.homey.settings.get(LAST_CLOUD_TOKEN_SETTING) ?? null;
  }

  /**
   * Records the latest token so subsequent pair sessions can prefill the form.
   */
  saveLastCloudToken(token: string): void {
    this.homey.settings.set(LAST_CLOUD_TOKEN_SETTING, token);
  }

  /**
   * Holds a validated place token until a device is actually created.
   * Pairing can be cancelled after the token check; settings are the wrong place for that.
   *
   * @param placeKey - Key from {@link placeKeyFromId}
   * @param entry - Place credentials from the pair session
   */
  stageCloudToken(placeKey: string, entry: CloudPlaceTokenEntry): void {
    this.stagedCloudTokens.set(placeKey, entry);
  }

  /**
   * Reads the in-memory pair token so device creation can commit it, and so a
   * closing session can check that it still owns the entry.
   *
   * @param placeKey - Key from {@link placeKeyFromId}
   */
  getStagedCloudToken(placeKey: string): CloudPlaceTokenEntry | undefined {
    return this.stagedCloudTokens.get(placeKey);
  }

  /**
   * Drops a staged token that no device committed.
   * A cancelled pair must not leave a credential a later session could save.
   *
   * @param placeKey - Key from {@link placeKeyFromId}
   */
  discardStagedCloudToken(placeKey: string): void {
    this.stagedCloudTokens.delete(placeKey);
  }

  /**
   * Drops a stored place token when no paired cloud device references it anymore.
   * Also clears the prefill token once the last place is gone, so removing every
   * cloud device leaves no credential behind in app settings.
   */
  removeCloudToken(placeKey: string): void {
    const map = this.getCloudTokenMap();
    delete map[placeKey];
    this.homey.settings.set(CLOUD_TOKENS_SETTING, map);

    if (Object.keys(map).length === 0) {
      this.homey.settings.unset(LAST_CLOUD_TOKEN_SETTING);
    }
  }

  /**
   * Place-token map from app settings.
   * Homey returns undefined before the first save; an empty object lets callers add an entry and write the map back.
   */
  private getCloudTokenMap(): CloudTokenMap {
    return this.homey.settings.get(CLOUD_TOKENS_SETTING) ?? {};
  }
}

module.exports = AirGradientApp;
