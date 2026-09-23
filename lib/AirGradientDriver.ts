import Homey from 'homey';
import AirGradientApp from './AirGradientApp';

/**
 * Base Homey driver shared by local and cloud connection types.
 * Caches the typed app instance so pair/repair flows can access shared place tokens.
 */
export default class AirGradientDriver extends Homey.Driver {

  app!: AirGradientApp;

  async onInit(): Promise<void> {
    this.app = this.homey.app as AirGradientApp;
  }

  /**
   * Empty on purpose.
   * Custom pair views fill the list through session handlers; Homey's default
   * list would otherwise show nothing useful and still run.
   */
  async onPairListDevices(): Promise<never[]> {
    return [];
  }
}

module.exports = AirGradientDriver;
