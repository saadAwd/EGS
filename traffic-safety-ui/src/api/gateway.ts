import apiClient from './client';

export interface GatewayStatus {
  gateway_connected: boolean;
  queue_depth: number;
  device_status: Record<string, {
    last_ack_time: string | null;
    last_command: string | null;
    success_rate: number;
    total_commands: number;
    successful_commands: number;
  }>;
  connection_status: string;
  last_heartbeat: string | null;
}

export interface GatewayResponse {
  ok: boolean;
  ack: boolean;
  retries: number;
  t_ms: number;
  error?: string;
}

export interface LampCommandResponse {
  success: boolean;
  lamp_id: number;
  state: boolean;
  message: string;
}

export interface BatchCommandResponse {
  success: boolean;
  commands_count: number;
  message: string;
}

// New REST API endpoints as per specification
export const controlLamp = async (device: string, lamp: number, state: 'on' | 'off'): Promise<GatewayResponse> => {
  const response = await apiClient.post('/lamp', {
    device,
    lamp,
    state
  });
  return response.data;
};

export const controlAll = async (device: string, state: 'on' | 'off'): Promise<GatewayResponse> => {
  const response = await apiClient.post('/all', {
    device,
    state
  });
  return response.data;
};

export const controlRoute = async (device: string, route: number): Promise<GatewayResponse> => {
  const response = await apiClient.post('/route', {
    device,
    route
  });
  return response.data;
};

export const controlMask = async (device: string, mask: string): Promise<GatewayResponse> => {
  const response = await apiClient.post('/mask', {
    device,
    mask
  });
  return response.data;
};

export const getHealth = async (): Promise<GatewayStatus> => {
  const response = await apiClient.get('/health');
  return response.data;
};

// Legacy API for backward compatibility
export const getGatewayStatus = async (): Promise<GatewayStatus> => {
  return getHealth();
};

export const connectGateway = async (): Promise<GatewayResponse> => {
  const response = await apiClient.post('/gateway/connect');
  return response.data;
};

export const disconnectGateway = async (): Promise<GatewayResponse> => {
  const response = await apiClient.post('/gateway/disconnect');
  return response.data;
};

export const updateLampGatewayMapping = async (): Promise<GatewayResponse> => {
  const response = await apiClient.post('/gateway/update-lamp-mapping');
  return response.data;
};

// Legacy lamp control for backward compatibility
export const sendLampCommand = async (lampId: number, state: boolean): Promise<LampCommandResponse> => {
  const response = await apiClient.post('/gateway/lamp-control', null, {
    params: { lamp_id: lampId, state }
  });
  return response.data;
};

export const sendBatchCommands = async (commands: Record<number, boolean>): Promise<BatchCommandResponse> => {
  const response = await apiClient.post('/gateway/send-batch-commands', commands);
  return response.data;
};

// Legacy device control functions
export const controlDevice = async (device: string, action: string, value?: string): Promise<GatewayResponse> => {
  const response = await apiClient.post('/gateway/device-control', null, {
    params: { device, action, value }
  });
  return response.data;
};

export const deviceAllOn = async (device: string): Promise<GatewayResponse> => {
  return controlAll(device, 'on');
};

export const deviceAllOff = async (device: string): Promise<GatewayResponse> => {
  return controlAll(device, 'off');
};

export const deviceRoutePreset = async (device: string, routeNumber: number): Promise<GatewayResponse> => {
  return controlRoute(device, routeNumber);
};

export const deviceMask = async (device: string, maskHex: string): Promise<GatewayResponse> => {
  return controlMask(device, maskHex);
};
