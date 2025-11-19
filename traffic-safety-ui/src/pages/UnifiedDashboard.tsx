import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';

// Fix for default markers in react-leaflet (Vite/ESM-friendly)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Device {
  id: string;
  name: string;
  location: string;
  is_active: boolean;
  is_green: boolean;
  battery_level?: number;
  signal_strength?: number;
  last_updated?: string;
}

interface Zone {
  id: string;
  name: string;
  is_active: boolean;
  wind_direction?: string;
  active_route?: string;
}

interface SensorData {
  device_id: string;
  hydrogen_ppm: number;
  temperature_c: number;
  humidity_percent: number;
  timestamp: string;
}

const UnifiedDashboard: React.FC = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'overview' | 'zones' | 'devices' | 'maintenance'>('overview');
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [windDirection, setWindDirection] = useState<string>('');
  const [isConnected, setConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // Try to fetch from backend
      const [devicesRes, zonesRes, sensorRes] = await Promise.all([
        fetch('http://localhost:8002/api/devices/').catch(() => null),
        fetch('http://localhost:8002/api/zones/').catch(() => null),
        fetch('http://localhost:8002/api/sensor-data/latest/').catch(() => null)
      ]);

      if (devicesRes && devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData);
      } else {
        // Fallback data for demo
        setDevices([
          { id: '1', name: 'TL1', location: 'Main Intersection', is_active: true, is_green: true, battery_level: 85, signal_strength: 92 },
          { id: '2', name: 'TL2', location: 'Secondary Road', is_active: true, is_green: false, battery_level: 78, signal_strength: 88 },
          { id: '3', name: 'TL3', location: 'Emergency Route', is_active: false, is_green: false, battery_level: 45, signal_strength: 65 }
        ]);
      }

      if (zonesRes && zonesRes.ok) {
        const zonesData = await zonesRes.json();
        setZones(zonesData);
      } else {
        // Fallback data for demo
        setZones([
          { id: '1', name: 'Zone A', is_active: true, wind_direction: 'north', active_route: 'route1' },
          { id: '2', name: 'Zone B', is_active: false, wind_direction: null, active_route: null },
          { id: '3', name: 'Zone C', is_active: false, wind_direction: null, active_route: null }
        ]);
      }

      if (sensorRes && sensorRes.ok) {
        const sensorData = await sensorRes.json();
        setSensorData(sensorData);
      } else {
        // Fallback data for demo
        setSensorData([
          { device_id: '1', hydrogen_ppm: 12.5, temperature_c: 22.3, humidity_percent: 65, timestamp: new Date().toISOString() },
          { device_id: '2', hydrogen_ppm: 8.7, temperature_c: 21.8, humidity_percent: 62, timestamp: new Date().toISOString() }
        ]);
      }

      setConnected(true);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Backend not available - showing demo data');
      setConnected(false);
      
      // Set demo data even on error
      setDevices([
        { id: '1', name: 'TL1', location: 'Main Intersection', is_active: true, is_green: true, battery_level: 85, signal_strength: 92 },
        { id: '2', name: 'TL2', location: 'Secondary Road', is_active: true, is_green: false, battery_level: 78, signal_strength: 88 },
        { id: '3', name: 'TL3', location: 'Emergency Route', is_active: false, is_green: false, battery_level: 45, signal_strength: 65 }
      ]);
      setZones([
        { id: '1', name: 'Zone A', is_active: true, wind_direction: 'north', active_route: 'route1' },
        { id: '2', name: 'Zone B', is_active: false, wind_direction: null, active_route: null },
        { id: '3', name: 'Zone C', is_active: false, wind_direction: null, active_route: null }
      ]);
      setSensorData([
        { device_id: '1', hydrogen_ppm: 12.5, temperature_c: 22.3, humidity_percent: 65, timestamp: new Date().toISOString() },
        { device_id: '2', hydrogen_ppm: 8.7, temperature_c: 21.8, humidity_percent: 62, timestamp: new Date().toISOString() }
      ]);
      setLastUpdate(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('UnifiedDashboard mounted, fetching data...');
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Zone activation
  const activateZone = async (zoneId: string, wind: string) => {
    try {
      const response = await fetch('http://localhost:8002/api/activate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zoneId, wind_direction: wind })
      });
      
      if (response.ok) {
        await fetchAllData();
        setSelectedZone(zoneId);
        setWindDirection(wind);
      }
    } catch (err) {
      setError('Failed to activate zone');
    }
  };

  const deactivateZone = async (zoneId: string) => {
    try {
      const response = await fetch('http://localhost:8002/api/deactivate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zoneId })
      });
      
      if (response.ok) {
        await fetchAllData();
        setSelectedZone('');
        setWindDirection('');
      }
    } catch (err) {
      setError('Failed to deactivate zone');
    }
  };

  // Device control
  const toggleDevice = async (deviceId: string, isGreen: boolean) => {
    try {
      const response = await fetch(`http://localhost:8002/api/devices/${deviceId}/control/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_green: isGreen })
      });
      
      if (response.ok) {
        await fetchAllData();
      }
    } catch (err) {
      setError('Failed to control device');
    }
  };

  // Statistics
  const activeDevices = devices.filter(d => d.is_active).length;
  const activeZones = zones.filter(z => z.is_active).length;
  const totalDevices = devices.length;
  const totalZones = zones.length;

  // Debug logging
  console.log('UnifiedDashboard render:', { loading, devices: devices.length, zones: zones.length, isConnected });

  // Show loading state initially
  if (loading && devices.length === 0) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
        <div className="text-center">
          <div className="text-6xl mb-4">🚦</div>
          <h1 className="text-2xl font-bold text-primary mb-2">Loading Traffic Safety Control Center...</h1>
          <p className="text-text-muted">Initializing system data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-primary mb-2">🚦 Traffic Safety Control Center</h1>
            <p className="text-text-muted text-lg">Unified Dashboard - Complete System Management</p>
            {error && (
              <div className="mt-2 p-2 bg-warning/20 text-warning text-sm rounded">
                ⚠️ {error}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`}></div>
              <span className="text-sm text-text-secondary">
                {isConnected ? 'System Online' : 'System Offline'}
              </span>
            </div>
            <div className="text-sm text-text-muted">
              Last Update: {lastUpdate || 'Never'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-6 text-center">
          <div className="text-3xl font-bold text-primary mb-2">{activeZones}</div>
          <div className="text-text-secondary">Active Zones</div>
        </div>
        <div className="glass-card p-6 text-center">
          <div className="text-3xl font-bold text-success mb-2">{activeDevices}</div>
          <div className="text-text-secondary">Active Devices</div>
        </div>
        <div className="glass-card p-6 text-center">
          <div className="text-3xl font-bold text-info mb-2">{totalZones}</div>
          <div className="text-text-secondary">Total Zones</div>
        </div>
        <div className="glass-card p-6 text-center">
          <div className="text-3xl font-bold text-accent mb-2">{totalDevices}</div>
          <div className="text-text-secondary">Total Devices</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 mb-8">
        {[
          { id: 'overview', label: '📊 Overview', icon: '📊' },
          { id: 'zones', label: '🗺️ Zone Control', icon: '🗺️' },
          { id: 'devices', label: '🔧 Device Management', icon: '🔧' },
          { id: 'maintenance', label: '🛠️ Maintenance', icon: '🛠️' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'btn-primary shadow-lg'
                : 'btn-secondary hover:shadow-md'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-error text-white p-4 rounded-lg mb-6 border border-error/20" style={{ boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}>
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="space-y-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* System Status */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">System Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Backend Connection</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`}></div>
                    <span className={isConnected ? 'text-success' : 'text-error'}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Active Zones</span>
                  <span className="text-primary font-semibold">{activeZones}/{totalZones}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Active Devices</span>
                  <span className="text-success font-semibold">{activeDevices}/{totalDevices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Last Update</span>
                  <span className="text-text-muted">{lastUpdate}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={fetchAllData}
                  disabled={loading}
                  className="w-full btn-primary p-3 rounded-lg font-medium disabled:opacity-50"
                >
                  {loading ? 'Refreshing...' : '🔄 Refresh All Data'}
                </button>
                <button
                  onClick={() => setActiveTab('zones')}
                  className="w-full btn-secondary p-3 rounded-lg font-medium"
                >
                  🗺️ Manage Zones
                </button>
                <button
                  onClick={() => setActiveTab('devices')}
                  className="w-full btn-secondary p-3 rounded-lg font-medium"
                >
                  🔧 Manage Devices
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-6 lg:col-span-2">
              <h3 className="text-xl font-semibold mb-4 text-primary">Recent Activity</h3>
              <div className="space-y-2">
                {devices.slice(0, 5).map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${device.is_green ? 'bg-success' : 'bg-error'}`}></div>
                      <span className="font-medium">{device.name}</span>
                      <span className="text-text-muted">({device.location})</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs ${device.is_active ? 'bg-success text-white' : 'bg-surface-secondary text-text-secondary'}`}>
                        {device.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${device.is_green ? 'bg-success text-white' : 'bg-error text-white'}`}>
                        {device.is_green ? 'GREEN' : 'RED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Zones Tab */}
        {activeTab === 'zones' && (
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">Zone Control</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Zone Selection */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Select Zone</label>
                  <div className="grid grid-cols-3 gap-2">
                    {zones.map((zone) => (
                      <button
                        key={zone.id}
                        onClick={() => setSelectedZone(zone.id)}
                        className={`p-3 rounded-lg transition-colors ${
                          selectedZone === zone.id
                            ? 'bg-primary text-white'
                            : zone.is_active
                            ? 'bg-success text-white'
                            : 'bg-surface-secondary hover:bg-surface text-text'
                        }`}
                      >
                        Zone {zone.id}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wind Direction */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Wind Direction</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['north', 'south', 'east', 'west'].map((wind) => (
                      <button
                        key={wind}
                        onClick={() => setWindDirection(wind)}
                        className={`p-3 rounded-lg transition-colors ${
                          windDirection === wind
                            ? 'bg-primary text-white'
                            : 'bg-surface-secondary hover:bg-surface text-text'
                        }`}
                      >
                        {wind.charAt(0).toUpperCase() + wind.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4 mt-6">
                <button
                  onClick={() => selectedZone && windDirection && activateZone(selectedZone, windDirection)}
                  disabled={!selectedZone || !windDirection || loading}
                  className="btn-success px-6 py-3 rounded-lg font-medium disabled:opacity-50"
                >
                  🚨 Activate Zone
                </button>
                <button
                  onClick={() => selectedZone && deactivateZone(selectedZone)}
                  disabled={!selectedZone || loading}
                  className="btn-error px-6 py-3 rounded-lg font-medium disabled:opacity-50"
                >
                  ⏹️ Deactivate Zone
                </button>
              </div>
            </div>

            {/* Active Zones Status */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">Active Zones Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {zones.filter(z => z.is_active).map((zone) => (
                  <div key={zone.id} className="p-4 rounded-lg border border-success/20" style={{ backgroundColor: 'var(--color-success)10' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-success">Zone {zone.id}</span>
                      <div className="w-3 h-3 bg-success rounded-full"></div>
                    </div>
                    <div className="text-sm text-text-secondary">
                      Wind: {zone.wind_direction?.toUpperCase() || 'N/A'}
                    </div>
                    <div className="text-sm text-text-secondary">
                      Route: {zone.active_route || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">Device Management</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device) => (
                  <div key={device.id} className="p-4 rounded-lg border" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">{device.name}</span>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${device.is_active ? 'bg-success' : 'bg-error'}`}></div>
                        <span className="text-sm text-text-secondary">
                          {device.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="text-sm text-text-secondary">
                        Location: {device.location}
                      </div>
                      {device.battery_level && (
                        <div className="text-sm text-text-secondary">
                          Battery: {device.battery_level}%
                        </div>
                      )}
                      {device.signal_strength && (
                        <div className="text-sm text-text-secondary">
                          Signal: {device.signal_strength}%
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleDevice(device.id, true)}
                        disabled={loading || device.is_green}
                        className={`flex-1 p-2 rounded text-sm font-medium transition-colors ${
                          device.is_green
                            ? 'bg-success text-white cursor-not-allowed'
                            : 'btn-success'
                        }`}
                      >
                        GREEN
                      </button>
                      <button
                        onClick={() => toggleDevice(device.id, false)}
                        disabled={loading || !device.is_green}
                        className={`flex-1 p-2 rounded text-sm font-medium transition-colors ${
                          !device.is_green
                            ? 'bg-error text-white cursor-not-allowed'
                            : 'btn-error'
                        }`}
                      >
                        RED
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4 text-primary">System Maintenance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-medium mb-3 text-primary">Device Health</h4>
                  <div className="space-y-2">
                    {devices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                        <span className="font-medium">{device.name}</span>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${device.is_active ? 'bg-success' : 'bg-error'}`}></div>
                          <span className="text-sm text-text-secondary">
                            {device.is_active ? 'Healthy' : 'Issues'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-medium mb-3 text-primary">Sensor Data</h4>
                  <div className="space-y-2">
                    {sensorData.slice(0, 5).map((data, index) => (
                      <div key={index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                        <div className="text-sm font-medium">Device {data.device_id}</div>
                        <div className="text-xs text-text-muted">
                          H₂: {data.hydrogen_ppm}ppm | Temp: {data.temperature_c}°C | Hum: {data.humidity_percent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedDashboard;
