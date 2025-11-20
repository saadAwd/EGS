import React, { useState, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useGatewayStatus, useWeather } from '../api/queries';

const StatusRibbon: React.FC = () => {
  const { wsClient, connectionStatus: wsStatus } = useWebSocketContext();
  const { data: gatewayStatus } = useGatewayStatus();
  const { data: weather, dataUpdatedAt } = useWeather();
  
  // Track current time for real-time age calculation
  const [currentTime, setCurrentTime] = useState(Date.now());
  const previousWeatherRecordTimeRef = useRef<string | null>(null);
  
  // Update current time every second for real-time age calculation
  // Use setInterval - browsers may throttle this when tab is inactive, but it still works
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Track weather.record_time changes (primary source - actual data timestamp)
  // This is the most reliable source because it comes from the actual weather data
  useEffect(() => {
    if (weather?.record_time && weather.record_time !== previousWeatherRecordTimeRef.current) {
      previousWeatherRecordTimeRef.current = weather.record_time;
      console.log('StatusRibbon: Weather record_time changed:', weather.record_time);
    }
  }, [weather?.record_time]);
  
  // Listen for weather_update WebSocket messages to trigger immediate query refetch
  // The actual timestamp will come from weather.record_time when query refetches
  useEffect(() => {
    if (!wsClient) return;
    
    const handleWeatherUpdate = () => {
      // WebSocket message received - query will be invalidated and refetched
      // The timestamp will update when weather.record_time changes
      console.log('StatusRibbon: WebSocket weather_update received, waiting for query refetch');
    };
    
    // Register handler for weather_update messages
    wsClient.onMessage('weather_update', handleWeatherUpdate);
    
    return () => {
      // Cleanup handled by WebSocket client
    };
  }, [wsClient]);
  
  // Use weather.record_time as primary source (most accurate - actual data timestamp)
  // Fall back to dataUpdatedAt if record_time is not available
  let effectiveUpdateTime: number | null = null;
  if (weather?.record_time) {
    try {
      const recordTime = new Date(weather.record_time).getTime();
      if (!isNaN(recordTime)) {
        effectiveUpdateTime = recordTime;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  // Fallback to dataUpdatedAt if record_time is not available
  if (!effectiveUpdateTime && dataUpdatedAt) {
    effectiveUpdateTime = dataUpdatedAt;
  }
  
  // Calculate weather age with real-time updates
  const getWeatherAge = (): string => {
    if (!effectiveUpdateTime) return 'Never';
    const ageMs = currentTime - effectiveUpdateTime;
    const ageSeconds = Math.floor(ageMs / 1000);
    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    const ageMinutes = Math.floor(ageSeconds / 60);
    if (ageMinutes < 60) return `${ageMinutes}m ago`;
    const ageHours = Math.floor(ageMinutes / 60);
    return `${ageHours}h ago`;
  };

  const weatherAge = getWeatherAge();
  const weatherIsOld = effectiveUpdateTime ? (currentTime - effectiveUpdateTime) > 300000 : true; // 5 minutes

  // Determine overall health status
  const getOverallStatus = (): 'healthy' | 'degraded' | 'critical' => {
    if (!wsStatus.isConnected) return 'critical';
    if (gatewayStatus?.connection_status !== 'connected') return 'critical';
    if (weatherIsOld) return 'degraded';
    return 'healthy';
  };

  const overallStatus = getOverallStatus();

  const getStatusColor = (status: 'healthy' | 'degraded' | 'critical') => {
    switch (status) {
      case 'healthy':
        return 'bg-green-600';
      case 'degraded':
        return 'bg-yellow-600';
      case 'critical':
        return 'bg-red-600';
    }
  };

  const getStatusText = (status: 'healthy' | 'degraded' | 'critical') => {
    switch (status) {
      case 'healthy':
        return 'All Systems Operational';
      case 'degraded':
        return 'Degraded Performance';
      case 'critical':
        return 'Critical Issues Detected';
    }
  };

  return (
    <div className={`${getStatusColor(overallStatus)} text-white px-4 py-2 text-sm flex items-center justify-between shadow-lg`}>
      <div className="flex items-center space-x-6">
        {/* WebSocket Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${wsStatus.isConnected ? 'bg-green-300 animate-pulse' : 'bg-red-300'}`}></div>
          <span className="font-medium">WebSocket:</span>
          <span>{wsStatus.isConnected ? 'Connected' : `Reconnecting (${wsStatus.reconnectAttempts})`}</span>
        </div>

        {/* Gateway Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            gatewayStatus?.connection_status === 'connected' 
              ? 'bg-green-300 animate-pulse' 
              : 'bg-red-300'
          }`}></div>
          <span className="font-medium">Gateway:</span>
          <span>{gatewayStatus?.connection_status === 'connected' ? 'READY' : 'DISCONNECTED'}</span>
        </div>

        {/* Weather Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${weatherIsOld ? 'bg-yellow-300' : 'bg-green-300 animate-pulse'}`}></div>
          <span className="font-medium">Weather:</span>
          <span>{weather ? weatherAge : 'Offline'}</span>
        </div>
      </div>

      <div className="text-xs opacity-90">
        {getStatusText(overallStatus)}
      </div>
    </div>
  );
};

export default StatusRibbon;

