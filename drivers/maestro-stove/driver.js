'use strict';

const Homey = require('homey');
const LocalMaestroClient = require('../../lib/api/LocalMaestroClient');

class MaestroStoveDriver extends Homey.Driver {

  async onInit() {
    this.log('MCZ Maestro Stove driver has been initialized');
  }

  async onPair(session) {
    let username = '';
    let password = '';
    let apiClient = null;
    let discoveredDevices = [];
    let useLocalMode = false;

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      // If username is an IP address, use local mode
      if (/^\d+\.\d+\.\d+\.\d+$/.test(username)) {
        this.log('Detected IP address - using local mode');
        useLocalMode = true;
        apiClient = new LocalMaestroClient(username, 81, this);

        try {
          await apiClient.connect();
          this.log('Local connection successful');
          return true;
        } catch (error) {
          this.error('Local connection failed:', error.message);
          throw new Error(`Local connection failed: ${error.message}`);
        }
      }

      try {
        // Get API client from app (supports both real and mock)
        apiClient = this.homey.app.getMaestroClient(username, password, this);
        await apiClient.login();

        this.log('Login successful for:', username);
        return true;
      } catch (error) {
        this.error('Login failed:', error.message);
        this.error('Full error:', error);
        // Return more detailed error message to user
        throw new Error(`Login failed: ${error.message || 'Unknown error'}`);
      }
    });

    session.setHandler('list_devices', async () => {
      try {
        if (!apiClient) {
          apiClient = this.homey.app.getMaestroClient(username, password, this);
          await apiClient.login();
        }

        const stoves = await apiClient.getStoveList();

        discoveredDevices = stoves.map(stove => ({
          name: stove.name,
          data: {
            id: stove.id
          },
          store: {
            username: username,
            password: password,
            serialNumber: stove.serialNumber,
            modelId: stove.modelId,
            sensorSetTypeId: stove.sensorSetTypeId,
            useLocalMode: useLocalMode,
            localIP: useLocalMode ? username : null
          }
        }));

        this.log(`Found ${discoveredDevices.length} device(s)`);
        return discoveredDevices;
      } catch (error) {
        this.error('Failed to list devices:', error);
        throw new Error(this.homey.__('list_devices_failed'));
      }
    });
  }

}

module.exports = MaestroStoveDriver;
