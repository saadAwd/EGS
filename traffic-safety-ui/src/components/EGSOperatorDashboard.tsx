import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useActivationContext } from '../contexts/ActivationContext';
import { useSystemState } from '../contexts/SystemStateContext';
import apiClient from '../api/client';
import { weatherApi, WeatherRecord } from '../api/weather';
import { useAlarmContext } from '../contexts/AlarmContext';

// Simple compass SVG card (snap to N/E/S/W only)
const snapToCardinal = (deg: number) => {
  const normalized = ((deg % 360) + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90 % 360; // 0, 90, 180, 270
  const dirs = ['N', 'E', 'S', 'W'] as const;
  const idx = Math.round(normalized / 90) % 4;
  return { snappedDeg: snapped, label: dirs[idx] };
};

const CompassCard: React.FC<{ headingDeg: number | null }> = ({ headingDeg }) => {
  const inDeg = headingDeg ?? 0;
  const cardinal = headingDeg == null ? '—' : snapToCardinal(inDeg).label;
  const d = inDeg; // keep true reading for needle and degree display
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-3 text-center shadow-xl border border-gray-600 relative overflow-hidden h-full flex flex-col justify-center">
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        <div className="w-44 h-44 mb-2">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="100" cy="100" r="88" fill="#0f172a" stroke="#374151" strokeWidth="2" />
            {/* tick marks */}
            {Array.from({ length: 120 }).map((_, i) => {
              const angle = (i / 120) * 360;
              const len = i % 10 === 0 ? 8 : 4;
              const width = i % 10 === 0 ? 2 : 1;
              const inner = 88 - len;
              const x1 = 100 + 88 * Math.sin((Math.PI / 180) * angle);
              const y1 = 100 - 88 * Math.cos((Math.PI / 180) * angle);
              const x2 = 100 + inner * Math.sin((Math.PI / 180) * angle);
              const y2 = 100 - inner * Math.cos((Math.PI / 180) * angle);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth={width} opacity={i % 10 === 0 ? 0.9 : 0.5} />;
            })}
            {/* cardinal labels */}
            <text x="100" y="28" textAnchor="middle" fill="#e5e7eb" fontSize="16" fontWeight="bold">N</text>
            <text x="100" y="188" textAnchor="middle" fill="#e5e7eb" fontSize="16" fontWeight="bold">S</text>
            <text x="20" y="105" textAnchor="middle" fill="#e5e7eb" fontSize="16" fontWeight="bold">W</text>
            <text x="180" y="105" textAnchor="middle" fill="#e5e7eb" fontSize="16" fontWeight="bold">E</text>
            {/* needle */}
            <g transform={`rotate(${d} 100 100)`} filter="url(#glow)">
              <polygon points="100,18 108,40 100,36 92,40" fill="#ef4444" />
              <polygon points="100,182 108,160 100,164 92,160" fill="#1f2937" />
              <circle cx="100" cy="100" r="6" fill="#111827" stroke="#e5e7eb" strokeWidth="2" />
            </g>
          </svg>
        </div>
        <div className="text-base font-semibold text-white">{headingDeg != null ? `${Math.round(d)}° ${cardinal}` : '—'}</div>
        <div className="text-[10px] text-gray-300">Wind Direction</div>
      </div>
    </div>
  );
};
// import AramcoLogo from '../assets/Aramco-logo.png';
// Resolve zone images (including "All Zones.png") for active display
const imageModules = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const FILENAME_TO_URL: Record<string, string> = Object.entries(imageModules).reduce((acc, [path, url]) => {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  acc[filename] = url as unknown as string;
  return acc;
}, {} as Record<string, string>);

interface Device {
  id: number;
  name: string;
  route_id: number;
  location: string;
  description?: string;
  is_active: boolean;
}

// (Removed unused ZonePolygons map component to avoid bundle bloat and lints)

interface Zone {
  id: number;
  name: string;
  is_active: boolean;
  active_wind_direction: string | null;
}

interface Alert {
  id: string;
  time: string;
  tag: string;
  priority: number;
  type: string;
  quality: string;
  isActive: boolean;
}

// interface SensorReading {
//   device_id: number;
//   hydrogen_ppm: number;
//   temperature_c: number;
//   humidity_percent: number;
//   timestamp: string;
// }


