import apiClient from './client';

export interface SyncState {
  isActivated: boolean;
  zoneName: string | null;
  windDirection: string | null;
  activationTime: string | null;
  manualOverride: boolean;
  deactivationInProgress: boolean;
}

export interface SyncResponse {
  status: string;
  state: SyncState;
}

// Get current sync state
export const getSyncState = async (): Promise<SyncState> => {
  const response = await apiClient.get('/sync/state');
  return response.data;
};

// Toggle manual override during emergency activation
export const toggleManualOverride = async (enable: boolean): Promise<SyncResponse> => {
  const response = await apiClient.post('/sync/manual-override', { enable });
  return response.data;
};

