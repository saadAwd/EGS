from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Zone(Base):
    __tablename__ = "zones"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    # is_active and active_wind_direction columns - REMOVED (were activation-related)
    
    # Relationships
    routes = relationship("Route", back_populates="zone")
    # activations relationship - REMOVED

class Route(Base):
    __tablename__ = "routes"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("zones.id"))
    name = Column(String(100))
    wind_direction = Column(String(50))
    
    # Relationships
    zone = relationship("Zone", back_populates="routes")
    devices = relationship("Device", back_populates="route")

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    route_id = Column(Integer, ForeignKey("routes.id"))
    location = Column(String(100))
    description = Column(String(200), nullable=True)  # Device description
    is_green = Column(Boolean, default=False)  # Track traffic light state
    
    # Relationships
    route = relationship("Route", back_populates="devices")
    sensor_readings = relationship("SensorData", back_populates="device")
    arrows = relationship("TrafficLightArrow", back_populates="device", cascade="all, delete-orphan")

# New Traffic Light System Models

class Pole(Base):
    __tablename__ = "poles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # "Pole-1", "Pole-2", etc.
    location = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=False)
    
    # Relationships
    lamps = relationship("Lamp", back_populates="pole", cascade="all, delete-orphan")

class Lamp(Base):
    __tablename__ = "lamps"
    
    id = Column(Integer, primary_key=True, index=True)
    pole_id = Column(Integer, ForeignKey("poles.id"), nullable=False)
    lamp_number = Column(Integer, nullable=False)  # 1-9 within each pole
    side_number = Column(Integer, nullable=False)  # 1, 2, or 3
    direction = Column(String(20), nullable=False)  # "straight", "left", "right"
    gateway_id = Column(String(50), unique=True, nullable=False)  # "L1" to "L126"
    gateway_switch_id = Column(Integer, nullable=True)  # ESP32 switch number (1-30)
    gateway_command_on = Column(String(5), nullable=True)  # "b", "d", "f", etc.
    gateway_command_off = Column(String(5), nullable=True)  # "a", "c", "e", etc.
    is_on = Column(Boolean, default=False)
    
    # Relationships
    pole = relationship("Pole", back_populates="lamps")
    
    # Ensure unique lamp_number per pole
    __table_args__ = (UniqueConstraint('pole_id', 'lamp_number', name='unique_pole_lamp'),)

class Gateway(Base):
    __tablename__ = "gateways"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # "ESP32-Gateway-1"
    ip_address = Column(String(15), nullable=False)  # "192.168.4.1"
    wifi_ssid = Column(String(50), nullable=False)  # "Aramco_EES"
    is_connected = Column(Boolean, default=False)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class SensorData(Base):
    __tablename__ = "sensor_data"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    hydrogen_ppm = Column(Float, nullable=True)  # Store as float for precision
    temperature_c = Column(Float, nullable=True)
    humidity_percent = Column(Float, nullable=True)
    rssi_dbm = Column(Float, nullable=True)  # RSSI in dBm
    snr_db = Column(Float, nullable=True)    # SNR in dB
    hop_count = Column(Integer, nullable=True)  # Number of hops (0 = direct, 1 = via repeater)
    msg_id = Column(String(50), nullable=True)  # Message ID for tracking
    lamp_state = Column(String(20), nullable=True)  # Lamp state (on/off)
    gateway_rssi = Column(Float, nullable=True)  # Gateway RSSI in dBm
    gateway_snr = Column(Float, nullable=True)   # Gateway SNR in dB
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    device = relationship("Device", back_populates="sensor_readings") 


class TrafficLightArrow(Base):
    __tablename__ = "traffic_light_arrows"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), index=True, nullable=False)
    direction = Column(String(16), nullable=False)  # 'left' | 'straight' | 'right'
    is_on = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    device = relationship("Device", back_populates="arrows")


class RoutePolicy(Base):
    __tablename__ = "route_policies"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("routes.id"), index=True, nullable=False)
    device_id = Column(Integer, ForeignKey("devices.id"), index=True, nullable=False)
    direction = Column(String(16), nullable=False)  # 'left' | 'straight' | 'right'
    is_on = Column(Boolean, default=True, nullable=False)

    # Optional relationships
    route = relationship("Route")
    device = relationship("Device")


# --- Weather ---
class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    # Timestamp coming from logger record (Datetime field or device clock now)
    record_time = Column(DateTime(timezone=True), nullable=False)
    temperature_c = Column(Float, nullable=True)
    wind_speed_ms = Column(Float, nullable=True)
    wind_direction_deg = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())