# MCZ Maestro Homey App

Control your MCZ Maestro pellet stove from Homey.

## Features

- Turn stove on/off
- Set target temperature (7-35°C)
- Control thermostat modes (Manual, Auto, Dynamic, Turbo)
- Adjust fan speeds (3 independent fans)
- Monitor current temperature, exhaust temperature, water temperature
- Enable/disable Eco mode
- Set manual power level
- Alarm monitoring

## Setup

### Prerequisites

1. You need a MCZ pellet stove with Maestro+ technology
2. Your stove must be connected to the MCZ cloud service
3. You need to create a MCZ Maestro+ account (via the mobile app)

### Installation

1. Install this app on your Homey
2. Go to Devices → Add Device → MCZ Maestro
3. Enter your MCZ Maestro+ credentials (email and password)
4. Select your stove from the list
5. Done! Your stove is now connected

## Development

### Setup

```bash
npm install --global --no-optional homey
npm install
```

### Testing with Mock API

For development without a physical stove, you can enable the mock API:

1. Open the app settings in Homey
2. Enable "Use Mock API"
3. The app will now use simulated data instead of connecting to the real MCZ cloud

### Running

```bash
# Run the app on your Homey
homey app run

# Build for production
homey app build

# Validate app
homey app validate
```

## API Implementation Notes

This app communicates with the MCZ cloud API at `https://s.maestro.mcz.it/hlapi/v1.0/`. The API endpoints were reverse-engineered from the Home Assistant integration and the MCZ Maestro+ mobile app.

### Known Endpoints

- `/Auth/SignIn` - Authentication
- `/Nav/FirstVisibleObjectsPaginated` - Get stove list
- `/Stove/Model` - Get stove configuration
- `/Stove/Status` - Get current status
- `/Stove/State` - Get current state
- `/Program/Activate` - Send commands
- `/Stove/Ping` - Keepalive

**Note**: Some endpoints may need adjustment based on actual API responses. If you encounter issues, please enable debug logging and check the logs.

## Troubleshooting

### Login fails

- Make sure you can log in to the MCZ Maestro+ mobile app with the same credentials
- Check that your stove is online and connected to the cloud
- Verify your internet connection

### Stove not responding

- Check if the stove is online in the MCZ Maestro+ app
- Try turning the stove off and on again
- Check the Homey app logs for errors

### Values not updating

- The app polls the MCZ cloud every 30 seconds by default
- After sending a command, there's a 3-second delay before the next update
- This is normal behavior to allow the cloud to sync with the stove

## Contributing

This is an open-source project. Contributions are welcome!

## License

ISC

## Credits

- Based on the [Home Assistant MCZ Maestro integration](https://github.com/Robbe-B/maestro_mcz)
- Inspired by the [MCZ Maestro API project](https://github.com/hackximus/MCZ-Maestro-API)

## Disclaimer

This app is not affiliated with, endorsed by, or connected to MCZ Group S.p.A. Use at your own risk.
