import { Zone } from '../types';
import apiClient from './client';

export const zonesApi = {
  // Get all zones
  getZones: async (): Promise<Zone[]> => {
    const response = await apiClient.get('/zones/');
    return response.data;
  },
}; 