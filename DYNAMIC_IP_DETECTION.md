# Dynamic IP Detection System

## Problem
The server IP address changes dynamically, so hardcoding IP addresses (like `192.168.4.9`) doesn't work. The frontend needs to automatically detect the backend's current IP address and WebSocket URL.

## Solution
Implemented a **dynamic IP detection system** that:
1. Backend detects its own IP address on startup
2. Backend provides configuration endpoint (`/api/config`) with current URLs
3. Frontend fetches this configuration on startup
4. Frontend uses the detected URLs for all API and WebSocket connections

## Implementation

### Backend Changes

#### New Endpoint: `/api/config`
```python
@app.get("/api/config")
async def get_backend_config(request: Request):
    """Get backend configuration including WebSocket URL"""
```

**Features:**
- Detects actual network IP address (not just localhost)
- Returns both API URL and WebSocket URL
- Handles dynamic IP changes
- Falls back to defaults if detection fails

**Response:**
```json
{
  "api_url": "http://192.168.4.9:8002/api",
  "ws_url": "ws://192.168.4.9:8002/ws",
  "host": "192.168.4.9",
  "port": 8002,
  "protocol": "http"
}
```

### Frontend Changes

#### New Utility: `backendConfig.ts`
- Centralized backend URL detection
- Fetches config from backend on startup
- Caches configuration for performance
- Falls back to `window.location.hostname` if backend unavailable

#### Updated Components
1. **WebSocketContext**: Fetches WebSocket URL from backend config
2. **api/client.ts**: Uses shared `getBackendUrl()` utility
3. **SystemStateContext**: Uses shared backend URL utility

## How It Works

### Startup Flow
1. Frontend loads
2. `WebSocketProvider` calls `getBackendConfig()`
3. `getBackendConfig()` tries to fetch `/api/config` from backend
4. Backend detects its IP and returns URLs
5. Frontend caches URLs and uses them for connections
6. If fetch fails, falls back to `window.location.hostname`

### IP Detection Method
Backend uses socket connection to detect actual network IP:
```python
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect(("8.8.8.8", 80))  # Google DNS
host = s.getsockname()[0]  # Gets actual network IP
```

This works even when:
- Server has multiple network interfaces
- IP address changes (DHCP)
- Running behind NAT

## Benefits

1. **Automatic**: No manual configuration needed
2. **Dynamic**: Handles IP changes automatically
3. **Resilient**: Falls back to defaults if detection fails
4. **Centralized**: Single source of truth for backend URLs
5. **Cached**: Configuration fetched once and reused

## Testing

### Verify Dynamic Detection
1. Start backend: `./scripts/start_production.sh`
2. Check backend logs for: `📡 Config endpoint: API=..., WS=...`
3. Open frontend in browser
4. Check browser console for: `✅ Backend config fetched, WebSocket URL: ws://...`
5. Verify WebSocket connects successfully

### Test IP Change
1. Change server network (e.g., connect to different WiFi)
2. Restart backend
3. Frontend should automatically detect new IP on next page load
4. No manual configuration needed

## Environment Variables (Optional Override)

If you need to override the auto-detection:

```bash
# Frontend (.env)
VITE_API_BASE_URL=http://192.168.1.100:8002/api
VITE_WS_URL=ws://192.168.1.100:8002/ws

# Backend
TSIM_BACKEND_PORT=8002
```

## Troubleshooting

### WebSocket Still Connecting to Wrong IP
1. Clear browser cache
2. Check browser console for config fetch
3. Verify backend `/api/config` endpoint returns correct IP
4. Check backend logs for IP detection

### Backend Can't Detect IP
- Check network connectivity
- Verify server has network interface
- Check firewall settings
- Backend will fall back to request hostname

### Frontend Can't Fetch Config
- Verify backend is running
- Check CORS settings
- Frontend will fall back to `window.location.hostname`
- This should work if frontend and backend are on same machine

## Future Improvements

1. **Periodic Refresh**: Re-fetch config periodically to handle IP changes
2. **Multiple Backends**: Support for multiple backend instances
3. **Service Discovery**: Use mDNS/Bonjour for automatic discovery
4. **Health Checks**: Validate backend URL before using it

