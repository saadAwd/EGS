import apiClient from './client';

export interface Pole {
  id: number;
  name: string;
  location?: string;
  is_active: boolean;
}

export interface Lamp {
  id: number;
  pole_id: number;
  lamp_number: number;
  side_number: number;
  direction: 'straight' | 'left' | 'right';
  gateway_id: string;
  is_on: boolean;
  pole?: Pole;
}

export interface PoleWithLamps extends Pole {
  lamps: Lamp[];
}

// Pole API functions
export const getPoles = async (): Promise<Pole[]> => {
  const response = await apiClient.get('/poles/');
  return response.data;
};

export const getPole = async (id: number): Promise<PoleWithLamps> => {
  const response = await apiClient.get(`/poles/${id}`);
  return response.data;
};

export const getPoleLamps = async (poleId: number): Promise<Lamp[]> => {
  const response = await apiClient.get(`/poles/${poleId}/lamps/`);
  return response.data;
};

// Lamp API functions
export const getAllLamps = async (): Promise<Lamp[]> => {
  const response = await apiClient.get('/lamps/');
  return response.data;
};

export const getLamp = async (id: number): Promise<Lamp> => {
  const response = await apiClient.get(`/lamps/${id}`);
  return response.data;
};

export const activateLamp = async (id: number): Promise<Lamp> => {
  const response = await apiClient.patch(`/lamps/${id}/activate`);
  return response.data;
};

export const deactivateLamp = async (id: number): Promise<Lamp> => {
  const response = await apiClient.patch(`/lamps/${id}/deactivate`);
  return response.data;
};

export const activateAllPoleLamps = async (poleId: number): Promise<Lamp[]> => {
  const response = await apiClient.patch(`/poles/${poleId}/activate-all`);
  return response.data;
};

export const deactivateAllPoleLamps = async (poleId: number): Promise<Lamp[]> => {
  const response = await apiClient.patch(`/poles/${poleId}/deactivate-all`);
  return response.data;
};
