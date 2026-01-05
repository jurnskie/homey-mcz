const axios = require('axios');

class BridgeMaestroClient {
  constructor(bridgeUrl, logger = console) {
    this.bridgeUrl = bridgeUrl; // e.g., 'http://10.0.0.38:3000'
    this.logger = logger;
    this.connected = false;

    this.axiosInstance = axios.create({
      baseURL: this.bridgeUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async connect() {
    try {
      const response = await this.axiosInstance.get('/health');
      this.connected = response.data.stoveConnected === true;
      this.logger.log('Bridge health check:', response.data);
      return this.connected;
    } catch (error) {
      this.logger.error('Failed to connect to bridge:', error.message);
      this.connected = false;
      return false;
    }
  }

  // Alias for compatibility with device.js
  async login() {
    return await this.connect();
  }

  async disconnect() {
    this.connected = false;
    this.logger.log('Disconnected from bridge');
  }

  async sendCommand(commandString) {
    if (!this.connected) {
      const reconnected = await this.connect();
      if (!reconnected) {
        throw new Error('Bridge not connected to stove');
      }
    }

    try {
      this.logger.log('Sending command to bridge:', commandString);
      const response = await this.axiosInstance.post('/command', {
        command: commandString
      });
      this.logger.log('Bridge response:', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to send command:', error.message);
      throw error;
    }
  }

  // Helper method to build M1 command strings
  buildCommand(sensorId, value) {
    return `C|WriteParametri|${sensorId}|${value}`;
  }

  // Compatibility method for device.js
  async setParameter(sensorId, value) {
    const command = this.buildCommand(sensorId, value);
    return await this.sendCommand(command);
  }

  // Compatibility method for cloud API interface
  // Bridge doesn't use stoveId, modelId, sensorSetTypeId, or configId
  // Just need sensorId and value
  async activateProgram(stoveId, modelId, sensorSetTypeId, sensorId, configId, value) {
    this.logger.log(`Activating program: sensor ${sensorId} = ${value}`);
    const command = this.buildCommand(sensorId, value);
    return await this.sendCommand(command);
  }

  // Use cloud client for status reading (cloud API works for M1 status, just not commands)
  async getStoveStatus(stoveId) {
    if (this.cloudClient) {
      return await this.cloudClient.getStoveStatus(stoveId);
    }
    throw new Error('Cloud client not configured for status reading');
  }

  async getStoveState(stoveId) {
    if (this.cloudClient) {
      return await this.cloudClient.getStoveState(stoveId);
    }
    throw new Error('Cloud client not configured for state reading');
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = BridgeMaestroClient;
