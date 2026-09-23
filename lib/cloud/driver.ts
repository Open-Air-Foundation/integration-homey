import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import { AxiosError } from 'axios';
import AirGradientCloud, { CloudDeviceInfo, CloudPlace } from './api';
import CloudDevice from './device';
import { placeKeyFromId } from './constants';
import { AirGradientConnectStatus } from '../common/types';
import AirGradientDriver from '../AirGradientDriver';

/**
 * Row for Homey's pair list after the token has been checked.
 * `store.placeKey` is how the new device finds the staged token. The token itself
 * is not written to settings until the device exists.
 */
export interface CloudPairDeviceCandidate {
  name: string;
  data: { id: string };
  store: { placeKey: string };
  settings: {
    locationId: number;
    serialno: string;
    firmware: string;
    model: string;
  };
}

/**
 * Shared cloud pairing for indoor and outdoor.
 * The shims only pass a model filter, so one implementation serves both.
 */
export default class CloudDriver extends AirGradientDriver {

  /**
   * Pair-session handlers for token entry and location selection.
   * The token is only staged here. The device writes it to settings in `onAdded`,
   * so cancelling the view leaves nothing stored.
   *
   * @param session - Active Homey pair session
   * @param outdoorOnly - When true, accept outdoor (`O-`) models only; indoor (`I-`) when false
   */
  async onDevicePair(session: PairSession, outdoorOnly: boolean): Promise<void> {
    let validatedLocations: CloudDeviceInfo[] = [];
    let placeKey: string | null = null;

    session.setHandler('getSavedToken', async () => {
      return this.app.getLastCloudToken() ?? '';
    });

    session.setHandler('validateKey', async (token: string) => {
      const { locations, place, trimmed } = await this.fetchPlaceLocations(token);
      validatedLocations = locations;
      const nextKey = placeKeyFromId(place.id);
      if (placeKey && placeKey !== nextKey) {
        this.app.discardStagedCloudToken(placeKey);
      }
      placeKey = nextKey;
      // Do not write settings yet. The device commits this when it is created.
      this.app.stageCloudToken(nextKey, {
        token: trimmed,
        placeId: place.id,
        placeName: place.name,
        updatedAt: Date.now(),
      });
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!placeKey) {
        throw new Error(this.homey.__('errors.tokenNotValidated'));
      }
      return this.mapLocationsToDevices(validatedLocations, outdoorOnly, placeKey);
    });

    session.setHandler('disconnect', async () => {
      if (!placeKey) return;
      const key = placeKey;
      const updatedAt = this.app.getStagedCloudToken(key)?.updatedAt;
      // onAdded commits the token before a successful session closes. The delay
      // covers a close that races device creation; a cancel still drops the token.
      // A newer pair session for the same place must keep its own staged token.
      await new Promise<void>((resolve) => {
        this.homey.setTimeout(() => resolve(), 250);
      });
      const current = this.app.getStagedCloudToken(key);
      if (current && current.updatedAt === updatedAt) {
        this.app.discardStagedCloudToken(key);
      }
    });
  }

  /**
   * Lets users re-enter a place token without re-pairing; updates shared place credentials
   * and restarts polling on the repaired device.
   *
   * @param session - Active Homey repair session
   * @param device - Device being repaired
   */
  async onDeviceRepair(session: PairSession, device: Homey.Device): Promise<void> {
    session.setHandler('getSavedToken', async () => {
      const placeKey = device.getStoreValue('placeKey') as string | undefined;
      if (placeKey) {
        const token = this.app.getCloudToken(placeKey);
        if (token) return token;
      }
      return this.app.getLastCloudToken() ?? '';
    });

    session.setHandler('validateKey', async (token: string) => {
      const { locations, place, trimmed } = await this.fetchPlaceLocations(token);

      // A token for a different place would otherwise be accepted, leaving the
      // device polling a location the new credentials cannot see.
      const serialno = device.getData().id as string;
      const match = locations.find((location) => location.data.serialno === serialno);
      if (!match) {
        throw new Error(this.homey.__('errors.tokenPlaceMismatch'));
      }

      const placeKey = this.storePlaceToken(place, trimmed);
      await device.setStoreValue('placeKey', placeKey);
      await device.setSettings({ locationId: match.locationId });

      if (device instanceof CloudDevice) {
        device.startPolling();
      }

      return true;
    });
  }

  /**
   * Fetches the place and its locations without writing anything, so a caller
   * can reject the token before it is persisted.
   * Maps HTTP 401/403 to a translated invalid-token error for the pair UI.
   *
   * @param token - Place API token from the pair/repair view
   */
  private async fetchPlaceLocations(token: string): Promise<{
    locations: CloudDeviceInfo[];
    place: CloudPlace;
    trimmed: string;
  }> {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new Error(this.homey.__('errors.tokenRequired'));
    }

    const api = new AirGradientCloud(trimmed, this.log);

    let locations: CloudDeviceInfo[];
    let place: CloudPlace;
    try {
      [locations, place] = await Promise.all([
        api.getDevices(),
        api.getPlace(),
      ]);
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new Error(this.homey.__('errors.tokenInvalid'));
        }
        throw new Error(this.homey.__('errors.cloudUnreachable'));
      }
      throw new Error(this.homey.__('errors.tokenInvalid'));
    }

    if (locations.length === 0) {
      throw new Error(this.homey.__('errors.noLocations'));
    }

    return { locations, place, trimmed };
  }

  /**
   * Persists the place credentials so sibling devices share one token.
   * Used by repair, where a device already exists and must poll with the new token
   * before the session closes. Pairing stages the token instead.
   *
   * @param place - Place resolved from the token
   * @param token - Trimmed API token
   */
  private storePlaceToken(place: CloudPlace, token: string): string {
    const placeKey = placeKeyFromId(place.id);
    this.app.saveCloudToken(placeKey, {
      token,
      placeId: place.id,
      placeName: place.name,
      updatedAt: Date.now(),
    });
    this.app.saveLastCloudToken(token);

    return placeKey;
  }

  /**
   * Locations this driver can pair.
   * A serial already paired on any AirGradient driver is skipped, and so is the wrong
   * model, so the indoor and outdoor lists do not offer each other's monitors.
   */
  private mapLocationsToDevices(
    locations: CloudDeviceInfo[],
    outdoorOnly: boolean,
    placeKey: string,
  ): CloudPairDeviceCandidate[] {
    const pairedSerials = this.getPairedSerialNumbers();

    return locations
      .filter((location) => {
        const { data } = location;
        if (data.status !== AirGradientConnectStatus.SUCCESS) return false;
        if (data.isOutdoor() !== outdoorOnly) return false;
        if (!data.serialno || pairedSerials.has(data.serialno)) return false;
        return true;
      })
      .map((location) => ({
        name: location.locationName || location.data.getModelName(),
        data: {
          id: location.data.serialno,
        },
        store: {
          placeKey,
        },
        settings: {
          locationId: location.locationId,
          serialno: location.data.serialno,
          firmware: location.data.firmware,
          model: location.data.model,
        },
      }));
  }

  /**
   * Collects serial numbers already paired on any AirGradient driver
   * so the pair list does not offer duplicates.
   */
  private getPairedSerialNumbers(): Set<string> {
    const serials = new Set<string>();
    const drivers = this.homey.drivers.getDrivers();
    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        serials.add(device.getData().id);
      }
    }
    return serials;
  }
}

module.exports = CloudDriver;
