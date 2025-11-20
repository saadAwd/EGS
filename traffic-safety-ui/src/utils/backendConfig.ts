/**
 * Backend Configuration Utility
 * Dynamically detects backend URL and WebSocket URL
 */

// Cache for backend configuration
let cachedBackendUrl: string | null = null;
let cachedWebSocketUrl: string | null = null;

/**
 * Get backend API base URL
 * Uses same logic as api/client.ts but exported for reuse
 */
export const getBackendUrl = (): string => {
  // Highest priority: explicit env override
  const override = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  // Default behaviors
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8002/api';
  }

  // Fallback: same host as page (works when UI and backend are on same machine)
  return `http://${window.location.hostname}:8002/api`;
};

/**
 * Get WebSocket URL - uses same hostname as API
 */
export const getWebSocketUrl = (): string => {
  // Highest priority: explicit env override
  const override = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  // Use same host as API, WebSocket endpoint is /ws
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  // Match API client logic: use same hostname, backend port 8002
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//localhost:8002/ws`;
  }
  
  // Production: use same hostname as page, backend port 8002
  return `${protocol}//${window.location.hostname}:8002/ws`;
};

/**
 * Fetch backend configuration from server
 * This allows backend to provide its own IP/URL dynamically
 */
export const fetchBackendConfig = async (): Promise<{ apiUrl: string; wsUrl: string }> => {
  try {
    // Try to fetch config from backend
    const apiBase = getBackendUrl().replace('/api', '');
    const response = await fetch(`${apiBase}/api/config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const config = await response.json();
      cachedBackendUrl = config.api_url || getBackendUrl();
      cachedWebSocketUrl = config.ws_url || getWebSocketUrl();
      console.log('✅ Fetched backend config:', { apiUrl: cachedBackendUrl, wsUrl: cachedWebSocketUrl });
      return {
        apiUrl: cachedBackendUrl,
        wsUrl: cachedWebSocketUrl,
      };
    }
  } catch (error) {
    console.warn('⚠️  Could not fetch backend config, using defaults:', error);
  }

  // Fallback to default detection
  cachedBackendUrl = getBackendUrl();
  cachedWebSocketUrl = getWebSocketUrl();
  return {
    apiUrl: cachedBackendUrl,
    wsUrl: cachedWebSocketUrl,
  };
};

/**
 * Get cached or fetch backend configuration
 */
export const getBackendConfig = async (): Promise<{ apiUrl: string; wsUrl: string }> => {
  if (cachedBackendUrl && cachedWebSocketUrl) {
    return {
      apiUrl: cachedBackendUrl,
      wsUrl: cachedWebSocketUrl,
    };
  }
  return fetchBackendConfig();
};

