// Zone types
export interface Zone {
  id: number;
  name: string;
  is_active: boolean;
  active_wind_direction: string | null;
}

export interface ZoneCreate {
  name: string;
}

// Route types
export interface Route {
  id: number;
  zone_id: number;
  name: string;
  wind_direction: string;
}

export interface RouteCreate {
  zone_id: number;
  name: string;
  wind_direction: string;
}

// Device types
export interface Device {
  id: number;
  name: string;
  route_id: number;
  location: string;
  is_active: boolean;
  is_green: boolean;
}

export interface DeviceCreate {
  name: string;
  route_id: number;
  location: string;
}

// Activation types
export interface Activation {
  id: number;
  zone_id: number;
  wind_direction: string;
  timestamp: string;
  is_active: boolean;
  deactivated_at: string | null;
}

export interface ActivationCreate {
  zone_id: number;
  wind_direction: string;
}

export interface DeactivationRequest {
  zone_id: number;
}

// Zone status response
export interface ZoneStatus {
  zone: Zone;
  active_route: Route | null;
  active_devices: Device[];
  activation: Activation | null;
}

// Message response
export interface MessageResponse {
  message: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
} 