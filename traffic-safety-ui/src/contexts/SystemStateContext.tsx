import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { HttpSyncClient } from '../utils/httpSyncClient';
import { useActivationContext } from './ActivationContext';

interface SystemState {
  isEmergencyActive: boolean;
  activeZone: string | null;
  windDirection: string;
  activationTime: string | null;
  isSystemLocked: boolean;
  allowedFeatures: string[];
}

interface SystemStateContextType {
  systemState: SystemState;
  setSystemState: (state: SystemState) => void;
  activateEmergency: (zoneName: string, windDirection: string) => void;
  deactivateEmergency: () => void;
  isFeatureAllowed: (feature: string) => boolean;
  syncClient: HttpSyncClient | null;
}

const SystemStateContext = createContext<SystemStateContextType | undefined>(undefined);

interface SystemStateProviderProps {
  children: ReactNode;
}

export const SystemStateProvider: React.FC<SystemStateProviderProps> = ({ children }) => {
  const { setZoneActivation, clearZoneActivation } = useActivationContext();
  const [systemState, setSystemState] = useState<SystemState>({
    isEmergencyActive: false,
    activeZone: null,
    windDirection: '',
    activationTime: null,
    isSystemLocked: false,
    allowedFeatures: ['egs', 'traffic-lights', 'map', 'zone-activation', 'schematic'] // All features allowed by default
  });

  const [syncClient] = useState<HttpSyncClient>(() => new HttpSyncClient());
  const systemStateRef = useRef(systemState);

  // Keep ref in sync with state
  useEffect(() => {
    systemStateRef.current = systemState;
  }, [systemState]);

  // STATELESS: No localStorage - backend is the only source of truth
  // On mount, immediately fetch from backend (SystemStateContext will poll after)
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await fetch('/api/sync/state');
        if (response.ok) {
          const state = await response.json();
          if (state.isActivated && state.zoneName) {
            setSystemState({
              isEmergencyActive: true,
              activeZone: state.zoneName,
              windDirection: state.windDirection || '',
              activationTime: state.activationTime,
              isSystemLocked: true,
              allowedFeatures: ['egs', 'zone-activation']
            });
            systemStateRef.current = {
              isEmergencyActive: true,
              activeZone: state.zoneName,
              windDirection: state.windDirection || '',
              activationTime: state.activationTime,
              isSystemLocked: true,
              allowedFeatures: ['egs', 'zone-activation']
            };
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial state from backend:', error);
      }
    };
    fetchInitialState();
  }, []);

  // HTTP polling for real-time sync (optimized to prevent unnecessary updates)
  useEffect(() => {
    const handleStateChange = (state: any) => {
      // Use ref to check current state without causing effect recreation
      const currentState = systemStateRef.current;
      
      // CRITICAL: Ignore deactivation signals if deactivation is in progress
      // This prevents UI from showing deactivation during the deactivation process
      if (state.deactivationInProgress) {
        // Keep current state during deactivation - don't update to false yet
        return;
      }
      
      // Only update state if it actually changed (prevents flickering)
      if (state.isActivated) {
        // Check if state is actually different before updating
        if (!currentState.isEmergencyActive || 
            currentState.activeZone !== state.zoneName || 
            currentState.windDirection !== state.windDirection) {
          const newSystemState = {
            isEmergencyActive: true,
            activeZone: state.zoneName,
            windDirection: state.windDirection,
            activationTime: state.activationTime,
            isSystemLocked: true,
            allowedFeatures: ['egs', 'zone-activation'] // Only EGS Dashboard and Zone Activation during emergency
          };
          setSystemState(newSystemState);
        }
      } else {
        // CRITICAL: Only deactivate if we're sure it's a real deactivation
        // Check if emergency was previously active AND we're not in the middle of activation
        // Add a small delay check to prevent race conditions with activation
        if (currentState.isEmergencyActive) {
          // Double-check: if we just activated (within last 2 seconds), ignore deactivation signal
          // This prevents race condition where polling happens before sync_state is updated
          const activationTime = currentState.activationTime ? new Date(currentState.activationTime).getTime() : 0;
          const now = Date.now();
          const timeSinceActivation = now - activationTime;
          
          // If activation happened less than 3 seconds ago, ignore deactivation (might be stale state)
          if (timeSinceActivation > 0 && timeSinceActivation < 3000) {
            console.log('Ignoring deactivation signal - activation was recent (possible race condition)');
            return;
          }
          
          const newSystemState = {
            isEmergencyActive: false,
            activeZone: null,
            windDirection: '',
            activationTime: null,
            isSystemLocked: false,
            allowedFeatures: ['egs', 'traffic-lights', 'zone-activation', 'system-events', 'generate-report'] // All features allowed
          };
          setSystemState(newSystemState);
        }
      }
    };

    // Start polling for state changes
    syncClient.startPolling(handleStateChange);
    
    // Register this client
    syncClient.registerClient();

    return () => {
      syncClient.stopPolling();
    };
  }, [syncClient]); // Only syncClient in dependencies - use ref for state checks

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
      isFeatureAllowed,
      syncClient
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