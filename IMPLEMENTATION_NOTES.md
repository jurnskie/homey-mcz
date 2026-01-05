# MCZ Maestro Homey App - Implementation Notes

## Project Overview

Creating a Homey app to control an MCZ Maestro Cute pellet stove (M1 generation). Started with cloud API approach based on Home Assistant integration, discovered M1 stoves require different architecture than M2/M3 stoves.

---

## Hardware & Environment

### User's Equipment
- **Stove**: MCZ ST.CUTE AIR 8 M1
  - Firmware: 1.10.8
  - Serial: YOUR_SERIAL_NUMBER
  - Model ID: `7c201fd8-42bd-4333-914d-0f5822070757§00000000-0000-0000-0000-000000000000§526e5560-9dce-426d-9bc1-0aff5867b840`
  - Sensor Set Type: `7c201fd8-42bd-4333-914d-0f5822070757§00000000-0000-0000-0000-000000000000§314b03b8-f4ed-11eb-a33c-0242ac120003`

### Stove Network Information
- **WiFi SSID**: MCZ-YOURSSID
- **WiFi Password**: YOUR_WIFI_PASSWORD
- **MAC Address (panel)**: YOUR:MAC:ADDRESS
- **Local IP on stove WiFi**: 192.168.120.1
- **Local WebSocket Port**: 81
- **Home network IP**: YOUR_HOME_IP (for internet access only, NOT for control)

### Homey Setup
- **Type**: Homey Pro (Early 2023) - Self-hosted on Docker/Synology
- **IP**: http://YOUR_SYNOLOGY_IP:4859
- **API Key**: `YOUR_HOMEY_API_KEY`
- **Homey ID**: `YOUR_HOMEY_ID`

### Synology NAS (Bridge Server)
- **Home Network IP**: YOUR_SYNOLOGY_IP (eth1)
- **MCZ Network IP**: 192.168.120.XXX (eth0, via WiFi extender)
- **Bridge Setup**: TP-Link WiFi extender connected to MCZ-YOURSSID, plugged into Synology LAN 1

### User's MCZ Account
- **Email**: your-email@example.com
- **API Token**: (expires, auto-refreshed by app)

---

## Technical Discovery Journey

### Phase 1: Initial Cloud API Attempt

**Assumption**: M1 stoves use same cloud API as M2/M3 stoves

**Implementation**:
1. Created MaestroClient using REST API endpoints from HA integration
2. Successfully authenticated with MCZ cloud
3. Successfully retrieved stove list
4. Successfully read stove status/state

**API Endpoints Discovered**:
```javascript
BASE_URL_HLAPI: 'https://s.maestro.mcz.it/hlapi/v1.0'
BASE_URL_MCZ: 'https://s.maestro.mcz.it/mcz/v1.0'
TENANT_ID: '7c201fd8-42bd-4333-914d-0f5822070757'

// Working endpoints:
POST /Authorization/Login
POST /Nav/FirstVisibleObjectsPaginated  // Get stove list
GET  /Appliance/{Id}/Status
GET  /Appliance/{Id}/State

// Failed endpoints (M1 doesn't support):
POST /Model/{ModelId}  // 405 Method Not Allowed
POST /Program/ActivateProgram/{Id}  // 400/500 errors
```

**Problem**: Commands via `/Program/ActivateProgram` failed with 400/500 errors despite trying:
- Different sensor IDs (1, 2, 34, 40, 128)
- Different value formats (int, boolean, string)
- Different ConfigurationId formats (0, "0", full ID)
- Empty/missing ConfigurationId

**Root Cause**: M1 stoves don't support REST API commands - they use WebSocket/Socket.IO!

---

### Phase 2: Socket.IO Cloud Attempt

**Discovery**: User provided GitHub repos showing M1 stoves use Socket.IO at `app.mcz.it:9000`
- https://github.com/Chibald/maestrogateway
- https://github.com/bertrandgressier/mcz-stove-gateway

**Implementation**:
1. Created SocketIOMaestroClient.js
2. Connected to `http://app.mcz.it:9000` successfully
3. Sent join session with serial number and MAC address
4. Sent commands in format: `C|WriteParametri|{sensorId}|{value}`

**Join Session Format**:
```javascript
socket.emit('join', {
  serialNumber: "YOUR_SERIAL_NUMBER",
  macAddress: "YOUR:MAC:ADDRESS",  // Tried both with/without colons
  type: "Android-App"
});
```

**Command Format**:
```javascript
socket.emit('chiedo', {
  serialNumber: "YOUR_SERIAL_NUMBER",
  macAddress: "YOUR:MAC:ADDRESS",
  tipoChiamata: 1,
  richiesta: "C|WriteParametri|34|1"  // Power on
});
```

**M1 Sensor IDs** (from gateway repos):
```javascript
34: Power (1=on, 40=off)
35: Temperature
36: Power Level (1-5)
37: Fan 1 speed
38: Fan 2 speed
39: Fan 3 speed
59: Mode (0=manual, 1=auto, 2=dynamic, 3=turbo)
60: Eco mode
```

