/**
 * Homey app entry point. Delegates to {@link AirGradientApp} so shared logic stays under `lib/`.
 */
import AirGradientApp from './lib/AirGradientApp';

module.exports = class App extends AirGradientApp {};
