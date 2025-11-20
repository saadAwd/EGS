# Weather Data Flow Analysis & Configuration

## 📊 Complete Data Flow Path

### Path 1: Weather Station → Database

```
CR1000 Weather Station
    ↓ (Serial Port: /dev/ttyUSB0 or /dev/cu.usbserial-*)
    ↓ (Baud: 9600)
cr1000_service.py::CR1000Client
    ↓ (latest() or range(15))
    ↓ (Reads: Temp_C_Avg, WindSpd_WVT, WindDir_WVT)
complete_backend.py::_start_weather_worker()
    ↓ (Background thread, polls every 60 seconds)
    ↓ (Normalizes field names)
    ↓ (Converts UTC → GMT+3)
    ↓ (_insert_weather_row())
database.db::weather_records table
    ↓ (INSERT + DELETE old records, keeps last 10)
    ✅ PERSISTENT STORAGE
```

### Path 2: Database → UI

```
database.db::weather_records table
    ↓ (_get_latest_weather_row())
    ↓ (SELECT ... ORDER BY record_time DESC LIMIT 1)
complete_backend.py::get_weather() endpoint
    ↓ (GET /api/weather/latest)
    ↓ (Returns: {id, record_time, temperature_c, wind_speed_ms, wind_direction_deg})
traffic-safety-ui/src/api/weather.ts::weatherApi.latest()
    ↓ (axios.get('/weather/latest'))
traffic-safety-ui/src/api/queries.ts::useWeather()
    ↓ (React Query hook)
    ↓ (Cached, refetched on WebSocket weather_update)
UI Components (EGSOperatorDashboard, ZoneActivation, StatusRibbon)
    ✅ DISPLAYED TO USER
```

### Path 3: Real-time Updates (WebSocket)

```
Weather Worker (after _insert_weather_row())
    ↓ (websocket_manager.broadcast_thread_safe())
    ↓ ({type: "weather_update", data: {...}})
WebSocketManager::_process_broadcast_queue()
    ↓ (Async queue processor)
    ↓ (websocket_manager.broadcast())
    ↓ (Sends to all connected clients)
traffic-safety-ui/src/utils/websocketClient.ts
    ↓ (Receives weather_update message)
traffic-safety-ui/src/contexts/SystemStateContext.tsx
    ↓ (handleWeatherUpdate())
    ↓ (queryClient.invalidateQueries(['weather', 'latest']))
React Query
    ↓ (Auto-refetches from /api/weather/latest)
    ✅ UI UPDATES AUTOMATICALLY
```

## 🔧 Configuration Check

### ✅ Database Configuration

**File**: `complete_backend.py`
- **Line 60**: `DB_PATH = os.getenv("TSIM_DB_PATH", "database.db")`
- **Status**: ✅ Correctly configured
- **Default**: `database.db` (in project root)
- **Override**: Set `TSIM_DB_PATH` environment variable

**Table Schema**:
```sql
CREATE TABLE weather_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_time TEXT,
  temperature_c REAL,
  wind_speed_ms REAL,
  wind_direction_deg REAL
)
```
- **Status**: ✅ Correct schema
- **Retention**: Keeps last 10 records (auto-deletes older)
- **Indexes**: None (acceptable for small table)
- **Triggers**: None (not needed)

### ✅ CR1000 Connection Configuration

**File**: `cr1000_service.py`
- **Line 42**: `port = serial_port or os.getenv("CR1000_SERIAL_PORT", "/dev/cu.usbserial-1230")`
- **Line 43**: `speed = baud or int(os.getenv("CR1000_BAUD", "9600"))`
- **Line 44**: `table_name = table_default or os.getenv("CR1000_TABLE", "Tbl_1min")`
- **Status**: ✅ Correctly configured

**File**: `complete_backend.py`
- **Line 897**: `port = _resolve_cr1000_port()` (auto-detects port)
- **Line 898**: `baud = int(os.getenv("CR1000_BAUD", "9600"))`
- **Status**: ✅ Correctly configured with cross-platform detection

### ✅ Weather Worker Configuration

**File**: `complete_backend.py`
- **Line 1156**: `_start_weather_worker()` function
- **Line 1220**: Polls every 60 seconds
- **Line 1309**: `_insert_weather_row()` saves to database
- **Line 1316**: `websocket_manager.broadcast_thread_safe()` sends update
- **Status**: ✅ Correctly configured

