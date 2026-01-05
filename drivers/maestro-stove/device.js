'use strict';

const Homey = require('homey');
const { SENSOR_NAMES, DEFAULT_POLLING_INTERVAL, THERMOSTAT_MODES } = require('../../lib/api/constants');
const LocalMaestroClient = require('../../lib/api/LocalMaestroClient');
const SocketIOMaestroClient = require('../../lib/api/SocketIOMaestroClient');

class MaestroStoveDevice extends Homey.Device {

  async onInit() {
    this.log('MCZ Maestro Stove device has been initialized');

    const settings = this.getStore();
    this.log('Device settings:', JSON.stringify(settings));

    // Create API client (local, Socket.IO for M1, or cloud for M2/M3)
    if (settings.useLocalMode) {
      this.log('Using local WebSocket connection at', settings.localIP);
      this.apiClient = new LocalMaestroClient(settings.localIP, 81, this);
    } else {
      // First try to get cloud client
      const cloudClient = this.homey.app.getMaestroClient(
        settings.username,
        settings.password,
        this
      );

      try {
        // Try to login with cloud client
        await cloudClient.login();

        // Try to fetch model - if this fails, it's likely an M1 stove
        try {
          await cloudClient.getStoveModel(settings.modelId);
          // Model fetch succeeded - use cloud client (M2/M3)
          this.log('Model fetch successful - using cloud API for M2/M3 stove');
          this.apiClient = cloudClient;
        } catch (modelError) {
          // Model fetch failed - this is an M1 stove, use Socket.IO
          this.log('Model fetch failed - detected M1 stove, switching to Socket.IO');
          this.error('Model error:', modelError.message);

          // Extract MAC address from SSID_wifi in cloud status
          // The MAC is in the format MCZ-01A6CF12C50732 (without the MCZ- prefix)
          let macAddress = null;

          try {
            // Try to get status to extract MAC from SSID
            const status = await cloudClient.getStoveStatus(this.getData().id);
            if (status.data && status.data.SSID_wifi && status.data.SSID_wifi.startsWith('MCZ-')) {
              macAddress = status.data.SSID_wifi.replace('MCZ-', '');
              this.log('Extracted MAC from SSID_wifi:', macAddress);
            } else if (status.data && status.data.SSID_wifi) {
              this.log('SSID_wifi found but does not start with MCZ-:', status.data.SSID_wifi);
            } else {
              this.log('SSID_wifi not found in status, using hardcoded MAC for testing');
              // TODO: Add MAC address field to pairing flow
              // Use MAC with colons (from app screenshot: A6:CF:12:C4:2B:9B)
              macAddress = 'A6:CF:12:C4:2B:9B';
            }
          } catch (error) {
            this.log('Could not extract MAC from SSID, error:', error.message);
            // Use hardcoded MAC as fallback (with colons)
            macAddress = 'A6:CF:12:C4:2B:9B';
          }

          // If we still couldn't get MAC, fail
          if (!macAddress) {
            throw new Error('Could not determine MAC address for Socket.IO connection');
          }

          // Create Socket.IO client for M1 stove
          // Use cloud Socket.IO server (stove is cloud-connected)
          this.log('Creating Socket.IO client with MAC:', macAddress);

          this.apiClient = new SocketIOMaestroClient(
            settings.serialNumber,
            macAddress,
            this,
            null  // Use default cloud URL: app.mcz.it:9000
          );
        }
      } catch (loginError) {
        this.error('Login failed:', loginError.message);
        throw loginError;
      }
    }

    try {
      // Initialize API connection
      this.log('Connecting to stove...');
      await this.apiClient.login();
      this.log('Connection successful');

      // Fetch and cache device model configuration (skip for Socket.IO)
      if (!(this.apiClient instanceof SocketIOMaestroClient)) {
        const modelId = settings.modelId;
        this.log('Fetching stove model for model ID:', modelId);

        try {
          this.model = await this.apiClient.getStoveModel(modelId);
          this.log('Stove model loaded:', this.model.modelName);
        } catch (modelError) {
          this.error('Failed to fetch stove model:', modelError.message);
          this.model = this._createMinimalModel();
        }
      } else {
        // Socket.IO M1 stove - use minimal model with M1 sensor IDs
        this.log('Using M1 Socket.IO model configuration');
        this.model = this._createM1Model();
      }

      // Register capability listeners
      this._registerCapabilityListeners();

      // Start polling for status updates
      this.startPolling();

      this.log('Device initialized successfully');
    } catch (error) {
      this.error('Failed to initialize device:', error.message);
      this.error('Full error:', error);
      this.setUnavailable(`Initialization failed: ${error.message}`).catch(this.error);
    }
  }

