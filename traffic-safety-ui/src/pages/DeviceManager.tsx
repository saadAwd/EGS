import React, { useState, useEffect } from 'react';
import { Device, DeviceCreate, Route } from '../types';
import { devicesApi, routesApi } from '../api';
import { sensorDataApi, SensorData } from '../api/sensorData';

const DeviceManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<DeviceCreate>({
    name: '',
    route_id: 0,
    location: ''
  });

  useEffect(() => {
    loadData();
    fetchSensorData();
    
    // Set up periodic refresh of sensor data
    const interval = setInterval(fetchSensorData, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [devicesData, routesData] = await Promise.all([
        devicesApi.getDevices(),
        routesApi.getRoutes()
      ]);
      
      // Filter to only show required devices and routes
      const requiredDevices = devicesData.filter(device => 
        ['TL1', 'TL2', 'TL4', 'TL6', 'TL8', 'TL13', 'TL14'].includes(device.name)
      );
      const zone5Routes = routesData.filter(route => route.zone_id === 5);
      
      setDevices(requiredDevices);
      setRoutes(zone5Routes);
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage({ type: 'error', text: 'Failed to load devices and routes' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSensorData = async () => {
    try {
      const data = await sensorDataApi.getLatestSensorData();
      setSensorData(data);
    } catch (err) {
      console.error('Error fetching sensor data:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'route_id' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.route_id || !formData.location) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      
      const newDevice = await devicesApi.createDevice(formData);
      setDevices(prev => [...prev, newDevice]);
      
      // Reset form
      setFormData({
        name: '',
        route_id: 0,
        location: ''
      });
      
      setShowCreateForm(false);
      setMessage({ type: 'success', text: `Device "${newDevice.name}" created successfully!` });
    } catch (error) {
      console.error('Error creating device:', error);
      setMessage({ type: 'error', text: 'Failed to create device' });
    } finally {
      setSubmitting(false);
    }
  };

  const getRouteName = (routeId: number) => {
    const route = routes.find(r => r.id === routeId);
    return route ? route.name : `Route ${routeId}`;
  };

  const getStatusColor = (isGreen: boolean) => {
    return isGreen ? 'bg-green-500' : 'bg-red-500';
  };

  const getStatusText = (isGreen: boolean) => {
    return isGreen ? 'Green Light' : 'Red Light';
  };

  // Helper to get latest sensor data for a device
  const getDeviceSignal = (deviceId: number) => {
    const reading = sensorData.find((d) => d.device_id === deviceId);
    return {
      rssi: reading?.rssi_dbm ?? null,
      snr: reading?.snr_db ?? null,
      hop: reading?.hop_count ?? null,
      msgId: reading?.msg_id ?? null,
      lampState: reading?.lamp_state ?? null,
      temp: reading?.temperature_c ?? null,
      humidity: reading?.humidity_percent ?? null,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--neon-cyan)] mx-auto mb-4"></div>
          <div className="text-gray-400">Loading devices...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold neon-text mb-2">Zone 5 Device Manager</h1>
            <p className="text-gray-400">Manage Zone 5 traffic control devices and sensors</p>
            <div className="mt-2 text-sm text-blue-300">
              Traffic Lights: TL1, TL2, TL4, TL6, TL8, TL13, TL14 | TL2: GPIO 25 (ON=Red, OFF=Green)
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-premium"
          >
            Add Device
          </button>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`glass-card p-4 ${
          message.type === 'success' 
            ? 'border-green-500/50 bg-green-500/10' 
            : 'border-red-500/50 bg-red-500/10'
        }`}>
          <div className={`text-sm ${
            message.type === 'success' ? 'text-green-400' : 'text-red-400'
          }`}>
            {message.text}
          </div>
        </div>
      )}

      {/* Create Device Form */}
      {showCreateForm && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Add New Device</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Device Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 
                           text-white placeholder-gray-400 focus:border-[var(--neon-cyan)] 
                           focus:outline-none transition-colors"
                  placeholder="e.g., Sensor Alpha"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Route
                </label>
                <select
                  name="route_id"
                  value={formData.route_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 
                           text-white focus:border-[var(--neon-cyan)] focus:outline-none 
                           transition-colors"
                  required
                >
                  <option value={0}>Select a route</option>
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>
                      {route.name} (Zone {route.zone_id}, {route.wind_direction})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 
                           text-white placeholder-gray-400 focus:border-[var(--neon-cyan)] 
                           focus:outline-none transition-colors"
                  placeholder="e.g., North Tower"
                  required
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <button 
                type="submit" 
                disabled={submitting}
                className="btn-premium flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating...' : 'Create Device'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="flex-1 py-3 rounded-xl font-medium text-white transition-all duration-300
                         border border-white/20 hover:bg-white/10 hover:border-white/40"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Field Device Status */}
      {(() => {
        const fieldDeviceData = getDeviceSignal(1);
        if (fieldDeviceData.rssi !== null || fieldDeviceData.temp !== null) {
          return (
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                📡 Field Device 1 (LoRa Sensor)
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-xl p-4 border border-blue-500/30">
                  <div className="text-sm text-blue-300 mb-1">Temperature</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {fieldDeviceData.temp !== null ? `${fieldDeviceData.temp}°C` : '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 rounded-xl p-4 border border-cyan-500/30">
                  <div className="text-sm text-cyan-300 mb-1">Humidity</div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {fieldDeviceData.humidity !== null ? `${fieldDeviceData.humidity}%` : '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-xl p-4 border border-purple-500/30">
                  <div className="text-sm text-purple-300 mb-1">Hop Count</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {fieldDeviceData.hop !== null ? fieldDeviceData.hop : '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-xl p-4 border border-green-500/30">
                  <div className="text-sm text-green-300 mb-1">Lamp State</div>
                  <div className={`text-2xl font-bold ${fieldDeviceData.lampState === 'on' ? 'text-green-400' : 'text-red-400'}`}>
                    {fieldDeviceData.lampState || '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 rounded-xl p-4 border border-orange-500/30">
                  <div className="text-sm text-orange-300 mb-1">RSSI</div>
                  <div className="text-2xl font-bold text-orange-400">
                    {fieldDeviceData.rssi !== null ? `${fieldDeviceData.rssi} dBm` : '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-indigo-900/50 to-indigo-800/30 rounded-xl p-4 border border-indigo-500/30">
                  <div className="text-sm text-indigo-300 mb-1">SNR</div>
                  <div className="text-2xl font-bold text-indigo-400">
                    {fieldDeviceData.snr !== null ? `${fieldDeviceData.snr} dB` : '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-900/50 to-pink-800/30 rounded-xl p-4 border border-pink-500/30">
                  <div className="text-sm text-pink-300 mb-1">Message ID</div>
                  <div className="text-lg font-bold text-pink-400 truncate">
                    {fieldDeviceData.msgId || '--'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 rounded-xl p-4 border border-yellow-500/30">
                  <div className="text-sm text-yellow-300 mb-1">Status</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {fieldDeviceData.rssi !== null ? '🟢 Online' : '🔴 Offline'}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Traffic Light Devices */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Traffic Light Devices</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const { rssi, snr, hop, msgId, lampState, temp, humidity } = getDeviceSignal(device.id);
            return (
              <div
                key={device.id}
                className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-lg p-6 flex flex-col items-start justify-between min-h-[180px] border border-gray-700 hover:scale-[1.02] transition-transform"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-3 h-3 rounded-full ${device.is_green ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div className="text-lg font-semibold text-white">{device.name}</div>
                  <span className="ml-2 px-2 py-0.5 rounded bg-blue-900 text-xs text-blue-300">{getRouteName(device.route_id)}</span>
                </div>
                <div className="text-sm text-gray-400 mb-2">{device.location}</div>
                <div className="flex flex-wrap gap-4 items-center mt-2 w-full">
                  <div className="flex flex-col items-center flex-1 min-w-[90px]">
                    <span className={`text-xs font-medium ${device.is_green ? 'text-green-400' : 'text-red-400'}`}>{getStatusText(device.is_green)}</span>
                  </div>
                  {device.name === 'TL2' && (
                    <>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">RSSI</span>
                        <span className="text-lg font-bold text-blue-400">{rssi !== null ? `${rssi} dBm` : '--'}</span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">SNR</span>
                        <span className="text-lg font-bold text-cyan-400">{snr !== null ? `${snr} dB` : '--'}</span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">Hop</span>
                        <span className="text-lg font-bold text-purple-400">{hop !== null ? hop : '--'}</span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">Lamp</span>
                        <span className={`text-lg font-bold ${lampState === 'on' ? 'text-green-400' : 'text-red-400'}`}>
                          {lampState || '--'}
                        </span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">Temp</span>
                        <span className="text-lg font-bold text-orange-400">{temp !== null ? `${temp}°C` : '--'}</span>
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-[90px]">
                        <span className="text-xs text-gray-400">Humidity</span>
                        <span className="text-lg font-bold text-cyan-400">{humidity !== null ? `${humidity}%` : '--'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {devices.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="text-6xl mb-4">📱</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Devices Found</h3>
          <p className="text-gray-400 mb-6">Get started by adding your first traffic control device</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-premium"
          >
            Add First Device
          </button>
        </div>
      )}
    </div>
  );
};

export default DeviceManager; 