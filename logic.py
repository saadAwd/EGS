from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import httpx
import serial
import time
from database import get_db
from models import Device as DeviceModel, Zone as ZoneModel, Route as RouteModel, SensorData as SensorDataModel, TrafficLightArrow as TrafficLightArrowModel, RoutePolicy as RoutePolicyModel, Pole as PoleModel, Lamp as LampModel, Gateway as GatewayModel
from schemas import (
    Device as DeviceSchema,
    DeviceCreate,
    Zone as ZoneSchema,
    ZoneCreate,
    Route as RouteSchema,
    RouteCreate,
    MessageResponse,
    SensorDataCreate,
    SensorData as SensorDataSchema,
    TrafficLightControl,
    TrafficLightStatus,
    TrafficLightArrow as TrafficLightArrowSchema,
    TrafficLightArrowCreate,
    RoutePolicy as RoutePolicySchema,
    RoutePolicyCreate,
    Pole as PoleSchema,
    PoleCreate,
    PoleWithLamps,
    Lamp as LampSchema,
    LampCreate,
    Gateway as GatewaySchema,
    GatewayCreate
)
# from serial_bridge import serial_bridge_health  # Commented out - not using serial bridge
from esp32_wifi_bridge import esp32_wifi_bridge, initialize_esp32_wifi_bridge, send_traffic_light_wifi_command
from gateway_service import ESP32GatewayService
from cr1000_service import CR1000Client
from models import WeatherRecord
from schemas import WeatherRecord as WeatherRecordSchema
import json

router = APIRouter(
    prefix="/api",
    tags=["api"],
    responses={404: {"description": "Not found"}},
)

# --- Gateway health for frontend ---
@router.get("/health")
def gateway_health(db: Session = Depends(get_db)):
    """Return gateway status in the shape the frontend expects."""
    service = ESP32GatewayService(db)
    try:
        status = {
            "gateway_connected": service.connection_status == "connected",
            "queue_depth": service.command_queue.qsize() if hasattr(service, "command_queue") else 0,
            "device_status": service.device_status if hasattr(service, "device_status") else {},
            "connection_status": service.connection_status,
            "last_heartbeat": service.last_heartbeat.isoformat() if service.last_heartbeat else None,
        }
        return status
    except Exception:
        # Always return a valid shape so the UI doesn't crash
        return {
            "gateway_connected": False,
            "queue_depth": 0,
            "device_status": {},
            "connection_status": "disconnected",
            "last_heartbeat": None,
        }

# --- Compatibility endpoints for frontend ---
class ActivationCompat(BaseModel):
    zone_id: int | None = None
    zone_name: str | None = None
    wind_direction: str

class DeactivationCompat(BaseModel):
    zone_id: int | None = None
    zone_name: str | None = None

@router.get("/test-connection")
async def test_connection():
    """Basic connectivity test for frontend. Also checks ESP32 bridge if available."""
    bridge_connected = getattr(esp32_wifi_bridge, "is_connected", False)
    return {
        "ok": True,
        "bridge_connected": bool(bridge_connected)
    }

@router.post("/activate/")
async def activate_compat(req: ActivationCompat, db: Session = Depends(get_db)):
    """Compatibility endpoint expected by frontend. Maps to /zones/activate."""
    # Resolve zone name
    zone_name: str | None = None
    if req.zone_name:
        zone_name = req.zone_name
    elif req.zone_id is not None:
        zone = db.query(ZoneModel).filter(ZoneModel.id == req.zone_id).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        zone_name = zone.name
    else:
        raise HTTPException(status_code=400, detail="zone_id or zone_name required")

    payload = ZoneActivationRequest(zone_name=zone_name, wind_direction=req.wind_direction)
    return await activate_zone_route(payload, db)

@router.post("/deactivate/")
async def deactivate_compat(req: DeactivationCompat, db: Session = Depends(get_db)):
    """Compatibility endpoint expected by frontend. Maps to /zones/deactivate."""
    zone_name: str | None = None
    if req.zone_name:
        zone_name = req.zone_name
    elif req.zone_id is not None:
        zone = db.query(ZoneModel).filter(ZoneModel.id == req.zone_id).first()
        zone_name = zone.name if zone else None
    payload = ZoneDeactivateRequest(zone_name=zone_name)
    return await deactivate_zone_route(payload, db)

