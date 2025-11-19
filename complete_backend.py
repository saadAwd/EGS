#!/usr/bin/env python3
"""
Complete TSIM Backend with Emergency Events Tracking and ESP32 Gateway Integration
"""

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import sqlite3
import os
import uvicorn
import asyncio
import logging
import json

# GMT+3 timezone (UTC+3)
GMT3 = timezone(timedelta(hours=3))

# Configure logging - ensure messages go to stderr for Gunicorn to capture
import sys
log_dir = os.getenv('TSIM_LOG_DIR', './logs')
os.makedirs(log_dir, exist_ok=True)

# Create a file handler for direct file logging (backup)
from logging.handlers import RotatingFileHandler
file_handler = RotatingFileHandler(
    os.path.join(log_dir, 'backend.log'),
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)

logging.basicConfig(
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stderr), file_handler],
    force=True,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Helper function for guaranteed log visibility (both print and logger)
def log_always(msg):
    """Log message that will always appear in Gunicorn error log"""
    # Write directly to stderr (captured by Gunicorn) and also use logger
    # Use logger.error() to ensure it appears in Gunicorn error log
    print(msg, file=sys.stderr, flush=True)
    logger.error(msg)  # Use error level to ensure visibility in Gunicorn error log
    # Also write to file directly as backup
    try:
        with open(os.path.join(log_dir, 'backend_error.log'), 'a') as f:
            f.write(f"{msg}\n")
            f.flush()
    except Exception:
        pass  # Don't fail if file write fails

app = FastAPI(title="TSIM Backend API", version="1.0.0")
# --- Weather DB helpers ---
DB_PATH = os.getenv("TSIM_DB_PATH", "database.db")

