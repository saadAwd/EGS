import apiClient from './client';
import type { Route, RouteCreate } from '../types';

export const routesApi = {
  // Get all routes
  getRoutes: async (): Promise<Route[]> => {
    const response = await apiClient.get<Route[]>('/routes/');
    return response.data;
  },

  // Create a new route
  createRoute: async (route: RouteCreate): Promise<Route> => {
    const response = await apiClient.post<Route>('/routes/', route);
    return response.data;
  },

  // Get ordered device sequence for a route based on policy (server-side order)
  getRouteSequence: async (routeId: number): Promise<Array<{device_id:number; name:string; direction:'left'|'straight'|'right'}>> => {
    const policy = await apiClient.get(`/routes/${routeId}/policy`);
    const devices = await apiClient.get('/devices/');
    const byId: Record<number, any> = {};
    for (const d of devices.data) byId[d.id]=d;
    return policy.data
      .filter((p: any) => p.is_on)
      .map((p: any) => ({ device_id: p.device_id, name: byId[p.device_id]?.name ?? `TL${p.device_id}`, direction: p.direction }));
  },
}; 