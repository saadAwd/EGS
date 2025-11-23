import React, { useMemo, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { useActivationContext } from '../contexts/ActivationContext';
import { useAlarmContext } from '../contexts/AlarmContext';
import { useSystemState } from '../contexts/SystemStateContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { CommandStatusMessage } from '../utils/websocketClient';
import { useWeather } from '../api/queries';
import { useActivateZone, useDeactivateZone } from '../api/mutations';
import { getZoneLampIds } from '../utils/zoneLamps';
import toast from 'react-hot-toast';

type WindDir = '' | 'N-S' | 'S-N' | 'E-W' | 'W-E';

// Discover zone images from src/assets using Vite's glob import
// Support both WebP (preferred) and PNG (fallback)
const imageModulesPNG = import.meta.glob('../assets/*.png', { eager: false, query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;
const imageModulesWebP = import.meta.glob('../assets/*.webp', { eager: false, query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;

// Build mappings from filename to URL (WebP preferred, PNG fallback)
const FILENAME_TO_URL_WEBP: Record<string, string> = {};
const FILENAME_TO_URL_PNG: Record<string, string> = {};

// Eager load for immediate access
const imageModulesWebPEager = import.meta.glob('../assets/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const imageModulesPNGEager = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

Object.entries(imageModulesWebPEager).forEach(([path, url]) => {
  const parts = path.split('/');
  const filename = parts[parts.length - 1].replace('.webp', '');
  FILENAME_TO_URL_WEBP[filename] = url as string;
});

Object.entries(imageModulesPNGEager).forEach(([path, url]) => {
  const parts = path.split('/');
  const filename = parts[parts.length - 1].replace('.png', '');
  FILENAME_TO_URL_PNG[filename] = url as string;
});

// Helper function to get image URL (WebP with PNG fallback)
const getImageUrl = (filename: string): string => {
  const baseName = filename.replace(/\.(png|webp)$/i, '');
  return FILENAME_TO_URL_WEBP[baseName] || FILENAME_TO_URL_PNG[baseName] || '';
};

// Extract known zone names from discovered files (exclude 'All Zones')
const KNOWN_ZONES: string[] = [
  ...Object.keys(FILENAME_TO_URL_WEBP),
  ...Object.keys(FILENAME_TO_URL_PNG)
]
  .filter(name => name.toLowerCase().startsWith('zone ') && name.toLowerCase() !== 'all zones')
  .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
  .sort();

const ZoneActivation: React.FC = () => {
  const { zoneActivation, setZoneActivation, clearZoneActivation } = useActivationContext();
  const { state: alarmState, play: startAlarm, stop: stopAlarm, acknowledge: suppressAlarm, resetSuppression } = useAlarmContext();
  const { systemState, activateEmergency, deactivateEmergency } = useSystemState();
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null);
  const [autoWindDirection, setAutoWindDirection] = useState<WindDir>('');
  const [manualWindDirection, setManualWindDirection] = useState<WindDir>('');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [uiLock, setUiLock] = useState<boolean>(false);
  const { wsClient } = useWebSocketContext();
  
  // Deactivation progress tracking
  const [deactivationProgress, setDeactivationProgress] = useState<{
    stage: 'idle' | 'queuing' | 'sending' | 'ack' | 'done';
    totalLamps: number;
    ackedLamps: number;
    failedLamps: number;
  }>({
    stage: 'idle',
    totalLamps: 0,
    ackedLamps: 0,
    failedLamps: 0
  });
  
  // React Query hooks
  const { data: weather, isLoading: weatherLoading, isError: weatherError } = useWeather();
  const activateZoneMutation = useActivateZone();
  const deactivateZoneMutation = useDeactivateZone();
  
  const weatherConnectionFailed = weatherError || false;
  
  // Subscribe to WebSocket command_status for deactivation progress
  useEffect(() => {
    if (!wsClient || !systemState.deactivationInProgress) return;
    
    const activeZoneLampIds = systemState.activeZone && systemState.windDirection
      ? getZoneLampIds(systemState.activeZone, systemState.windDirection)
      : [];
    
    if (activeZoneLampIds.length === 0) return;
    
    // Initialize progress tracking
    setDeactivationProgress({
      stage: 'queuing',
      totalLamps: activeZoneLampIds.length,
      ackedLamps: 0,
      failedLamps: 0
    });
    
    const handleCommandStatus = (message: CommandStatusMessage) => {
      if (message.scope === 'zone' || (message.scope === 'lamp' && message.device_id && activeZoneLampIds.includes(message.device_id))) {
        setDeactivationProgress(prev => {
          if (message.state === 'queued' || message.state === 'sent') {
            return {
              ...prev,
              stage: message.state === 'queued' ? 'queuing' : 'sending'
            };
          } else if (message.state === 'ack') {
            const newAcked = prev.ackedLamps + 1;
            const newStage = newAcked >= prev.totalLamps ? 'done' : 'ack';
            return {
              ...prev,
              stage: newStage,
              ackedLamps: newAcked
            };
          } else if (message.state === 'failed') {
            return {
              ...prev,
              failedLamps: prev.failedLamps + 1
            };
          }
          return prev;
        });
      }
    };
    
    wsClient.onMessage('command_status', handleCommandStatus);
    
    return () => {
      // Cleanup handled by WebSocket client
    };
  }, [wsClient, systemState.deactivationInProgress, systemState.activeZone, systemState.windDirection]);
  
  // Reset progress when deactivation completes
  useEffect(() => {
    if (!systemState.isEmergencyActive && deactivationProgress.stage === 'done') {
      setTimeout(() => {
        setDeactivationProgress({
          stage: 'idle',
          totalLamps: 0,
          ackedLamps: 0,
          failedLamps: 0
        });
      }, 2000);
    }
  }, [systemState.isEmergencyActive, deactivationProgress.stage]);

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

  // Update wind direction from weather data
  useEffect(() => {
    if (!zoneActivation.isActivated && !isManualMode && weather?.wind_direction_deg != null) {
      setAutoWindDirection(degToWindDir(weather.wind_direction_deg));
        }
        // Auto-switch to manual mode if weather connection fails
    if (weatherError && !zoneActivation.isActivated) {
          setIsManualMode(true);
        }
  }, [weather, weatherError, zoneActivation.isActivated, isManualMode]);

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
      // Try scenario-specific image first: "Zone A N-S" (WebP preferred, PNG fallback)
      const scenarioBaseName = `${zoneActivation.zoneName} ${zoneActivation.windDirection}`;
      const scenarioUrl = getImageUrl(scenarioBaseName);
      if (scenarioUrl) {
        return scenarioUrl;
      }
      // Fallback to general zone image: "Zone A" (WebP preferred, PNG fallback)
      const zoneUrl = getImageUrl(zoneActivation.zoneName);
      if (zoneUrl) {
        return zoneUrl;
      }
    }
    // Default to "All Zones" (WebP preferred, PNG fallback)
    return getImageUrl('All Zones') || '';
  }, [zoneActivation.isActivated, zoneActivation.zoneName, zoneActivation.windDirection]);

  // Image preloading based on wind direction prediction
  useEffect(() => {
    if (!weather || weatherConnectionFailed) return;
    
    // Predict likely wind directions based on current wind
    const currentWind = weather.wind_direction_deg;
    if (currentWind == null) return;
    
    // Get current wind direction
    const currentDir = degToWindDir(currentWind);
    if (!currentDir) return;
    
    // Preload images for current zone selection and likely wind directions
    const zonesToPreload = selectedZoneName ? [selectedZoneName] : KNOWN_ZONES.slice(0, 3); // Preload top 3 zones if none selected
    const windDirs: WindDir[] = ['N-S', 'S-N', 'E-W', 'W-E'];
    
    zonesToPreload.forEach(zone => {
      // Preload current wind direction first
      const currentWindImage = getImageUrl(`${zone} ${currentDir}`);
      if (currentWindImage) {
        const img = new Image();
        img.src = currentWindImage;
      }
      
      // Preload other wind directions (lower priority)
      windDirs.forEach(windDir => {
        if (windDir !== currentDir) {
          const imageUrl = getImageUrl(`${zone} ${windDir}`);
          if (imageUrl) {
            const img = new Image();
            img.src = imageUrl;
          }
        }
      });
      
      // Preload base zone image
      const baseImageUrl = getImageUrl(zone);
      if (baseImageUrl) {
        const img = new Image();
        img.src = baseImageUrl;
      }
    });
    
    // Preload "All Zones" image
    const allZonesUrl = getImageUrl('All Zones');
    if (allZonesUrl) {
      const img = new Image();
      img.src = allZonesUrl;
    }
  }, [weather, weatherConnectionFailed, selectedZoneName]);

  // STATELESS: No localStorage - SystemStateContext is the only source of truth

  // Deactivate handler - STATELESS: only sends command to backend, SystemStateContext will update
  const handleDeactivate = useCallback(async () => {
    setUiLock(true);
    try {
      console.log('Starting deactivation process...');
      await deactivateZoneMutation.mutateAsync();
      // Wait for backend to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Deactivation complete - SystemStateContext will update state');
    } catch (err) {
      console.error('Deactivation failed:', err);
    } finally {
      // Keep UI lock until state confirms activeZone=null
      // This will be handled by the useEffect below
    }
  }, [deactivateZoneMutation]);
  
  // Unlock UI when deactivation is confirmed
  useEffect(() => {
    if (uiLock && !systemState.isEmergencyActive && systemState.activeZone === null) {
      setUiLock(false);
    }
  }, [uiLock, systemState.isEmergencyActive, systemState.activeZone]);

  // Keyboard shortcuts: Alt+Shift+A (activate), Alt+Shift+D (deactivate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Shift+A: Activate emergency
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        
        // Check if activation is possible
        if (systemState.isEmergencyActive) {
          toast.error('Emergency is already active');
          return;
        }
        
        const activeWindDirection = isManualMode ? manualWindDirection : autoWindDirection;
        if (!selectedZoneName || !activeWindDirection) {
          toast.error('Please select a zone and ensure wind direction is available');
          return;
        }
        
        if (uiLock || activateZoneMutation.isPending) {
          toast.error('Operation in progress, please wait');
          return;
        }
        
        // Show confirmation dialog
        const confirmed = window.confirm(
          `Activate emergency for Zone ${selectedZoneName} with wind direction ${activeWindDirection}?`
        );
        
        if (confirmed) {
          activateZoneMutation.mutateAsync({ 
            zoneName: selectedZoneName, 
            windDirection: activeWindDirection 
          }).catch((err) => {
            console.error('Activation failed:', err);
          });
        }
      }
      
      // Alt+Shift+D: Deactivate emergency
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        
        // Check if deactivation is possible
        if (!systemState.isEmergencyActive) {
          toast.error('No active emergency to deactivate');
          return;
        }
        
        if (uiLock || deactivateZoneMutation.isPending || systemState.deactivationInProgress) {
          toast.error('Deactivation already in progress');
          return;
        }
        
        // Show confirmation dialog
        const confirmed = window.confirm(
          `Deactivate emergency for Zone ${systemState.activeZone || 'current zone'}?`
        );
        
        if (confirmed) {
          handleDeactivate();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    systemState.isEmergencyActive,
    systemState.activeZone,
    systemState.deactivationInProgress,
    selectedZoneName,
    isManualMode,
    manualWindDirection,
    autoWindDirection,
    uiLock,
    activateZoneMutation,
    deactivateZoneMutation,
    handleDeactivate
  ]);

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
                  aria-label="Acknowledge alarm and suppress for 2 minutes"
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md font-semibold transition-colors text-xs"
                >
                  🔕 Acknowledge
                </button>
              )}
              <button
                onClick={handleDeactivate}
                disabled={uiLock || deactivateZoneMutation.isPending || systemState.deactivationInProgress}
                aria-label="Deactivate emergency zone"
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deactivateZoneMutation.isPending || systemState.deactivationInProgress ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
          
          {/* Deactivation Progress Strip */}
          {systemState.deactivationInProgress && deactivationProgress.stage !== 'idle' && (
            <div className="mt-2 pt-2 border-t border-red-500">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">Deactivation Progress:</span>
                  <span className={`${
                    deactivationProgress.stage === 'queuing' ? 'text-yellow-200' :
                    deactivationProgress.stage === 'sending' ? 'text-blue-200' :
                    deactivationProgress.stage === 'ack' ? 'text-green-200' :
                    'text-white'
                  }`}>
                    {deactivationProgress.stage === 'queuing' && 'Queuing OFF commands...'}
                    {deactivationProgress.stage === 'sending' && 'Sending commands...'}
                    {deactivationProgress.stage === 'ack' && `ACK ${deactivationProgress.ackedLamps}/${deactivationProgress.totalLamps}`}
                    {deactivationProgress.stage === 'done' && 'Clearing state...'}
                  </span>
                </div>
                {deactivationProgress.totalLamps > 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-32 h-2 bg-red-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-400 transition-all duration-300"
                        style={{ width: `${(deactivationProgress.ackedLamps / deactivationProgress.totalLamps) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs opacity-75">
                      {deactivationProgress.ackedLamps}/{deactivationProgress.totalLamps}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Zone Image - Full remaining space, maximally stretched with minimal padding */}
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 flex-1" style={{ minHeight: 0, padding: '0.1rem' }}>
          <picture>
            <source srcSet={imageSrc} type="image/webp" />
          <img
              src={imageSrc.includes('.webp') ? imageSrc.replace('.webp', '.png') : imageSrc}
            alt={zoneActivation.zoneName || systemState.activeZone || 'Active Zone'}
            className="w-full h-full"
            style={{ display: 'block', objectFit: 'fill', width: '100%', height: '100%' }}
            loading="eager"
          />
          </picture>
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
                  className="mr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
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
                  aria-label={`Select wind direction ${dir}`}
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
            <picture>
              <source srcSet={imageSrc} type="image/webp" />
            <img
                src={imageSrc.includes('.webp') ? imageSrc.replace('.webp', '.png') : imageSrc}
              alt={selectedZoneName || 'All Zones'}
              className="absolute inset-0 h-full w-full object-contain"
            />
            </picture>
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
                aria-label={`Activate emergency zone ${selectedZoneName || ''} with wind direction ${isManualMode ? manualWindDirection : autoWindDirection || ''}`}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                disabled={uiLock || !(selectedZoneName && (isManualMode ? manualWindDirection : autoWindDirection)) || activateZoneMutation.isPending}
                onClick={async () => {
                  try {
                    const activeWindDirection = isManualMode ? manualWindDirection : autoWindDirection;
                    if (!selectedZoneName || !activeWindDirection) return;
                    
                    console.log('Starting activation process...');
                    await activateZoneMutation.mutateAsync({ 
                      zoneName: selectedZoneName, 
                      windDirection: activeWindDirection 
                    });
                    
                    // Wait for backend to process
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    console.log('Activation complete - SystemStateContext will update state');
                  } catch (err) {
                    console.error('Activation failed:', err);
                  }
                }}
              >
                {activateZoneMutation.isPending ? 'Activating...' : 'Activate Emergency'}
              </button>
            )}
            {systemState.isEmergencyActive && systemState.activeZone !== zoneActivation.zoneName && (
              <div className="text-sm text-yellow-300">
                Another zone ({systemState.activeZone}) is currently active
              </div>
            )}
            <button
              aria-label="Clear zone selection and deactivate emergency"
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
              disabled={uiLock || deactivateZoneMutation.isPending}
              onClick={async () => {
                try {
                  console.log('Starting clear/deactivation process...');
                  
                  // Step 1: Clear local UI selection only (not activation state)
                  setSelectedZoneName(null); 
                  setAutoWindDirection('');
                  setManualWindDirection('');
                  
                  // Step 2: Send deactivation command to backend (STATELESS - no local state changes)
                  await deactivateZoneMutation.mutateAsync();
                  console.log('Deactivation command sent');
                  
                  // Step 3: Wait for backend to process
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // SystemStateContext will poll and update state automatically
                  console.log('Clear/deactivation complete - SystemStateContext will update state');
                } catch (err) {
                  console.error('Clear/deactivation failed:', err);
                }
              }}
            >
              {deactivateZoneMutation.isPending ? 'Clearing...' : 'Clear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  };

export default ZoneActivation;


