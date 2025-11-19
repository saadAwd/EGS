// useAdvancedAlarm.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { unlockAudio } from '../utils/audioUnlock';
import { createBufferAlarm, preloadAlarmBuffer } from '../utils/bufferAlarm';
import { withAudioMaster, sendAlarm, setupCrossTabListener } from '../utils/crossTab';
import { isSuppressed, suppressFor } from '../utils/suppress';

type AlarmState = {
  isActive: boolean;      // logical alarm state (from backend)
  isPlaying: boolean;     // actually producing sound in this tab (master only)
  isReady: boolean;       // buffer decoded
  volume: number;
  suppressed: boolean;
};

export function useAdvancedAlarm() {
  const [state, setState] = useState<AlarmState>({
    isActive: false,
    isPlaying: false,
    isReady: false,
    volume: 0.25,
    suppressed: isSuppressed(),
  });

  const bufRef = useRef<ReturnType<typeof createBufferAlarm>>();

  // Create stable callback for cross-tab communication
  const handleCrossTabMessage = useCallback((cmd: string, payload?: any) => {
    if (cmd === 'PLAY') {
      setState(s => ({ ...s, isActive: true, isPlaying: true }));
    } else if (cmd === 'STOP') {
      setState(s => ({ ...s, isActive: false, isPlaying: false, suppressed: false }));
    } else if (cmd === 'ACK') {
      setState(s => ({ ...s, suppressed: true, isPlaying: false }));
    } else if (cmd === 'RESET_SUPPRESSION') {
      setState(s => ({ ...s, suppressed: false }));
    }
  }, []);

  useEffect(() => {
    // init buffer alarm engine
    bufRef.current = createBufferAlarm();
    
    // try to decode immediately after unlock
    const onFirstInteraction = async () => {
      await unlockAudio();
      preloadAlarmBuffer('/alarm.wav').then(() => {
        setState(s => ({ ...s, isReady: true }));
      });
      window.removeEventListener('click', onFirstInteraction);
      window.removeEventListener('touchstart', onFirstInteraction);
    };
    window.addEventListener('click', onFirstInteraction, { once: true });
    window.addEventListener('touchstart', onFirstInteraction, { once: true });

    const onStorage = () => setState(s => ({ ...s, suppressed: isSuppressed() }));
    window.addEventListener('storage', onStorage);
    
    // Setup cross-tab communication with stable callback
    setupCrossTabListener(handleCrossTabMessage);
    
    return () => {
      window.removeEventListener('storage', onStorage);
      // Note: setupCrossTabListener doesn't have a cleanup function, 
      // but it's a global handler that should be fine
    };
  }, [handleCrossTabMessage]);

  const play = useCallback(async () => {
    if (isSuppressed()) return;
    await withAudioMaster(async () => {
      const buf = bufRef.current!;
      if (buf.isReady()) {
        buf.start(state.volume);
        setState(s => ({ ...s, isPlaying: true, isActive: true }));
        sendAlarm('PLAY');
        
        // Alarm started
      } else {
        console.log('Alarm audio not ready yet, please wait...');
      }
    });
  }, [state.volume]);

  const stop = useCallback(async () => {
    await withAudioMaster(async () => {
      bufRef.current?.stop();
      setState(s => ({ ...s, isPlaying: false, isActive: false, suppressed: false }));
      sendAlarm('STOP');
    });
  }, []);

  const acknowledge = useCallback((ms = 120_000) => {
    suppressFor(ms);
    stop();
    sendAlarm('ACK', { ms });
    setState(s => ({ ...s, suppressed: true }));
    
    // Alarm suppressed
  }, [stop]);

  const resetSuppression = useCallback(() => {
    localStorage.removeItem('alarm-suppressed-until');
    setState(s => ({ ...s, suppressed: false }));
    sendAlarm('RESET_SUPPRESSION');
    
    // Alarm suppression reset
  }, []);

  const setVolume = useCallback((v: number) => {
    bufRef.current?.setGain(v);
    setState(s => ({ ...s, volume: v }));
  }, []);

  return {
    state,
    play,
    stop,
    acknowledge,
    resetSuppression,
    setVolume,
  };
}
