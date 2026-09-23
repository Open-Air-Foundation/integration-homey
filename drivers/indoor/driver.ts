import PairSession from 'homey/lib/PairSession';
import LocalDriver from '../../lib/local/driver';

/**
 * Homey loads one driver class from this folder.
 * Existing paired devices keep this driver id; new pairs use indoor-local.
 * The class delegates to {@link LocalDriver} with the indoor model filter.
 */
class IndoorDriver extends LocalDriver {

  async onPair(session: PairSession): Promise<void> {
    return this.onDevicePair(session, false);
  }
}

module.exports = IndoorDriver;
