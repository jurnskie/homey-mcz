'use strict';

const { io } = require('socket.io-client');

/**
 * MCZ Maestro Socket.IO Client for M1 Generation Stoves
 * Communicates with MCZ cloud via Socket.IO at app.mcz.it:9000
 */
class SocketIOMaestroClient {

  constructor(serialNumber, macAddress, logger = console, socketUrl = null) {
    this.serialNumber = serialNumber;
    this.macAddress = macAddress;
    this.logger = logger;
    this.socket = null;
    this.connected = false;
    this.dataHandlers = [];
    // Use provided URL or default to cloud server
    this.SOCKET_URL = socketUrl || 'http://app.mcz.it:9000';
  }

  /**
   * Connect to MCZ Socket.IO server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.log(`Connecting to MCZ Socket.IO at ${this.SOCKET_URL}...`);

        this.socket = io(this.SOCKET_URL, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
        });

        this.socket.on('connect', () => {
          this.logger.log('Socket.IO connected successfully');
          this.connected = true;

          // Join session for this stove
          this.joinSession();

          resolve();
        });

        this.socket.on('rispondo', (data) => {
          this.logger.log('Received data from stove');
          this.handleIncomingData(data);
        });

        this.socket.on('disconnect', () => {
          this.logger.log('Socket.IO disconnected');
          this.connected = false;
        });

        this.socket.on('connect_error', (error) => {
          this.logger.error('Socket.IO connection error:', error.message);
          this.connected = false;
          reject(error);
        });

        this.socket.on('connect_timeout', () => {
          this.logger.error('Socket.IO connection timeout');
          this.connected = false;
          reject(new Error('Connection timeout'));
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
   * Join session for the stove
   */
  joinSession() {
    const joinData = {
      serialNumber: this.serialNumber,
      macAddress: this.macAddress,
      type: 'Android-App'
    };
    this.logger.log('Joining stove session with:', JSON.stringify(joinData));
    this.socket.emit('join', joinData);

    // Listen for join response
    this.socket.on('joined', (data) => {
      this.logger.log('Join confirmed by server:', JSON.stringify(data));
    });

    // Listen for ANY other events to debug
    this.socket.onAny((eventName, ...args) => {
      this.logger.log(`Socket.IO event received: ${eventName}`, JSON.stringify(args).substring(0, 200));
    });
  }

  /**
   * No login needed for Socket.IO (handled by join session)
   */
  async login() {
    if (!this.connected) {
      await this.connect();
    }
    return true;
  }

  /**
   * Send command to stove
   */
  sendCommand(commandString) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to Socket.IO server');
    }

    const commandData = {
      serialNumber: this.serialNumber,
      macAddress: this.macAddress,
      tipoChiamata: 1,
      richiesta: commandString
    };

    this.logger.log(`Sending command: ${commandString}`);
    this.logger.log(`Full command data:`, JSON.stringify(commandData));

    this.socket.emit('chiedo', commandData);
  }

  /**
   * Activate a program (send a command to the stove)
   * For M1 stoves, we ignore modelId, sensorSetTypeId as Socket.IO uses different format
   */
  async activateProgram(stoveId, modelId, sensorSetTypeId, sensorId, configId, value) {
    // M1 uses command format: C|WriteParametri|sensorId|value
    const commandString = `C|WriteParametri|${sensorId}|${value}`;

    this.logger.log(`Activating program: sensorId=${sensorId}, value=${value}`);
    this.sendCommand(commandString);

    // Socket.IO is fire-and-forget, no response expected
    return { success: true };
  }

  /**
   * Get stove status
   */
  async getStoveStatus(stoveId) {
    // Request status update
    this.sendCommand('C|RecuperoInfo');

    // Wait for response (this is a simplified approach)
    // In production, you'd want to implement proper response handling
    return new Promise((resolve) => {
      const handler = (data) => {
        resolve({
          getSensor: (name, defaultValue = null) => {
            return data[name] !== undefined ? data[name] : defaultValue;
          },
          data: data
        });
      };

      this.dataHandlers.push(handler);

      // Timeout after 5 seconds
      setTimeout(() => {
        const index = this.dataHandlers.indexOf(handler);
        if (index > -1) {
          this.dataHandlers.splice(index, 1);
        }
        resolve({
          getSensor: () => null,
          data: {}
        });
      }, 5000);
    });
  }

  /**
   * Get stove state
   */
  async getStoveState(stoveId) {
    // Request parameters
    this.sendCommand('RecuperoParametri');

    return new Promise((resolve) => {
      const handler = (data) => {
        resolve({
          getSensor: (name, defaultValue = null) => {
            return data[name] !== undefined ? data[name] : defaultValue;
          },
          data: data
        });
      };

      this.dataHandlers.push(handler);

      setTimeout(() => {
        const index = this.dataHandlers.indexOf(handler);
        if (index > -1) {
          this.dataHandlers.splice(index, 1);
        }
        resolve({
          getSensor: () => null,
          data: {}
        });
      }, 5000);
    });
  }

  /**
   * Handle incoming data from stove
   */
  handleIncomingData(data) {
    this.logger.log('Processing stove data:', JSON.stringify(data).substring(0, 200));

    // Call all registered handlers
    this.dataHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        this.logger.error('Error in data handler:', error);
      }
    });

    // Clear handlers after processing
    this.dataHandlers = [];
  }

  /**
   * Get list of stoves (for Socket.IO, we only have one stove)
   */
  async getStoveList() {
    return [{
      id: `socketio_${this.serialNumber}`,
      name: `MCZ Stove (${this.serialNumber})`,
      serialNumber: this.serialNumber,
      modelId: 'socketio_m1',
      sensorSetTypeId: 'socketio_m1'
    }];
  }

  /**
   * Get stove model - not available for Socket.IO connection
   */
  async getStoveModel(modelId) {
    throw new Error('Model information not available for Socket.IO connection');
  }

  /**
   * Ping the stove
   */
  async ping(stoveId) {
    this.sendCommand('C|RecuperoInfo');
    return { success: true };
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

}

module.exports = SocketIOMaestroClient;
