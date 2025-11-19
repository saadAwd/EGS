import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../api/client';
import { weatherApi, WeatherRecord } from '../api/weather';
import { useActivationContext } from '../contexts/ActivationContext';
import { useAlarmContext } from '../contexts/AlarmContext';
import { useSystemState } from '../contexts/SystemStateContext';

type WindDir = '' | 'N-S' | 'S-N' | 'E-W' | 'W-E';

// Discover zone images from src/assets using Vite's glob import
// Use lazy loading to avoid blocking build with large images
const imageModules = import.meta.glob('../assets/*.png', { eager: false, query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;

// Build a mapping from filename (e.g., 'Zone A.png') to URL loader function
// For build-time, we'll use a synchronous approach with eager loading only for known files
const FILENAME_TO_URL: Record<string, string> = {};
const imageModulesEager = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
Object.entries(imageModulesEager).forEach(([path, url]) => {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  FILENAME_TO_URL[filename] = url as string;
});

// Extract known zone names from discovered files (exclude 'All Zones.png')
const KNOWN_ZONES: string[] = Object.keys(FILENAME_TO_URL)
  .filter(name => name.toLowerCase().startsWith('zone ') && name.toLowerCase().endsWith('.png'))
  .map(name => name.replace(/\.png$/i, ''))
  .sort();

const ZoneActivation: React.FC = () => {
  const { zoneActivation, setZoneActivation, clearZoneActivation } = useActivationContext();
  const { state: alarmState, play: startAlarm, stop: stopAlarm, acknowledge: suppressAlarm, resetSuppression } = useAlarmContext();
  const { systemState, activateEmergency, deactivateEmergency } = useSystemState();
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherRecord | null>(null);
  const [autoWindDirection, setAutoWindDirection] = useState<WindDir>('');
  const [manualWindDirection, setManualWindDirection] = useState<WindDir>('');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [weatherConnectionFailed, setWeatherConnectionFailed] = useState<boolean>(false);

  // Convert wind direction degrees to cardinal directions
  const degToWindDir = (deg: number | null): WindDir => {
    if (deg == null) return '';
    const normalized = ((deg % 360) + 360) % 360;
    if (normalized >= 315 || normalized < 45) return 'N-S';
    if (normalized >= 45 && normalized < 135) return 'E-W';
    if (normalized >= 135 && normalized < 225) return 'S-N';
    if (normalized >= 225 && normalized < 315) return 'W-E';
    return '';
  };

  // Fetch latest weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const latest = await weatherApi.latest();
        setWeather(latest);
        setWeatherConnectionFailed(false);
        // Only update wind direction if not activated (locked) and in auto mode
        if (!zoneActivation.isActivated && !isManualMode && latest?.wind_direction_deg != null) {
          setAutoWindDirection(degToWindDir(latest.wind_direction_deg));
        }
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
        setWeatherConnectionFailed(true);
        // Auto-switch to manual mode if weather connection fails
        if (!zoneActivation.isActivated) {
          setIsManualMode(true);
        }
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [zoneActivation.isActivated, isManualMode]);

  // Initialize wind direction from context if activated
  useEffect(() => {
    if (zoneActivation.isActivated && zoneActivation.windDirection) {
      setAutoWindDirection(zoneActivation.windDirection as WindDir);
      setManualWindDirection(zoneActivation.windDirection as WindDir);
    }
  }, [zoneActivation.isActivated, zoneActivation.windDirection]);

  // Handle alarm based on emergency activation
  useEffect(() => {
    if (zoneActivation.isActivated) {
      startAlarm();
    } else {
      stopAlarm();
      resetSuppression(); // Reset suppression when emergency is deactivated
    }
  }, [zoneActivation.isActivated, startAlarm, stopAlarm, resetSuppression]);

  // Simple sync: only update if system state shows a different active zone
  useEffect(() => {
    if (systemState.isEmergencyActive && systemState.activeZone) {
      // Only update if zone name or wind direction changed
      if (systemState.activeZone !== zoneActivation.zoneName || 
          systemState.windDirection !== zoneActivation.windDirection) {
        setZoneActivation({
          zoneName: systemState.activeZone,
          windDirection: systemState.windDirection,
          isActivated: true,
          activationTime: systemState.activationTime || new Date().toISOString()
        });
      }
    }
  }, [systemState.isEmergencyActive, systemState.activeZone, systemState.windDirection]);

  // Hotspot rectangles over "All Zones" image, positions as percentages
  const HOTSPOTS: Record<string, { x: number; y: number; width: number; height: number }> = {
    'Zone A': { x: 35, y: 18, width: 12, height: 9 },
    'Zone B': { x: 39, y: 34, width: 13, height: 8 },
    'Zone C': { x: 35, y: 44, width: 18, height: 16 },
    'Zone D': { x: 26, y: 26, width: 6, height: 20 },
    'Zone E': { x: 57, y: 18, width: 9, height: 22 },
    'Zone F': { x: 6, y: 27, width: 17, height: 21 },
    'Zone G': { x: 9, y: 54, width: 26, height: 11 },
    'Zone H': { x: 64, y: 45, width: 9, height: 21 },
    'Zone K': { x: 76, y: 24, width: 14, height: 27 },
  };

  const imageSrc = useMemo(() => {
    if (zoneActivation.isActivated && zoneActivation.zoneName && zoneActivation.windDirection) {
      // Try scenario-specific image first: "Zone A N-S.png"
      const scenarioFilename = `${zoneActivation.zoneName} ${zoneActivation.windDirection}.png`;
      if (FILENAME_TO_URL[scenarioFilename]) {
        return FILENAME_TO_URL[scenarioFilename];
      }
      // Fallback to general zone image: "Zone A.png"
      const zoneFilename = `${zoneActivation.zoneName}.png`;
      if (FILENAME_TO_URL[zoneFilename]) {
        return FILENAME_TO_URL[zoneFilename];
      }
    }
    // Default to "All Zones.png"
    return FILENAME_TO_URL['All Zones.png'];
  }, [zoneActivation.isActivated, zoneActivation.zoneName, zoneActivation.windDirection]);

  // STATELESS: No localStorage - SystemStateContext is the only source of truth

  // Deactivate handler - STATELESS: only sends command to backend, SystemStateContext will update
  const handleDeactivate = useCallback(async () => {
    try {
      console.log('Starting deactivation process...');
      
      // Step 1: Send deactivation command to backend (ONLY action - no local state changes)
      await apiClient.post('/zones/deactivate', {});
      console.log('Deactivation command sent to backend');
      
      // Step 2: Wait for backend to process and send commands to gateway
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 3: Refresh lamp states to reflect OFF state
      try {
        await apiClient.get('/lamps/');
        console.log('Lamp states refreshed');
      } catch (err) {
        console.error('Failed to refresh lamp states:', err);
      }
      
      // SystemStateContext will poll and update state automatically
      console.log('Deactivation complete - SystemStateContext will update state');
    } catch (err) {
      console.error('Deactivation failed:', err);
      // Don't restore state - let SystemStateContext handle it via polling
    }
  }, []);

  // Emergency activated view - full screen with zone image and alarm banner only
  if (zoneActivation.isActivated || systemState.isEmergencyActive) {
    return (
      <div className="flex flex-col bg-gray-900" style={{ padding: '0.25rem', height: 'calc(100vh - 18rem)', overflow: 'hidden' }}>
        {/* Alarm Banner - Top */}
        <div className="bg-red-600 text-white rounded-lg shadow-lg mb-1 p-2 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <div className="text-xl">🚨</div>
              <div>
                <h2 className="text-lg font-bold">EMERGENCY ACTIVATED</h2>
                <p className="text-xs">Zone: <strong>{zoneActivation.zoneName || systemState.activeZone}</strong> | Wind: <strong>{zoneActivation.windDirection || systemState.windDirection}</strong></p>
                <p className="text-xs opacity-90">Activation Time: <strong>{zoneActivation.activationTime || systemState.activationTime}</strong></p>
              </div>
            </div>
            {/* Alarm Status and Control */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${alarmState.isPlaying && !alarmState.suppressed ? 'bg-red-300 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-xs">
                  {alarmState.suppressed ? 'Suppressed' : alarmState.isPlaying ? 'Active' : 'Inactive'}
                </span>
              </div>
              {alarmState.isPlaying && !alarmState.suppressed && (
                <button
                  onClick={() => suppressAlarm(120000)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md font-semibold transition-colors text-xs"
                >
                  🔕 Acknowledge
                </button>
              )}
              <button
                onClick={handleDeactivate}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold transition-colors text-xs"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>

        {/* Zone Image - Full remaining space, maximally stretched with minimal padding */}
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 flex-1" style={{ minHeight: 0, padding: '0.1rem' }}>
          <img
            src={imageSrc}
            alt={zoneActivation.zoneName || systemState.activeZone || 'Active Zone'}
            className="w-full h-full"
            style={{ display: 'block', objectFit: 'fill', width: '100%', height: '100%' }}
            loading="eager"
          />
        </div>
      </div>
    );
  }

  // Normal view - all controls visible
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Zone Activation</h1>
            <div>
              {weatherConnectionFailed && (
                <div className="mt-2 text-sm text-yellow-300">
                  ⚠️ Weather Station Not Connected - Using Manual Mode
                </div>
              )}
              {weather && !weatherConnectionFailed && (
                <div className="mt-2 text-sm text-blue-300">
                  Current Wind: {weather.wind_direction_deg != null ? `${Math.round(weather.wind_direction_deg)}° (${autoWindDirection})` : 'No data'} | 
                  Last Update: {(() => {
                    const ts = weather.record_time;
                    try {
                      if (ts && ts.length > 0) return new Date(ts).toLocaleTimeString();
                      // Fallback: show current time when data is fresh but missing record_time
                      return new Date().toLocaleTimeString();
                    } catch {
                      return 'Unknown';
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={isManualMode}
                  onChange={(e) => setIsManualMode(e.target.checked)}
                  className="mr-2"
                  disabled={weatherConnectionFailed}
                />
                Manual Wind
              </label>
            </div>
            <div className="text-sm text-gray-300">
              {isManualMode ? (
                <span>Manual Wind: <span className="text-yellow-400 font-semibold">{manualWindDirection || 'Select'}</span></span>
              ) : (
                <span>Auto Wind: <span className="text-green-400 font-semibold">{autoWindDirection || 'No data'}</span></span>
              )}
            </div>
          </div>
        </div>
        
        {/* Manual Wind Direction Selector */}
        {isManualMode && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <label className="block text-sm font-medium text-gray-300 mb-2">Select Wind Direction:</label>
            <div className="flex gap-2">
              {(['N-S', 'S-N', 'E-W', 'W-E'] as WindDir[]).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setManualWindDirection(dir)}
                  className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                    manualWindDirection === dir
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map/Image Card */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4">
        <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-900 mx-auto" style={{ maxWidth: 1000 }}>
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            {/* 16:9 container to keep overlays in correct positions */}
            <img
              src={imageSrc}
              alt={selectedZoneName || 'All Zones'}
              className="absolute inset-0 h-full w-full object-contain"
            />
            {KNOWN_ZONES.filter(name => HOTSPOTS[name]).map(name => {
              const r = HOTSPOTS[name];
              const isSelected = selectedZoneName === name;
              return (
                <button
                  key={name}
                  aria-label={`Select ${name}`}
                  onClick={() => setSelectedZoneName(isSelected ? null : name)}
                  className={`absolute border-2 transition-all duration-300 focus:outline-none rounded ${
                    isSelected
                      ? 'border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.5)] shadow-blue-500/50'
                      : 'border-transparent hover:border-green-400/80'
                  }`}
                  style={{
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                    background: isSelected 
                      ? 'linear-gradient(to bottom, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.25))' 
                      : 'transparent',
                  }}
                  title={name}
                >
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-bold shadow-lg animate-pulse">
                        ✓ {name}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status + Actions Card */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4">
        <div className="text-sm text-gray-200 mb-4">
          <span className="mr-4">Selected Zone: <strong className="text-white">{selectedZoneName || 'None'}</strong></span>
          <span>
            {isManualMode ? (
              <>Manual Wind: <strong className="text-yellow-400">{manualWindDirection || 'Not selected'}</strong></>
            ) : (
              <>Auto Wind: <strong className="text-green-400">{autoWindDirection || 'No data'}</strong></>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-200">
            <span>Status: <strong className="text-gray-300">Standby</strong></span>
          </div>

          <div className="flex items-center gap-3">
            {!systemState.isEmergencyActive && (
              <button
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={!(selectedZoneName && (isManualMode ? manualWindDirection : autoWindDirection))}
                onClick={async () => {
                  try {
                    const activeWindDirection = isManualMode ? manualWindDirection : autoWindDirection;
                    
                    console.log('Starting activation process...');
                    
                    // STATELESS: Only send command to backend, SystemStateContext will update state
                    // Step 1: Send activation command to backend
                    await apiClient.post('/emergency-events/activate', null, { 
                      params: { zone_name: selectedZoneName, wind_direction: activeWindDirection }
                    });
                    
                    console.log('Activation command sent to backend');
                    
                    // Step 2: Wait for backend to process and send commands to gateway
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    // SystemStateContext will poll and update state automatically
                    console.log('Activation complete - SystemStateContext will update state');
                  } catch (err) {
                    console.error('Activation failed:', err);
                    // Don't clear state - let SystemStateContext handle it via polling
                  }
                }}
              >
                Activate Emergency
              </button>
            )}
            {systemState.isEmergencyActive && systemState.activeZone !== zoneActivation.zoneName && (
              <div className="text-sm text-yellow-300">
                Another zone ({systemState.activeZone}) is currently active
              </div>
            )}
            <button
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
              onClick={async () => {
                try {
                  console.log('Starting clear/deactivation process...');
                  
                  // Step 1: Clear local UI selection only (not activation state)
                  setSelectedZoneName(null); 
                  setAutoWindDirection('');
                  setManualWindDirection('');
                  
                  // Step 2: Send deactivation command to backend (STATELESS - no local state changes)
                  await apiClient.post('/zones/deactivate', {});
                  console.log('Deactivation command sent');
                  
                  // Step 3: Wait for backend to process and send commands to gateway
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Step 4: Refresh lamp states
                  try {
                    await apiClient.get('/lamps/');
                    console.log('Lamp states refreshed');
                  } catch (err) {
                    console.error('Failed to refresh lamp states:', err);
                  }
                  
                  // SystemStateContext will poll and update state automatically
                  console.log('Clear/deactivation complete - SystemStateContext will update state');
                } catch (err) {
                  console.error('Clear/deactivation failed:', err);
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  };

export default ZoneActivation;


