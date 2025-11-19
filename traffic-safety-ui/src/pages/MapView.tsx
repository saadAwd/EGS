import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, GeoJSON, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import { useActivationContext } from '../contexts/ActivationContext';
import { Device } from '../types';
import { devicesApi } from '../api/devices';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Add custom CSS for glowing effect
const glowStyle = `
  .glow-zone {
    animation: glow 2s ease-in-out infinite alternate;
  }
  
  @keyframes glow {
    from {
      box-shadow: 0 0 5px #00ffff, 0 0 10px #00ffff, 0 0 15px #00ffff;
    }
    to {
      box-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff;
    }
  }
`;

// Inject the CSS
if (!document.getElementById('glow-style')) {
  const style = document.createElement('style');
  style.id = 'glow-style';
  style.textContent = glowStyle;
  document.head.appendChild(style);
}

// Fix for default markers
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Zone coordinates will be loaded from GeoJSON

// Traffic light positions based on the satellite image - only required TLs
const TRAFFIC_LIGHTS: Record<string, [number, number]> = {
  'TL1': [25.9372, 49.7102],
  'TL2': [25.9371, 49.7108],
  'TL4': [25.9371, 49.7095],
  'TL6': [25.9368, 49.7092],
  'TL8': [25.9372, 49.7088],
  'TL13': [25.9368, 49.7110],
  'TL14': [25.9368, 49.7115]
};

// Device location offsets based on wind direction
const DEVICE_OFFSETS = {
  north: [0.002, 0],
  northeast: [0.0015, 0.0015],
  east: [0, 0.002],
  southeast: [-0.0015, 0.0015],
  south: [-0.002, 0],
  southwest: [-0.0015, -0.0015],
  west: [0, -0.002],
  northwest: [0.0015, -0.0015]
};

interface MapViewProps {
  activeZone?: number;
  windDirection?: string;
  activeSequence?: Array<{device_id:number; name:string; direction:'left'|'straight'|'right'}>;
}

// Overlay component for perfect pixel positioning
const ZoneOverlay: React.FC<{ lat: number; lng: number; children: React.ReactNode }> = ({ lat, lng, children }) => {
  const map = useMap();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      const point = map.latLngToContainerPoint([lat, lng]);
      setPos({ left: point.x, top: point.y });
    };
    update();
    map.on('move zoom resize', update);
    return () => {
      map.off('move zoom resize', update);
    };
  }, [map, lat, lng]);

  if (!pos) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top - 18, // raise up a bit
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
        zIndex: 500,
      }}
    >
      {children}
    </div>
  );
};

