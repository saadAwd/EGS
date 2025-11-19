import apiClient from './client';

export interface TrafficLightStatus {
  device_id: number;
  is_green: boolean;
  is_active: boolean;
  last_updated: string;
}

export type ArrowDirection = 'left' | 'straight' | 'right';

export interface TrafficLightArrow {
  id: number;
  device_id: number;
  direction: ArrowDirection;
  is_on: boolean;
  updated_at: string;
}

export interface TrafficLightControl {
  device_id: number;
  is_green: boolean;
}

export const trafficLightApi = {
  // Get traffic light status for a specific device
  getTrafficLightStatus: async (deviceId: number): Promise<TrafficLightStatus> => {
    const response = await apiClient.get<TrafficLightStatus>(`/traffic-light/status/${deviceId}`);
    return response.data;
  },

  // Get traffic light status for all devices
  getAllTrafficLightStatus: async (): Promise<TrafficLightStatus[]> => {
    const response = await apiClient.get<TrafficLightStatus[]>('/traffic-light/status/');
    return response.data;
  },

  // Control traffic light (set to red or green)
  controlTrafficLight: async (control: TrafficLightControl): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/traffic-light/control/', control);
    return response.data;
  },

  // Control GPIO pin on ESP32 gateway
  controlGpioPin: async (pin: number, state: 'on' | 'off'): Promise<{ message: string }> => {
    const response = await apiClient.get<{ message: string }>(`/gpio/control/?pin=${pin}&state=${state}`);
    return response.data;
  },

  // Get per-direction arrows for a device
  getArrows: async (deviceId: number): Promise<TrafficLightArrow[]> => {
    const response = await apiClient.get<TrafficLightArrow[]>(`/traffic-light/${deviceId}/arrows`);
    return response.data;
  },

  // Set a single arrow on/off
  setArrow: async (deviceId: number, direction: ArrowDirection, isOn: boolean): Promise<TrafficLightArrow> => {
    const response = await apiClient.patch<TrafficLightArrow>(`/traffic-light/${deviceId}/arrow`, {
      device_id: deviceId,
      direction,
      is_on: isOn,
    });
    return response.data;
  },
}; 