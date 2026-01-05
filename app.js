'use strict';

const Homey = require('homey');

class MCZMaestroApp extends Homey.App {

  async onInit() {
    this.log('MCZ Maestro app has been initialized');

    // Set to true for development with mock API
    this.homey.settings.set('useMockAPI', false);

    // Register flow cards if needed
    this._registerFlowCards();
  }

  _registerFlowCards() {
    // Register condition cards
    // Register action cards for specific stove commands
    // e.g., "Start eco mode", "Set power level", etc.
  }

  getMaestroClient(username, password, logger) {
    const useMock = this.homey.settings.get('useMockAPI');

    if (useMock) {
      const MockMaestroClient = require('./lib/api/MockMaestroClient');
      return new MockMaestroClient(username, password, logger);
    } else {
      const MaestroClient = require('./lib/api/MaestroClient');
      return new MaestroClient(username, password, logger);
    }
  }

}

module.exports = MCZMaestroApp;
