import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { useActivationContext } from './ActivationContext';
import { useWebSocketContext } from './WebSocketContext';
import { ZoneStateMessage, CommandStatusMessage } from '../utils/websocketClient';
import { useQueryClient } from '@tanstack/react-query';
import { getBackendUrl } from '../utils/backendConfig';

interface SystemState {
  isEmergencyActive: boolean;
  activeZone: string | null;
  windDirection: string;
  activationTime: string | null;
  isSystemLocked: boolean;
  allowedFeatures: string[];
  deactivationInProgress: boolean;
}

interface SystemStateContextType {
  systemState: SystemState;
  setSystemState: (state: SystemState) => void;
  activateEmergency: (zoneName: string, windDirection: string) => void;
  deactivateEmergency: () => void;
  isFeatureAllowed: (feature: string) => boolean;
}

const SystemStateContext = createContext<SystemStateContextType | undefined>(undefined);

interface SystemStateProviderProps {
  children: ReactNode;
}

export const SystemStateProvider: React.FC<SystemStateProviderProps> = ({ children }) => {
  const { setZoneActivation, clearZoneActivation } = useActivationContext();
  const { wsClient } = useWebSocketContext();
  const queryClient = useQueryClient();
  const [systemState, setSystemState] = useState<SystemState>({
    isEmergencyActive: false,
    activeZone: null,
    windDirection: '',
    activationTime: null,
    isSystemLocked: false,
    allowedFeatures: ['egs', 'traffic-lights', 'map', 'zone-activation', 'schematic'], // All features allowed by default
    deactivationInProgress: false
  });

  const systemStateRef = useRef(systemState);

  // Keep ref in sync with state
  useEffect(() => {
    systemStateRef.current = systemState;
  }, [systemState]);

  // STATELESS: No localStorage - backend is the only source of truth
  // On mount, fetch initial state from backend (WebSocket will handle real-time updates)
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        // Get backend URL - use shared utility
        const backendUrl = getBackendUrl();
        
        const response = await fetch(`${backendUrl}/sync/state`);
        if (response.ok) {
          const state = await response.json();
          if (state.isActivated && state.zoneName) {
            setSystemState({
              isEmergencyActive: true,
              activeZone: state.zoneName,
              windDirection: state.windDirection || '',
              activationTime: state.activationTime,
              isSystemLocked: true,
              allowedFeatures: ['egs', 'zone-activation'],
              deactivationInProgress: state.deactivationInProgress || false
            });
            systemStateRef.current = {
              isEmergencyActive: true,
              activeZone: state.zoneName,
              windDirection: state.windDirection || '',
              activationTime: state.activationTime,
              isSystemLocked: true,
              allowedFeatures: ['egs', 'zone-activation'],
              deactivationInProgress: state.deactivationInProgress || false
            };
          } else {
            setSystemState({
              isEmergencyActive: false,
              activeZone: null,
              windDirection: '',
              activationTime: null,
              isSystemLocked: false,
              allowedFeatures: ['egs', 'traffic-lights', 'map', 'zone-activation', 'schematic'],
              deactivationInProgress: state.deactivationInProgress || false
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial state from backend:', error);
      }
    };
    fetchInitialState();
  }, []);

  // REMOVED: HTTP polling - now using WebSocket only for real-time updates
  // WebSocket handles all state updates via zone_state messages

  // Subscribe to WebSocket messages for real-time updates (PRIMARY METHOD - no HTTP polling)
  useEffect(() => {
    if (!wsClient) {
      console.warn('WebSocket client not available, state updates will be delayed');
      return;
    }

    // Handle state_sync message (sent on WebSocket connection)
    const handleStateSync = (data: any) => {
      const currentState = systemStateRef.current;
      
      if (data.isActivated && data.zoneName) {
        const newSystemState = {
          isEmergencyActive: true,
          activeZone: data.zoneName,
          windDirection: data.windDirection || '',
          activationTime: data.activationTime,
          isSystemLocked: true,
          allowedFeatures: ['egs', 'zone-activation'],
          deactivationInProgress: data.deactivationInProgress || false
        };
        setSystemState(newSystemState);
        systemStateRef.current = newSystemState;
      } else {
        const newSystemState = {
          isEmergencyActive: false,
          activeZone: null,
          windDirection: '',
          activationTime: null,
          isSystemLocked: false,
          allowedFeatures: ['egs', 'traffic-lights', 'zone-activation', 'system-events', 'generate-report'],
          deactivationInProgress: data.deactivationInProgress || false
        };
        setSystemState(newSystemState);
        systemStateRef.current = newSystemState;
      }
    };

    // Handle zone_state messages
    const handleZoneState = (message: ZoneStateMessage) => {
      const currentState = systemStateRef.current;
      
      if (message.status === 'activated') {
        const newSystemState = {
          isEmergencyActive: true,
          activeZone: message.zone,
          windDirection: message.windDirection,
          activationTime: new Date(message.ts).toISOString(),
          isSystemLocked: true,
          allowedFeatures: ['egs', 'zone-activation'],
          deactivationInProgress: false
        };
        setSystemState(newSystemState);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['lamps'] });
        queryClient.invalidateQueries({ queryKey: ['emergency-events'] });
      } else if (message.status === 'deactivating') {
        // Update deactivationInProgress flag
        setSystemState({
          ...currentState,
          deactivationInProgress: true
        });
      } else if (message.status === 'cleared') {
        const newSystemState = {
          isEmergencyActive: false,
          activeZone: null,
          windDirection: '',
          activationTime: null,
          isSystemLocked: false,
          allowedFeatures: ['egs', 'traffic-lights', 'zone-activation', 'system-events', 'generate-report'],
          deactivationInProgress: false
        };
        setSystemState(newSystemState);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['lamps'] });
        queryClient.invalidateQueries({ queryKey: ['emergency-events'] });
      }
    };

    // Handle command_status messages (for lamp operations)
    const handleCommandStatus = (message: CommandStatusMessage) => {
      if (message.scope === 'lamp' && message.device_id) {
        // Invalidate lamps query when we get ACK for lamp commands
        if (message.state === 'ack' || message.state === 'failed') {
          queryClient.invalidateQueries({ queryKey: ['lamps'] });
        }
      }
    };
    
    // Handle lamp_update messages (real-time lamp state changes)
    const handleLampUpdate = (message: any) => {
      // Invalidate lamps query to refresh
      queryClient.invalidateQueries({ queryKey: ['lamps'] });
    };
    
    // Handle weather_update messages
    const handleWeatherUpdate = (message: any) => {
      // Invalidate weather query to refresh
      queryClient.invalidateQueries({ queryKey: ['weather', 'latest'] });
    };
    
    // Handle gateway_status messages
    const handleGatewayStatus = (message: any) => {
      // Invalidate gateway status query to refresh
      queryClient.invalidateQueries({ queryKey: ['gateway', 'status'] });
    };

    // Register handlers
    wsClient.onMessage('state_sync', handleStateSync);
    wsClient.onMessage('zone_state', handleZoneState);
    wsClient.onMessage('command_status', handleCommandStatus);
    wsClient.onMessage('lamp_update', handleLampUpdate);
    wsClient.onMessage('weather_update', handleWeatherUpdate);
    wsClient.onMessage('gateway_status', handleGatewayStatus);

    return () => {
      // Cleanup handlers (WebSocket client doesn't have removeHandler, but we can ignore)
      // The client will be cleaned up when component unmounts
    };
  }, [wsClient, queryClient]);

  // STATELESS: activateEmergency is now a no-op - components send API calls directly
  // SystemStateContext will poll and update state automatically
  const activateEmergency = async (zoneName: string, windDirection: string) => {
    // Do nothing - components should call API directly
    // SystemStateContext polling will update state
    console.log('activateEmergency called - state will update via polling');
  };

  // STATELESS: deactivateEmergency is now a no-op - components send API calls directly
  // SystemStateContext will poll and update state automatically
  const deactivateEmergency = async () => {
    // Do nothing - components should call API directly
    // SystemStateContext polling will update state
    console.log('deactivateEmergency called - state will update via polling');
  };

  const isFeatureAllowed = (feature: string): boolean => {
    return systemState.allowedFeatures.includes(feature);
  };

  return (
    <SystemStateContext.Provider value={{
      systemState,
      setSystemState,
      activateEmergency,
      deactivateEmergency,
      isFeatureAllowed
    }}>
      {children}
    </SystemStateContext.Provider>
  );
};

export const useSystemState = () => {
  const context = useContext(SystemStateContext);
  if (context === undefined) {
    throw new Error('useSystemState must be used within a SystemStateProvider');
  }
  return context;
};