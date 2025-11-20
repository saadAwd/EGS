# Clear All Active Zones

## Overview
This document explains how to clear all active zones from the system to ensure a clean state.

## What Gets Cleared

1. **Sync State** (in-memory)
   - `isActivated` → `False`
   - `zoneName` → `None`
   - `windDirection` → `None`
   - `activationTime` → `None`

2. **Database Emergency Events**
   - All events with `status='active'` → `status='cleared'`
   - Sets `clear_time` and `duration_minutes`

3. **Gateway Service**
   - Unregisters active zone
   - Clears command queue

4. **WebSocket Broadcast**
   - Sends `zone_state: cleared` to all connected clients

## Methods to Clear Active Zones

### Method 1: Automatic on Startup (Recommended)
The backend **automatically clears all active zones on startup**. Simply restart the backend:

```bash
./scripts/stop_production.sh
./scripts/start_production.sh
```

**What happens:**
- Sync state is cleared
- All active emergency events in database are marked as cleared
- Gateway service active zone is unregistered
- System starts in clean state

### Method 2: API Endpoint
If backend is running, call the cleanup endpoint:

```bash
curl -X POST http://localhost:8002/api/system/clear-all-active-zones
```

Or from browser/Postman:
- **URL**: `http://YOUR_IP:8002/api/system/clear-all-active-zones`
- **Method**: `POST`
- **Response**: JSON with cleanup results

**Response Example:**
```json
{
  "success": true,
  "message": "All active zones cleared",
  "cleared_zones": ["Zone A E-W"],
  "cleared_events": 2,
  "sync_state_cleared": true,
  "gateway_cleared": true
}
```

### Method 3: Database Script
Run the Python script directly:

```bash
python3 scripts/clear_active_zones.py
```

**Note**: This only clears the database. In-memory state (sync_state, gateway service) will be cleared on backend restart.

## When to Use

### Use Automatic Startup Clear (Method 1) When:
- ✅ Starting fresh
- ✅ System was left in unknown state
- ✅ Need complete cleanup
- ✅ **Recommended for production**

### Use API Endpoint (Method 2) When:
- ✅ Backend is running
- ✅ Need to clear without restarting
- ✅ Want immediate cleanup
- ✅ Testing/debugging

### Use Database Script (Method 3) When:
- ✅ Backend is not running
- ✅ Only need to clear database
- ✅ Manual database cleanup

## Verification

### Check Sync State
```bash
curl http://localhost:8002/api/sync/state
```

Should return:
```json
{
  "isActivated": false,
  "zoneName": null,
  "windDirection": null,
  "activationTime": null,
  "deactivationInProgress": false
}
```

### Check Active Events
```bash
curl http://localhost:8002/api/emergency-events/?status=active
```

Should return empty array `[]` or no active events.

### Check Backend Logs
```bash
tail -f logs/backend_error.log | grep -i "clear\|startup"
```

Should see:
```
✅ TSIM: Startup complete - all active zones cleared, system is clean
```

## Troubleshooting

### Active Zones Still Showing
1. **Restart backend** - ensures in-memory state is cleared
2. **Check database** - verify emergency_events table
3. **Check logs** - look for errors during cleanup
4. **Call API endpoint** - force immediate cleanup

### Database Errors
- If `emergency_events` table doesn't exist, it will be created on first activation
- This is normal for fresh installations
- Script handles this gracefully

### Gateway Service Not Clearing
- Gateway service state is in-memory
- Restart backend to clear it
- Or call API endpoint while backend is running

## Best Practices

1. **Always restart backend after manual database changes**
2. **Use startup cleanup for production** (automatic)
3. **Use API endpoint for runtime cleanup** (without restart)
4. **Verify cleanup** by checking sync state and events
5. **Monitor logs** to ensure cleanup completed successfully

## Related Files

- `complete_backend.py` - Startup cleanup and API endpoint
- `scripts/clear_active_zones.py` - Database cleanup script
- `scripts/start_production.sh` - Automatic cleanup on startup

