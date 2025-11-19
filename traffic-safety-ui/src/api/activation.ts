import apiClient from './client';
import type { ActivationCreate, DeactivationRequest, ZoneStatus, MessageResponse } from '../types';

export const activationApi = {
  // Activate a zone
  activateZone: async (activation: ActivationCreate): Promise<ZoneStatus> => {
    const response = await apiClient.post<ZoneStatus>('/activate/', activation);
    return response.data;
  },

  // Deactivate a zone
  deactivateZone: async (deactivation: DeactivationRequest): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/deactivate/', deactivation);
    return response.data;
  },

  // Get zone status
  getZoneStatus: async (zoneId: number): Promise<ZoneStatus> => {
    const response = await apiClient.get<ZoneStatus>(`/zones/${zoneId}/status`);
    return response.data;
  }
}; 