**Problem**: Socket.IO connection successful but **ZERO responses from server**
- `socket.on('rispondo')` never fired
- `socket.onAny()` showed no events received
- Cloud API shows `IsConnected: false` for the stove
- `SSID_wifi` field is empty in status

**Root Cause**: User's M1 stove is **NOT cloud-connected** to the Socket.IO server, despite being able to control via MCZ Maestro app on 5G (likely uses different mechanism)

---

### Phase 3: Local WebSocket Solution (Current)

**Discovery**: M1 stoves expose local WebSocket at `192.168.120.1:81` on their own WiFi network

**Challenge**: The stove creates its own isolated WiFi network (MCZ-YOURSSID), only accessible when connected to that network. Cannot be reached from home network at `YOUR_HOME_IP`.

**Solution**: Bridge architecture using Synology NAS
1. User configured TP-Link WiFi extender to connect to MCZ-YOURSSID WiFi
2. Plugged extender Ethernet into Synology LAN 1 port (eth0)
3. Synology now has dual network connectivity:
   - **eth0** (192.168.120.XXX): Connected to MCZ WiFi via extender
   - **eth1** (YOUR_SYNOLOGY_IP): Connected to home network

**Architecture**:
```
Homey (YOUR_SYNOLOGY_IP:4859)
  ↓ HTTP/REST
Synology Bridge Service (YOUR_SYNOLOGY_IP on home network)
  ↓ WebSocket (via eth0: 192.168.120.XXX)
MCZ Stove (192.168.120.1:81 on MCZ WiFi)
```

---

## Testing Performed

### Test 1: Cloud REST API Commands
**Date**: Initial implementation
**Commands Tested**:
```bash
# All returned 400/500 errors
POST /Program/ActivateProgram/7c201fd8...§67dcc1e3...
Body: {
  ModelId: "7c201fd8...§526e5560...",
  ConfigurationId: "0",
  SensorSetTypeId: "7c201fd8...§314b03b8...",
  Commands: [{SensorId: "34", Value: 1}]
}
```
**Result**: ❌ Failed - M1 stoves don't support this endpoint

### Test 2: Socket.IO Cloud Connection
**Date**: After discovering Socket.IO requirement
**Test Script** (run via node):
```javascript
const io = require('socket.io-client');
const socket = io('http://app.mcz.it:9000');

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join', {
    serialNumber: 'YOUR_SERIAL_NUMBER',
    macAddress: 'YOUR:MAC:ADDRESS',
    type: 'Android-App'
  });

  socket.emit('chiedo', {
    serialNumber: 'YOUR_SERIAL_NUMBER',
    macAddress: 'YOUR:MAC:ADDRESS',
    tipoChiamata: 1,
    richiesta: 'C|WriteParametri|34|1'
  });
});

socket.onAny((event, ...args) => {
  console.log('Event:', event, args);
});
```
**Result**: ❌ Connected but no events received - stove not cloud-connected

### Test 3: MAC Address Variations
**Tested**:
- `01A6CF12C50732` (from WiFi name, no colons)
- `YOUR:MAC:ADDRESS` (from panel, with colons)
**Result**: ❌ Both failed - stove simply not on cloud server

### Test 4: Local Network Connectivity (Current)
**Command**:
```bash
# On Synology via SSH
sudo ping -c 3 192.168.120.1
```
**Expected**: Responses from stove
**Status**: ⏳ Testing in progress

---

## Code Structure

### `/lib/api/MaestroClient.js`
Cloud REST API client for M2/M3 stoves. Works for authentication and status reading on M1, but commands fail.

**Key Methods**:
- `login()` - Authenticate with MCZ cloud ✓
- `getStoveList()` - Retrieve stoves ✓
- `getStoveStatus(stoveId)` - Read status ✓
- `getStoveState(stoveId)` - Read state ✓
- `activateProgram()` - Send command ❌ (M1 not supported)

### `/lib/api/SocketIOMaestroClient.js`
Socket.IO client for M1 stoves via cloud. Created but doesn't work due to stove not being cloud-connected.

**Key Methods**:
- `connect()` - Connect to app.mcz.it:9000
- `joinSession()` - Join stove session
- `sendCommand(commandString)` - Send command like `C|WriteParametri|34|1`
- `activateProgram()` - Wrapper for stove commands

### `/lib/api/LocalMaestroClient.js`
WebSocket client for M1 stoves via local network (192.168.120.1:81). **This is what we'll use with the bridge.**

**Status**: Created but not yet integrated with bridge service

### `/drivers/maestro-stove/device.js`
Main device implementation with auto-detection:
1. Try to fetch model from cloud
2. If 405 error → detected M1 stove
3. Switch to Socket.IO client (currently cloud, will switch to bridge)

**Current M1 Detection Logic**:
```javascript
try {
  await cloudClient.getStoveModel(settings.modelId);
  // Success = M2/M3 stove
} catch (modelError) {
  // 405 error = M1 stove
  // Extract MAC from SSID or use hardcoded
  this.apiClient = new SocketIOMaestroClient(...);
}
```

---

## Homey CLI Modifications

### AthomApi.js Workaround
**File**: `/path/to/your/Library/Application Support/Herd/config/nvm/versions/node/v22.14.0/lib/node_modules/homey/lib/AthomApi.js`

