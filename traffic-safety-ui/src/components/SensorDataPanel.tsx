import React, { useState, useEffect } from 'react';
import { sensorDataApi, SensorData } from '../api/sensorData';
import apiClient from '../api/client';

// Helper: always parse as UTC if no timezone, but display in local time
function parseBackendTimestamp(ts: string): Date {
  if (!ts) return new Date('1970-01-01T00:00:00Z');
  // If already has Z or offset, parse as is
  if (ts.endsWith('Z') || /[+-]\d\d:\d\d$/.test(ts)) {
    return new Date(ts);
  }
  // Otherwise, treat as UTC
  return new Date(ts + 'Z');
}

// Rename component
const MaintenancePanel: React.FC = () => {
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [recentReadings, setRecentReadings] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldDeviceLoading, setFieldDeviceLoading] = useState(false);
  const [repeaterLoading, setRepeaterLoading] = useState(false);
  const [pushRequested, setPushRequested] = useState(false);
  const [pushTimeout, setPushTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pushFailed, setPushFailed] = useState(false);
  const [fieldDeviceLastTrigger, setFieldDeviceLastTrigger] = useState<number | null>(null);
  const [repeaterLastTrigger, setRepeaterLastTrigger] = useState<number | null>(null);
  const [fieldDeviceLastSeen, setFieldDeviceLastSeen] = useState<number | null>(null);
  const [repeaterLastSeen, setRepeaterLastSeen] = useState<number | null>(null);

  // Fetch sensor data once (not polling)
  const fetchSensorData = async () => {
    setLoading(true);
    try {
      // Fetch data for device cards (latest readings for each device/hop combination)
      const data = await sensorDataApi.getLatestSensorData(10);
      
      // Fetch data for table (most recent chronological readings)
      const tableData = await sensorDataApi.getRecentReadings(10);
      
      // Check if we have any meaningful data (sensor data or lamp control data)
      const hasNewData = data.some(item => 
        item.temperature_c !== null || 
        item.humidity_percent !== null || 
        item.lamp_state || 
        item.rssi_dbm !== null || 
        item.snr_db !== null
      );
      
      // If we have data, clear the warning
      if (hasNewData) {
        setPushFailed(false);
      }
      
      // Update last seen timestamps for devices based on which trigger was used
      const now = Date.now();
      data.forEach(item => {
        if (item.device_id === 1 && (item.hop_count ?? 0) === 0) {
          setFieldDeviceLastSeen(now);
        }
        if (item.device_id === 1 && (item.hop_count ?? 0) === 1) {
          setRepeaterLastSeen(now);
        }
      });
      
      setSensorData(data);
      setRecentReadings(tableData);
      setError(null);
      
      // If a push was requested, check if new data arrived
      if (pushRequested) {
        setPushRequested(false);
        setFieldDeviceLoading(false);
        setRepeaterLoading(false);
        if (pushTimeout) {
          clearTimeout(pushTimeout);
          setPushTimeout(null);
        }
      }
    } catch (err) {
      setError('Failed to fetch sensor data');
      console.error('Error fetching sensor data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Push button handler
  const handlePush = async () => {
    setFieldDeviceLoading(true);
    setPushRequested(true);
    setPushFailed(false);
    setError(null);
    try {
      await apiClient.post('/trigger-sensor-read/');
      // Wait a short moment for device to respond, then fetch
      setTimeout(fetchSensorData, 2000);
      // Set a timeout to show warning if no new data arrives
      const timeout = setTimeout(() => {
        setFieldDeviceLoading(false);
        setPushFailed(true);
      }, 4000);
      setPushTimeout(timeout);
      setFieldDeviceLastTrigger(Date.now()); // Record the time of the last trigger
    } catch (err) {
      setError('Failed to trigger sensor read');
      setFieldDeviceLoading(false);
      setPushRequested(false);
      setPushFailed(true);
      console.error('Error triggering sensor read:', err);
    }
  };

  // Fetch on mount and set up periodic refresh
  useEffect(() => {
    fetchSensorData();
    
    // Set up periodic refresh every 5 seconds
    const interval = setInterval(fetchSensorData, 5000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, []);

  // Debug: log sensorData to console
  useEffect(() => {
    console.log('SensorData from API:', sensorData);
    console.log('Hop0 data:', hop0);
    console.log('Hop1 data:', hop1);
    console.log('Repeater status:', repeaterStatus);
    console.log('Field device status:', fieldDeviceStatus);
  }, [sensorData]);

  // Show in local time, but always parse as UTC if no timezone
  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '--';
    const date = parseBackendTimestamp(timestamp);
    return date.toLocaleString(); // local time
  };

  // Get latest readings for device 1, hop 0 and hop 1
  const hop0 = sensorData.find(d => d.device_id === 1 && (d.hop_count ?? 0) === 0);
  const hop1 = sensorData.find(d => d.device_id === 1 && (d.hop_count ?? 0) === 1);
  // Try to get repeater's own link (assuming device_id 2, hop 0)
  const repeaterSelf = sensorData.find(d => d.device_id === 2 && (d.hop_count ?? 0) === 0);

  // Helper function to check if data has any meaningful content (sensor data OR lamp control data)
  const hasMeaningfulData = (data: SensorData | undefined) => {
    if (!data) return false;
    // Check for sensor data
    if (data.temperature_c !== null || data.humidity_percent !== null) return true;
    // Check for lamp control data
    if (data.lamp_state || data.rssi_dbm !== null || data.snr_db !== null) return true;
    return false;
  };

  // Field device status logic - check for meaningful data and recent trigger
  let fieldDeviceStatus: 'present' | 'absent';
  if (hasMeaningfulData(hop0)) {
    // Direct connection to field device
    fieldDeviceStatus = 'present';
  } else if (hasMeaningfulData(hop1) && fieldDeviceLastTrigger && Date.now() - fieldDeviceLastTrigger < 10000) {
    // Field device data via repeater, and we triggered field device recently
    fieldDeviceStatus = 'present';
  } else {
    fieldDeviceStatus = 'absent';
  }

  // Repeater status - check for meaningful data via repeater (no timeout requirement)
  let repeaterStatus: 'present' | 'absent';
  if (hasMeaningfulData(hop1)) {
    // Repeater has data - show as present
    repeaterStatus = 'present';
  } else {
    repeaterStatus = 'absent';
  }
  const hasAnyData = hasMeaningfulData(hop0) || hasMeaningfulData(hop1);

  // Get the most recent timestamp (regardless of age)
  const getLatestTimestamp = () => {
    const timestamps = [];
    if (hop0) timestamps.push(parseBackendTimestamp(hop0.timestamp).getTime());
    if (hop1) timestamps.push(parseBackendTimestamp(hop1.timestamp).getTime());
    return timestamps.length > 0 ? Math.max(...timestamps) : null;
  };
  const latestTimestamp = getLatestTimestamp();

  // Badge helpers
  const fieldDeviceBadge =
    fieldDeviceStatus === 'present' ? (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500 text-white">CONNECTED</span>
    ) : (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500 text-white">NO DATA</span>
    );

  const repeaterBadge =
    repeaterStatus === 'present' ? (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500 text-white">CONNECTED</span>
    ) : (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500 text-white">NO DATA</span>
    );

  return (
    <div className="bg-gray-800 p-6 rounded-lg max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Maintenance Panel (Device 1 Field & Repeater)</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${fieldDeviceStatus === 'present' ? (fieldDeviceStatus === 'present' ? 'bg-green-500' : 'bg-blue-500') : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-300">Field Device</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${repeaterStatus === 'present' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-300">Repeater</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {pushFailed && (
        <div className="bg-yellow-600 text-white p-4 rounded-lg mb-4 text-center">
          <div className="text-lg font-semibold mb-2">⚠️ No New Sensor Data Received</div>
          <div className="text-sm">The last sensor read request did not return new data. Check your LoRa connections.</div>
        </div>
      )}

      {!hasAnyData && !loading && (
        <div className="bg-yellow-600 text-white p-4 rounded-lg mb-4 text-center">
          <div className="text-lg font-semibold mb-2">⚠️ No Sensor Data Available</div>
          <div className="text-sm">No readings from field device or repeater. Trigger a sensor read to get data.</div>
        </div>
      )}

      {latestTimestamp && (
        <div className="bg-blue-600 text-white p-3 rounded-lg mb-4 text-center">
          <div className="text-sm">Last Reading: {formatTimestamp(new Date(latestTimestamp).toISOString())}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Field Device (Hop 0) */}
        <div className={`bg-gradient-to-br ${fieldDeviceStatus === 'present' ? 'from-blue-900 to-gray-900' : 'from-gray-700 to-gray-800'} rounded-2xl shadow-lg p-6 flex flex-col items-center border-2 ${fieldDeviceStatus === 'present' ? 'border-blue-500' : 'border-gray-600'}`}>
          <div className="flex items-center space-x-2 mb-4">
            <h3 className="text-lg font-bold text-orange-300">Field Device (Hop 0)</h3>
            {fieldDeviceBadge}
          </div>
          {fieldDeviceStatus === 'present' && hop0 && hasMeaningfulData(hop0) ? (
            <>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-orange-400">{hop0.temperature_c !== null ? `${hop0.temperature_c.toFixed(1)}°C` : '--'}</span>
                <span className="text-sm text-gray-300">Temperature</span>
              </div>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-cyan-400">{hop0.humidity_percent !== null ? `${hop0.humidity_percent.toFixed(1)}%` : '--'}</span>
                <span className="text-sm text-gray-300">Humidity</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xl font-bold text-green-400">{hop0.rssi_dbm !== null ? `${hop0.rssi_dbm} dBm` : '--'}</span>
                <span className="text-xs text-gray-300">RSSI</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xl font-bold text-purple-400">{hop0.snr_db !== null ? `${hop0.snr_db} dB` : '--'}</span>
                <span className="text-xs text-gray-300">SNR</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className={`text-xl font-bold ${hop0.lamp_state === 'on' ? 'text-green-400' : 'text-red-400'}`}>{hop0.lamp_state || '--'}</span>
                <span className="text-xs text-gray-300">Lamp State</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xs text-pink-400">{hop0.msg_id || '--'}</span>
                <span className="text-xs text-gray-300">Message ID</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">Updated: {formatTimestamp(hop0.timestamp)}</div>
            </>
          ) : fieldDeviceStatus === 'present' && hop1 && hasMeaningfulData(hop1) ? (
            <>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-orange-400">{hop1.temperature_c !== null ? `${hop1.temperature_c.toFixed(1)}°C` : '--'}</span>
                <span className="text-sm text-gray-300">Temperature (via repeater)</span>
              </div>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-cyan-400">{hop1.humidity_percent !== null ? `${hop1.humidity_percent.toFixed(1)}%` : '--'}</span>
                <span className="text-sm text-gray-300">Humidity (via repeater)</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xl font-bold text-green-400">{hop1.rssi_dbm !== null ? `${hop1.rssi_dbm} dBm` : '--'}</span>
                <span className="text-xs text-gray-300">RSSI (via repeater)</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xl font-bold text-purple-400">{hop1.snr_db !== null ? `${hop1.snr_db} dB` : '--'}</span>
                <span className="text-xs text-gray-300">SNR (via repeater)</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className={`text-xl font-bold ${hop1.lamp_state === 'on' ? 'text-green-400' : 'text-red-400'}`}>{hop1.lamp_state || '--'}</span>
                <span className="text-xs text-gray-300">Lamp State (via repeater)</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xs text-pink-400">{hop1.msg_id || '--'}</span>
                <span className="text-xs text-gray-300">Message ID</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">Updated: {formatTimestamp(hop1.timestamp)}</div>
            </>
          ) : (
            <div className="text-center">
              <div className="text-gray-400 mb-2">📡 Field Device Disconnected</div>
              <div className="text-xs text-gray-500">No readings from field device</div>
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <button
                              onClick={async () => {
                  setFieldDeviceLoading(true);
                  setPushRequested(true);
                  setPushFailed(false); // Clear warning on new trigger
                  setError(null);
                  setFieldDeviceLastTrigger(Date.now()); // Record the time of the last trigger
                  try {
                    await apiClient.post('/trigger-sensor-read/'); // No body for field device
                    setTimeout(fetchSensorData, 2000);
                    const timeout = setTimeout(() => {
                      setFieldDeviceLoading(false);
                      setPushFailed(true);
                    }, 4000);
                    setPushTimeout(timeout);
                  } catch (err) {
                    setError('Failed to trigger sensor read');
                    setFieldDeviceLoading(false);
                    setPushRequested(false);
                    setPushFailed(true);
                    console.error('Error triggering sensor read:', err);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline transition-colors duration-200"
                disabled={fieldDeviceLoading || repeaterLoading}
              >
                {fieldDeviceLoading ? 'Triggering...' : 'Trigger Field Device Sensor'}
            </button>
          </div>
        </div>

        {/* Repeater (Hop 1) */}
        <div className={`bg-gradient-to-br ${repeaterStatus === 'present' ? 'from-purple-900 to-gray-900' : 'from-gray-700 to-gray-800'} rounded-2xl shadow-lg p-6 flex flex-col items-center border-2 ${repeaterStatus === 'present' ? 'border-purple-500' : 'border-gray-600'}`}>
          <div className="flex items-center space-x-2 mb-4">
            <h3 className="text-lg font-bold text-purple-300">Repeater (Hop 1)</h3>
            {repeaterBadge}
          </div>
          {repeaterStatus === 'present' && hop1 && hasMeaningfulData(hop1) ? (
            <>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-orange-400">{hop1.temperature_c !== null ? `${hop1.temperature_c.toFixed(1)}°C` : '--'}</span>
                <span className="text-sm text-gray-300">Temperature</span>
              </div>
              <div className="flex flex-col items-center mb-4">
                <span className="text-3xl font-bold text-cyan-400">{hop1.humidity_percent !== null ? `${hop1.humidity_percent.toFixed(1)}%` : '--'}</span>
                <span className="text-sm text-gray-300">Humidity</span>
              </div>
              {/* Repeater Link (self, hop 1) */}
              <div className="flex flex-col items-center mb-2 mt-2">
                <span className="text-xs text-gray-400 font-semibold mb-1">Repeater Link (to Gateway)</span>
                <span className="text-xl font-bold text-green-300">{hop1.rssi_dbm !== null ? `${hop1.rssi_dbm} dBm` : '--'}</span>
                <span className="text-xs text-gray-300">Repeater RSSI</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xl font-bold text-purple-300">{hop1.snr_db !== null ? `${hop1.snr_db} dB` : '--'}</span>
                <span className="text-xs text-gray-300">Repeater SNR</span>
              </div>
              <div className="flex flex-col items-center mb-2">
                <span className="text-xs text-pink-400">{hop1.msg_id || '--'}</span>
                <span className="text-xs text-gray-300">Message ID</span>
              </div>
              {/* Show origin device for repeater data */}
              <div className="text-xs text-blue-300 mt-2">Origin: Device {hop1.device_id}</div>
              <div className="text-xs text-gray-400 mt-2">Updated: {formatTimestamp(hop1.timestamp)}</div>
            </>
          ) : (
            <div className="text-center">
              <div className="text-gray-400 mb-2">📡 Repeater Disconnected</div>
              <div className="text-xs text-gray-500">No relayed readings from repeater</div>
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <button
              onClick={async () => {
                setRepeaterLoading(true);
                setPushRequested(true);
                setPushFailed(false); // Clear warning on new trigger
                setError(null);
                setRepeaterLastTrigger(Date.now()); // Record the time of the last trigger
                try {
                  await apiClient.post('/trigger-sensor-read/', { cmd: 'read_sensor', hop: 1 }); // Send correct body for repeater
                  setTimeout(fetchSensorData, 2000);
                  const timeout = setTimeout(() => {
                    setRepeaterLoading(false);
                    setPushFailed(true);
                  }, 4000);
                  setPushTimeout(timeout);
                } catch (err) {
                  setError('Failed to trigger repeater read');
                  setRepeaterLoading(false);
                  setPushRequested(false);
                  setPushFailed(true);
                  console.error('Error triggering repeater read:', err);
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline transition-colors duration-200"
              disabled={fieldDeviceLoading || repeaterLoading}
            >
              {repeaterLoading ? 'Triggering...' : 'Trigger Repeater Lamp'}
            </button>
          </div>
        </div>
      </div>

      {/* Connection Summary */}
      {hasAnyData && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Connection Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">Field Device:</span>
              {fieldDeviceBadge}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">Repeater:</span>
              {repeaterBadge}
            </div>
          </div>
        </div>
      )}

      {/* Last 10 Readings */}
      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold text-gray-300">Last 10 Readings</h4>
          <button
            onClick={fetchSensorData}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors duration-200"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {recentReadings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-2 px-2 text-gray-300">Time</th>
                  <th className="text-left py-2 px-2 text-gray-300">Device</th>
                  <th className="text-left py-2 px-2 text-gray-300">Temperature</th>
                  <th className="text-left py-2 px-2 text-gray-300">Humidity</th>
                  <th className="text-left py-2 px-2 text-gray-300">Lamp State</th>
                  <th className="text-left py-2 px-2 text-gray-300">RSSI</th>
                  <th className="text-left py-2 px-2 text-gray-300">SNR</th>
                  <th className="text-left py-2 px-2 text-gray-300">Hop</th>
                  <th className="text-left py-2 px-2 text-gray-300">Message ID</th>
                </tr>
              </thead>
              <tbody>
                {recentReadings.map((reading, index) => (
                  <tr key={reading.id} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}`}>
                    <td className="py-2 px-2 text-gray-300">
                      {formatTimestamp(reading.timestamp)}
                    </td>
                    <td className="py-2 px-2 text-blue-300">
                      {reading.hop_count === 0 ? 'Field Device' : 
                       reading.hop_count === 1 ? 'Repeater' : 
                       reading.hop_count && reading.hop_count > 1 ? `Multi-Hop (${reading.hop_count})` : 
                       'Device ' + reading.device_id}
                    </td>
                    <td className="py-2 px-2 text-orange-300">
                      {reading.temperature_c !== null && reading.temperature_c !== 0 ? 
                        `${reading.temperature_c.toFixed(1)}°C` : 
                        reading.temperature_c === 0 ? 
                          <span className="text-red-400" title="Sensor reading error">0.0°C ⚠️</span> : 
                          '--'}
                    </td>
                    <td className="py-2 px-2 text-cyan-300">
                      {reading.humidity_percent !== null && reading.humidity_percent !== 0 ? 
                        `${reading.humidity_percent.toFixed(1)}%` : 
                        reading.humidity_percent === 0 ? 
                          <span className="text-red-400" title="Sensor reading error">0.0% ⚠️</span> : 
                          '--'}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`font-semibold ${reading.lamp_state === 'on' ? 'text-green-400' : reading.lamp_state === 'off' ? 'text-red-400' : 'text-gray-400'}`}>
                        {reading.lamp_state || '--'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-green-300">
                      {reading.rssi_dbm !== null ? `${reading.rssi_dbm} dBm` : '--'}
                    </td>
                    <td className="py-2 px-2 text-purple-300">
                      {reading.snr_db !== null ? `${reading.snr_db} dB` : '--'}
                    </td>
                    <td className="py-2 px-2 text-yellow-300">
                      {reading.hop_count !== null ? reading.hop_count : '--'}
                    </td>
                    <td className="py-2 px-2 text-pink-300 text-xs">
                      {reading.msg_id || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-gray-400">No readings available</div>
            <div className="text-xs text-gray-500 mt-1">Trigger a lamp control to see readings here</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenancePanel; 