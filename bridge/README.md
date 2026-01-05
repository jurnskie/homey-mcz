# MCZ Bridge Service

Bridge service that connects Homey to MCZ M1 stove via WebSocket.

## Architecture

```
Homey (YOUR_SYNOLOGY_IP)
  ↓ HTTP REST
MCZ Bridge (YOUR_SYNOLOGY_IP:3000)
  ↓ WebSocket
MCZ Stove (192.168.120.1:81)
```

## Prerequisites

1. Synology NAS with Docker installed
2. Synology connected to both networks:
   - Home network (eth1): 10.0.0.x
   - MCZ WiFi network (eth0): 192.168.120.x (via WiFi extender)
3. Stove reachable at 192.168.120.1

## Deployment on Synology

### Option 1: Using Docker Compose (Recommended)

1. **Copy bridge folder to Synology**:
   ```bash
   # On your Mac
   scp -r /path/to/homey/bridge YOUR_USERNAME@YOUR_SYNOLOGY_IP:/volume1/docker/mcz-bridge
   ```

2. **SSH into Synology**:
   ```bash
   ssh YOUR_USERNAME@YOUR_SYNOLOGY_IP
   ```

3. **Navigate to the bridge directory**:
   ```bash
   cd /volume1/docker/mcz-bridge
   ```

4. **Build and start the service**:
   ```bash
   sudo docker-compose up -d --build
   ```

5. **Check logs**:
   ```bash
   sudo docker-compose logs -f
   ```

6. **Test the service**:
   ```bash
   curl http://YOUR_SYNOLOGY_IP:3000/health
   ```

### Option 2: Using Synology Docker UI

1. Open **Synology Docker** package
2. Go to **Image** → **Add** → **Add from File**
3. Upload the `Dockerfile` or build manually
4. Create a container with:
   - **Network**: Use host network
   - **Auto-restart**: Yes
   - **Port**: 3000 (already exposed in host mode)

## API Endpoints

### Health Check
```bash
GET http://YOUR_SYNOLOGY_IP:3000/health
```

Response:
```json
{
  "status": "ok",
  "stoveConnected": true,
  "timestamp": "2026-01-04T19:45:00.000Z"
}
```

### Send Command
```bash
POST http://YOUR_SYNOLOGY_IP:3000/command
Content-Type: application/json

{
  "command": "C|WriteParametri|34|1"
}
```

Response:
```json
{
  "success": true,
  "command": "C|WriteParametri|34|1",
  "timestamp": "2026-01-04T19:45:00.000Z"
}
```

### Get Status
```bash
GET http://YOUR_SYNOLOGY_IP:3000/status
```

## Command Examples

### Power On
```bash
curl -X POST http://YOUR_SYNOLOGY_IP:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "C|WriteParametri|34|1"}'
```

### Power Off
```bash
curl -X POST http://YOUR_SYNOLOGY_IP:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "C|WriteParametri|34|40"}'
```

### Set Temperature (e.g., 22°C)
```bash
curl -X POST http://YOUR_SYNOLOGY_IP:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "C|WriteParametri|35|22"}'
```

### Set Fan 1 Speed (0-5)
```bash
curl -X POST http://YOUR_SYNOLOGY_IP:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "C|WriteParametri|37|3"}'
```

## M1 Sensor IDs

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

## Troubleshooting

### Bridge won't start
```bash
# Check Docker logs
sudo docker-compose logs

# Check if port 3000 is available
sudo netstat -tulpn | grep 3000

# Restart the service
sudo docker-compose restart
```

### Cannot connect to stove
```bash
# Verify network connectivity
ping 192.168.120.1

# Check if using correct interface
ifconfig eth0  # Should show 192.168.120.x

# Test WebSocket manually
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://192.168.120.1:81
```

### Bridge unreachable from Homey
```bash
# Check firewall on Synology
sudo iptables -L -n | grep 3000

# Test from Homey server
curl http://YOUR_SYNOLOGY_IP:3000/health
```

## Maintenance

### View logs
```bash
sudo docker-compose logs -f
```

### Restart service
```bash
sudo docker-compose restart
```

### Stop service
```bash
sudo docker-compose down
```

### Update service
```bash
sudo docker-compose down
sudo docker-compose up -d --build
```

## Notes

- The bridge uses `network_mode: host` to access both eth0 (MCZ network) and eth1 (home network)
- Auto-reconnects to stove if connection drops
- Commands are fire-and-forget (M1 stoves don't send ACK)
- Logs are rotated automatically (max 10MB, 3 files)