def _ensure_weather_table() -> None:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              record_time TEXT,
              temperature_c REAL,
              wind_speed_ms REAL,
              wind_direction_deg REAL
            )
            """
        )
        conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _ensure_lamps_table() -> None:
    """Ensure lamps table exists for Traffic Light Management state persistence"""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS lamps (
              id INTEGER PRIMARY KEY,
              is_on INTEGER DEFAULT 0,
              last_updated TEXT,
              UNIQUE(id)
            )
            """
        )
        conn.commit()
        logger.debug("Lamps table ensured")
    except Exception as e:
        logger.error(f"Error ensuring lamps table: {e}")
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _update_lamp_state_in_db(lamp_id: int, is_on: bool) -> None:
    """Update lamp state in database for Traffic Light Management"""
    try:
        _ensure_lamps_table()
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO lamps (id, is_on, last_updated)
            VALUES (?, ?, ?)
            """,
            (lamp_id, 1 if is_on else 0, datetime.now(GMT3).isoformat())
        )
        conn.commit()
        logger.debug(f"Updated lamp {lamp_id} state to {is_on} in database")
    except Exception as e:
        logger.error(f"Error updating lamp {lamp_id} state in database: {e}")
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _get_lamp_state_from_db(lamp_id: int) -> bool:
    """Get lamp state from database for Traffic Light Management"""
    try:
        _ensure_lamps_table()
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        cur = conn.cursor()
        cur.execute("SELECT is_on FROM lamps WHERE id = ?", (lamp_id,))
        row = cur.fetchone()
        return bool(row[0]) if row else False
    except Exception as e:
        logger.error(f"Error getting lamp {lamp_id} state from database: {e}")
        return False
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _get_all_lamp_states_from_db() -> Dict[int, bool]:
    """Get all lamp states from database for Traffic Light Management"""
    try:
        _ensure_lamps_table()
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        cur = conn.cursor()
        cur.execute("SELECT id, is_on FROM lamps")
        rows = cur.fetchall()
        return {row[0]: bool(row[1]) for row in rows}
    except Exception as e:
        logger.error(f"Error getting all lamp states from database: {e}")
        return {}
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _to_gmt3(dt: datetime | None) -> datetime:
    """Convert datetime to GMT+3. If naive (no timezone), assume UTC."""
    if dt is None:
        return datetime.now(GMT3)
    if dt.tzinfo is None:
        # Assume UTC if no timezone info
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(GMT3)

def _insert_weather_row(record_time: str | None, t: float | None, ws: float | None, wd: float | None) -> None:
    # Ensure we always write a timestamp so UI shows last update time (GMT+3)
    try:
        if record_time:
            # Parse and convert to GMT+3
            try:
                dt = datetime.fromisoformat(record_time.replace('Z', '+00:00'))
                ts_iso = _to_gmt3(dt).isoformat()
            except Exception:
                ts_iso = datetime.now(GMT3).isoformat()
        else:
            ts_iso = datetime.now(GMT3).isoformat()
    except Exception:
        ts_iso = datetime.now(GMT3).isoformat()
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO weather_records(record_time, temperature_c, wind_speed_ms, wind_direction_deg) VALUES (?,?,?,?)",
            (ts_iso, t, ws, wd),
        )
        row_id = cur.lastrowid
        # Keep only latest 10
        cur.execute(
            "DELETE FROM weather_records WHERE id NOT IN (SELECT id FROM weather_records ORDER BY record_time DESC, id DESC LIMIT 10)"
        )
        deleted_count = cur.rowcount
        conn.commit()
        logger.debug(f"Weather DB: Inserted row id={row_id}, deleted {deleted_count} old rows")
    except Exception as e:
        logger.error(f"Weather DB insert error: {e}")
        raise
    finally:
        conn.close()

def _get_latest_weather_row() -> Dict[str, Optional[float | str]] | None:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT record_time, temperature_c, wind_speed_ms, wind_direction_deg FROM weather_records ORDER BY record_time DESC, id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "record_time": row[0],
            "temperature_c": row[1],
            "wind_speed_ms": row[2],
            "wind_direction_deg": row[3],
        }
    except Exception:
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass
# Shared singleton gateway service
try:
    from gateway_service import ESP32GatewayService
    log_always("TSIM: Initializing gateway service singleton")
    _GATEWAY_SERVICE = ESP32GatewayService(db=None)  # DB not required for mapping
    log_always("TSIM: Gateway service singleton initialized")
    logger.info("Initialized singleton ESP32GatewayService")
except Exception as e:
    log_always(f"TSIM: Failed to initialize gateway service singleton: {e}")
    logger.error(f"Failed to initialize gateway service singleton: {e}")
    _GATEWAY_SERVICE = None

def get_gateway_service():
    global _GATEWAY_SERVICE
    if _GATEWAY_SERVICE is None:
        from gateway_service import ESP32GatewayService
        _GATEWAY_SERVICE = ESP32GatewayService(db=None)
    return _GATEWAY_SERVICE

# HTTP Sync State (for concurrent UI updates across tablets/screens)
# Shared state across all clients
import threading
_sync_state = {
    "isActivated": False,
    "zoneName": None,
    "windDirection": None,
    "activationTime": None,
    "deactivationInProgress": False
}
_sync_lock = threading.RLock()  # Thread-safe access


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Database connection
def get_db_connection():
    """Get database connection"""
    db_path = 'tsim.db'
    if not os.path.exists(db_path):
        # Create a simple database if it doesn't exist
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create emergency_events table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS emergency_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone_name TEXT NOT NULL,
                wind_direction TEXT NOT NULL,
                activation_date TEXT NOT NULL,
                activation_time TEXT NOT NULL,
                clear_time TEXT,
                duration_minutes INTEGER,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
    
    return sqlite3.connect(db_path)

# Pydantic models
class EmergencyEvent(BaseModel):
    id: int
    zone_name: str
    wind_direction: str
    activation_date: str
    activation_time: str
    clear_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: str

class EmergencyEventCreate(BaseModel):
    zone_name: str
    wind_direction: str
    activation_date: str
    activation_time: str

# Basic endpoints
@app.get("/")
async def read_root():
    return {"message": "TSIM Backend API with Emergency Events", "status": "running"}

@app.get("/api/status")
async def get_status():
    return {"status": "running", "emergency": False}

@app.get("/api/health/weather")
async def get_weather_health():
    """Health endpoint for weather worker - returns last success timestamp"""
    try:
        # Get last successful weather record timestamp
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT record_time FROM weather_records 
            ORDER BY record_time DESC LIMIT 1
        ''')
        row = cursor.fetchone()
        conn.close()
        
        if row and row[0]:
            return {
                "status": "healthy",
                "last_success_ts": row[0],
                "cache": _WEATHER_CACHE
            }
        else:
            return {
                "status": "no_data",
                "last_success_ts": None,
                "cache": _WEATHER_CACHE
            }
    except Exception as e:
        logger.error(f"Weather health check error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "cache": _WEATHER_CACHE
        }

# Emergency Events endpoints
@app.get("/api/emergency-events/", response_model=List[EmergencyEvent])
async def get_emergency_events():
    """Get all emergency events"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, zone_name, wind_direction, activation_date, activation_time, 
                   clear_time, duration_minutes, status
            FROM emergency_events
            ORDER BY activation_date DESC, activation_time DESC
        ''')
        
        events = []
        for row in cursor.fetchall():
            events.append(EmergencyEvent(
                id=row[0],
                zone_name=row[1],
                wind_direction=row[2],
                activation_date=row[3],
                activation_time=row[4],
                clear_time=row[5],
                duration_minutes=row[6],
                status=row[7]
            ))
        
        conn.close()
        return events
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/emergency-events/", response_model=EmergencyEvent)
async def create_emergency_event(event: EmergencyEventCreate):
    """Create a new emergency event"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO emergency_events (zone_name, wind_direction, activation_date, activation_time, status)
            VALUES (?, ?, ?, ?, 'active')
        ''', (event.zone_name, event.wind_direction, event.activation_date, event.activation_time))
        
        event_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return EmergencyEvent(
            id=event_id,
            zone_name=event.zone_name,
            wind_direction=event.wind_direction,
            activation_date=event.activation_date,
            activation_time=event.activation_time,
            clear_time=None,
            duration_minutes=None,
            status='active'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/api/emergency-events/{event_id}/clear")
async def clear_emergency_event(event_id: int):
    """Clear an emergency event"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get current time
        now = datetime.now()
        clear_time = now.strftime("%H:%M:%S")
        clear_date = now.strftime("%Y-%m-%d")
        
        # Get the activation time to calculate duration
        cursor.execute('''
            SELECT activation_date, activation_time FROM emergency_events 
            WHERE id = ? AND status = 'active'
        ''', (event_id,))
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Active emergency event not found")
        
        activation_date, activation_time = row
        
        # Calculate duration in minutes
        try:
            activation_datetime = datetime.strptime(f"{activation_date} {activation_time}", "%Y-%m-%d %H:%M:%S")
            clear_datetime = datetime.strptime(f"{clear_date} {clear_time}", "%Y-%m-%d %H:%M:%S")
            duration = int((clear_datetime - activation_datetime).total_seconds() / 60)
        except ValueError:
            duration = None
        
        # Update the event
        cursor.execute('''
            UPDATE emergency_events 
            SET clear_time = ?, duration_minutes = ?, status = 'cleared', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (clear_time, duration, event_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Emergency event not found")
        
        conn.commit()
        conn.close()
        
        return {"message": "Emergency event cleared successfully", "duration_minutes": duration}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# New endpoint to create emergency event from system activation
@app.post("/api/emergency-events/activate")
async def create_emergency_from_activation(zone_name: str = Query(...), wind_direction: str = Query(...)):
    """Create emergency event when zone is activated and send gateway commands"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get current time
        now = datetime.now()
        activation_date = now.strftime("%Y-%m-%d")
        activation_time = now.strftime("%H:%M:%S")
        
        # First, clear any existing active events for this zone
        cursor.execute('''
            UPDATE emergency_events 
            SET clear_time = ?, duration_minutes = ?, status = 'cleared', updated_at = CURRENT_TIMESTAMP
            WHERE zone_name = ? AND status = 'active'
        ''', (activation_time, 0, zone_name))
        
        # Create new emergency event
        cursor.execute('''
            INSERT INTO emergency_events (zone_name, wind_direction, activation_date, activation_time, status)
            VALUES (?, ?, ?, ?, 'active')
        ''', (zone_name, wind_direction, activation_date, activation_time))
        
        event_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Send gateway commands for zone activation
        gateway_success = await send_zone_activation_commands(zone_name, wind_direction)
        
        # Update sync state for concurrent UI updates (tablets/screens)
        with _sync_lock:
            _sync_state["isActivated"] = True
            _sync_state["zoneName"] = zone_name
            _sync_state["windDirection"] = wind_direction
            _sync_state["activationTime"] = datetime.now().isoformat()
        logger.info(f"Sync state updated: Zone {zone_name} {wind_direction} activated")
        
        return {
            "message": "Emergency event created successfully",
            "event_id": event_id,
            "zone_name": zone_name,
            "wind_direction": wind_direction,
            "activation_date": activation_date,
            "activation_time": activation_time,
            "gateway_commands_sent": gateway_success
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# New endpoint to clear emergency event when system is deactivated
@app.post("/api/emergency-events/deactivate")
async def clear_emergency_from_deactivation():
    """Clear emergency event when system is deactivated with clean state management.
    
    CRITICAL FLOW:
    1. Clear sync state IMMEDIATELY (prevents UI reactivation)
    2. Clear command queue (remove pending commands)
    3. Clear database events
    4. Send zone deactivation commands (with ACK confirmation)
    """
    try:
        gateway_service = get_gateway_service()
        
        # CRITICAL: Clear sync state IMMEDIATELY (before any commands)
        # This prevents UI from showing reactivation
        with _sync_lock:
            _sync_state["isActivated"] = False
            _sync_state["zoneName"] = None
            _sync_state["windDirection"] = None
            _sync_state["activationTime"] = None
        logger.info("🚫 Sync state cleared IMMEDIATELY to prevent UI reactivation")
        
        # Clear command queue to remove any pending commands
        cleared = gateway_service.clear_command_queue()
        if cleared > 0:
            logger.info(f"🧹 Cleared {cleared} pending commands from queue")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get current time
        now = datetime.now()
        clear_time = now.strftime("%H:%M:%S")
        clear_date = now.strftime("%Y-%m-%d")
        
        # Find active emergency events
        cursor.execute('''
            SELECT id, zone_name, wind_direction, activation_date, activation_time FROM emergency_events 
            WHERE status = 'active'
        ''')
        
        active_events = cursor.fetchall()
        
        if not active_events:
            conn.close()
            return {"message": "No active emergency events found"}
        
        # Track deactivation results
        deactivated_zones = []
        
        # Clear all active events and send zone-specific OFF commands
        for event in active_events:
            event_id, zone_name, wind_direction, activation_date, activation_time = event
            
            # Calculate duration in minutes
            try:
                activation_datetime = datetime.strptime(f"{activation_date} {activation_time}", "%Y-%m-%d %H:%M:%S")
                clear_datetime = datetime.strptime(f"{clear_date} {clear_time}", "%Y-%m-%d %H:%M:%S")
                duration = int((clear_datetime - activation_datetime).total_seconds() / 60)
            except ValueError:
                duration = None
            
            # Update the event
            cursor.execute('''
                UPDATE emergency_events 
                SET clear_time = ?, duration_minutes = ?, status = 'cleared', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (clear_time, duration, event_id))
            
            # Send zone-specific deactivation commands (turn OFF only lamps that were ON for this zone)
            # This also unregisters the zone from assertion and clears queue
            zone_deactivate_success = await send_zone_deactivation_commands(zone_name, wind_direction)
            deactivated_zones.append({
                "zone": zone_name,
                "wind_direction": wind_direction,
                "success": zone_deactivate_success
            })
        
        conn.commit()
        conn.close()
        
        # Count successful deactivations
        gateway_success = any(z["success"] for z in deactivated_zones)
        
        logger.info(f"Emergency events deactivated: {len(active_events)} events cleared (sync state already cleared)")
        
        # Note: Zones are already unregistered in send_zone_deactivation_commands()
        # Note: Sync state already cleared at the start
        
        return {
            "message": f"Cleared {len(active_events)} emergency events successfully",
            "cleared_count": len(active_events),
            "gateway_commands_sent": gateway_success
        }
        
    except Exception as e:
        logger.error(f"Error in emergency deactivation: {str(e)}")
        # Still clear sync state on error
        with _sync_lock:
            _sync_state["isActivated"] = False
            _sync_state["zoneName"] = None
            _sync_state["windDirection"] = None
            _sync_state["activationTime"] = None
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Traffic Light Data Endpoints
@app.get("/api/poles/")
async def get_poles():
    """Get all traffic light poles"""
    # Mock data for now - in production this would come from database
    return [
        {"id": 1, "name": "Pole 1", "location": "Intersection A", "is_active": True},
        {"id": 2, "name": "Pole 2", "location": "Intersection B", "is_active": True},
        {"id": 3, "name": "Pole 3", "location": "Intersection C", "is_active": True},
        {"id": 4, "name": "Pole 4", "location": "Intersection D", "is_active": True},
        {"id": 5, "name": "Pole 5", "location": "Intersection E", "is_active": True},
        {"id": 6, "name": "Pole 6", "location": "Intersection F", "is_active": True},
        {"id": 7, "name": "Pole 7", "location": "Intersection G", "is_active": True},
        {"id": 8, "name": "Pole 8", "location": "Intersection H", "is_active": True},
        {"id": 9, "name": "Pole 9", "location": "Intersection I", "is_active": True},
        {"id": 10, "name": "Pole 10", "location": "Intersection J", "is_active": True},
        {"id": 11, "name": "Pole 11", "location": "Intersection K", "is_active": True},
        {"id": 12, "name": "Pole 12", "location": "Intersection L", "is_active": True},
        {"id": 13, "name": "Pole 13", "location": "Intersection M", "is_active": True},
        {"id": 14, "name": "Pole 14", "location": "Intersection N", "is_active": True}
    ]

@app.get("/api/lamps/")
async def get_lamps():
    """Get all traffic light lamps with state from database"""
    # Get all lamp states from database
    lamp_states = _get_all_lamp_states_from_db()
    
    # Generate lamp data for full system (14 devices × 9 lamps = 126 lamps)
    lamps = []
    lamp_id = 1
    
    for device in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']:
        for lamp_num in range(1, 10):  # 9 lamps per device
            # Correct side assignment: Side 1 (1,2,3), Side 2 (4,5,6), Side 3 (7,8,9)
            if lamp_num <= 3:
                side_number = 1
            elif lamp_num <= 6:
                side_number = 2
            else:
                side_number = 3
            
            # Get state from database (default to False if not found)
            is_on = lamp_states.get(lamp_id, False)
                
            lamps.append({
                "id": lamp_id,
                "gateway_id": f"L{lamp_id}",
                "pole_id": ((lamp_id - 1) // 9) + 1,  # Pole assignment
                "side_number": side_number,
                "lamp_number": lamp_num,
                "direction": ["straight", "left", "right"][(lamp_num - 1) % 3],
                "is_on": is_on,  # Read from database
                "gateway_switch_id": lamp_id,
                "gateway_command_on": "b" if lamp_num == 1 else "d" if lamp_num == 2 else "f" if lamp_num == 3 else "h" if lamp_num == 4 else "j" if lamp_num == 5 else "l" if lamp_num == 6 else "n" if lamp_num == 7 else "p" if lamp_num == 8 else "r",
                "gateway_command_off": "a" if lamp_num == 1 else "c" if lamp_num == 2 else "e" if lamp_num == 3 else "g" if lamp_num == 4 else "i" if lamp_num == 5 else "k" if lamp_num == 6 else "m" if lamp_num == 7 else "o" if lamp_num == 8 else "q"
            })
            lamp_id += 1
    
    return lamps

@app.get("/api/devices/")
async def get_devices():
    """Get all traffic light devices"""
    devices = []
    for i, device in enumerate(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'], 1):
        devices.append({
            "id": i,
            "name": f"TL{i}",
            "device_letter": device,
            "status": "active",
            "location": f"Intersection {device}"
        })
    return devices

@app.get("/api/zones/")
async def get_zones():
    """Get all zones"""
    return [
        {"id": 1, "name": "Zone A", "description": "Emergency Zone A"},
        {"id": 2, "name": "Zone B", "description": "Emergency Zone B"},
        {"id": 3, "name": "Zone C", "description": "Emergency Zone C"},
        {"id": 4, "name": "Zone D", "description": "Emergency Zone D"},
        {"id": 5, "name": "Zone E", "description": "Emergency Zone E"},
        {"id": 6, "name": "Zone F", "description": "Emergency Zone F"},
        {"id": 7, "name": "Zone G", "description": "Emergency Zone G"},
        {"id": 8, "name": "Zone H", "description": "Emergency Zone H"},
        {"id": 9, "name": "Zone K", "description": "Emergency Zone K"}
    ]

@app.get("/api/routes/")
async def get_routes():
    return []

"""
Weather Station (CR1000) integration
- Uses CR1000Client over serial when available
- Returns normalized keys used by the frontend: temperature_c, wind_speed_ms, wind_direction_deg, record_time
"""
try:
    from cr1000_service import CR1000Client  # Thin wrapper around pycampbellcr1000
    _CR1000_AVAILABLE = True
except Exception:
    CR1000Client = None  # type: ignore
    _CR1000_AVAILABLE = False

_CR1000_CLIENT = None
_CR1000_LOCK = threading.RLock()  # Serialize CR1000 access to prevent port conflicts
# Cache last good weather sample to avoid empty UI when a poll fails
_WEATHER_CACHE: Dict[str, Optional[float | str]] = {
    "temperature_c": None,
    "wind_speed_ms": None,
    "wind_direction_deg": None,
    "record_time": None,
}

def _resolve_cr1000_port():
    """Resolve CR1000 serial port with Linux autodetect"""
    # Use explicit port if set
    explicit_port = os.getenv("CR1000_SERIAL_PORT")
    if explicit_port:
        log_always(f"WEATHER: Using explicit port from CR1000_SERIAL_PORT: {explicit_port}")
        return explicit_port
    
    # Autodetect on Linux: try /dev/ttyUSB* and /dev/ttyACM*
    import glob
    import platform
    
    if platform.system() == "Linux":
        # Try ttyUSB first (most common)
        usb_ports = sorted(glob.glob("/dev/ttyUSB*"))
        if usb_ports:
            resolved = usb_ports[0]
            log_always(f"WEATHER: Autodetected port: {resolved} (from /dev/ttyUSB*)")
            return resolved
        
        # Try ttyACM as fallback
        acm_ports = sorted(glob.glob("/dev/ttyACM*"))
        if acm_ports:
            resolved = acm_ports[0]
            log_always(f"WEATHER: Autodetected port: {resolved} (from /dev/ttyACM*)")
            return resolved
    
    # Default fallback
    default_port = "/dev/ttyUSB0"
    log_always(f"WEATHER: Using default port: {default_port}")
    return default_port

def get_cr1000_client():
    """Get or create CR1000 client singleton"""
    global _CR1000_CLIENT
    if not _CR1000_AVAILABLE:
        return None
    if _CR1000_CLIENT is None:
        port = _resolve_cr1000_port()
        baud = int(os.getenv("CR1000_BAUD", "9600"))
        try:
            _CR1000_CLIENT = CR1000Client(port=port, baud=baud)
            log_always(f"WEATHER: Client initialized - {port} @ {baud}")
            logger.info(f"CR1000 client initialized: {port} @ {baud}")
        except Exception as e:
            log_always(f"WEATHER: Failed to initialize client - {e}")
            logger.error(f"Failed to initialize CR1000 client: {e}")
            return None
    return _CR1000_CLIENT

@app.get("/api/weather/latest")
async def get_weather():
    """Always return the latest row persisted in SQLite.

    If the table is empty, attempt a one-time live read to seed it.
    This guarantees the UI reads a consistent, DB-backed value.
    """
    db_latest = _get_latest_weather_row()
    if db_latest:
        _WEATHER_CACHE.update(db_latest)
        return {"id": 0, **_WEATHER_CACHE}

    # Table empty → try to seed from CR1000 once
    client = get_cr1000_client()
    if not client:
        return {"id": 0, "temperature_c": None, "wind_speed_ms": None, "wind_direction_deg": None, "record_time": None}
    try:
        # Serialize CR1000 access to prevent concurrent serial port conflicts
        def _fetch_with_lock():
            with _CR1000_LOCK:
                # Try quick latest; if empty, widen window and take last non-empty row
                rec = client.latest() or {}
                if rec:
                    return rec
                try:
                    rows = client.range(15)  # last 15 minutes
                    return rows[-1] if rows else {}
                except Exception:
                    return {}
        # Run blocking serial I/O off the event loop to avoid API timeouts
        latest = await asyncio.to_thread(_fetch_with_lock)
        # Map common CR1000 fields to normalized schema
        record_time_str = latest.get("Datetime")
        try:
            if record_time_str:
                # CR1000 returns UTC, convert to GMT+3
                record_time = datetime.fromisoformat(record_time_str.replace('Z', '+00:00'))
                record_time = _to_gmt3(record_time)
            else:
                record_time = None
        except Exception:
            record_time = None
        # Accept common alternate field names from different logger programs
        def pick(d, *keys):
            for k in keys:
                if k in d:
                    return d.get(k)
            return None
        temperature = pick(latest, "Temp_C_Avg", "Temp_C", "AirTemp_C", "TA_C")
        wind_speed = pick(latest, "WindSpd_WVT", "WS_mps", "WindSpeed_mps", "WS_ms")
        wind_dir = pick(latest, "WindDir_WVT", "WindDir_Deg", "WD_deg")
        resp = {
            "temperature_c": float(temperature) if temperature is not None else None,
            "wind_speed_ms": float(wind_speed) if wind_speed is not None else None,
            "wind_direction_deg": float(wind_dir) if wind_dir is not None else None,
            "record_time": record_time.isoformat() if record_time else None,
        }
        if any(v is not None for v in resp.values()):
            _insert_weather_row(resp.get("record_time"), resp.get("temperature_c"), resp.get("wind_speed_ms"), resp.get("wind_direction_deg"))
            _WEATHER_CACHE.update(resp)
        return {"id": 0, **_WEATHER_CACHE}
    except Exception as e:
        logger.warning(f"/api/weather/latest error: {e}")
        # On error, return nulls (DB is empty)
        return {"id": 0, "temperature_c": None, "wind_speed_ms": None, "wind_direction_deg": None, "record_time": None}

@app.get("/api/weather/recent")
async def get_weather_recent(limit: int = 10):
    """Return last N rows from SQLite (most recent first)."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT record_time, temperature_c, wind_speed_ms, wind_direction_deg FROM weather_records ORDER BY record_time DESC, id DESC LIMIT ?",
            (int(max(1, min(limit, 100))),),
        )
        rows = cur.fetchall() or []
        return [
            {
                "id": idx,
                "record_time": r[0],
                "temperature_c": r[1],
                "wind_speed_ms": r[2],
                "wind_direction_deg": r[3],
            }
            for idx, r in enumerate(rows)
        ]
    finally:
        try:
            conn.close()
        except Exception:
            pass

@app.post("/api/weather/poll-now")
async def weather_poll_now():
    """Force a live read from the CR1000 and persist one row, then return latest.

    Use this when you need a fresh sample immediately instead of waiting for
    the background worker/table interval. Returns the same schema as /latest.
    """
    client = get_cr1000_client()
    if not client:
        raise HTTPException(status_code=503, detail="CR1000 client not available")

    try:
        def _fetch_with_lock():
            with _CR1000_LOCK:
                rec = client.latest() or {}
                if not rec:
                    try:
                        rows = client.range(5)
                        rec = rows[-1] if rows else {}
                    except Exception:
                        rec = {}
                return rec

        latest = await asyncio.to_thread(_fetch_with_lock)
        record_time_str = latest.get("Datetime")
        try:
            if record_time_str:
                # CR1000 returns UTC, convert to GMT+3
                record_time = datetime.fromisoformat(record_time_str.replace('Z', '+00:00'))
                record_time = _to_gmt3(record_time)
            else:
                record_time = None
        except Exception:
            record_time = None

        def pick(d, *keys):
            for k in keys:
                if k in d:
                    return d.get(k)
            return None

        t = pick(latest, "Temp_C_Avg", "Temp_C", "AirTemp_C", "TA_C")
        ws = pick(latest, "WindSpd_WVT", "WS_mps", "WindSpeed_mps", "WS_ms")
        wd = pick(latest, "WindDir_WVT", "WindDir_Deg", "WD_deg")
        resp = {
            "record_time": record_time.isoformat() if record_time else None,
            "temperature_c": float(t) if t is not None else None,
            "wind_speed_ms": float(ws) if ws is not None else None,
            "wind_direction_deg": float(wd) if wd is not None else None,
        }
        if any(v is not None for v in resp.values()):
            _insert_weather_row(resp["record_time"], resp["temperature_c"], resp["wind_speed_ms"], resp["wind_direction_deg"])
        latest_db = _get_latest_weather_row() or resp
        _WEATHER_CACHE.update(latest_db)
        return {"id": 0, **_WEATHER_CACHE}
    except Exception as e:
        logger.warning(f"/api/weather/poll-now error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Background weather worker like previous stable flow
def _start_weather_worker() -> None:
    log_always("WEATHER: Startup - acquiring lock")
    if not _CR1000_AVAILABLE:
        log_always("WEATHER: CR1000 not available - weather worker not started")
        return
    
    # File lock to ensure single weather worker instance
    import fcntl
    lock_file_path = "/tmp/tsim_weather.lock"
    lock_file = None
    try:
        lock_file = open(lock_file_path, 'w')
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Write PID to lock file for debugging
        lock_file.write(str(os.getpid()))
        lock_file.flush()
        log_always(f"WEATHER: Lock acquired (PID {os.getpid()})")
    except (IOError, OSError) as e:
        # Lock already held by another process
        if lock_file:
            lock_file.close()
        try:
            with open(lock_file_path, 'r') as f:
                holder_pid = f.read().strip()
            log_always(f"WEATHER: Lock held by PID {holder_pid} - skipping worker start")
        except:
            log_always(f"WEATHER: Lock held by another process - skipping worker start")
        return

    def worker():
        import time
        import traceback
        log_always("WEATHER: Worker thread function starting")
        
        # Retry loop for client initialization with backoff
        backoff_sequence = [1, 3, 5, 10, 30, 60]
        client = None
        backoff_index = 0
        
        while client is None:
            try:
                client = get_cr1000_client()
                if client:
                    log_always(f"WEATHER: Connected to {_resolve_cr1000_port()}")
                    break
            except Exception as e:
                log_always(f"WEATHER: Client init attempt failed - {e}")
            
            if backoff_index < len(backoff_sequence):
                wait_time = backoff_sequence[backoff_index]
                log_always(f"WEATHER: Retrying in {wait_time}s (attempt {backoff_index + 1})")
                time.sleep(wait_time)
                backoff_index += 1
            else:
                # Max backoff reached, use last value
                wait_time = backoff_sequence[-1]
                log_always(f"WEATHER: Retrying in {wait_time}s (max backoff)")
                time.sleep(wait_time)
        
        if not client:
            log_always("WEATHER: Failed to initialize client after all retries")
            return
        
        log_always("WEATHER: Started - polling CR1000 every 60 seconds")
        while True:
            try:
                # Fetch data directly (no asyncio needed - this is a regular function)
                with _CR1000_LOCK:
                    rec = client.latest() or {}
                    if not rec:
                        rows = client.range(15)
                        rec = rows[-1] if rows else {}
                
                if rec:
                    record_time_str = rec.get("Datetime")
                    try:
                        if record_time_str:
                            # CR1000 returns UTC, convert to GMT+3
                            record_time = datetime.fromisoformat(record_time_str.replace('Z', '+00:00'))
                            record_time = _to_gmt3(record_time)
                        else:
                            record_time = None
                    except Exception:
                        record_time = None
                    
                    def pick(d, *keys):
                        for k in keys:
                            if k in d:
                                return d.get(k)
                        return None
                    
                    t = pick(rec, "Temp_C_Avg", "Temp_C", "AirTemp_C", "TA_C")
                    ws = pick(rec, "WindSpd_WVT", "WS_mps", "WindSpeed_mps", "WS_ms")
                    wd = pick(rec, "WindDir_WVT", "WindDir_Deg", "WD_deg")
                    
                    resp = {
                        "record_time": record_time.isoformat() if record_time else None,
                        "temperature_c": float(t) if t is not None else None,
                        "wind_speed_ms": float(ws) if ws is not None else None,
                        "wind_direction_deg": float(wd) if wd is not None else None,
                    }
                    
                    # Only insert if we have at least one valid value
                    if any(v is not None for v in [resp["temperature_c"], resp["wind_speed_ms"], resp["wind_direction_deg"]]):
                        _WEATHER_CACHE.update(resp)
                        _insert_weather_row(resp["record_time"], resp["temperature_c"], resp["wind_speed_ms"], resp["wind_direction_deg"])
                        log_always(f"WEATHER: Poll ok - T={resp['temperature_c']}°C, WS={resp['wind_speed_ms']} m/s, WD={resp['wind_direction_deg']}°")
                        logger.info(f"Weather worker: Inserted data - T={resp['temperature_c']}°C, WS={resp['wind_speed_ms']} m/s, WD={resp['wind_direction_deg']}°")
                    else:
                        log_always("WEATHER: Poll warning - No valid data fields found in CR1000 response")
                        logger.warning("Weather worker: No valid data fields found in CR1000 response")
                else:
                    log_always("WEATHER: Poll warning - Empty response from CR1000")
                    logger.warning("Weather worker: Empty response from CR1000")
            except Exception as e:
                log_always(f"WEATHER: Poll error - {e}")
                logger.error(f"Weather worker error: {e}")
                logger.debug(traceback.format_exc())
            finally:
                time.sleep(60)  # Poll every 60 seconds
    
    # Actually start the worker thread
    import threading
    thread = threading.Thread(target=worker, daemon=True, name="WeatherWorker")
    thread.start()
    log_always(f"WEATHER: Thread started (name={thread.name}, daemon={thread.daemon})")
    logger.info("Weather worker thread started")

@app.on_event("startup")
def on_startup():
    log_always("TSIM: Application startup")
    _ensure_weather_table()
    log_always("TSIM: Weather table ensured")
    _start_weather_worker()
    log_always("TSIM: Startup event complete")

@app.get("/api/sensor-data/latest-with-signal/")
async def get_latest_sensor_data_with_signal(limit: int = 50):
    """Get latest sensor data with signal strength - placeholder since no sensor DB in complete_backend"""
    # Return empty list to prevent 404 errors in frontend
    # In production, this would query the sensor database
    return []

# Zone activation models and endpoints expected by frontend
class ZoneActivationRequest(BaseModel):
    zone_name: str
    wind_direction: str  # 'N-S' | 'S-N' | 'E-W' | 'W-E'

@app.post("/api/zones/activate")
async def api_activate_zone(req: ZoneActivationRequest):
    try:
        success = await send_zone_activation_commands(req.zone_name, req.wind_direction)
        
        # Update sync state for concurrent UI updates (tablets/screens)
        with _sync_lock:
            _sync_state["isActivated"] = True
            _sync_state["zoneName"] = req.zone_name
            _sync_state["windDirection"] = req.wind_direction
            _sync_state["activationTime"] = datetime.now().isoformat()
        logger.info(f"Sync state updated: Zone {req.zone_name} {req.wind_direction} activated via /api/zones/activate")
        
        return {"success": bool(success), "zone": req.zone_name, "wind_direction": req.wind_direction}
    except Exception as e:
        logger.error(f"/api/zones/activate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ZoneDeactivationRequest(BaseModel):
    zone_name: Optional[str] = None
    wind_direction: Optional[str] = None

@app.post("/api/zones/deactivate")
async def api_deactivate_zone(req: Optional[ZoneDeactivationRequest] = None):
    """
    Deactivate zone(s) with clean state management (per expert plan P0.3):
    - Step A: Read active zone & wind from sync_state BEFORE clearing
    - Step B: Set deactivation_in_progress flag
    - Step C: Send OFF commands (with ACK confirmation)
    - Step D: Update lamps in DB after ACK
    - Step E: Clear sync_state AFTER commands are sent
    - Step F: Clear deactivation_in_progress flag
    
    If zone_name and wind_direction provided: turn OFF only lamps for that specific zone
    Otherwise: use sync_state to determine zone, or full system shutdown
    """
    try:
        gateway_service = get_gateway_service()
        
        # CRITICAL: Pause assertion IMMEDIATELY to prevent race condition
        gateway_service.pause_assertion("zone deactivation")
        
        # Step A: Read active zone & wind from sync_state BEFORE clearing
        with _sync_lock:
            active_zone = _sync_state.get("zoneName")
            active_wind = _sync_state.get("windDirection")
            is_activated = _sync_state.get("isActivated", False)
        
        log_always(f"DEACTIVATION: Started - zone={active_zone}, wind={active_wind}, req={req}")
        
        # Step B: Set deactivation_in_progress flag
        with _sync_lock:
            _sync_state["deactivationInProgress"] = True
        log_always("DEACTIVATION: Set deactivationInProgress flag")
        
        # Clear command queue to remove any pending commands
        cleared = gateway_service.clear_command_queue()
        if cleared > 0:
            logger.info(f"Cleared {cleared} pending commands from queue")
        
        # Determine which zone to deactivate
        zone_name = None
        wind_direction = None
        
        if req and req.zone_name and req.wind_direction:
            # Explicit zone provided in request
            zone_name = req.zone_name
            wind_direction = req.wind_direction
        elif active_zone and active_wind and is_activated:
            # Use active zone from sync_state
            zone_name = active_zone
            wind_direction = active_wind
            log_always(f"DEACTIVATION: Using active zone from sync_state: {zone_name} {wind_direction}")
        else:
            # No zone specified - full system shutdown
            zone_name = None
            wind_direction = None
            log_always("DEACTIVATION: No zone specified - full system shutdown")
        
        # Step C: Send OFF commands BEFORE clearing sync_state
        if zone_name and wind_direction:
            # Zone-specific deactivation
            log_always(f"DEACTIVATION: Sending OFF commands for zone {zone_name} {wind_direction}")
            success = await send_zone_deactivation_commands(zone_name, wind_direction)
            log_always(f"DEACTIVATION: Zone {zone_name} {wind_direction} OFF commands sent (success={success})")
        else:
            # Full system shutdown
            log_always("DEACTIVATION: Sending OFF commands for full system shutdown")
            success = await send_system_deactivation_commands()
            log_always(f"DEACTIVATION: Full system OFF commands sent (success={success})")
        
        # Step D: Update lamps in DB (already done in send_zone_deactivation_commands/send_system_deactivation_commands)
        
        # Step E: Clear sync_state AFTER commands are sent
        with _sync_lock:
            _sync_state["isActivated"] = False
            _sync_state["zoneName"] = None
            _sync_state["windDirection"] = None
            _sync_state["activationTime"] = None
        log_always("DEACTIVATION: Sync state cleared AFTER OFF commands")
        
        # Step F: Clear deactivation_in_progress flag
        with _sync_lock:
            _sync_state["deactivationInProgress"] = False
        log_always("DEACTIVATION: Completed - deactivationInProgress flag cleared")
        
        # CRITICAL: Resume assertion AFTER all deactivation is complete
        gateway_service.resume_assertion()
        
        if zone_name and wind_direction:
            return {"success": bool(success), "zone": zone_name, "wind_direction": wind_direction}
        else:
            return {"success": bool(success), "mode": "full_system"}
    except Exception as e:
        logger.error(f"/api/zones/deactivate error: {e}")
        log_always(f"DEACTIVATION: Error - {e}")
        # Still clear sync state and deactivation flag on error
        with _sync_lock:
            _sync_state["isActivated"] = False
            _sync_state["zoneName"] = None
            _sync_state["windDirection"] = None
            _sync_state["activationTime"] = None
            _sync_state["deactivationInProgress"] = False
        raise HTTPException(status_code=500, detail=str(e))

# Missing Frontend Endpoints
@app.patch("/api/lamps/{lamp_id}/activate")
async def activate_lamp(lamp_id: int):
    """Activate a specific lamp by ID (Traffic Light Management - separate from Zone Activation)"""
    try:
        gateway_service = get_gateway_service()
        success = await gateway_service.send_lamp_command(lamp_id, True, flash=False)

        if success:
            # Save state to database for Traffic Light Management
            _update_lamp_state_in_db(lamp_id, True)
            
            # Return the lamp object with updated state for frontend
            return {
                "id": lamp_id,
                "pole_id": ((lamp_id - 1) // 9) + 1,
                "lamp_number": ((lamp_id - 1) % 9) + 1,
                "side_number": 1 if ((lamp_id - 1) % 9) < 3 else 2 if ((lamp_id - 1) % 9) < 6 else 3,
                "direction": ["straight", "left", "right"][((lamp_id - 1) % 9) % 3],
                "gateway_id": f"L{lamp_id}",
                "is_on": True,
                "gateway_switch_id": lamp_id,
                "gateway_command_on": ["b", "d", "f", "h", "j", "l", "n", "p", "r"][(lamp_id - 1) % 9],
                "gateway_command_off": ["a", "c", "e", "g", "i", "k", "m", "o", "q"][(lamp_id - 1) % 9]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to activate lamp {lamp_id}")

    except Exception as e:
        logger.error(f"Error activating lamp {lamp_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/gateway/connect")
async def connect_gateway():
    """Connect to ESP32 gateway (frontend endpoint)"""
    try:
        gateway_service = get_gateway_service()
        is_connected = gateway_service.ensure_connected()
        
        if is_connected:
            # Return the full gateway status object that frontend expects
            return {
                "success": True, 
                "message": "Gateway connected successfully", 
                "status": {
                    "status": "connected",
                    "ip_address": "192.168.4.1",
                    "tcp_port": 9000,
                    "wifi_ssid": "ESP32_AP",
                    "last_heartbeat": None,
                    "available_switches": 126
                }
            }
        else:
            return {
                "success": False, 
                "message": "Failed to connect to gateway", 
                "status": {
                    "status": "disconnected",
                    "ip_address": "192.168.4.1",
                    "tcp_port": 9000,
                    "wifi_ssid": "ESP32_AP",
                    "last_heartbeat": None,
                    "available_switches": 126
                }
            }
            
    except Exception as e:
        logger.error(f"Error connecting to gateway: {str(e)}")
        return {
            "success": False, 
            "message": f"Connection error: {str(e)}", 
            "status": {
                "status": "error",
                "ip_address": "192.168.4.1",
                "tcp_port": 9000,
                "wifi_ssid": "ESP32_AP",
                "last_heartbeat": None,
                "available_switches": 126
            }
        }

# Gateway Status Endpoint
@app.get("/api/gateway/status")
async def get_gateway_status():
    """Get ESP32 gateway connection status"""
    try:
        gateway_service = get_gateway_service()
        # Do not send a frame here; just report socket state
        is_connected = gateway_service.is_connected()
        
        # Return format that matches frontend GatewayStatus interface
        return {
            "status": "connected" if is_connected else "disconnected",
            "ip_address": gateway_service.esp32_ip,
            "tcp_port": gateway_service.tcp_port,
            "wifi_ssid": gateway_service.wifi_ssid,
            "available_switches": 126,  # Full system coverage
            "last_heartbeat": gateway_service.last_heartbeat
        }
        
    except Exception as e:
        logger.error(f"Error getting gateway status: {str(e)}")
        return {
            "status": "error",
            "ip_address": "192.168.4.1",
            "tcp_port": 9000,
            "wifi_ssid": "ESP32_AP",
            "available_switches": 126,
            "last_heartbeat": None
        }

# Additional Frontend Endpoints
@app.patch("/api/lamps/{lamp_id}/deactivate")
async def deactivate_lamp(lamp_id: int):
    """Deactivate a specific lamp by ID (Traffic Light Management - separate from Zone Activation)"""
    try:
        gateway_service = get_gateway_service()
        success = await gateway_service.send_lamp_command(lamp_id, False, flash=False)

        if success:
            # Save state to database for Traffic Light Management
            _update_lamp_state_in_db(lamp_id, False)
            
            # Return the lamp object with updated state for frontend
            return {
                "id": lamp_id,
                "pole_id": ((lamp_id - 1) // 9) + 1,
                "lamp_number": ((lamp_id - 1) % 9) + 1,
                "side_number": 1 if ((lamp_id - 1) % 9) < 3 else 2 if ((lamp_id - 1) % 9) < 6 else 3,
                "direction": ["straight", "left", "right"][((lamp_id - 1) % 9) % 3],
                "gateway_id": f"L{lamp_id}",
                "is_on": False,
                "gateway_switch_id": lamp_id,
                "gateway_command_on": ["b", "d", "f", "h", "j", "l", "n", "p", "r"][(lamp_id - 1) % 9],
                "gateway_command_off": ["a", "c", "e", "g", "i", "k", "m", "o", "q"][(lamp_id - 1) % 9]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to deactivate lamp {lamp_id}")

    except Exception as e:
        logger.error(f"Error deactivating lamp {lamp_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.patch("/api/poles/{pole_id}/activate-all")
async def activate_all_pole_lamps(pole_id: int):
    """Activate all lamps for a specific pole (Traffic Light Management - separate from Zone Activation)"""
    try:
        gateway_service = get_gateway_service()
        
        # Calculate lamp IDs for this pole (9 lamps per pole)
        start_lamp_id = (pole_id - 1) * 9 + 1
        end_lamp_id = pole_id * 9
        
        success_count = 0
        for lamp_id in range(start_lamp_id, end_lamp_id + 1):
            try:
                success = await gateway_service.send_lamp_command(lamp_id, True, flash=False)
                if success:
                    # Save state to database for Traffic Light Management
                    _update_lamp_state_in_db(lamp_id, True)
                    success_count += 1
            except Exception as e:
                logger.error(f"Error activating lamp {lamp_id}: {str(e)}")
        
        if success_count > 0:
            # Return updated lamp objects for the pole
            updated_lamps = []
            for lamp_id in range(start_lamp_id, end_lamp_id + 1):
                updated_lamps.append({
                    "id": lamp_id,
                    "pole_id": pole_id,
                    "lamp_number": ((lamp_id - 1) % 9) + 1,
                    "side_number": 1 if ((lamp_id - 1) % 9) < 3 else 2 if ((lamp_id - 1) % 9) < 6 else 3,
                    "direction": ["straight", "left", "right"][((lamp_id - 1) % 9) % 3],
                    "gateway_id": f"L{lamp_id}",
                    "is_on": True,
                    "gateway_switch_id": lamp_id,
                    "gateway_command_on": "b" if ((lamp_id - 1) % 9) == 0 else "d" if ((lamp_id - 1) % 9) == 1 else "f" if ((lamp_id - 1) % 9) == 2 else "h" if ((lamp_id - 1) % 9) == 3 else "j" if ((lamp_id - 1) % 9) == 4 else "l" if ((lamp_id - 1) % 9) == 5 else "n" if ((lamp_id - 1) % 9) == 6 else "p" if ((lamp_id - 1) % 9) == 7 else "r",
                    "gateway_command_off": "a" if ((lamp_id - 1) % 9) == 0 else "c" if ((lamp_id - 1) % 9) == 1 else "e" if ((lamp_id - 1) % 9) == 2 else "g" if ((lamp_id - 1) % 9) == 3 else "i" if ((lamp_id - 1) % 9) == 4 else "k" if ((lamp_id - 1) % 9) == 5 else "m" if ((lamp_id - 1) % 9) == 6 else "o" if ((lamp_id - 1) % 9) == 7 else "q"
                })
            return updated_lamps
        else:
            raise HTTPException(status_code=500, detail=f"Failed to activate any lamps for pole {pole_id}")
            
    except Exception as e:
        logger.error(f"Error activating all lamps for pole {pole_id}: {str(e)}")
        return {"success": False, "pole_id": pole_id, "activated_lamps": 0, "message": f"Error: {str(e)}"}

@app.patch("/api/poles/{pole_id}/deactivate-all")
async def deactivate_all_pole_lamps(pole_id: int):
    """Deactivate all lamps for a specific pole (Traffic Light Management - separate from Zone Activation)"""
    try:
        gateway_service = get_gateway_service()
        
        # Calculate lamp IDs for this pole (9 lamps per pole)
        start_lamp_id = (pole_id - 1) * 9 + 1
        end_lamp_id = pole_id * 9
        
        success_count = 0
        for lamp_id in range(start_lamp_id, end_lamp_id + 1):
            try:
                success = await gateway_service.send_lamp_command(lamp_id, False, flash=False)
                if success:
                    # Save state to database for Traffic Light Management
                    _update_lamp_state_in_db(lamp_id, False)
                    success_count += 1
            except Exception as e:
                logger.error(f"Error deactivating lamp {lamp_id}: {str(e)}")
        
        if success_count > 0:
            # Return updated lamp objects for the pole
            updated_lamps = []
            for lamp_id in range(start_lamp_id, end_lamp_id + 1):
                updated_lamps.append({
                    "id": lamp_id,
                    "pole_id": pole_id,
                    "lamp_number": ((lamp_id - 1) % 9) + 1,
                    "side_number": 1 if ((lamp_id - 1) % 9) < 3 else 2 if ((lamp_id - 1) % 9) < 6 else 3,
                    "direction": ["straight", "left", "right"][((lamp_id - 1) % 9) % 3],
                    "gateway_id": f"L{lamp_id}",
                    "is_on": False,
                    "gateway_switch_id": lamp_id,
                    "gateway_command_on": "b" if ((lamp_id - 1) % 9) == 0 else "d" if ((lamp_id - 1) % 9) == 1 else "f" if ((lamp_id - 1) % 9) == 2 else "h" if ((lamp_id - 1) % 9) == 3 else "j" if ((lamp_id - 1) % 9) == 4 else "l" if ((lamp_id - 1) % 9) == 5 else "n" if ((lamp_id - 1) % 9) == 6 else "p" if ((lamp_id - 1) % 9) == 7 else "r",
                    "gateway_command_off": "a" if ((lamp_id - 1) % 9) == 0 else "c" if ((lamp_id - 1) % 9) == 1 else "e" if ((lamp_id - 1) % 9) == 2 else "g" if ((lamp_id - 1) % 9) == 3 else "i" if ((lamp_id - 1) % 9) == 4 else "k" if ((lamp_id - 1) % 9) == 5 else "m" if ((lamp_id - 1) % 9) == 6 else "o" if ((lamp_id - 1) % 9) == 7 else "q"
                })
            return updated_lamps
        else:
            raise HTTPException(status_code=500, detail=f"Failed to deactivate any lamps for pole {pole_id}")
            
    except Exception as e:
        logger.error(f"Error deactivating all lamps for pole {pole_id}: {str(e)}")
        return {"success": False, "pole_id": pole_id, "deactivated_lamps": 0, "message": f"Error: {str(e)}"}

# Gateway Integration Functions
async def send_zone_activation_commands(zone_name: str, wind_direction: str) -> bool:
    """Send gateway commands for zone activation with clean state management.
    
    CRITICAL FLOW:
    1. Unregister any active zone immediately (stop assertion loop)
    2. Clear command queue (remove any pending old commands)
    3. Wait for old zone to be fully OFF (ACK confirmed)
    4. Clear queue again (ensure no conflicts)
    5. Register new zone and send activation commands
    
    This ensures:
    - No command conflicts from old zone
    - Old zone fully OFF before new activation
    - Clean state transition
    - UI shows correct state
    
    Lamp IDs are sequential 1-126 where:
    - Lamp 1-9 = Device A (Pole 1)
    - Lamp 10-18 = Device B (Pole 2)
    - ...
    - Lamp 118-126 = Device N (Pole 14)
    """
    try:
        gateway_service = get_gateway_service()
        
        # STEP 1: Unregister any active zone IMMEDIATELY (stop assertion loop)
        old_zone_info = None
        with gateway_service.zone_assertion_lock:
            old_zone = gateway_service.active_zone
            if old_zone:
                old_zone_info = {
                    'zone_name': old_zone['zone_name'],
                    'wind_direction': old_zone['wind_direction']
                }
                # Unregister immediately
                gateway_service.active_zone = None
                logger.info(f"⏹️  Unregistered active zone: {old_zone_info['zone_name']} {old_zone_info['wind_direction']}")
        
        # STEP 2: Clear command queue (remove any pending commands from old zone)
        cleared = gateway_service.clear_command_queue()
        if cleared > 0:
            logger.info(f"🧹 Cleared {cleared} pending commands from queue")
        
        # STEP 3: If there was an old zone, wait for it to be fully OFF (with ACK confirmation)
        if old_zone_info:
            old_name = old_zone_info['zone_name']
            old_wind = old_zone_info['wind_direction']
            logger.info(f"⏳ Waiting for old zone {old_name} {old_wind} to be fully OFF (ACK confirmed)...")
            
            # Wait for old zone to be confirmed OFF (with ACK) - reduced timeout
            old_zone_off = await gateway_service.wait_for_zone_off(old_name, old_wind, timeout=10.0)
            
            if old_zone_off:
                logger.info(f"✅ Old zone {old_name} {old_wind} confirmed OFF (all ACKs received)")
            else:
                logger.warning(f"⚠️ Old zone {old_name} {old_wind} timeout - proceeding anyway")
            
            # Additional small delay to ensure stability
            await asyncio.sleep(0.3)
        
        # STEP 4: Clear queue one more time (in case any commands queued during wait)
        cleared = gateway_service.clear_command_queue()
        if cleared > 0:
            logger.info(f"🧹 Final queue clear: {cleared} commands removed")
        
        # STEP 5: Get new zone commands
        zone_commands = get_zone_activation_commands(zone_name, wind_direction)
        
        if not zone_commands:
            logger.warning(f"No commands defined for zone {zone_name} {wind_direction}")
            return False
        
        # Validate lamp IDs
        valid_commands = {lamp_id: state for lamp_id, state in zone_commands.items() 
                        if 1 <= lamp_id <= 126}
        
        if not valid_commands:
            logger.warning(f"No valid lamp IDs (1-126) for zone {zone_name} {wind_direction}")
            return False
        
        # STEP 6: Register new zone (starts assertion loop)
        gateway_service.register_active_zone(zone_name, wind_direction, valid_commands)
        logger.info(f"📝 Registered new zone: {zone_name} {wind_direction}")
        
        # STEP 7: Send activation commands
        success = await gateway_service.send_batch_commands(valid_commands)
        
        if success:
            logger.info(f"✅ Zone {zone_name} {wind_direction}: {len(valid_commands)} lamps activated (ACK confirmed)")
        else:
            logger.error(f"❌ Zone {zone_name} {wind_direction}: Activation failed")
            # Unregister on failure
            gateway_service.unregister_active_zone(zone_name, wind_direction)
        
        return success
            
    except Exception as e:
        logger.error(f"Error sending zone activation commands: {str(e)}")
        # Clean up on error
        try:
            gateway_service.unregister_active_zone(zone_name, wind_direction)
        except:
            pass
        return False

async def send_zone_deactivation_commands(zone_name: str, wind_direction: str) -> bool:
    """Send gateway commands to deactivate lamps for a specific zone.
    
    CRITICAL: Sends OFF commands UNCONDITIONALLY - does NOT check DB state.
    This ensures physical lamps turn off even if DB state is inconsistent.
    
    SIMPLIFIED LOGIC USING ACK:
    1. Unregister zone from assertion (stops assertion loop)
    2. Clear command queue (remove pending commands)
    3. Send OFF commands with ACK confirmation (unconditional - always send)
    4. Retry if ACK not received (up to 3 attempts)
    
    Uses ACK confirmations to ensure reliable OFF state.
    """
    try:
        gateway_service = get_gateway_service()
        
        # STEP 1: Unregister zone FIRST to stop assertion loop immediately
        gateway_service.unregister_active_zone(zone_name, wind_direction)
        log_always(f"DEACTIVATION: Unregistered zone {zone_name} {wind_direction} from assertion")
        
        # STEP 2: Clear command queue (remove any pending commands)
        cleared = gateway_service.clear_command_queue()
        if cleared > 0:
            log_always(f"DEACTIVATION: Cleared {cleared} pending commands from queue")
        
        # Small delay to ensure assertion loop sees the unregister
        await asyncio.sleep(0.05)
        
        # STEP 3: Get zone commands from hardcoded map (NOT from DB)
        zone_commands = get_zone_activation_commands(zone_name, wind_direction)
        
        if not zone_commands:
            logger.warning(f"No commands defined for zone {zone_name} with wind {wind_direction}")
            return True  # Nothing to deactivate
        
        # CRITICAL: Build OFF commands UNCONDITIONALLY - don't check DB state
        # Always send OFF regardless of what DB says
        deactivate_commands = {lamp_id: False for lamp_id in zone_commands.keys()}
        log_always(f"DEACTIVATION: Sending OFF commands for {len(deactivate_commands)} lamps (unconditional)")
        
        # STEP 4: Double-clear queue right before OFF send (extra safety)
        gateway_service.clear_command_queue()
        await asyncio.sleep(0.05)
        
        # STEP 5: Send OFF commands with retry (ACK confirmation ensures real OFF state)
        success = False
        for attempt in range(3):
            try:
                result = await gateway_service.send_batch_commands(deactivate_commands)
                if result:
                    success = True
                    logger.info(f"✅ Zone {zone_name} deactivation: Attempt {attempt + 1}/3 succeeded (ACK confirmed)")
                    break
                else:
                    logger.warning(f"⚠️ Zone {zone_name} deactivation: Attempt {attempt + 1}/3 failed (no ACK)")
                    if attempt < 2:
                        await asyncio.sleep(2)  # 2 second delay between retries (reduced from 5s)
            except Exception as e:
                logger.error(f"Zone deactivation attempt {attempt + 1}/3 error: {e}")
                if attempt < 2:
                    await asyncio.sleep(2)
        
        if success:
            logger.info(f"✅ Zone {zone_name} {wind_direction} confirmed OFF (ACK received)")
        else:
            logger.error(f"❌ Zone {zone_name} {wind_direction} deactivation FAILED after 3 attempts")
        
        return success
            
    except Exception as e:
        logger.error(f"Error sending zone deactivation commands: {str(e)}")
        # Still unregister even on error
        try:
            gateway_service.unregister_active_zone(zone_name, wind_direction)
        except:
            pass
        return False

async def send_system_deactivation_commands() -> bool:
    """Send gateway commands to deactivate all devices (full system shutdown)
    
    CRITICAL: Sends OFF commands UNCONDITIONALLY - does NOT check DB state.
    This ensures physical lamps turn off even if DB state is inconsistent.
    
    Steps:
    1. Clear all active zones FIRST to stop assertion loop immediately
    2. Send OFF commands to all devices (unconditional - always send)
    """
    try:
        gateway_service = get_gateway_service()
        
        # CRITICAL: Clear all active zones FIRST to stop assertion loop immediately
        gateway_service.clear_all_active_zones()
        log_always("DEACTIVATION: Cleared all active zones from assertion BEFORE sending system OFF commands")
        
        # Small delay to ensure assertion loop sees the clear
        await asyncio.sleep(0.1)
        
        # CRITICAL: Send all devices OFF commands UNCONDITIONALLY
        # Don't check DB state - always send OFF regardless
        log_always("DEACTIVATION: Sending OFF commands to all 14 devices (unconditional)")
        success_count = 0
        for device in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']:
            success = await gateway_service.send_device_all_off(device)
            if success:
                success_count += 1
        
        log_always(f"DEACTIVATION: System OFF commands sent to {success_count}/14 devices")
        
        return success_count > 0
        
    except Exception as e:
        logger.error(f"Error sending system deactivation commands: {str(e)}")
        # Still clear zones even on error
        try:
            gateway_service.clear_all_active_zones()
        except:
            pass
        return False

def get_zone_activation_commands(zone_name: str, wind_direction: str) -> Dict[int, bool]:
    """Get gateway commands for specific zone and wind direction.
    
    Lamp IDs are sequential 1-126 where:
    - Lamp 1-9 = Device A (Pole 1), positions 1-9
    - Lamp 10-18 = Device B (Pole 2), positions 1-9
    - Lamp 19-27 = Device C (Pole 3), positions 1-9
    - ...
    - Lamp 118-126 = Device N (Pole 14), positions 1-9
    
    Authoritative mappings from logic.py - all zones A, B, C, D, E, F, G, H, K.
    """
    zone_key = zone_name.strip().lower()
    wind = wind_direction.strip().upper()
    
    # Authoritative zone mappings from logic.py - EXACT COPY
    # Lamp IDs are sequential (1-126) = same as database lamp IDs
    zone_mappings = {
        'zone a': {
            'N-S': {6: True, 105: True},
            'S-N': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 79: True, 97: True},
            'E-W': {6: True, 105: True},
            'W-E': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 79: True, 97: True}
        },
        'zone b': {
            'N-S': {6: True, 104: True},
            'S-N': {4: True, 15: True},
            'E-W': {4: True, 15: True},  # Swapped: E-W now matches S-N pattern
            'W-E': {6: True, 104: True}  # Swapped: W-E now matches N-S pattern
        },
        'zone c': {
            'N-S': {4: True, 15: True},
            'S-N': {4: True, 13: True, 22: True, 31: True, 42: True, 54: True, 58: True},
            'E-W': {4: True, 13: True, 22: True, 31: True, 42: True, 54: True, 60: True},
            'W-E': {4: True, 15: True}
        },
        'zone d': {
            'N-S': {6: True, 103: True},
            'S-N': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 81: True, 86: True},
            'E-W': {6: True, 103: True},
            'W-E': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 81: True, 86: True}
        },
        'zone e': {
            'N-S': {5: True},
            'S-N': {4: True, 14: True},
            'E-W': {4: True, 14: True},
            'W-E': {5: True}
        },
        'zone f': {
            'N-S': {6: True, 92: True, 103: True},
            'S-N': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 81: True, 83: True},
            'E-W': {6: True, 92: True, 103: True},
            'W-E': {4: True, 13: True, 22: True, 31: True, 42: True, 52: True, 70: True, 81: True, 86: True}
        },
        'zone g': {
            'N-S': {6: True, 88: True, 92: True, 103: True},
            'S-N': {4: True, 22: True, 13: True, 31: True, 42: True, 52: True, 72: True},  # Corrected sequence: 4, 22, 13, 31, 42, 52, 72
            'E-W': {4: True, 22: True, 13: True, 31: True, 42: True, 52: True, 72: True},  # Same as S-N pattern
            'W-E': {6: True, 88: True, 92: True, 103: True}
        },
        'zone h': {
            'N-S': {4: True, 13: True, 22: True, 32: True},
            'S-N': {4: True, 13: True, 22: True, 32: True},
            'E-W': {4: True, 13: True, 23: True, 114: True},
            'W-E': {4: True, 13: True, 22: True, 32: True}
        },
        'zone k': {
            'N-S': {4: True, 13: True, 23: True, 113: True},
            'S-N': {4: True, 13: True, 23: True, 114: True, 119: True},
            'E-W': {4: True, 13: True, 22: True, 31: True, 41: True, 126: True},  # Corrected sequence: 4, 13, 22, 31, 41, 126
            'W-E': {4: True, 13: True, 23: True, 112: True}
        }
    }
    
    return zone_mappings.get(zone_key, {}).get(wind, {})

# New endpoint for manual lamp control
@app.post("/api/gateway/lamp-control")
async def control_lamp(lamp_id: int, state: bool):
    """Manually control individual lamp via gateway"""
    try:
        gateway_service = get_gateway_service()
        success = await gateway_service.send_lamp_command(lamp_id, state)
        
        return {
            "success": success,
            "lamp_id": lamp_id,
            "state": state,
            "message": f"Lamp {'activated' if state else 'deactivated'} successfully" if success else "Failed to control lamp"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gateway error: {str(e)}")

# New endpoint for device-level control
@app.post("/api/gateway/device-control")
async def control_device(device: str, action: str, value: Optional[str] = None):
    """Control entire device via gateway (all on/off, route preset, mask)"""
    try:
        # Use the singleton gateway service to preserve the single persistent socket
        gateway_service = get_gateway_service()
        success = False
        
        if action == "all_on":
            success = await gateway_service.send_device_all_on(device)
        elif action == "all_off":
            success = await gateway_service.send_device_all_off(device)
        elif action == "route" and value:
            route_num = int(value)
            success = await gateway_service.send_device_route_preset(device, route_num)
        elif action == "mask" and value:
            success = await gateway_service.send_device_mask(device, value)
        else:
            raise HTTPException(status_code=400, detail="Invalid action or missing value")
        
        return {
            "success": success,
            "device": device,
            "action": action,
            "value": value,
            "message": f"Device {device} {action} command sent successfully" if success else "Failed to send device command"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gateway error: {str(e)}")

# New REST API endpoints as per specification
@app.post("/api/lamp")
async def control_lamp(request: dict):
    """Control individual lamp - POST /api/lamp"""
    try:
        device = request.get("device", "").upper()
        lamp = request.get("lamp")
        state = request.get("state", "").lower()
        
        if not device or not lamp or not state:
            raise HTTPException(status_code=400, detail="Missing required fields: device, lamp, state")
        
        gateway_service = get_gateway_service()
        result = await gateway_service.send_lamp_command_new(device, lamp, state)

        return {
                "ok": result["ok"],
                "ack": result["ok"],
                "retries": result["retries"],
                "t_ms": result["t_ms"],
                "error": result.get("error") if not result["ok"] else None
            }

    except Exception as e:
        logger.error(f"Error in lamp control: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/all")
async def control_all(request: dict):
    """Control all lamps on device - POST /api/all"""
    try:
        device = request.get("device", "").upper()
        state = request.get("state", "").lower()
        
        if not device or not state:
            raise HTTPException(status_code=400, detail="Missing required fields: device, state")
        
        gateway_service = get_gateway_service()
        result = await gateway_service.send_all_command(device, state)

        return {
                "ok": result["ok"],
                "ack": result["ok"],
                "retries": result["retries"],
                "t_ms": result["t_ms"],
                "error": result.get("error") if not result["ok"] else None
            }

    except Exception as e:
        logger.error(f"Error in all control: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/route")
async def control_route(request: dict):
    """Control route preset - POST /api/route"""
    try:
        device = request.get("device", "").upper()
        route = request.get("route")
        
        if not device or route is None:
            raise HTTPException(status_code=400, detail="Missing required fields: device, route")
        
        gateway_service = get_gateway_service()
        result = await gateway_service.send_route_command(device, route)

        return {
                "ok": result["ok"],
                "ack": result["ok"],
                "retries": result["retries"],
                "t_ms": result["t_ms"],
                "error": result.get("error") if not result["ok"] else None
            }

    except Exception as e:
        logger.error(f"Error in route control: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/api/mask")
async def control_mask(request: dict):
    """Control mask - POST /api/mask"""
    try:
        device = request.get("device", "").upper()
        mask = request.get("mask", "")
        
        if not device or not mask:
            raise HTTPException(status_code=400, detail="Missing required fields: device, mask")
        
        gateway_service = get_gateway_service()
        result = await gateway_service.send_mask_command(device, mask)

        return {
                "ok": result["ok"],
                "ack": result["ok"],
                "retries": result["retries"],
                "t_ms": result["t_ms"],
                "error": result.get("error") if not result["ok"] else None
            }

    except Exception as e:
        logger.error(f"Error in mask control: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/api/health")
async def get_health():
    """Get gateway health status - GET /api/health"""
    try:
        gateway_service = get_gateway_service()
        health_status = gateway_service.get_health_status()

        return health_status

    except Exception as e:
        logger.error(f"Error getting health status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# HTTP Sync endpoints for concurrent UI updates (tablets/screens)
@app.get("/api/sync/state")
async def get_sync_state():
    """Get current sync state for concurrent UI updates"""
    with _sync_lock:
        return _sync_state.copy()

@app.post("/api/sync/activate")
async def sync_activate_emergency(request: Request):
    """Update sync state when emergency is activated (called by frontend)"""
    try:
        request_data = await request.json()
        with _sync_lock:
            _sync_state["isActivated"] = True
            _sync_state["zoneName"] = request_data.get("zoneName")
            _sync_state["windDirection"] = request_data.get("windDirection")
            _sync_state["activationTime"] = datetime.now().isoformat()
        logger.info(f"Sync state updated via API: {request_data.get('zoneName')} - {request_data.get('windDirection')}")
        with _sync_lock:
            return {"status": "success", "state": _sync_state.copy()}
    except Exception as e:
        logger.error(f"Sync activate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync/deactivate")
async def sync_deactivate_emergency():
    """Update sync state when emergency is deactivated (called by frontend)"""
    with _sync_lock:
        _sync_state["isActivated"] = False
        _sync_state["zoneName"] = None
        _sync_state["windDirection"] = None
        _sync_state["activationTime"] = None
    logger.info("Sync state updated via API: Emergency deactivated")
    with _sync_lock:
        return {"status": "success", "state": _sync_state.copy()}

@app.post("/api/sync/register")
async def sync_register_client(request: Request):
    """Register a client for sync updates"""
    client_id = request.client.host if request.client else "unknown"
    logger.info(f"Sync client registered: {client_id}")
    return {"status": "success", "client_id": client_id}

@app.post("/api/sync/heartbeat")
async def sync_heartbeat():
    """Client heartbeat to maintain connection"""
    return {"status": "alive"}

# Post-Event Report Endpoints
class PostEventReportRequest(BaseModel):
    event_id: Optional[int] = None
    emergency_type: str = "Real"  # "Real", "Drill", "Exercise", "Unknown"
    event_date: str
    start_time: str  # HH:MM format
    end_time: Optional[str] = None  # HH:MM format
    location: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    activation_scenario: Optional[str] = None  # e.g., "zone G wind south to north"
    activation_911: str = "Unknown"  # "Yes", "No", "Unknown"
    
    # Incident Manager
    incident_manager_name: Optional[str] = None
    incident_manager_login_id: Optional[str] = None
    incident_manager_organization: Optional[str] = None
    incident_manager_badge_id: Optional[str] = None
    
    # Incident Commander
    incident_commander_name: Optional[str] = None
    incident_commander_login_id: Optional[str] = None
    incident_commander_division: Optional[str] = None
    incident_commander_badge_id: Optional[str] = None
    
    # Observations (array of objects)
    observations: List[Dict] = []
    
    # Sequence of Events
    sequence_of_events: List[Dict] = []
    
    # ECC Notes
    ecc_notes: List[str] = []
    
    # Effects
    properties_affected: Optional[str] = None
    production_effectiveness: Optional[str] = None
    data_exported_at: Optional[str] = None
    comments: Optional[str] = None
    
    # Injuries
    injuries_number: Optional[int] = None
    injuries_type: Optional[str] = None  # "Minor", "Moderate", "Severe", "Fatal", "Unknown"
    
    # Checklists
    responder_actions: List[Dict] = []
    ecc_actions: List[Dict] = []
    sa_affairs_actions: List[Dict] = []

class PostEventReportResponse(BaseModel):
    report_id: str
    status: str  # "draft" or "finalized"
    missing_fields: List[Dict] = []
    created_at: str

@app.post("/api/reports/generate", response_model=PostEventReportResponse)
async def generate_post_event_report(req: PostEventReportRequest):
    """Generate a Post-Event Report from operator input"""
    try:
        import uuid
        from datetime import datetime
        
        report_id = str(uuid.uuid4())
        created_at = datetime.now().isoformat()
        
        # Build report data structure matching the schema
        report_data = {
            "emergency": {
                "type": req.emergency_type,
                "date": req.event_date,
                "location": req.location,
                "subject": req.subject,
                "description": req.description or req.activation_scenario,
                "activation_911": req.activation_911
            },
            "incident_manager": {
                "name": req.incident_manager_name,
                "login_id": req.incident_manager_login_id,
                "organization": req.incident_manager_organization,
                "badge_id": req.incident_manager_badge_id
            },
            "incident_commander": {
                "name": req.incident_commander_name,
                "login_id": req.incident_commander_login_id,
                "division": req.incident_commander_division,
                "badge_id": req.incident_commander_badge_id
            },
            "observations": req.observations,
            "sequence_of_events": req.sequence_of_events,
            "ecc_notes": req.ecc_notes,
            "effects": {
                "properties_affected": req.properties_affected,
                "production_effectiveness": req.production_effectiveness,
                "data_exported_at": req.data_exported_at,
                "comments": req.comments
            },
            "injuries": {
                "number": req.injuries_number,
                "type": req.injuries_type
            },
            "checklists": {
                "responder_actions": req.responder_actions,
                "ecc_actions": req.ecc_actions,
                "sa_affairs_actions": req.sa_affairs_actions
            },
            "meta": {
                "source": "EGS Post-Event Controller v1",
                "generated_at": created_at,
                "note": f"Event ID: {req.event_id}" if req.event_id else None,
                "missing_fields": []
            }
        }
        
        # Check for missing required fields
        missing_fields = []
        if not req.event_date:
            missing_fields.append({"path": "/emergency/date", "reason": "Event date is required"})
        if not req.start_time:
            missing_fields.append({"path": "/sequence_of_events[0]/time", "reason": "Start time is required"})
        
        report_data["meta"]["missing_fields"] = missing_fields
        
        # Store report in database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Create reports table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS post_event_reports (
                id TEXT PRIMARY KEY,
                event_id INTEGER,
                report_data TEXT,
                status TEXT,
                created_at TEXT,
                updated_at TEXT,
                closed_at TEXT
            )
        ''')
        
        status = "finalized" if len(missing_fields) == 0 else "draft"
        
        cursor.execute('''
            INSERT INTO post_event_reports (id, event_id, report_data, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            report_id,
            req.event_id,
            json.dumps(report_data),
            status,
            created_at,
            created_at
        ))
        
        conn.commit()
        conn.close()
        
        return PostEventReportResponse(
            report_id=report_id,
            status=status,
            missing_fields=missing_fields,
            created_at=created_at
        )
        
    except Exception as e:
        logger.error(f"Error generating post-event report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/{report_id}")
async def get_post_event_report(report_id: str):
    """Get a Post-Event Report by ID"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, event_id, report_data, status, created_at, updated_at, closed_at
            FROM post_event_reports
            WHERE id = ?
        ''', (report_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "id": row[0],
            "event_id": row[1],
            "report_data": json.loads(row[2]),
            "status": row[3],
            "created_at": row[4],
            "updated_at": row[5],
            "closed_at": row[6]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve report: {str(e)}")

@app.patch("/api/reports/{report_id}")
async def update_post_event_report(report_id: str, req: PostEventReportRequest):
    """Update a Post-Event Report"""
    try:
        from datetime import datetime
        
        # Rebuild report data (same as generate)
        report_data = {
            "emergency": {
                "type": req.emergency_type,
                "date": req.event_date,
                "location": req.location,
                "subject": req.subject,
                "description": req.description or req.activation_scenario,
                "activation_911": req.activation_911
            },
            "incident_manager": {
                "name": req.incident_manager_name,
                "login_id": req.incident_manager_login_id,
                "organization": req.incident_manager_organization,
                "badge_id": req.incident_manager_badge_id
            },
            "incident_commander": {
                "name": req.incident_commander_name,
                "login_id": req.incident_commander_login_id,
                "division": req.incident_commander_division,
                "badge_id": req.incident_commander_badge_id
            },
            "observations": req.observations,
            "sequence_of_events": req.sequence_of_events,
            "ecc_notes": req.ecc_notes,
            "effects": {
                "properties_affected": req.properties_affected,
                "production_effectiveness": req.production_effectiveness,
                "data_exported_at": req.data_exported_at,
                "comments": req.comments
            },
            "injuries": {
                "number": req.injuries_number,
                "type": req.injuries_type
            },
            "checklists": {
                "responder_actions": req.responder_actions,
                "ecc_actions": req.ecc_actions,
                "sa_affairs_actions": req.sa_affairs_actions
            },
            "meta": {
                "source": "EGS Post-Event Controller v1",
                "generated_at": datetime.now().isoformat(),
                "note": f"Event ID: {req.event_id}" if req.event_id else None,
                "missing_fields": []
            }
        }
        
        missing_fields = []
        if not req.event_date:
            missing_fields.append({"path": "/emergency/date", "reason": "Event date is required"})
        if not req.start_time:
            missing_fields.append({"path": "/sequence_of_events[0]/time", "reason": "Start time is required"})
        
        report_data["meta"]["missing_fields"] = missing_fields
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        updated_at = datetime.now().isoformat()
        status = "finalized" if len(missing_fields) == 0 else "draft"
        
        cursor.execute('''
            UPDATE post_event_reports
            SET report_data = ?, status = ?, updated_at = ?
            WHERE id = ?
        ''', (json.dumps(report_data), status, updated_at, report_id))
        
        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="Report not found")
        
        conn.commit()
        conn.close()
        
        return {"status": "updated", "report_id": report_id, "status": status}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update report: {str(e)}")

@app.post("/api/reports/{report_id}/close")
async def close_post_event_report(report_id: str):
    """Close a Post-Event Report (mark as finalized and closed)"""
    try:
        from datetime import datetime
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        closed_at = datetime.now().isoformat()
        
        cursor.execute('''
            UPDATE post_event_reports
            SET status = 'closed', closed_at = ?
            WHERE id = ?
        ''', (closed_at, report_id))
        
        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="Report not found")
        
        conn.commit()
        conn.close()
        
        return {"status": "closed", "report_id": report_id, "closed_at": closed_at}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to close report: {str(e)}")

@app.get("/api/reports/{report_id}/pdf")
async def export_report_to_pdf(report_id: str):
    """Export a Post-Event Report to PDF"""
    try:
        from io import BytesIO
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
        from fastapi.responses import Response
        
        # Get report data
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT report_data FROM post_event_reports WHERE id = ?
        ''', (report_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        
        report_data = json.loads(row[0])
        
        # Generate PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
        story = []
        styles = getSampleStyleSheet()
        
        # Title style
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            textColor=colors.HexColor('#1F2937'),
            spaceAfter=12,
            alignment=TA_CENTER
        )
        
        # Header style
        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1F2937'),
            spaceAfter=6,
            spaceBefore=12
        )
        
        # Normal style
        normal_style = styles['Normal']
        
        # Add title
        story.append(Paragraph("North Ghawar Producing Department", title_style))
        story.append(Paragraph("Emergency Guidance System", title_style))
        story.append(Paragraph("Emergency Event Reporting", title_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Emergency Event Information
        story.append(Paragraph("Emergency Event Information", header_style))
        emergency = report_data.get('emergency', {})
        story.append(Paragraph(f"<b>Emergency Type:</b> {emergency.get('type', 'N/A') or 'N/A'}", normal_style))
        story.append(Paragraph(f"<b>Event Date:</b> {emergency.get('date', 'N/A') or 'N/A'}", normal_style))
        story.append(Paragraph(f"<b>Location:</b> {emergency.get('location', 'N/A') or 'N/A'}", normal_style))
        story.append(Paragraph(f"<b>Subject:</b> {emergency.get('subject', 'N/A') or 'N/A'}", normal_style))
        story.append(Paragraph(f"<b>911 Activation:</b> {emergency.get('activation_911', 'N/A') or 'N/A'}", normal_style))
        if emergency.get('description'):
            desc = str(emergency.get('description', '')) or ''
            story.append(Paragraph(f"<b>Description:</b> {desc}", normal_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Incident Manager
        incident_manager = report_data.get('incident_manager', {})
        if any(v for v in incident_manager.values() if v):
            story.append(Paragraph("Incident Manager Information", header_style))
            story.append(Paragraph(f"<b>Name:</b> {incident_manager.get('name', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Log-in ID:</b> {incident_manager.get('login_id', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Organization:</b> {incident_manager.get('organization', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Badge #:</b> {incident_manager.get('badge_id', 'N/A') or 'N/A'}", normal_style))
            story.append(Spacer(1, 0.2*inch))
        
        # Incident Commander
        incident_commander = report_data.get('incident_commander', {})
        if any(v for v in incident_commander.values() if v):
            story.append(Paragraph("Incident Commander Information", header_style))
            story.append(Paragraph(f"<b>Name:</b> {incident_commander.get('name', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Log-in ID:</b> {incident_commander.get('login_id', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Division:</b> {incident_commander.get('division', 'N/A') or 'N/A'}", normal_style))
            story.append(Paragraph(f"<b>Badge #:</b> {incident_commander.get('badge_id', 'N/A') or 'N/A'}", normal_style))
            story.append(Spacer(1, 0.2*inch))
        
        # Observations
        observations = report_data.get('observations', [])
        if observations:
            story.append(Paragraph("Emergency Observations", header_style))
            obs_data = [['#', 'Observation', 'Priority', 'Recommendation', 'Classification']]
            for obs in observations:
                obs_obs = str(obs.get('observation', '')) or ''
                obs_rec = str(obs.get('recommendation', '')) or ''
                obs_data.append([
                    str(obs.get('rank', '')),
                    obs_obs[:50] + '...' if len(obs_obs) > 50 else obs_obs,
                    str(obs.get('priority', '')),
                    obs_rec[:30] + '...' if len(obs_rec) > 30 else obs_rec,
                    str(obs.get('recommendation_classification', ''))
                ])
            obs_table = Table(obs_data, colWidths=[0.5*inch, 2.5*inch, 0.8*inch, 1.5*inch, 1.2*inch])
            obs_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(obs_table)
            story.append(Spacer(1, 0.2*inch))
        
        # Sequence of Events
        sequence_of_events = report_data.get('sequence_of_events', [])
        if sequence_of_events:
            story.append(Paragraph("Sequence of Events", header_style))
            seq_data = [['Time', 'Event', 'Attended in ICP', 'Log-in ID', 'Organization']]
            for event in sequence_of_events:
                evt_event = str(event.get('event', '')) or ''
                evt_icp = str(event.get('attended_in_icp', '')) or ''
                evt_org = str(event.get('organization', '')) or ''
                seq_data.append([
                    str(event.get('time', '')),
                    evt_event[:40] + '...' if len(evt_event) > 40 else evt_event,
                    evt_icp[:30] + '...' if len(evt_icp) > 30 else evt_icp,
                    str(event.get('login_id', '')),
                    evt_org[:30] + '...' if len(evt_org) > 30 else evt_org
                ])
            seq_table = Table(seq_data, colWidths=[0.8*inch, 2.2*inch, 1.2*inch, 1*inch, 1.3*inch])
            seq_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(seq_table)
            story.append(Spacer(1, 0.2*inch))
        
        # Effects
        effects = report_data.get('effects', {})
        if any(effects.values()):
            story.append(Paragraph("Effected Properties", header_style))
            injuries = report_data.get('injuries', {})
            if injuries.get('number') is not None:
                story.append(Paragraph(f"<b>Number of Injuries:</b> {injuries.get('number')}", normal_style))
            if injuries.get('type'):
                story.append(Paragraph(f"<b>Type of Injuries:</b> {injuries.get('type')}", normal_style))
            if effects.get('production_effectiveness'):
                story.append(Paragraph(f"<b>Production Effectiveness:</b> {effects.get('production_effectiveness')}", normal_style))
            if effects.get('properties_affected'):
                story.append(Paragraph(f"<b>Effected Properties:</b> {effects.get('properties_affected')}", normal_style))
            if effects.get('comments'):
                story.append(Paragraph(f"<b>Comments:</b> {effects.get('comments')}", normal_style))
            story.append(Spacer(1, 0.2*inch))
        
        # Checklists
        checklists = report_data.get('checklists', {})
        if checklists.get('responder_actions'):
            story.append(Paragraph("Emergency Responders Checklist", header_style))
            for item in checklists['responder_actions']:
                item_text = str(item.get('item', '')) or ''
                item_answer = str(item.get('answer', 'N/A')) or 'N/A'
                story.append(Paragraph(f"• {item_text}: {item_answer}", normal_style))
            story.append(Spacer(1, 0.2*inch))
        
        if checklists.get('ecc_actions'):
            story.append(Paragraph("Emergency Control Center Checklist", header_style))
            for item in checklists['ecc_actions']:
                item_text = str(item.get('item', '')) or ''
                item_answer = str(item.get('answer', 'N/A')) or 'N/A'
                story.append(Paragraph(f"• {item_text}: {item_answer}", normal_style))
            story.append(Spacer(1, 0.2*inch))
        
        if checklists.get('sa_affairs_actions'):
            story.append(Paragraph("SA Affairs Checklist", header_style))
            for item in checklists['sa_affairs_actions']:
                item_text = str(item.get('item', '')) or ''
                item_answer = str(item.get('answer', 'N/A')) or 'N/A'
                story.append(Paragraph(f"• {item_text}: {item_answer}", normal_style))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        # Return PDF as response
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=emergency-report-{report_id}.pdf"
            }
        )
        
    except ImportError as e:
        error_msg = f"reportlab is not installed. Please install it: pip install reportlab. Error: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to export PDF: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/reports/")
async def list_post_event_reports():
    """List all Post-Event Reports"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, event_id, status, created_at, updated_at, closed_at
            FROM post_event_reports
            ORDER BY created_at DESC
        ''')
        
        reports = []
        for row in cursor.fetchall():
            reports.append({
                "id": row[0],
                "event_id": row[1],
                "status": row[2],
                "created_at": row[3],
                "updated_at": row[4],
                "closed_at": row[5]
            })
        
        conn.close()
        return reports
        
    except Exception as e:
        logger.error(f"Error listing reports: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list reports: {str(e)}")

@app.get("/api/reports/event/{event_id}/data")
async def get_event_data_for_report(event_id: int):
    """Get emergency event data and weather information for report generation"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get emergency event
        cursor.execute('''
            SELECT id, zone_name, wind_direction, activation_date, activation_time, 
                   clear_time, duration_minutes, status
            FROM emergency_events
            WHERE id = ?
        ''', (event_id,))
        
        event_row = cursor.fetchone()
        if not event_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Emergency event not found")
        
        event_data = {
            "id": event_row[0],
            "zone_name": event_row[1],
            "wind_direction": event_row[2],
            "activation_date": event_row[3],
            "activation_time": event_row[4],
            "clear_time": event_row[5],
            "duration_minutes": event_row[6],
            "status": event_row[7]
        }
        
        # Get weather data for the event date
        weather_data = None
        try:
            weather_latest = _get_latest_weather_row()
            if weather_latest:
                weather_data = weather_latest
        except Exception as e:
            logger.warning(f"Could not fetch weather data: {e}")
        
        # Build activation scenario
        activation_scenario = None
        if event_data.get("zone_name") and event_data.get("wind_direction"):
            zone = event_data["zone_name"]
            wind = event_data["wind_direction"]
            # Map wind direction to readable format
            wind_map = {
                "N-S": "north to south",
                "S-N": "south to north",
                "E-W": "east to west",
                "W-E": "west to east"
            }
            wind_readable = wind_map.get(wind, wind.lower())
            activation_scenario = f"{zone} wind {wind_readable}"
        
        conn.close()
        
        return {
            "event": event_data,
            "weather": weather_data,
            "activation_scenario": activation_scenario
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting event data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get event data: {str(e)}")

if __name__ == "__main__":
    print("🚀 Starting TSIM Complete Backend API with Emergency Events and ESP32 Gateway...")
    print("📊 Emergency Events API: /api/emergency-events/")
    print("🔌 Gateway Control API: /api/gateway/")
    print("📖 API Documentation: http://localhost:8002/docs")
    uvicorn.run(app, host="0.0.0.0", port=8002)
