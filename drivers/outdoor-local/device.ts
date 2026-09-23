/**
 * Homey resolves the device class from this folder.
 * The implementation lives in lib so the indoor and outdoor drivers do not each carry a copy.
 */
module.exports = require('../../lib/local/device');
