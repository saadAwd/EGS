import { useQuery } from '@tanstack/react-query';
import apiClient from './client';
import { weatherApi, WeatherRecord } from './weather';
import { getPoles, getAllLamps, Pole, Lamp } from './trafficLights';
import { getGatewayStatus, GatewayStatus } from './gateway';

// Device types
interface Device {
  id: number;
  name: string;
  route_id: number;
  location: string;
  description?: string;
  is_active: boolean;
}

interface Zone {
  id: number;
  name: string;
  is_active: boolean;
  active_wind_direction: string | null;
}

interface Lamp {
  id: number;
  pole_id: number;
  is_on: boolean;
  [key: string]: any;
}

// GatewayStatus is imported from gateway.ts

interface SensorData {
  device_id: number;
  temperature_c?: number;
  humidity_percent?: number;
  [key: string]: any;
}

// Query keys
export const queryKeys = {
  devices: ['devices'] as const,
  zones: ['zones'] as const,
  lamps: ['lamps'] as const,
  gatewayStatus: ['gateway', 'status'] as const,
  sensorData: ['sensor-data', 'latest'] as const,
  weather: ['weather', 'latest'] as const,
  backendHealth: ['backend', 'health'] as const,
  emergencyEvents: ['emergency-events'] as const,
  poles: ['poles'] as const,
};

// Hook for devices (filtered for TL1-TL14)
export const useDevices = () => {
  return useQuery<Device[]>({
    queryKey: queryKeys.devices,
    queryFn: async () => {
      const response = await apiClient.get('/devices/');
      const allDevices = response.data as Device[];
      return allDevices.filter(
        (device) => device.name.startsWith('TL') && parseInt(device.name.substring(2)) <= 14
      );
    },
    refetchInterval: false, // No polling - rely on WebSocket or manual refresh
  });
};

// Hook for zones
export const useZones = () => {
  return useQuery<Zone[]>({
    queryKey: queryKeys.zones,
    queryFn: async () => {
      const response = await apiClient.get('/zones/');
      return response.data as Zone[];
    },
    refetchInterval: false, // No polling - rely on WebSocket or manual refresh
  });
};

// Hook for lamps
export const useLamps = () => {
  return useQuery<Lamp[]>({
    queryKey: queryKeys.lamps,
    queryFn: async () => {
      return await getAllLamps();
    },
    refetchInterval: false, // No polling - rely on WebSocket lamp_update messages
  });
};

// Hook for poles
export const usePoles = () => {
  return useQuery<Pole[]>({
    queryKey: queryKeys.poles,
    queryFn: async () => {
      return await getPoles();
    },
    refetchInterval: false, // No polling - poles don't change frequently
  });
};

// Hook for gateway status
export const useGatewayStatus = () => {
  return useQuery<GatewayStatus>({
    queryKey: queryKeys.gatewayStatus,
    queryFn: async () => {
      try {
        return await getGatewayStatus();
      } catch {
        return { 
          gateway_connected: false,
          connection_status: 'disconnected',
          queue_depth: 0,
          device_status: {},
          last_heartbeat: null
        } as GatewayStatus;
      }
    },
    refetchInterval: false, // No polling - rely on WebSocket gateway_status messages
  });
};

// Hook for sensor data
export const useSensorData = () => {
  return useQuery<SensorData[]>({
    queryKey: queryKeys.sensorData,
    queryFn: async () => {
      try {
        const response = await apiClient.get('/sensor-data/latest-with-signal/');
        return response.data as SensorData[];
      } catch {
        return [];
      }
    },
    refetchInterval: false, // No polling - rely on WebSocket or manual refresh
  });
};

// Hook for weather
export const useWeather = () => {
  return useQuery<WeatherRecord | null>({
    queryKey: queryKeys.weather,
    queryFn: async () => {
      try {
        return await weatherApi.latest();
      } catch {
        return null;
      }
    },
    refetchInterval: false, // No polling - rely on WebSocket weather_update messages
  });
};

// Hook for backend health
export const useBackendHealth = () => {
  return useQuery<{ connected: boolean; lastCheck: Date }>({
    queryKey: queryKeys.backendHealth,
    queryFn: async () => {
      try {
        await apiClient.get('/health');
        return { connected: true, lastCheck: new Date() };
      } catch {
        return { connected: false, lastCheck: new Date() };
      }
    },
    refetchInterval: 10000, // 10 seconds
  });
};

// Hook for emergency events
export const useEmergencyEvents = () => {
  return useQuery({
    queryKey: queryKeys.emergencyEvents,
    queryFn: async () => {
      const response = await apiClient.get('/emergency-events/');
      return response.data;
    },
    refetchInterval: false, // No polling - rely on WebSocket zone_state messages or manual refresh
  });
};

