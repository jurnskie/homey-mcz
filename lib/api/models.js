'use strict';

/**
 * Model for a sensor configuration
 */
class SensorConfiguration {
  constructor(data) {
    this.sensorName = data.sensor_name || data.SensorName || '';
    this.sensorId = data.sensor_id || data.SensorId || 0;
    this.type = data.type || data.Type || '';
    this.min = data.min || data.Min;
    this.max = data.max || data.Max;
    this.visible = data.visible !== undefined ? data.visible : (data.Visible !== undefined ? data.Visible : true);
  }
}

/**
 * Model for a configuration group
 */
class ModelConfiguration {
  constructor(data) {
    this.configurationName = data.configuration_name || data.ConfigurationName || '';
    this.configurationId = data.configuration_id || data.ConfigurationId || 0;
    this.configurations = (data.configurations || data.Configurations || [])
      .map(config => new SensorConfiguration(config));
  }

  /**
   * Find a sensor by name
   * @param {string} sensorName
   * @returns {SensorConfiguration|null}
   */
  findSensor(sensorName) {
    return this.configurations.find(sensor => sensor.sensorName === sensorName) || null;
  }
}

/**
 * Model for the stove model information
 */
class StoveModel {
  constructor(data) {
    this.modelName = data.model_name || data.ModelName || '';
    this.modelId = data.model_id || data.ModelId || '';
    this.sensorSetTypeId = data.sensor_set_type_id || data.SensorSetTypeId || '';
    this.modelConfigurations = (data.model_configurations || data.ModelConfigurations || [])
      .map(config => new ModelConfiguration(config));
  }

  /**
   * Find sensor ID and config ID for a given sensor name
   * @param {string} sensorName
   * @returns {{sensorId: number, configId: number}|null}
   */
  findSensorIds(sensorName) {
    for (const config of this.modelConfigurations) {
      const sensor = config.findSensor(sensorName);
      if (sensor) {
        return {
          sensorId: sensor.sensorId,
          configId: config.configurationId
        };
      }
    }
    return null;
  }
}

/**
 * Model for stove status (read-only sensor data)
 */
class StoveStatus {
  constructor(data) {
    this.sensors = this._parseSensors(data);
    this.rawData = data;
  }

  _parseSensors(data) {
    // The API likely returns sensor data in various formats
    // This handles both snake_case and PascalCase
    const sensors = {};

    if (data.sensors) {
      Object.assign(sensors, data.sensors);
    }

    if (data.Sensors) {
      Object.assign(sensors, data.Sensors);
    }

    // If data itself contains sensor values directly
    if (!data.sensors && !data.Sensors) {
      Object.assign(sensors, data);
    }

    return sensors;
  }

  /**
   * Get a sensor value by name
   * @param {string} sensorName
   * @param {*} defaultValue
   * @returns {*}
   */
  getSensor(sensorName, defaultValue = null) {
    return this.sensors[sensorName] !== undefined ? this.sensors[sensorName] : defaultValue;
  }
}

/**
 * Model for stove state (configuration/setting data)
 */
class StoveState {
  constructor(data) {
    this.sensors = this._parseSensors(data);
    this.rawData = data;
  }

  _parseSensors(data) {
    const sensors = {};

    if (data.sensors) {
      Object.assign(sensors, data.sensors);
    }

    if (data.Sensors) {
      Object.assign(sensors, data.Sensors);
    }

    // If data itself contains sensor values directly
    if (!data.sensors && !data.Sensors) {
      Object.assign(sensors, data);
    }

    return sensors;
  }

  /**
   * Get a sensor value by name
   * @param {string} sensorName
   * @param {*} defaultValue
   * @returns {*}
   */
  getSensor(sensorName, defaultValue = null) {
    return this.sensors[sensorName] !== undefined ? this.sensors[sensorName] : defaultValue;
  }
}

/**
 * Model for a stove device
 */
class Stove {
  constructor(data) {
    // Handle nested Node structure from API response
    const node = data.Node || data;

    this.id = node.Id || node.id || '';
    this.name = node.Name || node.name || '';
    this.modelId = node.ModelId || node.model_id || '';
    this.serialNumber = node.UniqueCode || node.unique_code || node.Description || node.serial_number || '';
    this.sensorSetTypeId = node.SensorSetTypeId || node.sensor_set_type_id || '';
  }
}

module.exports = {
  SensorConfiguration,
  ModelConfiguration,
  StoveModel,
  StoveStatus,
  StoveState,
  Stove
};
