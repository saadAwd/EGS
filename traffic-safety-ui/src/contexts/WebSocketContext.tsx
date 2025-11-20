import React, { createContext, useContext, ReactNode, useRef, useEffect, useState } from 'react';
import { EmergencyWebSocketClient } from '../utils/websocketClient';
import { useActivationContext } from './ActivationContext';
import { getBackendConfig, getWebSocketUrl } from '../utils/backendConfig';

interface WebSocketContextType {
  wsClient: EmergencyWebSocketClient | null;
  connectionStatus: { isConnected: boolean; reconnectAttempts: number };
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const wsClientRef = useRef<EmergencyWebSocketClient | null>(null);
  const { setZoneActivation, clearZoneActivation } = useActivationContext();
  const [connectionStatus, setConnectionStatus] = useState<{ isConnected: boolean; reconnectAttempts: number }>({
    isConnected: false,
    reconnectAttempts: 0
  });
  const [wsUrl, setWsUrl] = useState<string | null>(null);

  // Fetch backend config on mount to get dynamic WebSocket URL
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await getBackendConfig();
        setWsUrl(config.wsUrl);
        console.log('✅ Backend config fetched, WebSocket URL:', config.wsUrl);
      } catch (error) {
        console.warn('⚠️  Failed to fetch backend config, using default:', error);
        // Fallback to default detection
        setWsUrl(getWebSocketUrl());
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    // Wait for WebSocket URL to be determined
    if (!wsUrl) {
      return;
    }

    // Initialize WebSocket client
    const wsClient = new EmergencyWebSocketClient({
      setZoneActivation,
      clearZoneActivation
    });
    wsClientRef.current = wsClient;

    // Connect with dynamically determined URL
    console.log('🔌 Connecting to WebSocket:', wsUrl);
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
  }, [wsUrl, setZoneActivation, clearZoneActivation]);

  return (
    <WebSocketContext.Provider value={{
      wsClient: wsClientRef.current,
      connectionStatus
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

