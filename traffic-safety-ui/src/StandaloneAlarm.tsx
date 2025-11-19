import React, { useState, useEffect, useRef } from 'react';

interface AlarmState {
  isPlaying: boolean;
  isSuppressed: boolean;
  volume: number;
}

const StandaloneAlarm: React.FC = () => {
  const [alarmState, setAlarmState] = useState<AlarmState>({
    isPlaying: false,
    isSuppressed: false,
    volume: 0.8
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/alarm.wav');
      audioRef.current.volume = alarmState.volume;
      audioRef.current.loop = false;
    }
  }, []);

  // Play alarm when emergency is activated
  const startAlarm = () => {
    if (alarmState.isSuppressed || !audioRef.current) return;

    setAlarmState(prev => ({ ...prev, isPlaying: true }));
    
    const playAlarm = () => {
      if (audioRef.current && !alarmState.isSuppressed) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
    };

    // Play immediately
    playAlarm();

    // Set up interval to repeat every 3 seconds
    intervalRef.current = setInterval(() => {
      if (!alarmState.isSuppressed && audioRef.current) {
        playAlarm();
      }
    }, 3000);
  };

  // Stop alarm
  const stopAlarm = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
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
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#1a1a1a', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px', color: '#ff6b6b' }}>
        🚨 Emergency Alarm System Test 🚨
      </h1>
      
      <div style={{ 
        backgroundColor: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ color: '#4CAF50', marginBottom: '15px' }}>Alarm Controls</h2>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button 
            onClick={startAlarm}
            disabled={alarmState.isPlaying}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: alarmState.isPlaying ? '#666' : '#d32f2f',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: alarmState.isPlaying ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            🔊 Start Alarm
          </button>
          
          <button 
            onClick={stopAlarm}
            disabled={!alarmState.isPlaying}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: !alarmState.isPlaying ? '#666' : '#f57c00',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: !alarmState.isPlaying ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            ⏹️ Stop Alarm
          </button>
          
          <button 
            onClick={suppressAlarm}
            disabled={!alarmState.isPlaying || alarmState.isSuppressed}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: (!alarmState.isPlaying || alarmState.isSuppressed) ? '#666' : '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (!alarmState.isPlaying || alarmState.isSuppressed) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            🔕 Suppress Alarm
          </button>
          
          <button 
            onClick={resetSuppression}
            disabled={!alarmState.isSuppressed}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: !alarmState.isSuppressed ? '#666' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: !alarmState.isSuppressed ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            🔄 Reset Suppression
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>
            Volume: {Math.round(alarmState.volume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={alarmState.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{ width: '200px' }}
          />
        </div>
      </div>
      
      <div style={{ 
        backgroundColor: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ color: '#4CAF50', marginBottom: '15px' }}>Alarm Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div style={{ 
            padding: '15px', 
            backgroundColor: alarmState.isPlaying ? '#4CAF50' : '#666',
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {alarmState.isPlaying ? '🔊 PLAYING' : '🔇 STOPPED'}
            </div>
          </div>
          
          <div style={{ 
            padding: '15px', 
            backgroundColor: alarmState.isSuppressed ? '#ff9800' : '#666',
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {alarmState.isSuppressed ? '🔕 SUPPRESSED' : '🔊 ACTIVE'}
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ 
        backgroundColor: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px' 
      }}>
        <h2 style={{ color: '#4CAF50', marginBottom: '15px' }}>Instructions</h2>
        <ol style={{ lineHeight: '1.6', fontSize: '16px' }}>
          <li><strong>Start Alarm:</strong> Click to begin playing the alarm sound repeatedly every 3 seconds</li>
          <li><strong>Suppress Alarm:</strong> Click to acknowledge and stop the sound (but keep alarm state)</li>
          <li><strong>Reset Suppression:</strong> Click to allow alarm to play again</li>
          <li><strong>Stop Alarm:</strong> Click to completely stop the alarm system</li>
          <li><strong>Volume:</strong> Use the slider to adjust alarm volume (0-100%)</li>
        </ol>
        
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          backgroundColor: '#1a1a1a', 
          borderRadius: '6px',
          border: '2px solid #4CAF50'
        }}>
          <h3 style={{ color: '#4CAF50', marginBottom: '10px' }}>🎵 Expected Behavior:</h3>
          <ul style={{ lineHeight: '1.6' }}>
            <li>Alarm sound should play the <code>alarm.wav</code> file</li>
            <li>Sound repeats every 3 seconds automatically</li>
            <li>Visual indicators show current alarm state</li>
            <li>Buttons are enabled/disabled based on alarm state</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StandaloneAlarm;
