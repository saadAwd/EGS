import React, { createContext, useContext, ReactNode } from 'react';
import { useAdvancedAlarm } from '../hooks/useAdvancedAlarm';

interface AlarmContextType {
  state: {
    isActive: boolean;
    isPlaying: boolean;
    isReady: boolean;
    volume: number;
    suppressed: boolean;
  };
  play: () => Promise<void>;
  stop: () => Promise<void>;
  acknowledge: (ms?: number) => void;
  resetSuppression: () => void;
  setVolume: (volume: number) => void;
}

const AlarmContext = createContext<AlarmContextType | undefined>(undefined);

interface AlarmProviderProps {
  children: ReactNode;
}

export const AlarmProvider: React.FC<AlarmProviderProps> = ({ children }) => {
  const alarmHook = useAdvancedAlarm();

  return (
    <AlarmContext.Provider value={alarmHook}>
      {children}
    </AlarmContext.Provider>
  );
};

export const useAlarmContext = () => {
  const context = useContext(AlarmContext);
  if (context === undefined) {
    throw new Error('useAlarmContext must be used within an AlarmProvider');
  }
  return context;
};