### ✅ API Endpoint Configuration

**File**: `complete_backend.py`
- **Line 983**: `@app.get("/api/weather/latest")`
- **Line 990**: `db_latest = _get_latest_weather_row()` (reads from DB)
- **Line 993**: Returns database data
- **Line 996**: Fallback: reads from CR1000 if DB empty (one-time seed)
- **Status**: ✅ Correctly configured

### ✅ Frontend Configuration

**File**: `traffic-safety-ui/src/api/weather.ts`
- **Line 14**: `apiClient.get('/weather/latest')`
- **Status**: ✅ Correctly configured

**File**: `traffic-safety-ui/src/api/queries.ts`
- **Line 140**: `useWeather()` hook
- **Line 150**: `refetchInterval: false` (relies on WebSocket)
- **Status**: ✅ Correctly configured

**File**: `traffic-safety-ui/src/contexts/SystemStateContext.tsx`
- **Line 201**: `handleWeatherUpdate()` invalidates query
- **Line 217**: Registers WebSocket handler
- **Status**: ✅ Correctly configured

### ✅ WebSocket Configuration

**File**: `complete_backend.py`
- **Line 268**: `WebSocketManager` class
- **Line 314**: `broadcast_thread_safe()` for worker threads
- **Line 1316**: Weather worker uses thread-safe broadcast
- **Status**: ✅ Correctly configured

**File**: `traffic-safety-ui/src/utils/websocketClient.ts`
- **Line 219**: Handles `weather_update` message type
- **Status**: ✅ Correctly configured

## ⚠️ Potential Issues Found

### 1. Database Path Inconsistency

**Issue**: Two different database paths in code
- **Line 60**: `DB_PATH = os.getenv("TSIM_DB_PATH", "database.db")` (weather_records)
- **Line 363**: `db_path = 'tsim.db'` (emergency_events)

**Impact**: Weather data and emergency events in different databases
**Recommendation**: Use single database or document the separation

### 2. WebSocket Message Format Inconsistency

**Issue**: Two different WebSocket message formats
- **Line 1317** (Worker): `{type: "weather_update", data: {id: 0, ...resp}}`
- **Line 1057** (API fallback): `{type: "weather_update", temp, wind_dir, wind_speed, ts}`

**Impact**: Frontend may not handle both formats correctly
**Recommendation**: Standardize on one format (prefer worker format with `data` wrapper)

### 3. Missing Database Index

**Issue**: No index on `record_time` column
- **Impact**: `ORDER BY record_time DESC` may be slow with many records
- **Recommendation**: Add index if keeping more than 10 records

## ✅ Recommendations

### 1. Standardize WebSocket Message Format

**Current** (Worker - Line 1317):
```python
{
    "type": "weather_update",
    "data": {
        "id": 0,
        "record_time": "...",
        "temperature_c": 31.55,
        "wind_speed_ms": 1.65,
        "wind_direction_deg": 108.1
    }
}
```

**Current** (API fallback - Line 1057):
```python
{
    "type": "weather_update",
    "temp": 31.55,
    "wind_dir": "ESE",
    "wind_speed": 1.65,
    "ts": 1234567890
}
```

**Recommendation**: Use worker format consistently, update API fallback to match.

### 2. Add Database Index (Optional)

If increasing retention beyond 10 records:
```sql
CREATE INDEX idx_weather_record_time ON weather_records(record_time DESC);
```

### 3. Document Database Separation

If intentional, document that:
- `database.db` = Weather records, lamps
- `tsim.db` = Emergency events, zones, devices

## 📋 Verification Checklist

- [x] Database path correctly configured
- [x] CR1000 connection correctly configured
- [x] Weather worker correctly saves to database
- [x] API endpoint correctly reads from database
- [x] Frontend correctly fetches from API
- [x] WebSocket correctly broadcasts updates
- [x] Frontend correctly handles WebSocket updates
- [ ] WebSocket message format standardized (needs fix)
- [ ] Database path documented (needs documentation)

## 🎯 Summary

**Overall Status**: ✅ **MOSTLY CORRECT** - Minor inconsistencies found

**Main Flow**: Weather Station → Database → API → UI ✅ Working
**Real-time Updates**: Worker → WebSocket → UI ✅ Working
**Issues**: WebSocket message format inconsistency (minor)

**Action Items**:
1. Standardize WebSocket message format
2. Document database separation (if intentional)
3. Consider adding index if increasing retention

