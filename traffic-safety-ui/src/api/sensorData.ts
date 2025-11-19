import apiClient from './client';

export interface SensorData {
  id: number;
  device_id: number;
  hydrogen_ppm: number | null;
  temperature_c: number | null;
  humidity_percent: number | null;
  rssi_dbm?: number | null;
  snr_db?: number | null;
  hop_count?: number | null;
  msg_id?: string | null;
  lamp_state?: string | null;
  timestamp: string;
}

export const sensorDataApi = {
  // Get latest sensor data for all devices (with signal)
  getLatestSensorData: async (limit: number = 50): Promise<SensorData[]> => {
    const response = await apiClient.get<SensorData[]>(`/sensor-data/latest-with-signal/?limit=${limit}`);
    return response.data;
  },

  // Get recent sensor readings chronologically (for table display)
  getRecentReadings: async (limit: number = 10): Promise<SensorData[]> => {
    const response = await apiClient.get<SensorData[]>(`/sensor-data/recent-readings/?limit=${limit}`);
    return response.data;
  },

  // Get sensor data for a specific device (with signal)
  getDeviceSensorData: async (deviceId: number, limit: number = 100): Promise<SensorData[]> => {
    const response = await apiClient.get<SensorData[]>(`/sensor-data/device/${deviceId}/signal?limit=${limit}`);
    return response.data;
  },
}; 