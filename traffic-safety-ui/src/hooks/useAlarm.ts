import { useState, useEffect, useRef } from 'react';

interface AlarmState {
  isPlaying: boolean;
  isSuppressed: boolean;
  volume: number;
}

export const useAlarm = () => {
  const [alarmState, setAlarmState] = useState<AlarmState>({
    isPlaying: false,
    isSuppressed: false,
    volume: 0.8
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialized = useRef(false);

  // Initialize audio element only once and preload it
  useEffect(() => {
    if (!isInitialized.current) {
      try {
        audioRef.current = new Audio('/alarm.wav');
        audioRef.current.volume = alarmState.volume;
        audioRef.current.loop = false; // Will be set to true when playing
        audioRef.current.preload = 'auto';
        
        // Add error handling
        audioRef.current.addEventListener('error', (e) => {
          console.error('Audio loading error:', e);
        });
        
        audioRef.current.addEventListener('canplaythrough', () => {
          console.log('Alarm audio preloaded and ready to play');
        });
        
        audioRef.current.addEventListener('loadeddata', () => {
          console.log('Alarm audio data loaded');
        });
        
        // Force preload the audio file
        audioRef.current.load();
        
        isInitialized.current = true;
      } catch (error) {
        console.error('Failed to initialize alarm audio:', error);
      }
    }
  }, []);

  // Play alarm when emergency is activated
  const startAlarm = () => {
    if (alarmState.isSuppressed || !audioRef.current) return;

    setAlarmState(prev => ({ ...prev, isPlaying: true }));
    
    const playAlarm = () => {
      if (audioRef.current && !alarmState.isSuppressed) {
        try {
          audioRef.current.currentTime = 0;
          audioRef.current.loop = true; // Set to loop continuously
          const playPromise = audioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('Alarm playing continuously');
              })
              .catch((error) => {
                console.error('Alarm play failed:', error);
                // If autoplay is blocked, try again after user interaction
                if (error.name === 'NotAllowedError') {
                  console.log('Autoplay blocked, waiting for user interaction');
                }
              });
          }
        } catch (error) {
          console.error('Error playing alarm:', error);
        }
      }
    };

    // Play immediately with continuous loop
    playAlarm();
  };

  // Stop alarm
  const stopAlarm = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = false; // Disable loop when stopping
      } catch (error) {
        console.error('Error stopping alarm:', error);
      }
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setAlarmState(prev => ({ ...prev, isPlaying: false }));
  };

  // Suppress alarm (acknowledge button)
  const suppressAlarm = () => {
    setAlarmState(prev => ({ ...prev, isSuppressed: true }));
    stopAlarm();
  };

  // Reset suppression (when emergency is deactivated)
  const resetSuppression = () => {
    setAlarmState(prev => ({ ...prev, isSuppressed: false }));
  };

  // Set volume
  const setVolume = (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setAlarmState(prev => ({ ...prev, volume: clampedVolume }));
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (error) {
          console.error('Error cleaning up alarm:', error);
        }
      }
    };
  }, []);

  return {
    alarmState,
    startAlarm,
    stopAlarm,
    suppressAlarm,
    resetSuppression,
    setVolume
  };
};