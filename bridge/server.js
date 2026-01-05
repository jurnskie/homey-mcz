const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const STOVE_WS_URL = 'ws://192.168.120.1:81';
const PORT = 3000;

let stoveWs = null;
let reconnectInterval = null;

// WebSocket connection to stove
function connectToStove() {
  console.log('Connecting to stove at', STOVE_WS_URL);

  stoveWs = new WebSocket(STOVE_WS_URL);

  stoveWs.on('open', () => {
    console.log('Connected to stove WebSocket');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  });

  stoveWs.on('message', (data) => {
    console.log('Received from stove:', data.toString());
  });

  stoveWs.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  stoveWs.on('close', () => {
    console.log('Disconnected from stove, will retry in 5s...');
    stoveWs = null;

    if (!reconnectInterval) {
      reconnectInterval = setInterval(() => {
        connectToStove();
      }, 5000);
    }
  });
}

// Initialize connection
connectToStove();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    stoveConnected: stoveWs && stoveWs.readyState === WebSocket.OPEN,
    timestamp: new Date().toISOString()
  });
});

// Send command to stove
app.post('/command', (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  if (!stoveWs || stoveWs.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Not connected to stove' });
  }

  console.log('Sending command to stove:', command);

  try {
    // Send command to stove WebSocket
    stoveWs.send(command);

    // For M1 stoves, commands are fire-and-forget
    // We'll assume success if the send didn't throw
    res.json({
      success: true,
      command: command,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get stove status (query current state)
app.get('/status', (req, res) => {
  if (!stoveWs || stoveWs.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Not connected to stove' });
  }

  // Send status request
  const statusCommand = 'RecuperoInfo';
  console.log('Requesting status from stove');

  try {
    stoveWs.send(statusCommand);

    // For now, return success
    // TODO: Implement proper response handling with timeouts
    res.json({
      success: true,
      message: 'Status request sent'
    });
  } catch (error) {
    console.error('Error requesting status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCZ Bridge Server running on port ${PORT}`);
  console.log(`Health check: http://10.0.0.39:${PORT}/health`);
  console.log(`Send command: POST http://10.0.0.39:${PORT}/command`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  if (stoveWs) {
    stoveWs.close();
  }
  process.exit(0);
});
