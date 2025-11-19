import React from 'react';
import { useAlarm } from '../hooks/useAlarm';

const AlarmTest: React.FC = () => {
  const { alarmState, startAlarm, stopAlarm, suppressAlarm, resetSuppression, setVolume } = useAlarm();

  return (
    <div className="p-6 bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-4">Alarm Test Controls</h3>
      
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={startAlarm}
            disabled={alarmState.isPlaying}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:bg-gray-500"
          >
            Start Alarm
          </button>
          
          <button
            onClick={stopAlarm}
            disabled={!alarmState.isPlaying}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded disabled:bg-gray-500"
          >
            Stop Alarm
          </button>
          
          <button
            onClick={suppressAlarm}
            disabled={!alarmState.isPlaying || alarmState.isSuppressed}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded disabled:bg-gray-500"
          >
            Suppress Alarm
          </button>
          
          <button
            onClick={resetSuppression}
            disabled={!alarmState.isSuppressed}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-gray-500"
          >
            Reset Suppression
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="text-white">Volume:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={alarmState.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-white">{Math.round(alarmState.volume * 100)}%</span>
        </div>
        
        <div className="text-sm text-gray-300">
          <div>Status: {alarmState.isPlaying ? 'Playing' : 'Stopped'}</div>
          <div>Suppressed: {alarmState.isSuppressed ? 'Yes' : 'No'}</div>
          <div>Volume: {alarmState.volume}</div>
        </div>
      </div>
    </div>
  );
};

export default AlarmTest;
