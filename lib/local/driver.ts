import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import AirGradientLocal from './api';
import LocalDevice from './device';
import { DISCOVERY_STRATEGY } from './constants';
import { AirGradientConnectStatus } from '../common/types';
import { isValidHost } from '../common/request';
import AirGradientDriver from '../AirGradientDriver';

/**
 * Row for Homey's pair list.
 * `data.id` is the monitor serial: that is the stable identity. The IP is only a setting because DHCP changes it.
 */
export interface PairDeviceCandidate {
  name: string;
  data: { id: string };
  settings: {
    ipAddress: string;
    serialno: string;
    firmware: string;
    model: string;
  };
}

/**
 * List-row id for manual IP entry.
 * Must not collide with a monitor serial, which is what `data.id` is for real rows.
 */
const MANUAL_PAIR_ID = 'manual';

/** Fake list row that routes to the IP form instead of `add_devices`. */
interface ManualPairListItem {
  name: string;
  data: { id: typeof MANUAL_PAIR_ID };
  icon: string;
  capabilities: string[];
}

type PairListItem = PairDeviceCandidate | ManualPairListItem;

/**
 * Result handed back to the repair view.
 * A thrown error would close the session; this shape lets the view show the message inline.
 */
type RepairTryConnectResult =
  | { success: true }
  | { success: false; message: string };

/**
 * Shared LAN pairing for indoor and outdoor.
 * The shims only pass a model filter, so one implementation serves both.
 */
export default class LocalDriver extends AirGradientDriver {

  /**
   * Pair-session handlers for mDNS discovery and manual IP entry.
   * The manual row is not a device, so the list's next view is `pair_continue`,
   * which opens the IP form instead of `add_devices`.
   *
   * @param session - Active Homey pair session
   * @param outdoorOnly - Model filter passed to {@link mapAddressToDevice}
   */
  async onDevicePair(session: PairSession, outdoorOnly: boolean): Promise<void> {
    let discovered: PairDeviceCandidate[] | null = null;
    let selectedId: string | undefined;

    const ensureDiscovered = async (): Promise<PairDeviceCandidate[]> => {
      if (discovered !== null) return discovered;

      try {
        discovered = await this.discoverDevices(outdoorOnly);
      } catch (error) {
        this.error('Discovery failed:', error);
        discovered = [];
      }

      return discovered;
    };

    session.setHandler('list_devices_selection', async (devices: PairListItem[]) => {
      selectedId = devices[0]?.data?.id;
    });

    session.setHandler('showView', async (viewId: string) => {
      if (viewId === 'loading') {
        await ensureDiscovered();
        await session.showView('list_devices');
        return;
      }

      if (viewId !== 'pair_continue') return;

      const chosenId = selectedId;
      selectedId = undefined;

      if (chosenId === MANUAL_PAIR_ID) {
        await session.showView('device_ip');
        return;
      }

      await session.showView('add_devices');
    });

    session.setHandler('list_devices', async () => {
      const devices = await ensureDiscovered();

      return [
        ...devices,
        {
          name: this.homey.__('device.pair.list.add_by_ip'),
          data: { id: MANUAL_PAIR_ID },
          icon: '/icon-ip.svg',
          capabilities: [],
        },
      ];
    });

    session.setHandler('check_details', async (data: { ipAddress: string }) => {
      return this.mapAddressToDevice(data.ipAddress.trim(), outdoorOnly);
    });
  }

  /**
   * Lets users update the LAN address without re-pairing; probes the new host,
   * verifies the serial matches, then persists the IP and restarts polling.
   *
   * @param session - Active Homey repair session
   * @param device - Device being repaired
   * @param outdoorOnly - Model filter passed to {@link mapAddressToDevice}
   */
  async onDeviceRepair(
    session: PairSession,
    device: Homey.Device,
    outdoorOnly: boolean,
  ): Promise<void> {
    session.setHandler('getDeviceSerial', async () => {
      return {
        serialno: device.getData().id as string,
      };
    });

    session.setHandler('getConnectionInfo', async () => {
      return {
        ipAddress: (device.getSetting('ipAddress') as string | undefined) ?? '',
      };
    });

    session.setHandler('repair_try_connect', async (data: {
      ipAddress?: string;
    }): Promise<RepairTryConnectResult> => {
      const ipAddress = data?.ipAddress?.trim() ?? '';
      if (!ipAddress) {
        return {
          success: false,
          message: this.homey.__('device.ipAddressRequired'),
        };
      }

      try {
        const candidate = await this.mapAddressToDevice(ipAddress, outdoorOnly);
        if (!candidate) {
          return {
            success: false,
            message: this.homey.__('errors.deviceNotFound'),
          };
        }

        if (candidate.data.id !== device.getData().id) {
          return {
            success: false,
            message: this.homey.__('errors.wrongDevice'),
          };
        }

        if (device instanceof LocalDevice) {
          await device.repair(ipAddress);
        } else {
          await device.setSettings({ ipAddress });
        }

        return { success: true };
      } catch (error) {
        this.error('repair_try_connect failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message };
      }
    });
  }

  /**
   * Unpaired monitors on the LAN that match the model filter.
   * Already paired serials are removed from the mDNS results first; otherwise Homey
   * would offer a second device with the same id.
   *
   * @param outdoorOnly - Model filter passed to {@link mapAddressToDevice}
   */
  async discoverDevices(outdoorOnly: boolean): Promise<PairDeviceCandidate[]> {
    const discoveryStrategy = this.homey.discovery.getStrategy(DISCOVERY_STRATEGY);
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    const drivers = this.homey.drivers.getDrivers();
    for (const driver of Object.values(drivers)) {
      for (const existingDevice of driver.getDevices()) {
        delete discoveryResults[`airgradient_${existingDevice.getData().id}`];
      }
    }

    const devices = await Promise.all(
      Object.values(discoveryResults).map(async (result) => {
        const mdnsResult = result as Homey.DiscoveryResultMDNSSD;
        return this.mapAddressToDevice(mdnsResult.address, outdoorOnly);
      }),
    );

    const candidates = devices.filter((device): device is PairDeviceCandidate => device !== null);
    this.log(`Discovery matched ${candidates.length} of ${devices.length} record(s)`);
    return candidates;
  }

  /**
   * Probes `ipAddress` and returns a pair candidate only when the model matches the filter.
   * Prevents indoor drivers from pairing outdoor hardware (and the reverse).
   *
   * @param ipAddress - LAN address to probe
   * @param outdoorOnly - When true, accept outdoor (`O-`) models only; indoor (`I-`) when false
   */
  async mapAddressToDevice(
    ipAddress: string,
    outdoorOnly: boolean,
  ): Promise<PairDeviceCandidate | null> {
    if (!isValidHost(ipAddress)) {
      return null;
    }

    const air = new AirGradientLocal(ipAddress, this.log);
    const response = await air.getData();

    // A blank serial would pair a device whose `data.id` then matches any other
    // record that also reports no serial.
    if (
      response.status !== AirGradientConnectStatus.SUCCESS
      || !response.serialno
      || response.isOutdoor() !== outdoorOnly
    ) {
      return null;
    }

    return {
      name: response.getModelName(),
      data: {
        id: response.serialno,
      },
      settings: {
        ipAddress,
        serialno: response.serialno,
        firmware: response.firmware,
        model: response.model,
      },
    };
  }
}

module.exports = LocalDriver;