# --- Direct ESP32 TCP gateway control endpoints (device-letter based) ---
@router.post("/lamp")
async def gateway_control_lamp(request: dict, db: Session = Depends(get_db)):
    """Control individual lamp: { device: 'A'..'N', lamp: 1..9, state: 'on'|'off' }"""
    try:
        device = str(request.get("device", "")).upper()
        lamp = int(request.get("lamp")) if request.get("lamp") is not None else None
        state = str(request.get("state", "")).lower()
        if not device or lamp is None or state not in ("on", "off"):
            raise HTTPException(status_code=400, detail="device, lamp, state required")

        gateway = ESP32GatewayService(db)
        result = await gateway.send_lamp_command_new(device, lamp, state)
        return {
            "ok": result["ok"],
            "ack": result["ok"],
            "retries": result["retries"],
            "t_ms": result["t_ms"],
            "error": result.get("error") if not result["ok"] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")

@router.post("/all")
async def gateway_control_all(request: dict, db: Session = Depends(get_db)):
    """All lamps on a device: { device: 'A'..'N', state: 'on'|'off' }"""
    try:
        device = str(request.get("device", "")).upper()
        state = str(request.get("state", "")).lower()
        if not device or state not in ("on", "off"):
            raise HTTPException(status_code=400, detail="device and state required")

        gateway = ESP32GatewayService(db)
        result = await gateway.send_all_command(device, state)
        return {
            "ok": result["ok"],
            "ack": result["ok"],
            "retries": result["retries"],
            "t_ms": result["t_ms"],
            "error": result.get("error") if not result["ok"] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")

@router.post("/route")
async def gateway_control_route(request: dict, db: Session = Depends(get_db)):
    """Route preset: { device: 'A'..'N', route: 0..9 }"""
    try:
        device = str(request.get("device", "")).upper()
        route = request.get("route")
        if not device or route is None:
            raise HTTPException(status_code=400, detail="device and route required")
        route_num = int(route)

        gateway = ESP32GatewayService(db)
        result = await gateway.send_route_command(device, route_num)
        return {
            "ok": result["ok"],
            "ack": result["ok"],
            "retries": result["retries"],
            "t_ms": result["t_ms"],
            "error": result.get("error") if not result["ok"] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")

@router.post("/mask")
async def gateway_control_mask(request: dict, db: Session = Depends(get_db)):
    """Mask control: { device: 'A'..'N', mask: 'hex3' }"""
    try:
        device = str(request.get("device", "")).upper()
        mask = str(request.get("mask", ""))
        if not device or not mask:
            raise HTTPException(status_code=400, detail="device and mask required")

        gateway = ESP32GatewayService(db)
        result = await gateway.send_mask_command(device, mask)
        return {
            "ok": result["ok"],
            "ack": result["ok"],
            "retries": result["retries"],
            "t_ms": result["t_ms"],
            "error": result.get("error") if not result["ok"] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")
# --- CR1000 Weather Station Endpoints ---
@router.get("/cr1000/time")
def cr1000_time():
    """Return the logger's own clock time to verify connectivity."""
    try:
        client = CR1000Client()
        t = client.get_time()
        return {"logger_time": t.isoformat()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"CR1000 time error: {e}")


@router.get("/cr1000/latest")
def cr1000_latest(table: str | None = None):
    """Return latest record from a logged table (default Tbl_1min)."""
    try:
        client = CR1000Client()
        rec = client.latest(table)
        return rec
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"CR1000 latest error: {e}")


@router.get("/cr1000/range")
def cr1000_range(minutes: int = 30, table: str | None = None):
    """Return records for the past N minutes from a logged table (default Tbl_1min)."""
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="minutes must be > 0")
    try:
        client = CR1000Client()
        rows = client.range(minutes=minutes, table=table)
        return rows
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"CR1000 range error: {e}")


# --- Weather storage endpoints ---
@router.get("/weather/latest", response_model=WeatherRecordSchema | None)
def get_latest_weather(db: Session = Depends(get_db)):
    rec = db.query(WeatherRecord).order_by(WeatherRecord.record_time.desc(), WeatherRecord.id.desc()).first()
    return rec


@router.get("/weather/recent", response_model=List[WeatherRecordSchema])
def get_recent_weather(limit: int = 10, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 10)
    recs = db.query(WeatherRecord).order_by(WeatherRecord.record_time.desc(), WeatherRecord.id.desc()).limit(limit).all()
    return recs


# ESP32 Gateway Configuration
ESP32_GATEWAY_IP = "192.168.1.100"  # Change this to your ESP32's local IP
ESP32_GATEWAY_PORT = 80

# Serial Communication Configuration
SERIAL_PORT = "/dev/tty.usbserial-0001"  # Mac USB serial port - update this if ESP32 uses different port
SERIAL_BAUDRATE = 115200
SERIAL_TIMEOUT = 5

# Initialize serial connection
def get_serial_connection():
    """Get serial connection to ESP32"""
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=SERIAL_TIMEOUT)
        return ser
    except serial.SerialException as e:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to ESP32 via serial port {SERIAL_PORT}: {str(e)}"
        )

def send_serial_command(pin: int, state: str):
    """Send GPIO control command via LoRa to field device"""
    import json
    print(f"🔌 Serial Command Details:")
    print(f"   Pin: {pin}")
    print(f"   State: {state}")
    print(f"   Port: {SERIAL_PORT}")
    print(f"   Baudrate: {SERIAL_BAUDRATE}")
    try:
        # Send JSON command in the exact format specified
        cmd = json.dumps({"cmd": "gpio_control", "pin": pin, "state": state.lower()})
        
        print(f"📤 Sending JSON command to gateway: {cmd}")
        
        # Send via LoRa through gateway
        import serial
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=2)
        ser.write((cmd + "\n").encode())
        ser.flush()
        ser.close()
        print(f"✅ JSON command sent successfully: {cmd}")
        return True
    except Exception as e:
        print(f"❌ Failed to send JSON command: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Serial error: {str(e)}"
        )


# reset_all_arrows function - REMOVED (was activation-related)


# any_emergency_active function - REMOVED (was activation-related)

# New Traffic Light System API Endpoints

# Pole Endpoints
@router.get("/poles/", response_model=List[PoleSchema])
def get_poles(db: Session = Depends(get_db)):
    """Get all poles"""
    return db.query(PoleModel).all()

@router.get("/poles/{pole_id}", response_model=PoleWithLamps)
def get_pole(pole_id: int, db: Session = Depends(get_db)):
    """Get a specific pole with its lamps"""
    pole = db.query(PoleModel).filter(PoleModel.id == pole_id).first()
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    return pole

@router.get("/poles/{pole_id}/lamps/", response_model=List[LampSchema])
def get_pole_lamps(pole_id: int, db: Session = Depends(get_db)):
    """Get all lamps for a specific pole"""
    pole = db.query(PoleModel).filter(PoleModel.id == pole_id).first()
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    return db.query(LampModel).filter(LampModel.pole_id == pole_id).all()

# Lamp Endpoints
@router.get("/lamps/", response_model=List[LampSchema])
def get_all_lamps(db: Session = Depends(get_db)):
    """Get all lamps"""
    return db.query(LampModel).all()

@router.get("/lamps/{lamp_id}", response_model=LampSchema)
def get_lamp(lamp_id: int, db: Session = Depends(get_db)):
    """Get a specific lamp"""
    lamp = db.query(LampModel).filter(LampModel.id == lamp_id).first()
    if not lamp:
        raise HTTPException(status_code=404, detail="Lamp not found")
    return lamp

