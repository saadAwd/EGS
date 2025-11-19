import apiClient from './client';

export interface WeatherRecord {
  id: number;
  record_time: string;
  temperature_c: number | null;
  wind_speed_ms: number | null;
  wind_direction_deg: number | null;
}

export const weatherApi = {
  async latest(): Promise<WeatherRecord | null> {
    // Add cache-busting param to avoid intermediate caching
    const res = await apiClient.get('/weather/latest', { params: { _t: Date.now() } });
    return res.data ?? null;
  },
  async recent(limit = 10): Promise<WeatherRecord[]> {
    const res = await apiClient.get('/weather/recent', { params: { limit } });
    return res.data ?? [];
  },
};


