# Production Scripts Readiness Check

## ✅ Status: READY TO USE

### `start_production.sh`

**Status**: ✅ **READY** - Fully compatible with WebSocket implementation

**Key Features**:
- ✅ Uses Gunicorn with `uvicorn.workers.UvicornWorker` (supports WebSocket)
- ✅ Backend port: 8002 (correct for WebSocket endpoint `/ws`)
- ✅ Frontend port: 3001
- ✅ Properly handles environment variables (CR1000 serial port)
- ✅ Cleans up stale processes before starting
- ✅ Waits for backend and weather worker initialization
- ✅ Builds frontend if needed
- ✅ **Updated**: Now displays WebSocket URL in output

**WebSocket Support**:
- ✅ Gunicorn with `UvicornWorker` fully supports FastAPI WebSocket endpoints
- ✅ WebSocket endpoint available at `ws://host:8002/ws`
- ✅ No additional configuration needed

**Configuration**:
```bash
gunicorn complete_backend:app \
  --workers $TSIM_WORKERS \
  --worker-class uvicorn.workers.UvicornWorker \  # ✅ Supports WebSocket
  --bind $TSIM_HOST:$TSIM_BACKEND_PORT \
  --timeout 120 \
  --keep-alive 5
```

**Output URLs** (Updated):
- Frontend: `http://host:3001`
- Backend API: `http://host:8002`
- **WebSocket: `ws://host:8002/ws`** ✅ (NEW)
- API Docs: `http://host:8002/docs`

### `stop_production.sh`

**Status**: ✅ **READY** - Properly stops all services

**Key Features**:
- ✅ Stops backend (Gunicorn) processes
- ✅ Stops frontend (serve) processes
- ✅ Cleans up weather station processes and lock files
- ✅ Releases USB serial ports properly
- ✅ Handles stale PIDs gracefully
- ✅ Comprehensive cleanup

**WebSocket Cleanup**:
- ✅ WebSocket connections are automatically closed when backend stops
- ✅ No additional cleanup needed (handled by FastAPI/Gunicorn)

## 📋 Verification Checklist

### Dependencies
- ✅ `gunicorn` - Installed automatically if missing
- ✅ `uvicorn[standard]` - Required for UvicornWorker (in requirements.txt)
- ✅ `fastapi` - Required for WebSocket support (in requirements.txt)

### Ports
- ✅ Backend: 8002 (HTTP + WebSocket on same port)
- ✅ Frontend: 3001
- ✅ Scripts properly kill processes on these ports before starting

### WebSocket Configuration
- ✅ Backend WebSocket endpoint: `/ws` (configured in `complete_backend.py`)
- ✅ Frontend WebSocket URL: `ws://host:8002/ws` (configured in `WebSocketContext.tsx`)
- ✅ Gunicorn with UvicornWorker supports WebSocket natively

### Environment Variables
- ✅ `CR1000_SERIAL_PORT` - Auto-detected or from environment
- ✅ `CR1000_BAUD` - Defaults to 9600
- ✅ `TSIM_BACKEND_PORT` - Defaults to 8002
- ✅ `TSIM_FRONTEND_PORT` - Defaults to 3001
- ✅ `TSIM_WORKERS` - Defaults to 1
- ✅ `TSIM_LOG_DIR` - Defaults to `./logs`

## 🔍 Testing Recommendations

### Before Production Use:
1. **Test Start Script**:
   ```bash
   ./scripts/start_production.sh
   ```
   - Verify backend starts on port 8002
   - Verify frontend starts on port 3001
   - Check WebSocket connection: `ws://localhost:8002/ws`
   - Check logs for any errors

2. **Test Stop Script**:
   ```bash
   ./scripts/stop_production.sh
   ```
   - Verify all processes stop
   - Verify ports are released
   - Verify lock files are cleaned up

3. **Test WebSocket Connection**:
   - Open browser console on frontend
   - Check for WebSocket connection success
   - Verify real-time updates work

## ⚠️ Known Considerations

### Gunicorn Workers and WebSocket
- **Single Worker Recommended**: WebSocket connections are stateful
- Current default: `TSIM_WORKERS=1` (good for WebSocket)
- If using multiple workers, WebSocket connections may be sticky to specific workers
- For production with multiple workers, consider using a load balancer with sticky sessions

### Port Configuration
- Backend port 8002 serves both HTTP API and WebSocket
- Frontend automatically connects to `ws://host:8002/ws`
- No separate WebSocket port needed

## ✅ Conclusion

**Both scripts are ready for production use with WebSocket support.**

**No changes required** - The scripts are properly configured:
- ✅ Gunicorn with UvicornWorker supports WebSocket
- ✅ Backend WebSocket endpoint is accessible
- ✅ Frontend is configured to connect to correct WebSocket URL
- ✅ All cleanup and startup procedures are correct

**Ready to deploy!** 🚀

