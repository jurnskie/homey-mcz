'use strict';

const WebSocket = require('ws');

/**
 * MCZ Maestro Local WebSocket Client
 * Communicates directly with the stove via WebSocket on local network
 */
class LocalMaestroClient {

  constructor(ip, port = 81, logger = console) {
    this.ip = ip;
    this.port = port;
    this.logger = logger;
    this.ws = null;
    this.connected = false;
    this.messageQueue = [];
    this.messageHandlers = new Map();
    this.messageId = 0;
  }

  /**
   * Connect to the stove's WebSocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.log(`Connecting to MCZ stove at ws://${this.ip}:${this.port}`);

        this.ws = new WebSocket(`ws://${this.ip}:${this.port}`);

        this.ws.on('open', () => {
          this.logger.log('WebSocket connected');
          this.connected = true;

          // Process any queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            this.ws.send(msg);
          }

          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.logger.log('Received message:', JSON.stringify(message).substring(0, 200));

            // Call any registered handlers
            if (message.id && this.messageHandlers.has(message.id)) {
              const handler = this.messageHandlers.get(message.id);
              handler(null, message);
              this.messageHandlers.delete(message.id);
            }
          } catch (error) {
            this.logger.error('Failed to parse message:', error);
          }
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error:', error);
          this.connected = false;
          reject(error);
        });

        this.ws.on('close', () => {
          this.logger.log('WebSocket closed');
          this.connected = false;
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a message and wait for response
   */
  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      message.id = id;

      // Register handler for response
      this.messageHandlers.set(id, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });

      const msgStr = JSON.stringify(message);

      if (this.connected && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(msgStr);
      } else {
        // Queue the message
        this.messageQueue.push(msgStr);
        // Try to reconnect
        this.connect().catch(reject);
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('Message timeout'));
        }
      }, 30000);
    });
  }

  /**
   * No login needed for local connection
   */
  async login() {
    // Local connection doesn't require authentication
    if (!this.connected) {
      await this.connect();
    }
    return true;
  }

  /**
   * Get stove status - for local API, we'll fetch all data at once
   */
  async getStoveStatus(stoveId) {
    // For local WebSocket, we send a status request
    const response = await this.sendMessage({
      type: 'status'
    });

    return {
      getSensor: (name, defaultValue = null) => {
        // The response should contain sensor data
        return response.data?.[name] ?? defaultValue;
      },
      data: response.data || {}
    };
  }

  /**
   * Get stove state
   */
  async getStoveState(stoveId) {
    const response = await this.sendMessage({
      type: 'state'
    });

    return {
      getSensor: (name, defaultValue = null) => {
        return response.data?.[name] ?? defaultValue;
      },
      data: response.data || {}
    };
  }

  /**
   * Send a command to the stove
   */
  async activateProgram(stoveId, modelId, sensorSetTypeId, sensorId, configId, value) {
    this.logger.log(`Sending command: sensor=${sensorId}, value=${value}`);

    const response = await this.sendMessage({
      type: 'command',
      sensor: sensorId,
      value: value
    });

    return response;
  }

  /**
   * Ping the stove
   */
  async ping(stoveId) {
    const response = await this.sendMessage({
      type: 'ping'
    });
    return response;
  }

  /**
   * Get list of stoves (for local, just return the connected stove)
   */
  async getStoveList() {
    // For local connection, we only have one stove
    return [{
      id: `local_${this.ip}`,
      name: `MCZ Stove (${this.ip})`,
      serialNumber: this.ip,
      modelId: 'local',
      sensorSetTypeId: 'local'
    }];
  }

  /**
   * Get stove model - not available for local connection
   */
  async getStoveModel(modelId) {
    // Local connection doesn't have model info
    throw new Error('Model information not available for local connection');
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

}

module.exports = LocalMaestroClient;
