'use strict';

const { StoveModel, StoveStatus, StoveState, Stove } = require('./models');

/**
 * Mock MCZ Maestro API Client for testing without a real stove
 */
class MockMaestroClient {

  constructor(username, password, logger = console) {
    this.username = username;
    this.password = password;
    this.logger = logger;

    // Simulated stove state
    this.mockState = {
      power: true,
      targetTemp: 21,
      currentTemp: 19.5,
      mode: 1, // Auto
      fanSpeed1: 3,
      fanSpeed2: 2,
      fanSpeed3: 0,
      powerLevel: 3,
      ecoMode: false,
      alarm: false,
      exhaustTemp: 85,
      waterTemp: 45
    };
  }

  /**
   * Mock login - always succeeds
   */
  async login() {
    this.logger.log('[MOCK] Login successful');
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 100);
    });
  }

  /**
   * Mock get stove list - returns a fake stove
   */
  async getStoveList() {
    this.logger.log('[MOCK] Returning mock stove list');
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([new Stove({
          Id: 'mock-stove-1',
          Name: 'Living Room Stove',
          ModelId: 'maestro-cute',
          UniqueCode: 'MCZ123456789',
          SensorSetTypeId: 'M2'
        })]);
      }, 100);
    });
  }

  /**
   * Mock get stove model - returns fake configuration
   */
  async getStoveModel(stoveId) {
    this.logger.log(`[MOCK] Returning mock model for ${stoveId}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(new StoveModel({
          model_name: 'Maestro Cute',
          model_id: 'maestro-cute',
          sensor_set_type_id: 'M2',
          model_configurations: [
            {
              configuration_name: 'Manual',
              configuration_id: 1,
              configurations: [
                { sensor_name: 'com_on_off', sensor_id: 100, type: 'boolean' },
                { sensor_name: 'set_amb1', sensor_id: 101, type: 'number', min: 7, max: 35 },
                { sensor_name: 'mode', sensor_id: 102, type: 'number', min: 0, max: 3 },
                { sensor_name: 'fan1', sensor_id: 103, type: 'number', min: 0, max: 5 },
                { sensor_name: 'fan2', sensor_id: 104, type: 'number', min: 0, max: 5 },
                { sensor_name: 'fan3', sensor_id: 105, type: 'number', min: 0, max: 5 },
                { sensor_name: 'pot', sensor_id: 106, type: 'number', min: 1, max: 5 },
                { sensor_name: 'eco_start', sensor_id: 107, type: 'boolean' }
              ]
            }
          ]
        }));
      }, 100);
    });
  }

  /**
   * Mock get stove status - returns fake sensor data
   */
  async getStoveStatus(stoveId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(new StoveStatus({
          stato_stufa: this.mockState.power ? 4 : 0, // 4 = heating, 0 = off
          temp_ambiente: this.mockState.currentTemp,
          temp_fumi: this.mockState.exhaustTemp,
          temp_acqua: this.mockState.waterTemp,
          allarme: this.mockState.alarm ? 1 : 0,
          pot: this.mockState.powerLevel
        }));
      }, 100);
    });
  }

  /**
   * Mock get stove state - returns fake configuration data
   */
  async getStoveState(stoveId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(new StoveState({
          set_amb1: this.mockState.targetTemp,
          mode: this.mockState.mode,
          fan1: this.mockState.fanSpeed1,
          fan2: this.mockState.fanSpeed2,
          fan3: this.mockState.fanSpeed3,
          eco_start: this.mockState.ecoMode ? 1 : 0
        }));
      }, 100);
    });
  }

  /**
   * Mock activate program - updates internal state
   */
  async activateProgram(stoveId, sensorId, configId, value) {
    this.logger.log(`[MOCK] Activate program: sensor=${sensorId}, config=${configId}, value=${value}`);

    return new Promise((resolve) => {
      setTimeout(() => {
        // Update mock state based on sensor ID
        switch (sensorId) {
          case 100: // com_on_off
            this.mockState.power = value === 1 || value === true;
            break;
          case 101: // set_amb1
            this.mockState.targetTemp = value;
            break;
          case 102: // mode
            this.mockState.mode = value;
            break;
          case 103: // fan1
            this.mockState.fanSpeed1 = value;
            break;
          case 104: // fan2
            this.mockState.fanSpeed2 = value;
            break;
          case 105: // fan3
            this.mockState.fanSpeed3 = value;
            break;
          case 106: // pot
            this.mockState.powerLevel = value;
            break;
          case 107: // eco_start
            this.mockState.ecoMode = value === 1 || value === true;
            break;
        }

        // Simulate temperature changes when power state changes
        if (sensorId === 100) {
          if (this.mockState.power) {
            // Gradually heat up
            const interval = setInterval(() => {
              if (this.mockState.currentTemp < this.mockState.targetTemp) {
                this.mockState.currentTemp += 0.5;
                this.mockState.exhaustTemp += 2;
              } else {
                clearInterval(interval);
              }
            }, 5000);
          } else {
            // Gradually cool down
            const interval = setInterval(() => {
              if (this.mockState.currentTemp > 15) {
                this.mockState.currentTemp -= 0.5;
                this.mockState.exhaustTemp -= 2;
              } else {
                clearInterval(interval);
              }
            }, 5000);
          }
        }

        resolve({ success: true });
      }, 100);
    });
  }

  /**
   * Mock ping - always succeeds
   */
  async ping(stoveId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true });
      }, 50);
    });
  }

}

module.exports = MockMaestroClient;
