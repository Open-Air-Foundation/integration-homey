import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import CloudDriver from '../../lib/cloud/driver';

/**
 * Homey loads one driver class from this folder.
 * Indoor and outdoor share {@link CloudDriver}; this class only selects the indoor model filter.
 */
class IndoorCloudDriver extends CloudDriver {

  async onPair(session: PairSession): Promise<void> {
    return this.onDevicePair(session, false);
  }

  async onRepair(session: PairSession, device: Homey.Device): Promise<void> {
    return this.onDeviceRepair(session, device);
  }
}

module.exports = IndoorCloudDriver;