const EGSOperatorDashboard: React.FC = () => {
  const { zoneActivation, setZoneActivation, clearZoneActivation } = useActivationContext();
  const { systemState, deactivateEmergency } = useSystemState();
  const { state: alarmState, play: startAlarm, stop: stopAlarm, acknowledge: suppressAlarm, resetSuppression } = useAlarmContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lamps, setLamps] = useState<any[]>([]);
  const [gatewayStatus, setGatewayStatus] = useState<any>(null);
  const lastGatewayHeartbeatRef = React.useRef<number | null>(null);
  const lastGatewayStableStatusRef = React.useRef<'connected' | 'disconnected' | null>(null);
  const GATEWAY_ONLINE_GRACE_MS = 10000; // 10s grace to avoid flicker
  const [backendStatus, setBackendStatus] = useState<{ connected: boolean; lastCheck: Date | null }>({ connected: false, lastCheck: null });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [weather, setWeather] = useState<WeatherRecord | null>(null);

  // Handle alarm based on emergency activation
  useEffect(() => {
    if (zoneActivation.isActivated) {
      startAlarm();
    } else {
      stopAlarm();
      resetSuppression(); // Reset suppression when emergency is deactivated
    }
  }, [zoneActivation.isActivated, startAlarm, stopAlarm, resetSuppression]);

  // STATELESS: Only read from SystemStateContext (single source of truth)
  // SystemStateContext polls backend every 2 seconds and is authoritative
  // NO localStorage, NO local state management - just display what SystemStateContext says
  useEffect(() => {
    if (systemState.isEmergencyActive && systemState.activeZone) {
      // Backend has active zone - update local display state ONLY
      if (systemState.activeZone !== zoneActivation.zoneName || 
          systemState.windDirection !== zoneActivation.windDirection ||
          !zoneActivation.isActivated) {
        setZoneActivation({
          zoneName: systemState.activeZone,
          windDirection: systemState.windDirection,
          isActivated: true,
          activationTime: systemState.activationTime || new Date().toISOString()
        });
      }
    } else if (!systemState.isEmergencyActive && zoneActivation.isActivated) {
      // Backend says no active zone - clear local display state
      clearZoneActivation();
    }
  }, [systemState.isEmergencyActive, systemState.activeZone, systemState.windDirection, systemState.activationTime]);

  // Use the exact same image logic as ZoneActivation
  const imageSrc = useMemo(() => {
    if (zoneActivation.isActivated && zoneActivation.zoneName && zoneActivation.windDirection) {
      // Try scenario-specific image first: "Zone A N-S.png"
      const scenarioFilename = `${zoneActivation.zoneName} ${zoneActivation.windDirection}.png`;
      if (FILENAME_TO_URL[scenarioFilename]) {
        return FILENAME_TO_URL[scenarioFilename];
      }
      // Fallback to general zone image: "Zone A.png"
      const zoneFilename = `${zoneActivation.zoneName}.png`;
      if (FILENAME_TO_URL[zoneFilename]) {
        return FILENAME_TO_URL[zoneFilename];
      }
    }
    // Default to "All Zones.png"
    return FILENAME_TO_URL['All Zones.png'];
  }, [zoneActivation.isActivated, zoneActivation.zoneName, zoneActivation.windDirection]);

  // Check backend health - defined before fetchData
  const checkBackendHealth = useCallback(async () => {
    try {
      await apiClient.get('/health'); // Use health endpoint
      setBackendStatus({ connected: true, lastCheck: new Date() });
      return true;
    } catch (error) {
      setBackendStatus({ connected: false, lastCheck: new Date() });
      return false;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [devicesResponse, zonesResponse, lampsResponse, gatewayResponse, sensorResponse, weatherLatest] = await Promise.all([
        apiClient.get('/devices/'),
        apiClient.get('/zones/'),
        apiClient.get('/lamps/'),
        apiClient.get('/gateway/status').catch(() => ({ data: { status: 'disconnected' } })),
        apiClient.get('/sensor-data/latest-with-signal/').catch(() => ({ data: [] })),
        weatherApi.latest().catch(() => null),
      ]);

      // Check backend health
      await checkBackendHealth();

      // Filter devices for traffic lights TL1-TL14
      const allDevices = devicesResponse.data.filter((device: Device) =>
        device.name.startsWith('TL') && parseInt(device.name.substring(2)) <= 14
      );

      setDevices(allDevices);
      setZones(zonesResponse.data);
      setLamps(lampsResponse.data);

      // Stabilize gateway status to prevent online/offline flicker
      const gw = gatewayResponse.data || {};
      const heartbeat = gw.last_heartbeat ? new Date(gw.last_heartbeat).getTime() : null;
      if (heartbeat) {
        lastGatewayHeartbeatRef.current = heartbeat;
      }
      const now = Date.now();
      const withinGrace = lastGatewayHeartbeatRef.current != null && (now - lastGatewayHeartbeatRef.current) <= GATEWAY_ONLINE_GRACE_MS;
      const reported = (gw.connection_status || gw.status || 'disconnected') as 'connected' | 'disconnected';
      let stable: 'connected' | 'disconnected' = reported;
      if (reported === 'disconnected' && withinGrace) {
        // Keep showing connected during grace period after last heartbeat
        stable = 'connected';
      }
      // Debounce: require two consecutive disconnected states outside grace window
      if (reported === 'disconnected' && !withinGrace && lastGatewayStableStatusRef.current === 'connected') {
        // Keep previous connected one more cycle
        stable = 'connected';
      }
      lastGatewayStableStatusRef.current = stable;
      setGatewayStatus({ ...gw, connection_status: stable });

      // Generate real alerts based on system status
      const realAlerts: Alert[] = [];
      
      // Gateway connection alert
      if (gatewayResponse.data.status === 'disconnected') {
        realAlerts.push({
          id: 'gateway-1',
          time: new Date().toLocaleTimeString(),
          tag: 'ESP32 Gateway',
          priority: 900,
          type: 'Digital',
          quality: 'Good',
          isActive: true
        });
      }

      // Active zones alerts (use frontend context)
      if (zoneActivation.isActivated) {
        realAlerts.push({
          id: `zone-${zoneActivation.zoneName}`,
          time: new Date().toLocaleTimeString(),
          tag: `${zoneActivation.zoneName} Active`,
          priority: 800,
          type: 'Digital',
          quality: 'Good',
          isActive: true
        });
      }

      // Active lamps alerts
      const activeLamps = lampsResponse.data.filter((lamp: any) => lamp.is_on);
      if (activeLamps.length > 0) {
        realAlerts.push({
          id: 'lamps-1',
          time: new Date().toLocaleTimeString(),
          tag: `${activeLamps.length} Lamps Active`,
          priority: 700,
          type: 'Digital',
          quality: 'Good',
          isActive: true
        });
      }

      // Sensor data alerts
      if (sensorResponse.data.length > 0) {
        const latestSensor = sensorResponse.data[0];
        if (latestSensor.temperature_c && latestSensor.temperature_c > 40) {
          realAlerts.push({
            id: 'temp-1',
            time: new Date().toLocaleTimeString(),
            tag: 'High Temperature',
            priority: 850,
            type: 'HI',
            quality: 'Good',
            isActive: true
          });
        }
      }

      setAlerts(realAlerts);
      setWeather(weatherLatest);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [checkBackendHealth]); // Include checkBackendHealth in dependencies

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Periodic backend health check (every 10 seconds)
  useEffect(() => {
    checkBackendHealth();
    const healthInterval = setInterval(checkBackendHealth, 10000);
    return () => clearInterval(healthInterval);
  }, [checkBackendHealth]);


  // const getZoneStatus = (zoneId: number) => {
  //   const zone = zones.find(z => z.id === zoneId);
  //   return zone?.is_active ? 'active' : 'inactive';
  // };

  const getActiveDevicesCount = () => devices.filter(d => d.is_active).length;
  const getTotalFaults = () => alerts.filter(a => a.isActive).length;
  
  const getActiveLampsCount = () => lamps.filter(lamp => lamp.is_on).length;
  const getTotalLampsCount = () => lamps.length;
  const getActiveZonesCount = () => {
    // Use frontend activation context instead of backend zone status
    return zoneActivation.isActivated ? 1 : 0;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Emergency Status Banner */}
      {(zoneActivation.isActivated || systemState.isEmergencyActive) && (
        <div className="bg-red-600 rounded-lg p-4 mb-6 text-center">
          <div className="text-2xl font-bold mb-2">🚨 EMERGENCY ACTIVE 🚨</div>
          <div className="text-lg">
            Zone: <strong>{zoneActivation.zoneName || systemState.activeZone}</strong> | 
            Wind Direction: <strong>{zoneActivation.windDirection || systemState.windDirection}</strong> | 
            Activated: <strong>{zoneActivation.activationTime || systemState.activationTime}</strong>
          </div>
          
          {/* Alarm Status and Control */}
          <div className="mt-4 pt-4 border-t border-red-400">
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${alarmState.isPlaying && !alarmState.suppressed ? 'bg-red-300 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-sm">
                  {alarmState.suppressed ? 'Alarm Suppressed' : alarmState.isPlaying ? 'Alarm Active' : 'Alarm Inactive'}
                </span>
              </div>
              {alarmState.isPlaying && !alarmState.suppressed && (
                <button
                  onClick={() => suppressAlarm(120000)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md font-semibold transition-colors"
                >
                  🔕 Acknowledge Alarm
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    console.log('EGS Dashboard: Starting deactivation process...');
                    
                    // STATELESS: Only send command to backend, SystemStateContext will update
                    // Step 1: Send deactivation command to backend
                    await apiClient.post('/api/zones/deactivate', {});
                    console.log('EGS Dashboard: Deactivation command sent to backend');
                    
                    // Step 2: Wait for backend to process and send commands to gateway
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Step 3: Refresh lamp states to reflect OFF state
                    try {
                      await apiClient.get('/api/lamps/');
                      console.log('EGS Dashboard: Lamp states refreshed');
                    } catch (err) {
                      console.error('Failed to refresh lamp states:', err);
                    }
                    
                    // SystemStateContext will poll and update state automatically
                    console.log('EGS Dashboard: Deactivation complete - SystemStateContext will update state');
                  } catch (err) {
                    console.error('EGS Dashboard: Deactivation failed:', err);
                    // Don't restore state - let SystemStateContext handle it via polling
                  }
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold transition-colors"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Section - Map and Right Column (Compass/Temp/Wind + Alerts) */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Active Zone Map (image) */}
        <div className="col-span-8">
          <div className="bg-gray-800 rounded-lg h-96 relative overflow-hidden border border-gray-700" style={{ padding: '0.25rem' }}>
            <img src={imageSrc} alt="Active Zone" className="w-full h-full object-contain" style={{ display: 'block' }} loading="eager" />
          </div>
        </div>

        {/* Right Column: Compass (large) + Temp/Wind (short) + Alerts */}
        <div className="col-span-4 flex flex-col space-y-3 h-96">
          <div className="h-50">
            <CompassCard headingDeg={weather?.wind_direction_deg ?? null} />
          </div>
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-3 text-center shadow-xl border border-blue-500 relative overflow-hidden h-16 flex flex-col justify-center">
            <div className="absolute top-0 left-0 w-6 h-6 bg-white/10 rounded-full -ml-3 -mt-3"></div>
            <div className="relative z-10 flex flex-col items-center justify-center h-full">
              <div className="flex items-center justify-center mb-0.5">
                <div className="text-xl font-semibold text-white mr-2">{weather?.temperature_c != null ? `${weather.temperature_c.toFixed(1)}°C` : '—'}</div>
                <div className="text-xs font-medium text-blue-100">Temperature</div>
              </div>
              <div className="text-[10px] text-blue-100/80">{weather?.record_time ? new Date(weather.record_time).toLocaleTimeString() : ''}</div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-lg p-3 text-center shadow-xl border border-cyan-500 relative overflow-hidden h-16 flex flex-col justify-center">
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-white/10 rounded-full -mr-3 -mb-3"></div>
            <div className="relative z-10 flex flex-col items-center justify-center h-full">
              <div className="flex items-center justify-center mb-0.5">
                <div className="text-xl font-semibold text-white mr-2">{weather?.wind_speed_ms != null ? `${weather.wind_speed_ms.toFixed(2)} m/s` : '—'}</div>
                <div className="text-xs font-medium text-cyan-100">Wind Speed</div>
              </div>
              <div className="text-[10px] text-cyan-100/80">{weather?.record_time ? new Date(weather.record_time).toLocaleTimeString() : ''}</div>
            </div>
          </div>
          {/* Alerts panel moved below Health Index (middle row) */}
        </div>
      </div>

      {/* Middle Row - Enhanced Status Panels */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* System Status Overview */}
        <div className="col-span-8">
          <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-4 h-85 shadow-2xl border border-gray-600 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                <h3 className="text-base font-bold text-white">System Status Overview</h3>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-green-400 font-semibold">Lamps: {getActiveLampsCount()}/{getTotalLampsCount()}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-blue-400 font-semibold">Zones: {getActiveZonesCount()}/{zones.length}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${gatewayStatus?.status === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className={`font-semibold ${gatewayStatus?.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                    Gateway: {gatewayStatus?.status || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 h-full">
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-12 h-12 bg-green-400/10 rounded-full -mr-6 -mt-6"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                    <div className="text-sm font-semibold text-gray-200">Active Zones</div>
                  </div>
                  <div className="space-y-2 h-full overflow-y-auto">
                    {(zoneActivation.isActivated || systemState.isEmergencyActive) ? (
                      <div className="flex justify-between items-center p-3 bg-red-600 rounded-lg shadow-sm hover:bg-red-700 transition-colors">
                        <span className="text-sm font-medium text-white">{zoneActivation.zoneName || systemState.activeZone}</span>
                        <span className="text-xs text-white bg-red-500/30 px-2 py-1 rounded-full font-medium">
                          {zoneActivation.windDirection || systemState.windDirection}
                        </span>
                      </div>
                    ) : (
                      <div className="text-gray-400 text-sm p-4 bg-gray-700 rounded-lg text-center border border-gray-600">
                        No active zones
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 shadow-xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-12 h-12 bg-blue-400/10 rounded-full -ml-6 -mt-6"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                    <div className="text-sm font-semibold text-gray-200">Device Status</div>
                  </div>
                  <div className="space-y-2 h-full">
                    <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg shadow-sm hover:bg-gray-600 transition-colors">
                      <span className="text-sm text-gray-300">Active Devices:</span>
                      <span className="text-lg font-bold text-green-400">{getActiveDevicesCount()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg shadow-sm hover:bg-gray-600 transition-colors">
                      <span className="text-sm text-gray-300">Total Devices:</span>
                      <span className="text-lg font-bold text-blue-400">{devices.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg shadow-sm hover:bg-gray-600 transition-colors">
                      <span className="text-sm text-gray-300">System Faults:</span>
                      <span className="text-lg font-bold text-red-400">{getTotalFaults()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 shadow-xl overflow-hidden relative">
                <div className="absolute bottom-0 right-0 w-12 h-12 bg-yellow-400/10 rounded-full -mr-6 -mb-6"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></div>
                    <div className="text-sm font-semibold text-gray-200">System Info</div>
                  </div>
                  <div className="space-y-2 h-full">
                    <div className="p-3 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                      <div className="text-xs text-gray-400 mb-1">Last Update</div>
                      <div className="text-sm font-medium text-white">{lastUpdate}</div>
                    </div>
                    <div className="p-3 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                      <div className="text-xs text-gray-400 mb-1">Wind Direction</div>
                      <div className="text-sm font-medium text-white">{weather?.wind_direction_deg != null ? `${Math.round(weather.wind_direction_deg)}°` : '—'}</div>
                    </div>
                    <div className="p-3 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                      <div className="text-xs text-gray-400 mb-1">Active Zones</div>
                      <div className="text-sm font-medium text-white">{zones.filter(z => z.is_active).length}</div>
                    </div>
                    <div className="p-3 bg-gray-700 rounded-lg shadow-sm border border-gray-600">
                      <div className="text-xs text-gray-400 mb-1">System Status</div>
                      <div className="text-sm font-medium text-green-400">Operational</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-4 flex flex-col h-85">
          <div className="space-y-3 flex flex-col h-full">
            {/* Gateway Status Box */}
            <div className={`bg-gradient-to-br ${gatewayStatus?.connection_status === 'connected' ? 'from-green-600 to-green-700 border-green-500' : 'from-red-600 to-red-700 border-red-500'} rounded-lg p-2 text-center shadow-xl border relative overflow-hidden h-16 flex flex-col justify-center`}>
              <div className="absolute top-0 right-0 w-8 h-8 bg-white/10 rounded-full -mr-4 -mt-4"></div>
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                <div className="flex items-center justify-center mb-0.5">
                  <div className={`w-2 h-2 rounded-full mr-1.5 ${gatewayStatus?.connection_status === 'connected' ? 'bg-green-300 animate-pulse' : 'bg-red-300'}`}></div>
                  <div className="text-xs font-medium text-white">Gateway</div>
                </div>
                <div className="text-sm font-bold text-white mb-0">
                  {gatewayStatus?.connection_status === 'connected' ? 'Connected' : 'Disconnected'}
                </div>
                <div className="text-[9px] text-white/80">
                  {gatewayStatus?.last_heartbeat ? new Date(gatewayStatus.last_heartbeat).toLocaleTimeString() : 'No heartbeat'}
                </div>
              </div>
            </div>

            {/* Backend Status Box */}
            <div className={`bg-gradient-to-br ${backendStatus.connected ? 'from-blue-600 to-blue-700 border-blue-500' : 'from-red-600 to-red-700 border-red-500'} rounded-lg p-2 text-center shadow-xl border relative overflow-hidden h-16 flex flex-col justify-center mt-3`}>
              <div className="absolute bottom-0 left-0 w-8 h-8 bg-white/10 rounded-full -ml-4 -mb-4"></div>
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                <div className="flex items-center justify-center mb-0.5">
                  <div className={`w-2 h-2 rounded-full mr-1.5 ${backendStatus.connected ? 'bg-blue-300 animate-pulse' : 'bg-red-300'}`}></div>
                  <div className="text-xs font-medium text-white">Backend</div>
                </div>
                <div className="text-sm font-bold text-white mb-0">
                  {backendStatus.connected ? 'Online' : 'Offline'}
                </div>
                <div className="text-[9px] text-white/80">
                  {backendStatus.lastCheck ? backendStatus.lastCheck.toLocaleTimeString() : 'Not checked'}
                </div>
              </div>
            </div>

            {/* (Compass/Temp/Wind moved beside the map above) */}

            {/* Alarms list moved here under Health Index */}
            <div className="bg-gray-700 rounded-lg p-4 flex-1 overflow-hidden">
              <div className="space-y-2 text-xs h-full overflow-y-auto">
                {alerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} className={`p-2 rounded text-xs ${alert.isActive ? 'bg-red-600' : 'bg-gray-600'}`}>
                    <div className="flex justify-between items-center">
                      <span>{alert.time}</span>
                      <span className="font-medium">{alert.tag}</span>
                      <span>{alert.type}</span>
                      <span>{alert.priority}</span>
                      <span className="text-green-400">{alert.quality}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - Enlarged Alarms Annunciator */}
      <div className="grid grid-cols-12 gap-6">
        {/* Enlarged Alarms Annunciator Panel */}
        <div className="col-span-12">
          <div className="bg-gray-700 rounded-lg p-6 h-64">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-semibold">System Alarms & Events Annunciator</h3>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm">Active Alarms: {alerts.filter(a => a.isActive).length}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm">Warnings: {alerts.filter(a => !a.isActive && a.priority > 700).length}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Normal: {alerts.filter(a => !a.isActive && a.priority <= 700).length}</span>
                </div>
                <button 
                  onClick={fetchData}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
            
            {/* Alarms Grid */}
            <div className="grid grid-cols-4 gap-4 h-40 overflow-y-auto">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.isActive 
                      ? 'bg-red-600 border-red-400' 
                      : alert.priority > 700 
                        ? 'bg-yellow-600 border-yellow-400' 
                        : 'bg-gray-600 border-gray-400'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-semibold">{alert.time}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      alert.isActive ? 'bg-red-500' : 'bg-gray-500'
                    }`}>
                      {alert.priority}
                    </span>
                  </div>
                  <div className="text-sm font-medium mb-1">{alert.tag}</div>
                  <div className="flex justify-between items-center text-xs">
                    <span>{alert.type}</span>
                    <span className={`${
                      alert.quality === 'Good' ? 'text-green-300' : 'text-yellow-300'
                    }`}>
                      {alert.quality}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* System Status Summary */}
            <div className="mt-4 pt-4 border-t border-gray-600">
              <div className="grid grid-cols-6 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">{getActiveLampsCount()}</div>
                  <div className="text-xs text-gray-300">Active Lamps</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">{getTotalLampsCount()}</div>
                  <div className="text-xs text-gray-300">Total Lamps</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-400">{getActiveZonesCount()}</div>
                  <div className="text-xs text-gray-300">Active Zones</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-400">{getTotalFaults()}</div>
                  <div className="text-xs text-gray-300">Total Alarms</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${backendStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                    {backendStatus.connected ? 'Online' : 'Offline'}
                  </div>
                  <div className="text-xs text-gray-300">Backend</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-400">{lastUpdate}</div>
                  <div className="text-xs text-gray-300">Last Update</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-6 text-gray-400">
        <div className="text-lg font-semibold">Traffic Safety Status Overview</div>
      </div>
    </div>
  );
};

export default EGSOperatorDashboard;
