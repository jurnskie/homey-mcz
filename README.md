# MCZ Maestro Homey App

Control your MCZ Maestro M1 pellet stove from Homey.

## ⚠️ Important: M1 Stoves Only

**This app currently only works with M1 generation MCZ stoves** (like ST.CUTE AIR 8 M1, EGO AIR M1, etc.)

M2 and M3 generation stoves are **not yet supported** but may work with cloud-only mode. If you have an M2/M3 stove and want to help test, please open an issue.

## Features

- Turn stove on/off
- Set target temperature (7-35°C)
- Control thermostat modes (Manual, Auto, Dynamic, Turbo)
- Adjust fan speeds (3 independent fans)
- Monitor current temperature, exhaust temperature, water temperature
- Enable/disable Eco mode
- Set manual power level
- Alarm monitoring

## Architecture

This app uses a **hybrid approach** for M1 stoves:
- **Commands**: Sent via local WebSocket through a bridge service (Synology NAS)
- **Status**: Read from MCZ cloud API
- **Why?**: M1 stoves don't support cloud commands, only local WebSocket control

```
Homey → Bridge (Synology) → Stove (local WiFi WebSocket)
Homey ← MCZ Cloud API ← Stove (internet)
```

## Prerequisites

### For M1 Stoves (Required)

1. **MCZ Maestro Account** (NOT Maestro+)
   - Download the old **MCZ Maestro** app (v1.11.4 or similar)
   - Create account with email/password
   - **Important**: Use the OLD "MCZ Maestro" app, NOT "MCZ Maestro+"

2. **Bridge Server** (Synology NAS or similar)
   - Needs to be on both your home network AND the stove's WiFi network
   - See [Bridge Setup Guide](bridge/README.md) for detailed instructions

3. **Network Setup**
   - WiFi extender or dual-network device to connect to stove's WiFi (MCZ-XXXXXX)
   - Stove creates its own WiFi network for local control

## Installation

### Step 1: Set Up the Bridge Service

**For M1 stoves, you MUST set up the bridge first.** See [bridge/README.md](bridge/README.md) for detailed setup instructions.

Quick summary:
1. Connect a WiFi extender to your Synology (or similar) to access stove's WiFi
2. Deploy the bridge Docker container on your Synology
3. Verify bridge is accessible at `http://YOUR_SYNOLOGY_IP:3000/health`

### Step 2: Install Homey App

1. Install this app on your Homey
2. Go to **Devices** → **Add Device** → **MCZ Maestro**
3. Enter your **MCZ Maestro** credentials (email and password from old MCZ app)
   - **Not Maestro+!** Use the old MCZ Maestro account
4. Select your stove from the list
5. Done! Your stove is now connected

The app will automatically detect it's an M1 stove and use the bridge for commands.

## Troubleshooting

### "Device Unavailable" after some time

This is usually a token expiration issue. The app now automatically refreshes tokens, but if you see this:
1. Go to Devices → Your stove → Settings
2. Remove and re-add the device

The app will re-login and get a fresh token.

### Login fails

- Make sure you're using the **old MCZ Maestro app credentials**, not Maestro+
- Verify you can log in to the MCZ Maestro mobile app (not Maestro+)
- Check your internet connection

### Stove not responding to commands

**For M1 stoves:**
1. Check if the bridge is running: `curl http://YOUR_SYNOLOGY_IP:3000/health`
2. Verify bridge can reach stove: Check bridge logs for "Connected to stove WebSocket"
3. Check WiFi extender is connected to stove's WiFi network

**For M2/M3 stoves (if testing):**
- Check if stove is online in the MCZ Maestro+ app
- Cloud commands should work directly

### Values not updating

- The app polls the MCZ cloud every 30 seconds for status
- After sending a command, there's a 3-second delay before the next update
- This is normal behavior to allow state changes to propagate

## Development

### Setup

```bash
npm install --global --no-optional homey
npm install
```

### Running

```bash
# Run the app on your Homey
homey app run

# Install to Homey
homey app install

# Validate app
homey app validate
```

## Technical Details

### M1 vs M2/M3 Stoves

**M1 Generation:**
- Uses old MCZ Maestro app (not Maestro+)
- Cloud API: Read-only (status/state)
- Control: Local WebSocket only (ws://192.168.120.1:81)
- Command format: `C|WriteParametri|{sensorId}|{value}`

**M2/M3 Generation:**
- Uses MCZ Maestro+ app
- Cloud API: Full control (read + write)
- REST API endpoints for commands

### API Endpoints

**Cloud API** (used for status reading):
- Base: `https://s.maestro.mcz.it/hlapi/v1.0/` and `https://s.maestro.mcz.it/mcz/v1.0/`
- `/Auth/SignIn` - Authentication
- `/Appliance/{id}/Status` - Get current status
- `/Appliance/{id}/State` - Get current state

**Local WebSocket** (M1 only, via bridge):
- `ws://192.168.120.1:81` - Stove local WebSocket
- Commands: `C|WriteParametri|{sensorId}|{value}`

### Sensor IDs (M1)

| Sensor | ID | Values |
|--------|-------|--------|
| Power | 34 | 1=on, 40=off |
| Temperature | 35 | degrees (e.g., 22) |
| Power Level | 36 | 1-5 |
| Fan 1 Speed | 37 | 0-5 |
| Fan 2 Speed | 38 | 0-5 |
| Fan 3 Speed | 39 | 0-5 |
| Mode | 59 | 0=manual, 1=auto, 2=dynamic, 3=turbo |
| Eco | 60 | 0=off, 1=on |

## Contributing

This is an open-source project. Contributions are welcome!

**Especially needed:**
- M2/M3 stove testing and support
- Better error handling
- UI improvements
- Documentation

## License

ISC

## Credits

- Based on the [Home Assistant MCZ Maestro integration](https://github.com/Robbe-B/maestro_mcz)
- M1 WebSocket protocol from [bertrandgressier/mcz-stove-gateway](https://github.com/bertrandgressier/mcz-stove-gateway)
- API research from [MCZ Maestro API project](https://github.com/hackximus/MCZ-Maestro-API)

## Disclaimer

This app is not affiliated with, endorsed by, or connected to MCZ Group S.p.A. Use at your own risk.
