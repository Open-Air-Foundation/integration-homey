import PairSession from 'homey/lib/PairSession';
import LocalDriver from '../../lib/local/driver';

/**
 * Homey loads one driver class from this folder.
 * Existing paired devices keep this driver id; new pairs use outdoor-local.
 * The class delegates to {@link LocalDriver} with the outdoor model filter.
 */
class OutdoorDriver extends LocalDriver {

  async onPair(session: PairSession): Promise<void> {
    return this.onDevicePair(session, true);
  }
}

module.exports = OutdoorDriver;