  _registerCapabilityListeners() {
    // On/Off
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    // Target Temperature
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));

    // Thermostat Mode
    this.registerCapabilityListener('thermostat_mode', this.onCapabilityThermostatMode.bind(this));

    // Fan Speeds
    if (this.hasCapability('fan_speed_1')) {
      this.registerCapabilityListener('fan_speed_1', value => this.onCapabilityFanSpeed(1, value));
    }
    if (this.hasCapability('fan_speed_2')) {
      this.registerCapabilityListener('fan_speed_2', value => this.onCapabilityFanSpeed(2, value));
    }
    if (this.hasCapability('fan_speed_3')) {
      this.registerCapabilityListener('fan_speed_3', value => this.onCapabilityFanSpeed(3, value));
    }

    // Eco Mode
    if (this.hasCapability('eco_mode')) {
      this.registerCapabilityListener('eco_mode', this.onCapabilityEcoMode.bind(this));
    }

    // Power Level
    if (this.hasCapability('power_level')) {
      this.registerCapabilityListener('power_level', this.onCapabilityPowerLevel.bind(this));
    }
  }

  async onCapabilityOnoff(value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try {
      this.log(`Setting onoff to: ${value}`);

      // Find the power sensor configuration
      const sensorIds = this.model.findSensorIds(SENSOR_NAMES.POWER_COMMAND);

      if (!sensorIds) {
        throw new Error('Power command sensor not found in model configuration');
      }

      // M1 stoves use value 40 for OFF, not 0
      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        value ? 1 : 40
      );

      // Optimistically update the capability
      await this.setCapabilityValue('onoff', value);

      // Force an update after a delay to get actual state
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error('Failed to set onoff:', error);
      throw error;
    }
  }

  async onCapabilityTargetTemperature(value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try {
      this.log(`Setting target temperature to: ${value}°C`);

      // Try to find set_amb1 first (most common)
      let sensorIds = this.model.findSensorIds(SENSOR_NAMES.SET_TEMP_AMB1);

      if (!sensorIds) {
        throw new Error('Temperature setpoint sensor not found in model configuration');
      }

      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        parseFloat(value)
      );

      // Optimistically update the capability
      await this.setCapabilityValue('target_temperature', value);

      // Force an update after a delay
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error('Failed to set target temperature:', error);
      throw error;
    }
  }

  async onCapabilityThermostatMode(value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try {
      this.log(`Setting thermostat mode to: ${value}`);

      // Map Homey mode to MCZ mode value
      const modeMap = {
        'manual': THERMOSTAT_MODES.MANUAL,
        'auto': THERMOSTAT_MODES.AUTO,
        'dynamic': THERMOSTAT_MODES.DYNAMIC,
        'turbo': THERMOSTAT_MODES.TURBO
      };

      const modeValue = modeMap[value];

      if (modeValue === undefined) {
        throw new Error(`Invalid thermostat mode: ${value}`);
      }

      const sensorIds = this.model.findSensorIds(SENSOR_NAMES.MODE);

      if (!sensorIds) {
        throw new Error('Mode sensor not found in model configuration');
      }

      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        modeValue
      );

      // Optimistically update the capability
      await this.setCapabilityValue('thermostat_mode', value);

      // Force an update after a delay
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error('Failed to set thermostat mode:', error);
      throw error;
    }
  }

  async onCapabilityFanSpeed(fanNumber, value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try{
      this.log(`Setting fan ${fanNumber} speed to: ${value}`);

      const sensorName = fanNumber === 1 ? SENSOR_NAMES.FAN1 :
                         fanNumber === 2 ? SENSOR_NAMES.FAN2 :
                         SENSOR_NAMES.FAN3;

      const sensorIds = this.model.findSensorIds(sensorName);

      if (!sensorIds) {
        this.log(`Fan ${fanNumber} sensor not found - might not be supported`);
        return true;
      }

      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        parseInt(value)
      );

      // Optimistically update the capability
      await this.setCapabilityValue(`fan_speed_${fanNumber}`, value);

      // Force an update after a delay
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error(`Failed to set fan ${fanNumber} speed:`, error);
      throw error;
    }
  }

  async onCapabilityEcoMode(value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try {
      this.log(`Setting eco mode to: ${value}`);

      const sensorName = value ? SENSOR_NAMES.ECO_START : SENSOR_NAMES.ECO_STOP;
      const sensorIds = this.model.findSensorIds(sensorName);

      if (!sensorIds) {
        this.log('Eco mode sensor not found - might not be supported');
        return true;
      }

      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        value ? 1 : 0
      );

      // Optimistically update the capability
      await this.setCapabilityValue('eco_mode', value);

      // Force an update after a delay
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error('Failed to set eco mode:', error);
      throw error;
    }
  }

  async onCapabilityPowerLevel(value) {
    const stoveId = this.getData().id;
    const settings = this.getStore();

    try {
      this.log(`Setting power level to: ${value}`);

      const sensorIds = this.model.findSensorIds(SENSOR_NAMES.POWER_LEVEL);

      if (!sensorIds) {
        throw new Error('Power level sensor not found in model configuration');
      }

      await this.apiClient.activateProgram(
        stoveId,
        settings.modelId,
        settings.sensorSetTypeId,
        sensorIds.sensorId,
        sensorIds.configId,
        parseInt(value)
      );

      // Optimistically update the capability
      await this.setCapabilityValue('power_level', value);

      // Force an update after a delay
      setTimeout(() => this.updateDeviceState().catch(this.error), 3000);

      return true;
    } catch (error) {
      this.error('Failed to set power level:', error);
      throw error;
    }
  }

  startPolling() {
    // Get polling interval from settings or use default
    const pollingInterval = this.getSetting('polling_interval') || DEFAULT_POLLING_INTERVAL;

    this.log(`Starting polling with interval: ${pollingInterval}ms`);

    // Clear any existing interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Poll every X seconds
    this.pollInterval = setInterval(async () => {
      await this.updateDeviceState();
    }, pollingInterval);

    // Initial update
    this.updateDeviceState().catch(this.error);
  }

  async updateDeviceState() {
    const stoveId = this.getData().id;

    try {
      this.log('Updating device state for stove ID:', stoveId);

      // Fetch both status and state
      const [status, state] = await Promise.all([
        this.apiClient.getStoveStatus(stoveId),
        this.apiClient.getStoveState(stoveId)
      ]);

      this.log('Status received:', JSON.stringify(status).substring(0, 200));
      this.log('State received:', JSON.stringify(state).substring(0, 200));

      // Update capabilities based on sensor data
      await this._updateCapabilitiesFromSensors(status, state);

      // Mark device as available
      if (!this.getAvailable()) {
        await this.setAvailable();
        this.log('Device marked as available');
      }
    } catch (error) {
      this.error('Failed to update device state:', error.message);
      this.error('Error details:', error);
      if (error.response) {
        this.error('Response status:', error.response.status);
        this.error('Response data:', JSON.stringify(error.response.data));
      }
      await this.setUnavailable(`Update failed: ${error.message}`).catch(this.error);
    }
  }

  async _updateCapabilitiesFromSensors(status, state) {
    // Power state (stato_stufa: 0=off, 1-8=various states)
    const powerState = status.getSensor(SENSOR_NAMES.POWER, 0);
    const isOn = powerState > 0;
    if (this.hasCapability('onoff')) {
      await this.setCapabilityValue('onoff', isOn).catch(this.error);
    }

    // Current temperature
    const currentTemp = status.getSensor(SENSOR_NAMES.TEMP_AMBIENT_INSTALL) ||
                       status.getSensor(SENSOR_NAMES.TEMP_AMBIENT);
    if (currentTemp !== null && this.hasCapability('measure_temperature')) {
      await this.setCapabilityValue('measure_temperature', currentTemp).catch(this.error);
    }

    // Target temperature
    const targetTemp = state.getSensor(SENSOR_NAMES.SET_TEMP_AMB1);
    if (targetTemp !== null && this.hasCapability('target_temperature')) {
      await this.setCapabilityValue('target_temperature', targetTemp).catch(this.error);
    }

    // Thermostat mode
    const mode = state.getSensor(SENSOR_NAMES.MODE);
    if (mode !== null && this.hasCapability('thermostat_mode')) {
      const modeMap = {
        [THERMOSTAT_MODES.MANUAL]: 'manual',
        [THERMOSTAT_MODES.AUTO]: 'auto',
        [THERMOSTAT_MODES.DYNAMIC]: 'dynamic',
        [THERMOSTAT_MODES.TURBO]: 'turbo'
      };
      const homeyMode = modeMap[mode] || 'manual';
      await this.setCapabilityValue('thermostat_mode', homeyMode).catch(this.error);
    }

    // Power level
    const powerLevel = status.getSensor(SENSOR_NAMES.POWER_LEVEL);
    if (powerLevel !== null && this.hasCapability('measure_power')) {
      await this.setCapabilityValue('measure_power', powerLevel).catch(this.error);
    }
    if (powerLevel !== null && this.hasCapability('power_level')) {
      await this.setCapabilityValue('power_level', powerLevel).catch(this.error);
    }

    // Alarm
    const alarm = status.getSensor(SENSOR_NAMES.ALARM, 0);
    if (this.hasCapability('alarm_fire')) {
      await this.setCapabilityValue('alarm_fire', alarm === 1).catch(this.error);
    }

    // Fan speeds
    const fan1 = state.getSensor(SENSOR_NAMES.FAN1);
    if (fan1 !== null && this.hasCapability('fan_speed_1')) {
      await this.setCapabilityValue('fan_speed_1', fan1).catch(this.error);
    }

    const fan2 = state.getSensor(SENSOR_NAMES.FAN2);
    if (fan2 !== null && this.hasCapability('fan_speed_2')) {
      await this.setCapabilityValue('fan_speed_2', fan2).catch(this.error);
    }

    const fan3 = state.getSensor(SENSOR_NAMES.FAN3);
    if (fan3 !== null && this.hasCapability('fan_speed_3')) {
      await this.setCapabilityValue('fan_speed_3', fan3).catch(this.error);
    }

    // Eco mode
    const ecoMode = state.getSensor(SENSOR_NAMES.ECO_START, 0);
    if (this.hasCapability('eco_mode')) {
      await this.setCapabilityValue('eco_mode', ecoMode === 1).catch(this.error);
    }

    // Additional temperature sensors
    const exhaustTemp = status.getSensor(SENSOR_NAMES.TEMP_EXHAUST);
    if (exhaustTemp !== null && this.hasCapability('measure_temperature_exhaust')) {
      await this.setCapabilityValue('measure_temperature_exhaust', exhaustTemp).catch(this.error);
    }

    const waterTemp = status.getSensor(SENSOR_NAMES.TEMP_WATER);
    if (waterTemp !== null && this.hasCapability('measure_temperature_water')) {
      await this.setCapabilityValue('measure_temperature_water', waterTemp).catch(this.error);
    }

    if (currentTemp !== null && this.hasCapability('measure_temperature_ambient')) {
      await this.setCapabilityValue('measure_temperature_ambient', currentTemp).catch(this.error);
    }
  }

  /**
   * Create minimal model for M2/M3 stoves when model endpoint fails
   */
  _createMinimalModel() {
    return {
      modelName: 'MCZ Stove',
      findSensorIds: (sensorName) => {
        return {
          sensorId: '0',
          configId: '0'
        };
      }
    };
  }

  /**
   * Create M1 model with Socket.IO sensor IDs
   * Based on the bertrandgressier/mcz-stove-gateway implementation
   */
  _createM1Model() {
    // M1 Socket.IO command IDs (from the gateway code)
    const M1_SENSOR_IDS = {
      power: '34',           // Power on/off (1=on, 40=off)
      temperature: '35',     // Target temperature
      mode: '59',           // Operating mode
      fan1: '37',           // Fan 1 speed
      fan2: '38',           // Fan 2 speed
      fan3: '39',           // Fan 3 speed
      power_level: '36',    // Power level (1-5)
      eco: '60'             // Eco mode
    };

    return {
      modelName: 'M1 Air (Socket.IO)',
      findSensorIds: (sensorName) => {
        // Map sensor names to M1 command IDs
        const idMap = {
          [SENSOR_NAMES.POWER_COMMAND]: { sensorId: M1_SENSOR_IDS.power, configId: '0' },
          [SENSOR_NAMES.SET_TEMP_AMB1]: { sensorId: M1_SENSOR_IDS.temperature, configId: '0' },
          [SENSOR_NAMES.MODE]: { sensorId: M1_SENSOR_IDS.mode, configId: '0' },
          [SENSOR_NAMES.FAN1]: { sensorId: M1_SENSOR_IDS.fan1, configId: '0' },
          [SENSOR_NAMES.FAN2]: { sensorId: M1_SENSOR_IDS.fan2, configId: '0' },
          [SENSOR_NAMES.FAN3]: { sensorId: M1_SENSOR_IDS.fan3, configId: '0' },
          [SENSOR_NAMES.POWER_LEVEL]: { sensorId: M1_SENSOR_IDS.power_level, configId: '0' },
          [SENSOR_NAMES.ECO_START]: { sensorId: M1_SENSOR_IDS.eco, configId: '0' },
          [SENSOR_NAMES.ECO_STOP]: { sensorId: M1_SENSOR_IDS.eco, configId: '0' }
        };

        return idMap[sensorName] || { sensorId: '0', configId: '0' };
      }
    };
  }

  async onDeleted() {
    this.log('MCZ Maestro Stove device has been deleted');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

}

module.exports = MaestroStoveDevice;
