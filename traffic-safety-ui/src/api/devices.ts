import apiClient from './client';
import type { Device, DeviceCreate } from '../types';

export const devicesApi = {
  // Get all devices
  getDevices: async (): Promise<Device[]> => {
    const response = await apiClient.get<Device[]>('/devices/');
    return response.data;
  },

  // Create a new device
  createDevice: async (device: DeviceCreate): Promise<Device> => {
    const response = await apiClient.post<Device>('/devices/', device);
    return response.data;
  },
}; 