const ZonePolygons: React.FC<{ geoJsonData: any, windDirection: string | undefined }> = ({ geoJsonData, windDirection }) => {
  const map = useMap();
  const activeRoute = (windDirection === 'northwest') ? 'route1' : (windDirection === 'southeast' ? 'route2' : null);
  return (
    <>
      {/* Render GeoJSON with custom styling - only routes, no traffic light points */}
      {geoJsonData && (
        <GeoJSON
          data={{
            ...geoJsonData,
            features: geoJsonData.features.filter((f: any) => f.properties.type === 'route')
          }}
          style={(feature: any) => {
            if (feature.properties.type === 'route') {
              const isActive = feature.properties.route === activeRoute;
              if (!windDirection) {
                return {
                  color: '#6b7280',
                  weight: 3,
                  opacity: 0.5,
                  fillOpacity: 0.1,
                  dashArray: '5, 5'
                };
              }
              return {
                color: isActive ? '#10b981' : '#ef4444',
                weight: isActive ? 6 : 4,
                opacity: isActive ? 1.0 : 0.7,
                fillOpacity: 0.2,
                dashArray: isActive ? undefined : '10, 5'
              };
            }
            return {
              color: '#ffffff',
              weight: 1,
              opacity: 0.3
            };
          }}
          onEachFeature={(feature, layer) => {
            if (feature.properties.type === 'route') {
              const isActive = feature.properties.route === activeRoute;
              let statusText, statusClass;
              if (!windDirection) {
                statusText = 'Normal State';
                statusClass = 'bg-surface-secondary text-text';
              } else {
                statusText = isActive ? 'Active Route (GREEN)' : 'Inactive Route (RED)';
                statusClass = isActive ? 'bg-success text-white' : 'bg-error text-white';
              }
              layer.bindPopup(`
                <div class="p-2">
                  <h3 class="font-semibold" style="color: var(--color-text)">${feature.properties.name}</h3>
                  <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 ${statusClass}">
                    ${statusText}
                  </div>
                </div>
              `);
            }
          }}
        />
      )}
      {/* Traffic Light Markers from GeoJSON */}
      {geoJsonData && geoJsonData.features && geoJsonData.features
        .filter((f: any) => f.geometry.type === 'Point' && f.properties.type === 'traffic_light')
        .map((feature: any, idx: number) => {
          const [lng, lat] = feature.geometry.coordinates;
          // Default all TLs to red unless provided via activeSequence (future wiring)
          const isGreen = false;
          return (
            <Marker
              key={`geojson-tl-${idx}`}
              position={[lat, lng]}
              icon={new Icon({
                iconUrl: `data:image/svg+xml;base64,${btoa(`
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="8" fill="${isGreen ? '#10b981' : '#ef4444'}" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" fill="white"/>
                  </svg>
                `)}`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })}
            >
              {feature.properties?.name && (
                <Popup>{feature.properties.name}</Popup>
              )}
            </Marker>
          );
        })}

      {/* Render ALL zones from GeoJSON as rectangles/polygons with labels */}
      {geoJsonData && geoJsonData.features && geoJsonData.features
        .filter((f: any) => f.properties.type === 'zone')
        .map((feature: any, idx: number) => {
          const coordinates = feature.geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
          const centerLat = coordinates.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coordinates.length;
          const centerLng = coordinates.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coordinates.length;
          const zoneName = feature.properties?.name || `Zone ${feature.properties?.zone_id || ''}`;
          return (
            <React.Fragment key={`zone-${idx}`}>
              <Polygon
                positions={coordinates}
                pathOptions={{
                  color: '#00ffff',
                  weight: 2,
                  opacity: 0.7,
                  fillOpacity: 0.15,
                  fillColor: '#00ffff'
                }}
              />
              <Marker
                position={[centerLat, centerLng]}
                icon={L.divIcon({
                  className: '',
                  html: `
                    <div style="display: flex; flex-direction: column; align-items: center; cursor: default;">
                      <span style="
                        color: #fff;
                        font-weight: 600;
                        font-size: 0.70rem;
                        text-shadow: 0 1px 4px #000, 0 0 2px #000;
                        background: rgba(0,0,0,0.55);
                        border-radius: 999px;
                        padding: 2px 8px;
                        margin-bottom: 2px;
                        border: 1.0px solid #fff;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.18);
                        letter-spacing: 0.5px;
                        line-height: 1.1;
                        white-space: nowrap;
                        ">
                        ${zoneName}
                      </span>
                    </div>
                  `,
                  iconSize: [70, 36],
                  iconAnchor: [35, 18],
                })}
              />
            </React.Fragment>
          );
        })}
    </>
  );
};

