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

  // Load zone activation from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('activeZoneMap');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.activated && parsed.zoneName && parsed.windDirection) {
          setZoneActivation({
            zoneName: parsed.zoneName,
            windDirection: parsed.windDirection,
            isActivated: true,
            activationTime: parsed.activationTime || new Date().toLocaleString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to load zone activation from localStorage:', error);
    }
  }, []);

  const clearZoneActivation = () => {
    setZoneActivation({
      zoneName: null,
      windDirection: '',
      isActivated: false,
      activationTime: null
    });
    try {
      localStorage.removeItem('activeZoneMap');
    } catch (error) {
      console.error('Failed to clear zone activation from localStorage:', error);
    }
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