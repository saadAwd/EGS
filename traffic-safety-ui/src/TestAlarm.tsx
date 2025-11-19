import React from 'react';
import { useAlarm } from './hooks/useAlarm';

const TestAlarm: React.FC = () => {
  const { alarmState, startAlarm, stopAlarm, suppressAlarm, resetSuppression } = useAlarm();

  return (
    <div style={{ padding: '20px', backgroundColor: '#1a1a1a', color: 'white', minHeight: '100vh' }}>
      <h1>Alarm Test Page</h1>
      <p>This is a simple test to verify the alarm functionality works.</p>
      
      <div style={{ margin: '20px 0' }}>
        <button 
          onClick={startAlarm}
          disabled={alarmState.isPlaying}
          style={{ 
            padding: '10px 20px', 
            margin: '5px', 
            backgroundColor: alarmState.isPlaying ? '#666' : '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: alarmState.isPlaying ? 'not-allowed' : 'pointer'
          }}
        >
          Start Alarm
        </button>
        
        <button 
          onClick={stopAlarm}
          disabled={!alarmState.isPlaying}
          style={{ 
            padding: '10px 20px', 
            margin: '5px', 
            backgroundColor: !alarmState.isPlaying ? '#666' : '#f57c00',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !alarmState.isPlaying ? 'not-allowed' : 'pointer'
          }}
        >
          Stop Alarm
        </button>
        
        <button 
          onClick={suppressAlarm}
          disabled={!alarmState.isPlaying || alarmState.isSuppressed}
          style={{ 
            padding: '10px 20px', 
            margin: '5px', 
            backgroundColor: (!alarmState.isPlaying || alarmState.isSuppressed) ? '#666' : '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!alarmState.isPlaying || alarmState.isSuppressed) ? 'not-allowed' : 'pointer'
          }}
        >
          Suppress Alarm
        </button>
        
        <button 
          onClick={resetSuppression}
          disabled={!alarmState.isSuppressed}
          style={{ 
            padding: '10px 20px', 
            margin: '5px', 
            backgroundColor: !alarmState.isSuppressed ? '#666' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !alarmState.isSuppressed ? 'not-allowed' : 'pointer'
          }}
        >
          Reset Suppression
        </button>
      </div>
      
      <div style={{ margin: '20px 0', padding: '10px', backgroundColor: '#333', borderRadius: '4px' }}>
        <h3>Alarm Status:</h3>
        <p>Playing: {alarmState.isPlaying ? 'Yes' : 'No'}</p>
        <p>Suppressed: {alarmState.isSuppressed ? 'Yes' : 'No'}</p>
        <p>Volume: {alarmState.volume}</p>
      </div>
      
      <div style={{ margin: '20px 0' }}>
        <h3>Instructions:</h3>
        <ol>
          <li>Click "Start Alarm" to test the alarm sound</li>
          <li>You should hear the alarm.wav file playing</li>
          <li>Click "Suppress Alarm" to stop the sound</li>
          <li>Click "Reset Suppression" to allow alarm to play again</li>
          <li>Click "Stop Alarm" to completely stop the alarm</li>
        </ol>
      </div>
    </div>
  );
};

export default TestAlarm;
