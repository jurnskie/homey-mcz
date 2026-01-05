'use strict';

module.exports = {
  BASE_URL_HLAPI: 'https://s.maestro.mcz.it/hlapi/v1.0',
  BASE_URL_MCZ: 'https://s.maestro.mcz.it/mcz/v1.0',
  TENANT_ID: '7c201fd8-42bd-4333-914d-0f5822070757',
  ENDPOINTS: {
    LOGIN: '/Authorization/Login',  // HLAPI
    STOVE_LIST: '/Nav/FirstVisibleObjectsPaginated',  // HLAPI
    STOVE_MODEL: '/Model',  // HLAPI - requires ModelId param in URL
    STOVE_STATUS: '/Appliance',  // MCZ - requires Id param + /Status
    STOVE_STATE: '/Appliance',  // MCZ - requires Id param + /State
    ACTIVATE_PROGRAM: '/Program/ActivateProgram',  // MCZ - requires Id param
    PING: '/Program/Ping'  // MCZ - requires Id param
  },
  DEFAULT_POLLING_INTERVAL: 30000, // 30 seconds
  SENSOR_NAMES: {
    // Power/Status
    POWER: 'stato_stufa',
    POWER_COMMAND: 'com_on_off',
    ALARM: 'allarme',

    // Temperatures
    TEMP_AMBIENT: 'temp_ambiente',
    TEMP_AMBIENT_INSTALL: 'temp_amb_install',
    TEMP_EXHAUST: 'temp_fumi',
    TEMP_WATER: 'temp_acqua',
    SET_TEMP_AMB1: 'set_amb1',
    SET_TEMP_AMB2: 'set_amb2',
    SET_TEMP_AMB3: 'set_amb3',

    // Modes
    MODE: 'mode',

    // Fans
    FAN1: 'fan1',
    FAN2: 'fan2',
    FAN3: 'fan3',

    // Power
    POWER_LEVEL: 'pot',

    // Eco mode
    ECO_START: 'eco_start',
    ECO_STOP: 'eco_stop',

    // Phase
    PHASE: 'fase'
  },
  STOVE_STATES: {
    OFF: 0,
    STARTING: 1,
    PREHEATING: 2,
    IGNITION: 3,
    HEATING: 4,
    CLEANING: 5,
    STANDBY: 6,
    ALARM: 7,
    TURNING_OFF: 8
  },
  THERMOSTAT_MODES: {
    MANUAL: 0,
    AUTO: 1,
    DYNAMIC: 2,
    TURBO: 3
  }
};