const MapView: React.FC<MapViewProps> = ({ activeZone = 5, windDirection, activeSequence = [] }) => {
  const { activatedDevices } = useActivationContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);

  // Determine active route based on wind direction for Zone 5
  const getActiveRoute = () => {
    if (activeZone === 5) {
      if (windDirection === 'northwest') return 'route1';
      if (windDirection === 'southeast') return 'route2';
    }
    return null;
  };

  const activeRoute = getActiveRoute();

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devicesData = await devicesApi.getDevices();
        setDevices(devicesData);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/features.geojson')
      .then(res => res.json())
      .then(setGeoJsonData)
      .catch(err => console.error('Failed to load GeoJSON:', err));
  }, []);

  const isZoneActive = (zoneId: number) => {
    return activatedDevices.some(d => {
      const device = devices.find(dev => dev.id === d.id);
      return device?.route_id === zoneId;
    });
  };

  const getZoneColor = (zoneId: number) => {
    if (isZoneActive(zoneId)) {
      return '#00ffff'; // Neon cyan for active zones
    }
    return 'rgba(255, 255, 255, 0.3)'; // Semi-transparent white for inactive zones
  };

  const getZoneWeight = (zoneId: number) => {
    return isZoneActive(zoneId) ? 3 : 1;
  };

  const getZoneOpacity = (zoneId: number) => {
    return isZoneActive(zoneId) ? 0.8 : 0.3;
  };

  const getDeviceIcon = (device: Device) => {
    const color = device.is_green ? '#10b981' : '#ef4444';
    return new Icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(`
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="8" fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="12" cy="12" r="3" fill="white"/>
        </svg>
      `)}`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  // Function to determine if a traffic light should be green based on route and wind direction
  const isTrafficLightGreen = (feature: any) => {
    if (feature.properties.type !== 'traffic_light') return false;
    
    // Check if this traffic light is in the active sequence from backend
    if (activeSequence && activeSequence.length > 0) {
      const deviceId = feature.properties.id;
      return activeSequence.some((item: any) => item.device_id === deviceId);
    }
    
    return false; // Default to red if no emergency activation
  };

  // Add this style block at the top of the file (if not already present)
  if (!document.getElementById('beacon-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'beacon-pulse-style';
    style.textContent = `
      .beacon-label {
        color: #fff;
        font-weight: bold;
        font-size: 1rem;
        text-shadow: 0 1px 4px #000, 0 0 2px #000;
        letter-spacing: 1px;
        background: rgba(0,0,0,0.45);
        border-radius: 6px;
        padding: 2px 10px;
        margin-bottom: 2px;
        display: inline-block;
      }
      .beacon-dot {
        width: 14px;
        height: 14px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 8px 2px #ef4444cc;
        margin: 0 auto;
        animation: beacon-pulse 1.2s infinite alternate;
      }
      @keyframes beacon-pulse {
        0% { box-shadow: 0 0 8px 2px #ef4444cc; }
        100% { box-shadow: 0 0 24px 8px #ef4444aa; }
      }
    `;
    document.head.appendChild(style);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Zone 5 Traffic Map</h1>
            <p className="text-text-muted">Real-time monitoring of Zone 5 traffic control devices</p>
            {activeRoute && (
              <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-success)20' }}>
                <p className="text-success text-sm">
                  🚨 Emergency Active: {windDirection?.toUpperCase()} wind - Route {activeRoute === 'route1' ? '1' : '2'} GREEN
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-success rounded-full"></div>
              <span className="text-sm text-text-secondary">Green Light</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-error rounded-full"></div>
              <span className="text-sm text-text-secondary">Red Light</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
              <span className="text-sm text-text-secondary">Active Zone</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="glass-card p-6">
        <MapContainer
          center={[25.9360, 49.7100]}
          zoom={17}
          className="h-96 w-full rounded-xl"
          zoomControl={false}
          dragging={false}
          doubleClickZoom={false}
          scrollWheelZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          />
          <ZonePolygons geoJsonData={geoJsonData} windDirection={windDirection} />
        </MapContainer>

        {/* Emergency Status Panel */}
        <div className="mt-4 p-4 glass-card">
          <h3 className="font-semibold text-primary mb-2">Zone 5 Emergency Status</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-secondary)20' }}>
              <h4 className="text-sm font-medium text-text-secondary mb-2">Route 1 (Northwest Wind)</h4>
              <div className={`text-lg font-bold ${activeRoute === 'route1' ? 'text-success' : 'text-error'}`}>
                {activeRoute === 'route1' ? 'GREEN' : 'RED'}
              </div>
              <p className="text-xs text-text-muted mt-1">
                Traffic Lights: 0 (always green), 1, 2, 3
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-secondary)20' }}>
              <h4 className="text-sm font-medium text-text-secondary mb-2">Route 2 (Southeast Wind)</h4>
              <div className={`text-lg font-bold ${activeRoute === 'route2' ? 'text-success' : 'text-error'}`}>
                {activeRoute === 'route2' ? 'GREEN' : 'RED'}
              </div>
              <p className="text-xs text-text-muted mt-1">
                Traffic Lights: 0 (always green), 5, 6, 7, 8
              </p>
            </div>
          </div>
          <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info)20' }}>
            <p className="text-info text-sm">
              💡 Traffic Light 0 is always GREEN (main intersection)
            </p>
          </div>
          {activeRoute ? (
            <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-success)20' }}>
              <p className="text-success text-sm">
                🚨 Emergency activated for {windDirection?.toUpperCase()} wind direction
              </p>
                <p className="text-success text-xs mt-1">
                Active traffic lights: {activeSequence.map(item => item.name).join(', ')} are GREEN
              </p>
            </div>
          ) : (
            <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info)20' }}>
              <p className="text-info text-sm">
                ✅ Normal operation mode - No emergency active
              </p>
              <p className="text-info text-xs mt-1">
                All traffic lights in normal operation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView; 