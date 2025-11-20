import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Device } from '../types';

interface ZoneActivation {
  zoneName: string | null;
  windDirection: string;
  isActivated: boolean;
  activationTime: string | null;
}

interface ActivationContextType {
  activatedDevices: Device[];
  setActivatedDevices: (devices: Device[]) => void;
  zoneActivation: ZoneActivation;
  setZoneActivation: (activation: ZoneActivation) => void;
  clearZoneActivation: () => void;
}

const ActivationContext = createContext<ActivationContextType | undefined>(undefined);

interface ActivationProviderProps {
  children: ReactNode;
}

export const ActivationProvider: React.FC<ActivationProviderProps> = ({ children }) => {
  const [activatedDevices, setActivatedDevices] = useState<Device[]>([]);
  const [zoneActivation, setZoneActivation] = useState<ZoneActivation>({
    zoneName: null,
    windDirection: '',
    isActivated: false,
    activationTime: null
  });

  // REMOVED: localStorage persistence - backend is the source of truth
  // Loading old state from localStorage can cause false activations
  // WebSocket state_sync messages will update the UI state correctly
  useEffect(() => {
    // Clear any old localStorage state to prevent false activations
    try {
      localStorage.removeItem('activeZoneMap');
      console.log('🧹 Cleared old localStorage state (backend is source of truth)');
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }, []);

  const clearZoneActivation = () => {
    console.log('🧹 [ActivationContext] Clearing zone activation (UI state only)');
    setZoneActivation({
      zoneName: null,
      windDirection: '',
      isActivated: false,
      activationTime: null
    });
    // REMOVED: localStorage persistence - backend is the source of truth
  };

  return (
    <ActivationContext.Provider value={{ 
      activatedDevices, 
      setActivatedDevices, 
      zoneActivation, 
      setZoneActivation,
      clearZoneActivation 
    }}>
      {children}
    </ActivationContext.Provider>
  );
};

export const useActivationContext = () => {
  const context = useContext(ActivationContext);
  if (context === undefined) {
    throw new Error('useActivationContext must be used within an ActivationProvider');
  }
  return context;
}; 