const { HomeyAPI } = require('homey-api');

async function installApp() {
  try {
    // Connect to Homey using API key and local IP
    const api = new HomeyAPI({
      address: 'YOUR_SYNOLOGY_IP:4859',
      token: 'YOUR_HOMEY_API_KEY'
    });

    console.log('Connecting to Homey...');

    // Get apps manager
    const apps = await api.apps.getApps();
    console.log('Currently installed apps:', Object.keys(apps).join(', '));

    // Check available methods
    console.log('\nAvailable methods on api.apps:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(api.apps))
      .filter(m => !m.startsWith('_') && typeof api.apps[m] === 'function');
    console.log(methods.join('\n'));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

installApp();
