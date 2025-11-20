# Diagnostic Guide: WebSocket & Auto-Activation Issues

## Issues Fixed

### 1. WebSocket Connection URL
**Problem**: WebSocket was connecting to `ws://localhost:8002/ws` even when server is at `192.168.4.9:8002`

**Fix Applied**:
- Updated `WebSocketContext.tsx` to use same hostname logic as API client
- Fixed reconnection to use stored URL instead of defaulting to localhost
- WebSocket now correctly connects to `ws://192.168.4.9:8002/ws` on local network

### 2. Auto-Activation Prevention
**Problem**: Devices activating without user clicking buttons

**Fixes Applied**:
- Removed localStorage persistence that could load old activation state
- Added logging to track WebSocket messages (UI updates only, no activation)
- WebSocket messages now only update UI display, never trigger API calls
- All activation must go through explicit user button clicks

## How to Verify Fixes

### 1. Check WebSocket Connection
Open browser DevTools Console and look for:
```
✅ Connecting to WebSocket: ws://192.168.4.9:8002/ws
✅ WebSocket connected to emergency portal
```

If you see `ws://localhost:8002/ws`, the fix didn't apply - clear browser cache.

### 2. Check for Auto-Activation
Monitor console logs:
- `📡 [WebSocket] Syncing emergency state (UI update only, no activation)` - This is normal, just UI sync
- `✅ [WebSocket] UI state updated (display only)` - Normal, no activation triggered
- If you see `Starting activation process...` without clicking a button, that's a problem

### 3. Backend Logs
Check backend logs for:
- `Sync state updated: Zone X activated` - Should only appear when API endpoint is called
- `WebSocket client connected` - Shows how many clients are connected
- `Broadcast WebSocket message: zone_state` - Shows when state is broadcast

## Troubleshooting Auto-Activation

### Possible Causes:
1. **Multiple Browser Tabs**: If you have multiple tabs open, one tab activating will broadcast to all tabs
   - **Solution**: Close all tabs, open only one

2. **Backend Has Old State**: Backend sync state might have old activation
   - **Check**: `GET http://192.168.4.9:8002/api/sync/state`
   - **Fix**: Call deactivate endpoint to clear state

3. **Another Client Connected**: Another device/tablet might be activating zones
   - **Check**: Backend logs show "WebSocket client connected" - count the connections
   - **Solution**: Ensure only authorized devices are connected

4. **Backend Auto-Activation Logic**: Check if backend has any scheduled/automatic activation
   - **Check**: Search backend code for `activate` calls outside of API endpoints
   - **Solution**: Remove any automatic activation logic

### Diagnostic Commands

```bash
# Check backend sync state
curl http://192.168.4.9:8002/api/sync/state

# Check active emergency events
curl http://192.168.4.9:8002/api/emergency-events/

# Check backend logs (if running with systemd)
journalctl -u tsim-backend -f

# Or if running manually, check terminal output
```

## Next Steps

1. **Clear Browser Cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. **Restart Backend**: Ensure backend is running and WebSocket endpoint is active
3. **Monitor Console**: Watch for WebSocket connection and any activation logs
4. **Test Activation**: Click "Activate Emergency" button and verify it works correctly
5. **Check Backend Logs**: Verify backend receives activation request and processes it

## Expert Recommendations

1. **Add User Confirmation**: Consider adding a confirmation dialog before activation
2. **Add Audit Logging**: Log all activations with user ID, timestamp, and source
3. **Rate Limiting**: Add rate limiting to prevent rapid activations
4. **State Validation**: Validate backend state on startup and clear if invalid
5. **Connection Monitoring**: Add UI indicator showing number of connected clients