@router.patch("/lamps/{lamp_id}/activate", response_model=LampSchema)
async def activate_lamp(lamp_id: int, db: Session = Depends(get_db)):
    """Activate a specific lamp"""
    lamp = db.query(LampModel).filter(LampModel.id == lamp_id).first()
    if not lamp:
        raise HTTPException(status_code=404, detail="Lamp not found")
    
    # Send command to ESP32 gateway
    gateway_service = ESP32GatewayService(db)
    gateway_success = await gateway_service.send_lamp_command(lamp_id, True)
    
    if gateway_success:
        lamp.is_on = True
        db.commit()
        db.refresh(lamp)
        print(f"🔆 Activated lamp {lamp.gateway_id} ({lamp.pole.name} Side-{lamp.side_number} {lamp.direction})")
    else:
        print(f"❌ Failed to activate lamp {lamp.gateway_id} - gateway not connected")
        raise HTTPException(status_code=503, detail="Gateway not connected")
    
    return lamp

@router.patch("/lamps/{lamp_id}/deactivate", response_model=LampSchema)
async def deactivate_lamp(lamp_id: int, db: Session = Depends(get_db)):
    """Deactivate a specific lamp"""
    lamp = db.query(LampModel).filter(LampModel.id == lamp_id).first()
    if not lamp:
        raise HTTPException(status_code=404, detail="Lamp not found")
    
    # Send command to ESP32 gateway
    gateway_service = ESP32GatewayService(db)
    gateway_success = await gateway_service.send_lamp_command(lamp_id, False)
    
    if gateway_success:
        lamp.is_on = False
        db.commit()
        db.refresh(lamp)
        print(f"🔇 Deactivated lamp {lamp.gateway_id} ({lamp.pole.name} Side-{lamp.side_number} {lamp.direction})")
    else:
        print(f"❌ Failed to deactivate lamp {lamp.gateway_id} - gateway not connected")
        raise HTTPException(status_code=503, detail="Gateway not connected")
    
    return lamp

@router.patch("/poles/{pole_id}/activate-all", response_model=List[LampSchema])
def activate_all_pole_lamps(pole_id: int, db: Session = Depends(get_db)):
    """Activate all lamps on a specific pole"""
    pole = db.query(PoleModel).filter(PoleModel.id == pole_id).first()
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    lamps = db.query(LampModel).filter(LampModel.pole_id == pole_id).all()
    for lamp in lamps:
        lamp.is_on = True
    
    db.commit()
    
    # Send commands to gateway (placeholder for ESP32 integration)
    print(f"🔆 Activating all lamps on {pole.name} (9 lamps)")
    
    return lamps

@router.patch("/poles/{pole_id}/deactivate-all", response_model=List[LampSchema])
def deactivate_all_pole_lamps(pole_id: int, db: Session = Depends(get_db)):
    """Deactivate all lamps on a specific pole"""
    pole = db.query(PoleModel).filter(PoleModel.id == pole_id).first()
    if not pole:
        raise HTTPException(status_code=404, detail="Pole not found")
    
    lamps = db.query(LampModel).filter(LampModel.pole_id == pole_id).all()
    for lamp in lamps:
        lamp.is_on = False
    
    db.commit()
    
    # Send commands to gateway (placeholder for ESP32 integration)
    print(f"🔇 Deactivating all lamps on {pole.name} (9 lamps)")
    
    return lamps

# Device Endpoints
@router.get("/devices/", response_model=List[DeviceSchema])
def get_devices(db: Session = Depends(get_db)):
    """Get all devices - simplified without activation logic"""
    devices = db.query(DeviceModel).all()
    # Set all devices as inactive by default (no activation system)
    for device in devices:
        device.is_active = False
    return devices

@router.post("/devices/", response_model=DeviceSchema)
def create_device(device: DeviceCreate, db: Session = Depends(get_db)):
    db_device = DeviceModel(**device.dict())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

# Zone Endpoints
@router.get("/zones/", response_model=List[ZoneSchema])
def get_zones(db: Session = Depends(get_db)):
    return db.query(ZoneModel).all()

@router.post("/zones/", response_model=ZoneSchema)
def create_zone(zone: ZoneCreate, db: Session = Depends(get_db)):
    db_zone = ZoneModel(**zone.dict())
    db.add(db_zone)
    db.commit()
    db.refresh(db_zone)
    return db_zone

# Route Endpoints
@router.get("/routes/", response_model=List[RouteSchema])
def get_routes(db: Session = Depends(get_db)):
    return db.query(RouteModel).all()

@router.post("/routes/", response_model=RouteSchema)
def create_route(route: RouteCreate, db: Session = Depends(get_db)):
    db_route = RouteModel(**route.dict())
    db.add(db_route)
    db.commit()
    db.refresh(db_route)
    return db_route

# Activation Endpoints - REMOVED

# API Endpoints
@router.post("/zones/", response_model=ZoneSchema)
def create_zone_endpoint(zone: ZoneCreate, db: Session = Depends(get_db)):
    return create_zone(db, zone)

@router.get("/zones/", response_model=List[ZoneSchema])
def get_zones_endpoint(db: Session = Depends(get_db)):
    return get_zones(db)

@router.post("/routes/", response_model=RouteSchema)
def create_route_endpoint(route: RouteCreate, db: Session = Depends(get_db)):
    return create_route(db, route)

@router.get("/routes/", response_model=List[RouteSchema])
def get_routes_endpoint(db: Session = Depends(get_db)):
    return get_routes(db)

@router.post("/devices/", response_model=DeviceSchema)
def create_device_endpoint(device: DeviceCreate, db: Session = Depends(get_db)):
    return create_device(db, device)

