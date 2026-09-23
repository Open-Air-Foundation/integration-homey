import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import LocalDriver from '../../lib/local/driver';

/**
 * Homey loads one driver class from this folder.
 * Indoor and outdoor share {@link LocalDriver}; this class only selects the outdoor model filter.
 */
class OutdoorLocalDriver extends LocalDriver {

  async onPair(session: PairSession): Promise<void> {
    return this.onDevicePair(session, true);
  }

  async onRepair(session: PairSession, device: Homey.Device): Promise<void> {
    return this.onDeviceRepair(session, device, true);
  }
}

module.exports = OutdoorLocalDriver;
