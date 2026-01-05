'use strict';

const axios = require('axios');
const { BASE_URL_HLAPI, BASE_URL_MCZ, TENANT_ID, ENDPOINTS } = require('./constants');
const { StoveModel, StoveStatus, StoveState, Stove } = require('./models');

/**
 * MCZ Maestro Cloud API Client
 * Communicates with the MCZ cloud service to control and monitor pellet stoves
 */
class MaestroClient {

  constructor(username, password, logger = console) {
    this.username = username;
    this.password = password;
    this.token = null;
    this.stoves = [];
    this.logger = logger;

    // Create axios instances for both API versions
    this.hlapiInstance = axios.create({
      baseURL: BASE_URL_HLAPI,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.mczInstance = axios.create({
      baseURL: BASE_URL_MCZ,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Keep old instance for backwards compatibility
    this.axiosInstance = this.hlapiInstance;

    // Add response interceptor for automatic token refresh on 401
    const retryInterceptor = async (error) => {
      const originalRequest = error.config;

      // If error is 401 and we haven't already retried, try to re-login
      if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          this.logger.log('Token expired (401), refreshing...');
          await this.login();
          // Retry original request with new token
          originalRequest.headers['auth-token'] = this.token;

          // Determine which instance to use for retry
          const instance = originalRequest.baseURL === BASE_URL_MCZ ? this.mczInstance : this.hlapiInstance;
          return instance(originalRequest);
        } catch (loginError) {
          this.logger.error('Token refresh failed:', loginError.message);
          return Promise.reject(loginError);
        }
      }

      return Promise.reject(error);
    };

    // Add interceptor to both instances
    this.hlapiInstance.interceptors.response.use(response => response, retryInterceptor);
    this.mczInstance.interceptors.response.use(response => response, retryInterceptor);
  }

  /**
   * Authenticate with MCZ cloud service
   * @returns {Promise<boolean>}
   */
  async login() {
    try {
      this.logger.log('Logging in to MCZ Maestro cloud...');

      const response = await this.axiosInstance.post(ENDPOINTS.LOGIN, {
        username: this.username,
        password: this.password
      }, {
        headers: {
          'tenantid': TENANT_ID
        }
      });

      if (response.data && response.data.Token) {
        this.token = response.data.Token;
        // Set token in all instances
        this.hlapiInstance.defaults.headers.common['auth-token'] = this.token;
        this.mczInstance.defaults.headers.common['auth-token'] = this.token;
        this.logger.log('Login successful');
        return true;
      }

      throw new Error('No token in login response');
    } catch (error) {
      this.logger.error('Login failed:', error.message);
      if (error.response) {
        this.logger.error('Response status:', error.response.status);
        this.logger.error('Response data:', JSON.stringify(error.response.data));
      }
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get list of stoves associated with the account
   * @returns {Promise<Stove[]>}
   */
  async getStoveList() {
    if (!this.token) {
      await this.login();
    }

    try {
      this.logger.log('Fetching stove list...');

      const response = await this.axiosInstance.post(ENDPOINTS.STOVE_LIST, {});

      if (response.data) {
        // Response might be an array or an object with a property containing the array
        let stoveData = response.data;

        if (Array.isArray(stoveData)) {
          this.stoves = stoveData.map(data => new Stove(data));
        } else if (stoveData.objects && Array.isArray(stoveData.objects)) {
          this.stoves = stoveData.objects.map(data => new Stove(data));
        } else if (stoveData.Objects && Array.isArray(stoveData.Objects)) {
          this.stoves = stoveData.Objects.map(data => new Stove(data));
        } else {
          this.logger.warn('Unexpected stove list format:', JSON.stringify(stoveData));
          this.stoves = [];
        }

        this.logger.log(`Found ${this.stoves.length} stove(s)`);
        return this.stoves;
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to get stove list:', error.message);
      throw error;
    }
  }

  /**
   * Get stove model configuration
   * @param {string} modelId - The model ID (not stove ID!)
   * @returns {Promise<StoveModel>}
   */
  async getStoveModel(modelId) {
    if (!this.token) {
      await this.login();
    }

    try {
      this.logger.log(`Fetching stove model for model ID ${modelId}...`);

      // Try POST first (even though HA uses GET, API might have changed)
      const response = await this.hlapiInstance.post(`${ENDPOINTS.STOVE_MODEL}/${modelId}`, {}, {
        headers: {
          'auth-token': this.token
        }
      });

      return new StoveModel(response.data);
    } catch (error) {
      this.logger.error('Failed to get stove model:', error.message);
      if (error.response) {
        this.logger.error('Response status:', error.response.status);
        this.logger.error('Response data:', JSON.stringify(error.response.data));
        this.logger.error('Request URL:', error.config.url);
        this.logger.error('Request method:', error.config.method);
      }
      throw error;
    }
  }

  /**
   * Get current stove status (sensor readings)
   * @param {string} stoveId
   * @returns {Promise<StoveStatus>}
   */
  async getStoveStatus(stoveId) {
    if (!this.token) {
      await this.login();
    }

    try {
      const response = await this.mczInstance.get(`${ENDPOINTS.STOVE_STATUS}/${stoveId}/Status`, {
        headers: {
          'auth-token': this.token
        }
      });

      return new StoveStatus(response.data);
    } catch (error) {
      this.logger.error('Failed to get stove status:', error.message);
      if (error.response) {
        this.logger.error('Response status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Get current stove state (configuration settings)
   * @param {string} stoveId
   * @returns {Promise<StoveState>}
   */
  async getStoveState(stoveId) {
    if (!this.token) {
      await this.login();
    }

    try {
      const response = await this.mczInstance.get(`${ENDPOINTS.STOVE_STATE}/${stoveId}/State`, {
        headers: {
          'auth-token': this.token
        }
      });

      return new StoveState(response.data);
    } catch (error) {
      this.logger.error('Failed to get stove state:', error.message);
      if (error.response) {
        this.logger.error('Response status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Activate a program (send a command to the stove)
   * @param {string} stoveId
   * @param {string} modelId
   * @param {string} sensorSetTypeId
   * @param {number} sensorId
   * @param {number} configId
   * @param {*} value
   * @returns {Promise<any>}
   */
  async activateProgram(stoveId, modelId, sensorSetTypeId, sensorId, configId, value) {
    if (!this.token) {
      await this.login();
    }

    try {
      // Convert IDs to strings (required by M1 API)
      const configIdStr = String(configId);
      const sensorIdStr = String(sensorId);

      this.logger.log(`Activating program: stoveId=${stoveId}, sensorId=${sensorIdStr}, configId=${configIdStr}, value=${value}`);

      const body = {
        ModelId: modelId,
        ConfigurationId: configIdStr,
        SensorSetTypeId: sensorSetTypeId,
        Commands: [
          {
            SensorId: sensorIdStr,
            Value: value
          }
        ]
      };

      this.logger.log('Request body:', JSON.stringify(body));

      const response = await this.mczInstance.post(`${ENDPOINTS.ACTIVATE_PROGRAM}/${stoveId}`, body, {
        headers: {
          'auth-token': this.token
        }
      });

      this.logger.log('Program activated successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to activate program:', error.message);
      if (error.response) {
        this.logger.error('Response status:', error.response.status);
        this.logger.error('Response data:', JSON.stringify(error.response.data));
        this.logger.error('Request was:', JSON.stringify({sensorId, configId, value}));
      }
      throw error;
    }
  }

  /**
   * Ping the stove (keepalive)
   * @param {string} stoveId
   * @returns {Promise<any>}
   */
  async ping(stoveId) {
    if (!this.token) {
      await this.login();
    }

    try {
      const response = await this.mczInstance.post(`${ENDPOINTS.PING}/${stoveId}`, {}, {
        headers: {
          'auth-token': this.token
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Ping failed:', error.message);
      throw error;
    }
  }

}

module.exports = MaestroClient;
