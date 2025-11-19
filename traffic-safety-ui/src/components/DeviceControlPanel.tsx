import React, { useState, useEffect } from 'react';
import { trafficLightApi, TrafficLightStatus } from '../api/trafficLight';
import { sensorDataApi, SensorData } from '../api/sensorData';

interface DeviceControlPanelProps {
  deviceId: number;
}

const DeviceControlPanel: React.FC<DeviceControlPanelProps> = ({ deviceId }) => {
  const [trafficLightStatus, setTrafficLightStatus] = useState<TrafficLightStatus | null>(null);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [statusResponse, sensorResponse] = await Promise.all([
        trafficLightApi.getTrafficLightStatus(deviceId),
        sensorDataApi.getDeviceSensorData(deviceId, 1)
      ]);
      
      setTrafficLightStatus(statusResponse);
      setSensorData(sensorResponse[0] || null);
      setError(null);
    } catch (err) {
      setError('Failed to fetch device data');
      console.error('Error fetching device data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // Update every 3 seconds
    return () => clearInterval(interval);
  }, [deviceId]);

  const toggleTrafficLight = async (isGreen: boolean) => {
    setLoading(true);
    setError(null);
    try {
      await trafficLightApi.controlTrafficLight({
        device_id: deviceId,
        is_green: isGreen
      });
      await fetchData(); // Refresh data
    } catch (err) {
      setError(`Failed to set traffic light to ${isGreen ? 'GREEN' : 'RED'}`);
      console.error('Error controlling traffic light:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="glass-card p-6">
      <h2 className="text-xl font-semibold mb-4">Device {deviceId} Control Panel</h2>
      
      {error && (
        <div className="bg-error text-white p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Traffic Light Control */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Traffic Light Control</h3>
        <div className="flex gap-3 mb-3">
          <button
            onClick={() => toggleTrafficLight(true)}
            disabled={loading || trafficLightStatus?.is_green}
            className={`flex-1 p-3 rounded-lg font-medium transition-colors ${
              trafficLightStatus?.is_green
                ? 'bg-success text-white cursor-not-allowed'
                : 'btn-secondary hover:bg-success text-white'
            }`}
          >
            {loading ? 'Setting...' : 'Set GREEN'}
          </button>
          <button
            onClick={() => toggleTrafficLight(false)}
            disabled={loading || !trafficLightStatus?.is_green}
            className={`flex-1 p-3 rounded-lg font-medium transition-colors ${
              !trafficLightStatus?.is_green
                ? 'bg-error text-white cursor-not-allowed'
                : 'btn-secondary hover:bg-error text-white'
            }`}
          >
            {loading ? 'Setting...' : 'Set RED'}
          </button>
        </div>
        
        {/* Traffic Light Status */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Current Status:</span>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full ${trafficLightStatus?.is_green ? 'bg-success' : 'bg-error'}`}></div>
              <span className="font-medium">
                {trafficLightStatus?.is_green ? 'GREEN' : 'RED'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-text-secondary">Active:</span>
            <span className={`text-sm font-medium ${trafficLightStatus?.is_active ? 'text-success' : 'text-text-muted'}`}>
              {trafficLightStatus?.is_active ? 'YES' : 'NO'}
            </span>
          </div>
          {trafficLightStatus?.last_updated && (
            <div className="text-xs text-text-muted mt-2">
              Last Updated: {formatTimestamp(trafficLightStatus.last_updated)}
            </div>
          )}
        </div>
      </div>

      {/* Sensor Data */}
      <div>
        <h3 className="text-lg font-medium mb-3">Latest Sensor Data</h3>
        {sensorData ? (
          <div className="glass-card p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Hydrogen (ppm):</span>
              <span className="font-medium">{sensorData.hydrogen_ppm}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Temperature (°C):</span>
              <span className="font-medium">{sensorData.temperature_c}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Humidity (%):</span>
              <span className="font-medium">{sensorData.humidity_percent}</span>
            </div>
            <div className="text-xs text-text-muted mt-2">
              Timestamp: {formatTimestamp(sensorData.timestamp)}
            </div>
          </div>
        ) : (
          <div className="glass-card p-3 text-text-muted">
            No sensor data available
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceControlPanel; 