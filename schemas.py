from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# Zone Schemas
class ZoneBase(BaseModel):
    name: str

class ZoneCreate(ZoneBase):
    pass

class Zone(ZoneBase):
    id: int

    class Config:
        from_attributes = True

# Route Schemas
class RouteBase(BaseModel):
    zone_id: int
    name: str
    wind_direction: str

class RouteCreate(RouteBase):
    pass

class Route(RouteBase):
    id: int
    
    class Config:
        from_attributes = True

# Device Schemas
class DeviceBase(BaseModel):
    name: str
    route_id: int
    location: str
    description: str | None = None

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    id: int
    is_active: bool = False
    is_green: bool = False
    
    class Config:
        from_attributes = True

# Zone Status Response
# New Traffic Light System Schemas

class PoleBase(BaseModel):
    name: str
    location: Optional[str] = None
    is_active: bool = False

class PoleCreate(PoleBase):
    pass

class Pole(PoleBase):
    id: int
    
    class Config:
        from_attributes = True

class LampBase(BaseModel):
    pole_id: int
    lamp_number: int
    side_number: int
    direction: str
    gateway_id: str
    gateway_switch_id: Optional[int] = None
    gateway_command_on: Optional[str] = None
    gateway_command_off: Optional[str] = None
    is_on: bool = False

class LampCreate(LampBase):
    pass

class Lamp(LampBase):
    id: int
    pole: Optional[Pole] = None
    
    class Config:
        from_attributes = True

class PoleWithLamps(Pole):
    lamps: List[Lamp] = []
    
    class Config:
        from_attributes = True

# Gateway Schemas
class GatewayBase(BaseModel):
    name: str
    ip_address: str
    wifi_ssid: str
    is_connected: bool = False

class GatewayCreate(GatewayBase):
    pass

class Gateway(GatewayBase):
    id: int
    last_heartbeat: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Response Schemas
class MessageResponse(BaseModel):
    message: str

class PaginatedResponse(BaseModel):
    items: List[dict]
    total: int
    page: int
    size: int
    pages: int

# Sensor Data Schemas
class SensorDataCreate(BaseModel):
    device_id: int
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    hydrogen_ppm: Optional[float] = None
    rssi_dbm: Optional[float] = None
    snr_db: Optional[float] = None
    hop_count: Optional[int] = None
    msg_id: Optional[str] = None
    lamp_state: Optional[str] = None
    gateway_rssi: Optional[float] = None
    gateway_snr: Optional[float] = None

class SensorData(SensorDataCreate):
    id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

# Traffic Light Control Schemas
class TrafficLightControl(BaseModel):
    device_id: int
    is_green: bool

class TrafficLightStatus(BaseModel):
    device_id: int
    is_green: bool
    is_active: bool
    last_updated: datetime
    
    class Config:
        from_attributes = True 


# Traffic light arrows (on/off only)
class TrafficLightArrowBase(BaseModel):
    device_id: int
    direction: str  # 'left' | 'straight' | 'right'
    is_on: bool

class TrafficLightArrowCreate(TrafficLightArrowBase):
    pass

class TrafficLightArrow(TrafficLightArrowBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


class RoutePolicyBase(BaseModel):
    route_id: int
    device_id: int
    direction: str
    is_on: bool = True

class RoutePolicyCreate(RoutePolicyBase):
    pass

class RoutePolicy(RoutePolicyBase):
    id: int

    class Config:
        from_attributes = True


# --- Weather ---
class WeatherRecord(BaseModel):
    id: int
    record_time: datetime
    temperature_c: float | None = None
    wind_speed_ms: float | None = None
    wind_direction_deg: float | None = None

    class Config:
        from_attributes = True