@router.get("/zones/{zone_id}", response_model=ZoneSchema)
def get_zone_endpoint(zone_id: int, db: Session = Depends(get_db)):
    return get_zone(db, zone_id)

# ZoneStatus endpoint removed - was activation-related

# Sensor Data Endpoints
@router.post("/sensor-data/", response_model=SensorDataSchema)
def create_sensor_data(sensor_data: SensorDataCreate, db: Session = Depends(get_db)):
    # Validate that the device exists
    device = db.query(DeviceModel).filter(DeviceModel.id == sensor_data.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Create new sensor data record
    gateway_rssi = sensor_data.gateway_rssi if hasattr(sensor_data, 'gateway_rssi') else None
    gateway_snr = sensor_data.gateway_snr if hasattr(sensor_data, 'gateway_snr') else None
    db_sensor_data = SensorDataModel(
        device_id=sensor_data.device_id,
        temperature_c=sensor_data.temperature_c,
        humidity_percent=sensor_data.humidity_percent,
        hydrogen_ppm=sensor_data.hydrogen_ppm,
        rssi_dbm=sensor_data.rssi_dbm,
        snr_db=sensor_data.snr_db,
        hop_count=sensor_data.hop_count,
        msg_id=sensor_data.msg_id,
        lamp_state=sensor_data.lamp_state,
        gateway_rssi=gateway_rssi,
        gateway_snr=gateway_snr
    )
    db.add(db_sensor_data)
    db.commit()
    db.refresh(db_sensor_data)
    return db_sensor_data

@router.get("/sensor-data/device/{device_id}", response_model=List[SensorDataSchema])
def get_device_sensor_data(device_id: int, limit: int = 100, db: Session = Depends(get_db)):
    # Validate that the device exists
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    sensor_data = db.query(SensorDataModel).filter(
        SensorDataModel.device_id == device_id
    ).order_by(SensorDataModel.timestamp.desc()).limit(limit).all()
    return sensor_data

@router.get("/sensor-data/latest/", response_model=List[SensorDataSchema])
def get_latest_sensor_data(limit: int = 50, db: Session = Depends(get_db)):
    # Get latest sensor data for each device
    latest_data = []
    devices = db.query(DeviceModel).all()
    
    for device in devices:
        latest = db.query(SensorDataModel).filter(
            SensorDataModel.device_id == device.id
        ).order_by(SensorDataModel.timestamp.desc()).first()
        if latest:
            latest_data.append(latest)
    
    return latest_data[:limit]

@router.get("/sensor-data/latest-with-signal/", response_model=List[SensorDataSchema])
def get_latest_sensor_data_with_signal(limit: int = 50, db: Session = Depends(get_db)):
    """Get latest sensor data for each (device_id, hop_count) pair including RSSI and SNR"""
    from sqlalchemy import func
    # Subquery: get the max timestamp for each (device_id, hop_count)
    subq = db.query(
        SensorDataModel.device_id,
        SensorDataModel.hop_count,
        func.max(SensorDataModel.timestamp).label("max_timestamp")
    ).group_by(SensorDataModel.device_id, SensorDataModel.hop_count).subquery()

    # Join with main table to get full records
    q = db.query(SensorDataModel).join(
        subq,
        (SensorDataModel.device_id == subq.c.device_id) &
        (SensorDataModel.hop_count == subq.c.hop_count) &
        (SensorDataModel.timestamp == subq.c.max_timestamp)
    ).order_by(SensorDataModel.timestamp.desc())

    results = q.limit(limit).all()
    return results

@router.get("/sensor-data/recent-readings/", response_model=List[SensorDataSchema])
def get_recent_sensor_readings(limit: int = 10, db: Session = Depends(get_db)):
    """Get the most recent sensor readings chronologically (for table display)"""
    # Get the most recent readings by timestamp, regardless of device/hop
    sensor_data = db.query(SensorDataModel).order_by(
        SensorDataModel.timestamp.desc()
    ).limit(limit).all()
    return sensor_data

@router.get("/sensor-data/device/{device_id}/signal", response_model=List[SensorDataSchema])
def get_device_sensor_data_with_signal(device_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get sensor data for a specific device including RSSI and SNR"""
    # Validate that the device exists
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    sensor_data = db.query(SensorDataModel).filter(
        SensorDataModel.device_id == device_id
    ).order_by(SensorDataModel.timestamp.desc()).limit(limit).all()
    return sensor_data

# Traffic Light Control Endpoints
@router.post("/traffic-light/control/", response_model=MessageResponse)
def control_traffic_light(control: TrafficLightControl, db: Session = Depends(get_db)):
    device = db.query(DeviceModel).filter(DeviceModel.id == control.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    status = "GREEN" if control.is_green else "RED"

    # Prefer the ESP32 TCP gateway (AP 192.168.4.1) for manual checks
    try:
        gateway = ESP32GatewayService(db)
        name = (device.name or "").strip().upper()
        # If device name is a single letter A..N, treat it as gateway device letter and send ALL on/off
        if len(name) == 1 and name >= 'A' and name <= 'N':
            state = 'on' if control.is_green else 'off'
            # send_all_command returns a dict { ok, retries, t_ms, error }
            import asyncio
            result = asyncio.get_event_loop().run_until_complete(gateway.send_all_command(name, state))
            if result.get("ok"):
                device.is_green = control.is_green
                db.commit()
                logger.info(f"Successfully set device {name} to {status} via TCP gateway")
                return MessageResponse(message=f"Traffic light {name} set to {status} via gateway")
            else:
                logger.error(f"Gateway command failed for {name}: {result.get('error')}")
        else:
            # Fallback: try legacy WiFi bridge if naming does not map to a gateway letter
            esp32_success = send_traffic_light_wifi_command(device.name, control.is_green)
            if esp32_success:
                device.is_green = control.is_green
                db.commit()
                logger.info(f"Successfully set {device.name} to {status} via WiFi bridge (fallback)")
                return MessageResponse(message=f"Traffic light {device.name} set to {status}")
    except Exception as e:
        logger.error(f"Manual control error for device_id={control.device_id}: {e}")

    raise HTTPException(status_code=500, detail="Failed to send manual control to gateway")

@router.get("/traffic-light/status/{device_id}", response_model=TrafficLightStatus)
def get_traffic_light_status(device_id: int, db: Session = Depends(get_db)):
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Simplified - no activation system
    is_active = False

    # Get the latest sensor reading timestamp as last_updated
    latest_sensor = db.query(SensorDataModel).filter(
        SensorDataModel.device_id == device_id
    ).order_by(SensorDataModel.timestamp.desc()).first()

    from datetime import datetime
    last_updated = latest_sensor.timestamp if latest_sensor else datetime.now()

    return TrafficLightStatus(
        device_id=device.id,
        is_green=device.is_green,
        is_active=is_active,
        last_updated=last_updated
    )

@router.get("/traffic-light/status/", response_model=List[TrafficLightStatus])
def get_all_traffic_light_status(db: Session = Depends(get_db)):
    devices = db.query(DeviceModel).all()
    status_list = []

    # Simplified - no activation system
    active_device_ids = set()

    from datetime import datetime

    for device in devices:
        is_active = device.id in active_device_ids
        latest_sensor = db.query(SensorDataModel).filter(
            SensorDataModel.device_id == device.id
        ).order_by(SensorDataModel.timestamp.desc()).first()
        last_updated = latest_sensor.timestamp if latest_sensor else datetime.now()
        status_list.append(TrafficLightStatus(
            device_id=device.id,
            is_green=device.is_green,
            is_active=is_active,
            last_updated=last_updated
        ))
    return status_list

# --- Traffic light arrows ---

@router.get("/traffic-light/{device_id}/arrows", response_model=List[TrafficLightArrowSchema])
def get_device_arrows(device_id: int, db: Session = Depends(get_db)):
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    # Ensure three rows exist
    existing = db.query(TrafficLightArrowModel).filter(TrafficLightArrowModel.device_id == device_id).all()
    if len(existing) < 3:
        needed = {"left", "straight", "right"} - {a.direction for a in existing}
        for d in needed:
            db.add(TrafficLightArrowModel(device_id=device_id, direction=d, is_on=False))
        db.commit()
        existing = db.query(TrafficLightArrowModel).filter(TrafficLightArrowModel.device_id == device_id).all()
    return existing

@router.patch("/traffic-light/{device_id}/arrow", response_model=TrafficLightArrowSchema)
def set_device_arrow(device_id: int, arrow: TrafficLightArrowCreate, db: Session = Depends(get_db)):
    # Emergency check removed - no more activation logic
    if device_id != arrow.device_id:
        raise HTTPException(status_code=400, detail="device_id mismatch")
    if arrow.direction not in ["left", "straight", "right"]:
        raise HTTPException(status_code=400, detail="Invalid direction")
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    rec = db.query(TrafficLightArrowModel).filter(
        TrafficLightArrowModel.device_id == device_id,
        TrafficLightArrowModel.direction == arrow.direction
    ).first()
    if not rec:
        rec = TrafficLightArrowModel(device_id=device_id, direction=arrow.direction, is_on=arrow.is_on)
        db.add(rec)
    else:
        rec.is_on = arrow.is_on
    # Optional: push to ESP32
    try:
        send_serial_command(25, "on" if arrow.is_on else "off")  # TODO: map per-direction pins
    except Exception:
        pass
    db.commit()
    db.refresh(rec)
    return rec

# --- Route policies and apply ---
@router.get("/routes/{route_id}/policy", response_model=List[RoutePolicySchema])
def get_route_policy(route_id: int, db: Session = Depends(get_db)):
    return db.query(RoutePolicyModel).filter(RoutePolicyModel.route_id == route_id).all()

@router.put("/routes/{route_id}/policy", response_model=List[RoutePolicySchema])
def put_route_policy(route_id: int, items: List[RoutePolicyCreate], db: Session = Depends(get_db)):
    db.query(RoutePolicyModel).filter(RoutePolicyModel.route_id == route_id).delete()
    for it in items:
        db.add(RoutePolicyModel(route_id=route_id, device_id=it.device_id, direction=it.direction, is_on=it.is_on))
    db.commit()
    return db.query(RoutePolicyModel).filter(RoutePolicyModel.route_id == route_id).all()

@router.post("/routes/{route_id}/apply", response_model=MessageResponse)
def apply_route(route_id: int, db: Session = Depends(get_db)):
    policy = db.query(RoutePolicyModel).filter(RoutePolicyModel.route_id == route_id).all()
    for p in policy:
        rec = db.query(TrafficLightArrowModel).filter(
            TrafficLightArrowModel.device_id == p.device_id,
            TrafficLightArrowModel.direction == p.direction
        ).first()
        if not rec:
            rec = TrafficLightArrowModel(device_id=p.device_id, direction=p.direction, is_on=p.is_on)
            db.add(rec)
        else:
            rec.is_on = p.is_on
        try:
            send_serial_command(25, "on" if p.is_on else "off")
        except Exception:
            pass
    db.commit()
    return MessageResponse(message="Route policy applied")

# Add this function before the API Endpoints section
def get_zone(db: Session, zone_id: int):
    zone = db.query(ZoneModel).filter(ZoneModel.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone

# Test endpoint to debug traffic light status issue
@router.get("/test-traffic-light/{device_id}")
def test_traffic_light(device_id: int, db: Session = Depends(get_db)):
    try:
        device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
        if not device:
            return {"error": "Device not found"}
        
        return {
            "device_id": device.id,
            "is_green": device.is_green,
            "is_active": device.is_active
        }
    except Exception as e:
        return {"error": str(e)} 

# GPIO Control Endpoint for ESP32 via Serial
@router.get("/gpio/control/")
async def control_gpio_pin(pin: int, state: str, db: Session = Depends(get_db)):
    """
    Control GPIO pin on ESP32 via serial communication
    Enhanced: After sending the command, wait 10s, trigger sensor read, check lamp state, and retry if needed.
    """
    import asyncio
    from datetime import datetime, timedelta
    print(f"🎛️  GPIO Control Request Received:")
    print(f"   Pin: {pin}")
    print(f"   State: {state}")
    print(f"   Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    # Validate pin number (common ESP32 GPIO pins)
    if pin not in [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39]:
        print(f"❌ Invalid GPIO pin number: {pin}")
        raise HTTPException(status_code=400, detail="Invalid GPIO pin number")

    # Validate state
    if state.lower() not in ['on', 'off']:
        print(f"❌ Invalid state: {state}")
        raise HTTPException(status_code=400, detail="State must be 'on' or 'off'")

    try:
        print(f"📡 Sending serial command: GPIO {pin} -> {state.lower()}")
        send_serial_command(pin, state.lower())
        print(f"✅ GPIO command executed successfully")
        print(f"   Pin {pin} set to {state.lower()}")

        # --- Enhanced Verification Logic ---
        # Wait 10 seconds
        await asyncio.sleep(10)
        # Trigger sensor read
        try:
            from fastapi.testclient import TestClient
            client = TestClient(router)
            client.post("/trigger-sensor-read/")
        except Exception as e:
            print(f"⚠️ Could not trigger sensor read: {e}")
        await asyncio.sleep(2)  # Wait for sensor to respond
        # Check latest lamp state
        latest = db.query(SensorDataModel).filter(SensorDataModel.device_id == 1).order_by(SensorDataModel.timestamp.desc()).first()
        desired_state = state.lower()
        if latest and latest.lamp_state == desired_state:
            return {
                "message": f"GPIO pin {pin} set to {state.lower()} and verified.",
                "pin": pin,
                "state": state.lower(),
                "lamp_state": latest.lamp_state,
                "verified": True
            }
        # If not matching, retry
        print(f"🔁 Lamp state mismatch after 1st check. Retrying...")
        send_serial_command(pin, state.lower())
        await asyncio.sleep(5)
        try:
            client.post("/trigger-sensor-read/")
        except Exception as e:
            print(f"⚠️ Could not trigger sensor read (retry): {e}")
        await asyncio.sleep(10)
        latest2 = db.query(SensorDataModel).filter(SensorDataModel.device_id == 1).order_by(SensorDataModel.timestamp.desc()).first()
        if latest2 and latest2.lamp_state == desired_state:
            return {
                "message": f"GPIO pin {pin} set to {state.lower()} and verified after retry.",
                "pin": pin,
                "state": state.lower(),
                "lamp_state": latest2.lamp_state,
                "verified": True,
                "retry": True
            }
        return {
            "message": f"GPIO pin {pin} set to {state.lower()} but lamp state did not match after retry.",
            "pin": pin,
            "state": state.lower(),
            "lamp_state": latest2.lamp_state if latest2 else None,
            "verified": False,
            "retry": True
        }
    except HTTPException:
        print(f"❌ HTTP Exception in GPIO control")
        raise
    except Exception as e:
        print(f"❌ Error controlling GPIO pin {pin}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to control GPIO pin {pin}: {str(e)}"
        )

# LoRa Data Endpoint
@router.post("/lora-data/", response_model=MessageResponse)
def receive_lora_data(lora_data: dict, db: Session = Depends(get_db)):
    """
    Receive LoRa sensor data in format:
    {"device_id": 1, "temp": 25.8, "humidity": 34, "rssi": -30, "snr": 9.75, "lamp_state": "on"}
    """
    try:
        # Extract data from LoRa JSON
        device_id = lora_data.get("device_id")
        temperature = lora_data.get("temp")
        humidity = lora_data.get("humidity")
        rssi = lora_data.get("rssi")
        snr = lora_data.get("snr")
        hop_count = lora_data.get("hop", 0)
        msg_id = lora_data.get("msg_id")
        lamp_state = lora_data.get("lamp_state")
        
        # Validate device exists
        device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
        
        # Create sensor data record
        gateway_rssi = lora_data.get("gateway_rssi")
        gateway_snr = lora_data.get("gateway_snr")
        sensor_data = SensorDataModel(
            device_id=device_id,
            temperature_c=temperature,
            humidity_percent=humidity,
            rssi_dbm=rssi,
            snr_db=snr,
            hydrogen_ppm=None,
            hop_count=hop_count,
            msg_id=msg_id,
            lamp_state=lamp_state,
            gateway_rssi=gateway_rssi,
            gateway_snr=gateway_snr
        )
        
        db.add(sensor_data)
        db.commit()
        db.refresh(sensor_data)
        
        print(f"📩 Received LoRa data from Device {device_id} (hop {hop_count}, msg_id: {msg_id}):")
        print(f"   Temperature: {temperature}°C")
        print(f"   Humidity: {humidity}%")
        print(f"   RSSI: {rssi} dBm")
        print(f"   SNR: {snr} dB")
        print(f"   Lamp State: {lamp_state}")
        
        return MessageResponse(message=f"LoRa data received from device {device_id}")
        
    except Exception as e:
        print(f"Error processing LoRa data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process LoRa data: {str(e)}")

@router.post("/trigger-sensor-read/", response_model=MessageResponse)
async def trigger_sensor_read(request: Request, db: Session = Depends(get_db)):
    """Trigger field device or repeater to control lamp (on-demand)."""
    try:
        import serial
        import json
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=SERIAL_TIMEOUT)
        # Read JSON body if present
        try:
            body = await request.json()
        except Exception:
            body = None
        if body:
            cmd = json.dumps(body)
        else:
            cmd = '{"cmd":"read_sensor"}'  # Default to read_sensor to get temperature and humidity
        ser.write(cmd.encode('utf-8') + b'\n')
        ser.flush()
        ser.close()
        return MessageResponse(message="Lamp control command sent to field device or repeater.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger lamp control: {str(e)}")

@router.get("/test-connection")
def test_connection():
    """Test endpoint to verify frontend can reach backend"""
    print(f"🔗 Connection test request received at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    return {
        "message": "Backend connection successful",
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "status": "ok"
    }

# @router.get("/serial-bridge/health")  # Commented out - not using serial bridge
# def get_serial_bridge_health():
#     return serial_bridge_health()

@router.get("/esp32/status")
async def get_esp32_status():
    """Get ESP32 master device status"""
    global esp32_wifi_bridge
    
    if not esp32_wifi_bridge.is_connected:
        return {
            "connected": False,
            "message": "ESP32 not connected",
            "ip": esp32_wifi_bridge.esp32_ip
        }
    
    # Test connection
    connection_ok = await esp32_wifi_bridge.test_connection()
    status = esp32_wifi_bridge.get_esp32_status()
    
    return {
        "connected": connection_ok,
        "ip": esp32_wifi_bridge.esp32_ip,
        "port": esp32_wifi_bridge.port,
        "device_states": esp32_wifi_bridge.get_all_device_states(),
        "esp32_status": status
    }

@router.post("/esp32/test-command")
async def test_esp32_command(device_id: str, is_green: bool):
    """Test ESP32 command for debugging"""
    success = send_traffic_light_wifi_command(device_id, is_green)
    
    return {
        "success": success,
        "device_id": device_id,
        "command": "GREEN" if is_green else "RED",
        "message": f"Command {'sent successfully' if success else 'failed'}"
    }

# ESP32 WiFi Bridge Endpoints
@router.get("/esp32/status")
async def get_esp32_status():
    """Get ESP32 master device status"""
    global esp32_wifi_bridge
    
    if not esp32_wifi_bridge.is_connected:
        return {
            "connected": False,
            "message": "ESP32 not connected",
            "ip": esp32_wifi_bridge.esp32_ip
        }
    
    # Test connection
    connection_ok = await esp32_wifi_bridge.test_connection()
    status = esp32_wifi_bridge.get_esp32_status()
    
    return {
        "connected": connection_ok,
        "ip": esp32_wifi_bridge.esp32_ip,
        "port": esp32_wifi_bridge.port,
        "device_states": esp32_wifi_bridge.get_all_device_states(),
        "esp32_status": status
    }

@router.post("/esp32/test-command")
async def test_esp32_command(device_id: str, is_green: bool):
    """Test ESP32 command for debugging"""
    success = send_traffic_light_wifi_command(device_id, is_green)
    
    return {
        "success": success,
        "device_id": device_id,
        "command": "GREEN" if is_green else "RED",
        "message": f"Command {'sent successfully' if success else 'failed'}"
    }

# Command status endpoint removed - commands are sent immediately

# Gateway Management Endpoints
@router.get("/gateway/status")
async def get_gateway_status(db: Session = Depends(get_db)):
    """Get ESP32 gateway connection status"""
    gateway_service = ESP32GatewayService(db)
    # Always check connection status first
    await gateway_service.check_connection()
    status = gateway_service.get_connection_status()
    return status

@router.post("/gateway/connect")
async def connect_gateway(db: Session = Depends(get_db)):
    """Connect to ESP32 gateway"""
    gateway_service = ESP32GatewayService(db)
    success = await gateway_service.check_connection()
    
    return {
        "success": success,
        "status": gateway_service.get_connection_status(),
        "message": "Gateway connected successfully" if success else "Failed to connect to gateway"
    }

@router.post("/gateway/disconnect")
async def disconnect_gateway(db: Session = Depends(get_db)):
    """Disconnect from ESP32 gateway"""
    gateway_service = ESP32GatewayService(db)
    gateway_service.connection_status = "disconnected"
    
    return {
        "success": True,
        "message": "Gateway disconnected",
        "status": gateway_service.get_connection_status()
    }

@router.post("/gateway/update-lamp-mapping")
async def update_lamp_gateway_mapping(db: Session = Depends(get_db)):
    """Update lamp gateway switch mapping for first 30 lamps"""
    gateway_service = ESP32GatewayService(db)
    success = await gateway_service.update_lamp_gateway_mapping()
    
    return {
        "success": success,
        "message": "Lamp gateway mapping updated successfully" if success else "Failed to update lamp mapping"
    }

@router.post("/gateway/send-lamp-command")
async def send_lamp_command(lamp_id: int, state: bool, db: Session = Depends(get_db)):
    """Send command to specific lamp via ESP32 gateway"""
    gateway_service = ESP32GatewayService(db)
    success = await gateway_service.send_lamp_command(lamp_id, state)
    
    return {
        "success": success,
        "lamp_id": lamp_id,
        "state": state,
        "message": f"Lamp {'activated' if state else 'deactivated'} successfully" if success else "Failed to send lamp command"
    }

@router.post("/gateway/send-batch-commands")
async def send_batch_commands(commands: dict, db: Session = Depends(get_db)):
    """Send multiple commands to ESP32 gateway"""
    gateway_service = ESP32GatewayService(db)
    success = await gateway_service.send_batch_commands(commands)
    
    return {
        "success": success,
        "commands_count": len(commands),
        "message": f"Batch commands sent successfully" if success else "Failed to send batch commands"
    } 

# --- New: Zone Activation by Routes (starting with Zone A) ---
class ZoneActivationRequest(BaseModel):
    zone_name: str
    wind_direction: str  # 'N-S' | 'S-N' | 'E-W' | 'W-E'

@router.post("/zones/activate")
async def activate_zone_route(req: ZoneActivationRequest, db: Session = Depends(get_db)):
    """Activate a zone's lamps for a given wind direction.

    Implements all zones (A, B, C, D, E, F, G, H, K) routing. Lamps not physically installed are ignored.
    Installed lamp IDs: 4,5,6, 13,14,15, 22,23,24, 31,32,33, 40,41,42, 49,50,51
    """
    zone_key = req.zone_name.strip().lower()
    wind = req.wind_direction.strip().upper()

    zone_a_map = {
        'N-S': [6, 105],
        'S-N': [4, 13, 22, 31, 42, 52, 70, 79, 97],
        'E-W': [6, 105],
        'W-E': [4, 13, 22, 31, 42, 52, 70, 79, 97],
    }

    zone_b_map = {
        'N-S': [6, 104],
        'S-N': [4, 15],
        'E-W': [4, 15],  # Swapped: E-W now matches S-N pattern
        'W-E': [6, 104],  # Swapped: W-E now matches N-S pattern
    }

    zone_c_map = {
        'N-S': [4, 15],
        'S-N': [4, 13, 22, 31, 42, 54, 58],
        'E-W': [4, 13, 22, 31, 42, 54, 60],
        'W-E': [4, 15],
    }

    zone_d_map = {
        'N-S': [6, 103],
        'S-N': [4, 13, 22, 31, 42, 52, 70, 81, 86],
        'E-W': [6, 103],
        'W-E': [4, 13, 22, 31, 42, 52, 70, 81, 86],
    }

    zone_e_map = {
        'N-S': [5],
        'S-N': [4, 14],
        'E-W': [4, 14],
        'W-E': [5],
    }

    zone_f_map = {
        'N-S': [6, 92, 103],
        'S-N': [4, 13, 22, 31, 42, 52, 70, 81, 86],
        'E-W': [6, 92, 103],
        'W-E': [4, 13, 22, 31, 42, 52, 70, 81, 86],
    }

    zone_g_map = {
        'N-S': [6, 88, 92, 103],
        'S-N': [4, 22, 13, 31, 42, 52, 72],  # Corrected sequence: 4, 22, 13, 31, 42, 52, 72
        'E-W': [4, 22, 13, 31, 42, 52, 72],  # Same as S-N pattern
        'W-E': [6, 88, 92, 103],
    }

    zone_h_map = {
        'N-S': [4, 13, 22, 32],
        'S-N': [4, 13, 22, 32],
        'E-W': [4, 13, 23, 114],
        'W-E': [4, 13, 22, 32],
    }

    zone_k_map = {
        'N-S': [4, 13, 23, 113],
        'S-N': [4, 13, 23, 114, 119],
        'E-W': [4, 13, 22, 31, 41, 126],  # Corrected sequence: 4, 13, 22, 31, 41, 126
        'W-E': [4, 13, 23, 112],
    }

    # Physically installed lamps (in this deployment)
    installed = {4,5,6, 13,14,15, 22,23,24, 31,32,33, 40,41,42, 49,50,51}

    if zone_key == 'zone a':
        planned_lamps = zone_a_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone b':
        planned_lamps = zone_b_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone c':
        planned_lamps = zone_c_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone d':
        planned_lamps = zone_d_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone e':
        planned_lamps = zone_e_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone f':
        planned_lamps = zone_f_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone g':
        planned_lamps = zone_g_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone h':
        planned_lamps = zone_h_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    elif zone_key == 'zone k':
        planned_lamps = zone_k_map.get(wind)
        if planned_lamps is None:
            raise HTTPException(status_code=400, detail=f"Unsupported wind direction: {req.wind_direction}")
    else:
        raise HTTPException(status_code=400, detail=f"Zone mapping not defined yet for {req.zone_name}")

    target_lamp_ids = [lid for lid in planned_lamps if lid in installed]

    lamps = db.query(LampModel).filter(LampModel.id.in_(target_lamp_ids)).all()
    commands: dict[int, bool] = {}
    included: list[int] = []
    skipped: list[int] = []

    # Fallback: derive switch id from installed order if missing
    installed_order = [4,5,6, 13,14,15, 22,23,24, 31,32,33, 40,41,42, 49,50,51]
    id_to_switch: dict[int, int] = {lamp_id: idx + 1 for idx, lamp_id in enumerate(installed_order)}

    for lid in target_lamp_ids:
        lamp = next((l for l in lamps if l.id == lid), None)
        switch_id = None
        if lamp and lamp.gateway_switch_id:
            switch_id = lamp.gateway_switch_id
        else:
            switch_id = id_to_switch.get(lid)
        if not switch_id:
            skipped.append(lid)
            continue
        commands[switch_id] = True
        included.append(lid)

    gateway_service = ESP32GatewayService(db)
    print(f"[ZONE ACTIVATE] Zone={req.zone_name} Wind={wind} Planned={planned_lamps} Included={included} SwitchCommands={commands}")
    success = await gateway_service.send_batch_commands(commands) if commands else False

    return {
        "success": bool(success),
        "zone": req.zone_name,
        "wind_direction": wind,
        "planned_lamps": planned_lamps,
        "activated_lamps": included,
        "skipped_lamps": skipped,
        "switch_commands": commands,
    }

class ZoneDeactivateRequest(BaseModel):
    zone_name: str | None = None

@router.post("/zones/deactivate")
async def deactivate_zone_route(req: ZoneDeactivateRequest, db: Session = Depends(get_db)):
    """Deactivate all physically installed lamps (turn OFF)."""
    # Installed physical order (matches switch 1..18)
    installed_order = [4,5,6, 13,14,15, 22,23,24, 31,32,33, 40,41,42, 49,50,51]
    commands = {idx + 1: False for idx in range(len(installed_order))}

    gateway_service = ESP32GatewayService(db)
    print(f"[ZONE DEACTIVATE] Zone={req.zone_name or '-'} SwitchCommands={commands}")
    success = await gateway_service.send_batch_commands(commands)

    return {
        "success": bool(success),
        "zone": req.zone_name,
        "deactivated_switches": list(commands.keys()),
    }