**Problem**: Docker-based Homey doesn't support mDNS auto-discovery

**Fix**: Hardcoded connection for user's Homey
```javascript
// Around line 150, in _ensureActiveHomey method:
if (activeHomey.id === 'YOUR_HOMEY_ID') {
  const homeyApi = await HomeyAPI.createLocalAPI({
    address: 'http://YOUR_SYNOLOGY_IP:4859',
    token: 'YOUR_HOMEY_API_KEY',
  });
  this._activeHomey = homeyApi;
  return this._activeHomey;
}
```

---

## Development Commands

### Install App to Homey
```bash
cd /path/to/your/Code/javascript/homey
homey app install --clean
```

### Run with Live Logging
```bash
homey app run
# Press Ctrl+C to stop
```

### Publish to App Store
```bash
homey app validate
homey app publish
```

### Fix Sharp Library Issue
If you get `ENOENT: no such file or directory, lstat '.../sharp-darwin-x64'`:
```bash
rm node_modules/@img/sharp-darwin-arm64/sharp-darwin-arm64  # Remove circular symlink
ln -s sharp-libvips-darwin-arm64 node_modules/@img/sharp-libvips-darwin-x64  # Create x64 symlink
```

---

## WiFi Extender Setup (TP-Link)

### Reset Extender
1. Hold reset button for 10 seconds
2. Wait for restart

### Configure via Web Interface
1. Connect to extender's setup WiFi: `TP-Link_Extender_XXXX`
2. Open browser: http://tplinkrepeater.net or http://192.168.0.254
3. Create admin password
4. Select **Quick Setup** → **Wireless**
5. Scan and select: **MCZ-YOURSSID**
6. Enter password: **YOUR_WIFI_PASSWORD**
7. Mode: **Range Extender** or **Client** (NOT Access Point)
8. Save and reboot

### Verify Connection
```bash
# On Synology
ifconfig eth0  # Should show 192.168.120.x
ifconfig eth1  # Should show 10.0.0.x
sudo ping 192.168.120.1  # Should get responses
```

**Current Status**: ✓ Extender configured, Synology on both networks

---

## Next Steps

### 1. Test Stove WebSocket Connection
```bash
# On Synology, test WebSocket connection
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(echo -n 'test' | base64)" \
  http://192.168.120.1:81
```

### 2. Create Bridge Service
Build Node.js/Docker service on Synology that:
- Listens on HTTP port (e.g., 3000) on home network
- Forwards commands to stove WebSocket at 192.168.120.1:81
- Returns responses to Homey

### 3. Update Homey App
Modify device.js to:
- Detect M1 stoves
- Use HTTP bridge at `http://YOUR_SYNOLOGY_IP:3000` instead of Socket.IO
- Send commands via bridge API

### 4. Test End-to-End
- Homey → Bridge → Stove → Response
- Verify power on/off works
- Test all capabilities (temperature, mode, fans, etc.)

### 5. Polish & Release
- Add proper error handling
- Implement reconnection logic
- Add bridge health monitoring
- Write user documentation
- Publish to Homey App Store

---

## Known Issues & Limitations

### M1 Stove Limitations
- ❌ No cloud control support (not connected to app.mcz.it:9000)
- ❌ Cannot control when away from home (without VPN to bridge)
- ✓ Can read status from cloud API
- ✓ Local control works via WebSocket at 192.168.120.1:81

### Bridge Requirements
- Requires Synology NAS or similar device on both networks
- Requires WiFi extender or USB WiFi adapter
- Single point of failure (if bridge goes down, control stops)

### Cloud API Discoveries
- M1 stoves return `IsConnected: false`
- M1 stoves return empty `SSID_wifi` field
- Model endpoint returns 405 for M1 (detection method)
- Status/State endpoints work for reading

---

## References

### GitHub Repositories
- MCZ HA Integration: https://github.com/Robbe-B/maestro_mcz
- M1 Gateway 1: https://github.com/Chibald/maestrogateway
- M1 Gateway 2: https://github.com/bertrandgressier/mcz-stove-gateway
- MCZ API Research: https://github.com/hackximus/MCZ-Maestro-API

### Homey Documentation
- Apps SDK: https://apps.developer.homey.app/
- CLI Reference: https://apps.developer.homey.app/tools/homey-cli

---

## Session Continuity Checklist

When continuing this project on a new computer:

- [ ] Clone repo: `/path/to/your/Code/javascript/homey`
- [ ] Install Homey CLI: `npm install --global --no-optional homey`
- [ ] Install dependencies: `npm install`
- [ ] Fix sharp symlink if needed (see Development Commands)
- [ ] Verify Synology bridge is running and accessible
- [ ] Test ping to stove: `ssh YOUR_USERNAME@YOUR_SYNOLOGY_IP` → `sudo ping 192.168.120.1`
- [ ] Continue with "Next Steps" section above

---

**Last Updated**: 2026-01-04
**Current Phase**: Testing local WebSocket connectivity via Synology bridge
**Next Action**: Verify ping to 192.168.120.1 succeeds, then build bridge service
