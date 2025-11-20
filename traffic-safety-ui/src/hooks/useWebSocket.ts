import { useEffect, useRef, useState } from 'react';
import { EmergencyWebSocketClient } from '../utils/websocketClient';
import { useActivationContext } from '../contexts/ActivationContext';

// Get WebSocket URL from environment or use default
const getWebSocketUrl = (): string => {
  const override = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  
  // Default to same host as API, but port 8003 for WebSocket
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:8003';
  }
  
  return `ws://${window.location.hostname}:8003`;
};

export const useWebSocket = () => {
  const wsClientRef = useRef<EmergencyWebSocketClient | null>(null);
  const { setZoneActivation, clearZoneActivation } = useActivationContext();
  const [connectionStatus, setConnectionStatus] = useState<{ isConnected: boolean; reconnectAttempts: number }>({
    isConnected: false,
    reconnectAttempts: 0
  });

  useEffect(() => {
    // Initialize WebSocket client
    const wsClient = new EmergencyWebSocketClient({
      setZoneActivation,
      clearZoneActivation
    });
    wsClientRef.current = wsClient;

    // Connect on mount
    const wsUrl = getWebSocketUrl();
    console.log('Connecting to WebSocket:', wsUrl);
    wsClient.connect(wsUrl);

    // Subscribe to connection status changes
    const unsubscribe = wsClient.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      wsClient.disconnect();
    };
  }, [setZoneActivation, clearZoneActivation]);

  return {
    wsClient: wsClientRef.current,
    connectionStatus
  };
};

