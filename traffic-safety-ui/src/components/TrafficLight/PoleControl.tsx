import React, { useState, useEffect } from 'react';
import { Pole, Lamp, activateAllPoleLamps, deactivateAllPoleLamps, activateLamp, deactivateLamp } from '../../api/trafficLights';
import LampIndicator from './LampIndicator';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { CommandStatusMessage } from '../../utils/websocketClient';
import toast from 'react-hot-toast';

interface PoleControlProps {
  pole: Pole;
  lamps: Lamp[];
  onLampUpdate?: (updatedLamps: Lamp[]) => void;
  deactivationInProgress?: boolean;
  disabledLampIds?: number[];
}

const PoleControl: React.FC<PoleControlProps> = ({
  pole,
  lamps,
  onLampUpdate,
  deactivationInProgress = false,
  disabledLampIds = []
}) => {
  const { wsClient } = useWebSocketContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLampIds, setPendingLampIds] = useState<Set<number>>(new Set());
  const [failedLampIds, setFailedLampIds] = useState<Set<number>>(new Set());
  const [lampCommandStates, setLampCommandStates] = useState<Map<number, 'queued' | 'sent' | 'ack' | 'failed' | 'retry'>>(new Map());

  const activeLamps = lamps.filter(lamp => lamp.is_on);
  const inactiveLamps = lamps.filter(lamp => !lamp.is_on);
  
  // Check if any lamps in this pole are in the disabled set
  const hasDisabledLamps = lamps.some(lamp => disabledLampIds.includes(lamp.id));
  const isPoleDisabled = deactivationInProgress && hasDisabledLamps;
  
  // Subscribe to WebSocket command_status messages for optimistic updates
  useEffect(() => {
    if (!wsClient) return;
    
    const handleCommandStatus = (message: CommandStatusMessage) => {
      if (message.scope === 'lamp' && message.device_id) {
        const lampId = message.device_id;
        const poleLampIds = lamps.map(l => l.id);
        
        // Only handle if this lamp belongs to this pole
        if (!poleLampIds.includes(lampId)) return;
        
        if (message.state === 'ack') {
          // Command acknowledged - clear pending, mark as ACK
          setPendingLampIds(prev => {
            const next = new Set(prev);
            next.delete(lampId);
            return next;
          });
          setFailedLampIds(prev => {
            const next = new Set(prev);
            next.delete(lampId);
            return next;
          });
          setLampCommandStates(prev => {
            const next = new Map(prev);
            next.set(lampId, 'ack');
            return next;
          });
          // Invalidate to get fresh state
          onLampUpdate?.();
        } else if (message.state === 'failed') {
          // Command failed - mark as failed
          setPendingLampIds(prev => {
            const next = new Set(prev);
            next.delete(lampId);
            return next;
          });
          setFailedLampIds(prev => new Set(prev).add(lampId));
          setLampCommandStates(prev => {
            const next = new Map(prev);
            next.set(lampId, 'failed');
            return next;
          });
          toast.error(`Lamp command failed for lamp ${lampId}`);
        } else if (message.state === 'queued' || message.state === 'sent') {
          // Command queued/sent - keep pending
          setPendingLampIds(prev => new Set(prev).add(lampId));
          setLampCommandStates(prev => {
            const next = new Map(prev);
            next.set(lampId, message.state);
            return next;
          });
        }
      }
    };
    
    wsClient.onMessage('command_status', handleCommandStatus);
    
    return () => {
      // Cleanup handled by WebSocket client lifecycle
    };
  }, [wsClient, lamps, onLampUpdate]);

  const handleToggleAll = async () => {
    // During deactivation, only allow turning OFF
    if (isPoleDisabled && activeLamps.length === 0) {
      return; // Can't turn ON during deactivation
    }
    
    setIsLoading(true);
    setError(null);
    
    // Mark all pole lamps as pending
    const poleLampIds = new Set<number>(lamps.map(l => l.id));
    setPendingLampIds(poleLampIds);
    
    try {
      let updatedLamps: Lamp[];
      
      if (activeLamps.length === 0) {
        // All lamps are off, turn all on (disabled during deactivation)
        if (isPoleDisabled) {
          setError('Cannot turn ON during deactivation');
          setPendingLampIds(new Set());
          setIsLoading(false);
          return;
        }
        updatedLamps = await activateAllPoleLamps(pole.id);
        toast.success(`All lamps on pole ${pole.name} activated`);
      } else {
        // Some or all lamps are on, turn all off (always allowed)
        updatedLamps = await deactivateAllPoleLamps(pole.id);
        toast.success(`All lamps on pole ${pole.name} deactivated`);
      }
      
      // Clear pending state
      setPendingLampIds(new Set());
      onLampUpdate?.(updatedLamps);
    } catch (err) {
      setError('Failed to update pole lamps');
      setPendingLampIds(new Set());
      toast.error(`Failed to update pole ${pole.name}`);
      console.error('Error toggling pole lamps:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLamp = async (lamp: Lamp) => {
    // During deactivation, only allow turning OFF lamps in the active zone
    const isLampDisabled = deactivationInProgress && disabledLampIds.includes(lamp.id);
    if (isLampDisabled && !lamp.is_on) {
      // Can't turn ON during deactivation
      setError('Cannot turn ON during deactivation');
      toast.error('Cannot turn ON during deactivation');
      return;
    }
    
    // If already pending, just update the label (coalesce clicks)
    if (pendingLampIds.has(lamp.id)) {
      // Already pending - just show toast
      toast.loading(`Lamp ${lamp.gateway_id} command already pending...`);
      return;
    }
    
    // Mark this lamp as pending (optimistic update)
    setPendingLampIds(prev => new Set(prev).add(lamp.id));
    setFailedLampIds(prev => {
      const next = new Set(prev);
      next.delete(lamp.id);
      return next;
    });
    setLampCommandStates(prev => {
      const next = new Map(prev);
      next.set(lamp.id, 'queued');
      return next;
    });
    setError(null);
    
    try {
      let updatedLamp: Lamp;
      
      // Update state to 'sent'
      setLampCommandStates(prev => {
        const next = new Map(prev);
        next.set(lamp.id, 'sent');
        return next;
      });
      
      if (lamp.is_on) {
        updatedLamp = await deactivateLamp(lamp.id);
      } else {
        if (isLampDisabled) {
          setError('Cannot turn ON during deactivation');
          setPendingLampIds(prev => {
            const next = new Set(prev);
            next.delete(lamp.id);
            return next;
          });
          setLampCommandStates(prev => {
            const next = new Map(prev);
            next.delete(lamp.id);
            return next;
          });
          toast.error('Cannot turn ON during deactivation');
          return;
        }
        updatedLamp = await activateLamp(lamp.id);
      }
      
      // Clear pending state immediately since API call succeeded
      // The backend has confirmed the command, so we can clear pending
      // WebSocket ACK will still be handled as a backup confirmation
      setPendingLampIds(prev => {
        const next = new Set(prev);
        next.delete(lamp.id);
        return next;
      });
      setLampCommandStates(prev => {
        const next = new Map(prev);
        next.set(lamp.id, 'ack');
        return next;
      });
      
      // Set a timeout fallback to ensure pending is cleared even if WebSocket ACK doesn't arrive
      setTimeout(() => {
        setPendingLampIds(prev => {
          const next = new Set(prev);
          next.delete(lamp.id);
          return next;
        });
        setLampCommandStates(prev => {
          const next = new Map(prev);
          // Only clear if still in 'ack' state (not failed or retry)
          if (next.get(lamp.id) === 'ack') {
            next.delete(lamp.id);
          }
          return next;
        });
      }, 2000); // 2 second fallback timeout
      
      // Update the specific lamp in the lamps array
      const updatedLamps = lamps.map(l => 
        l.id === lamp.id ? updatedLamp : l
      );
      
      onLampUpdate?.(updatedLamps);
    } catch (err) {
      setError(`Failed to update lamp ${lamp.gateway_id}`);
      setPendingLampIds(prev => {
        const next = new Set(prev);
        next.delete(lamp.id);
        return next;
      });
      setFailedLampIds(prev => new Set(prev).add(lamp.id));
      setLampCommandStates(prev => {
        const next = new Map(prev);
        next.set(lamp.id, 'failed');
        return next;
      });
      toast.error(`Failed to update lamp ${lamp.gateway_id}`);
      console.error('Error toggling lamp:', err);
    }
  };

  const getPoleStatusColor = () => {
    if (activeLamps.length === 0) return 'text-gray-500';
    if (activeLamps.length === lamps.length) return 'text-green-600';
    return 'text-yellow-600';
  };

  const getPoleStatusText = () => {
    if (activeLamps.length === 0) return 'All Off';
    if (activeLamps.length === lamps.length) return 'All On';
    return `${activeLamps.length}/${lamps.length} Active`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-200">
      {/* Pole Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {pole.name}
          </h3>
          {pole.location && (
            <p className="text-sm text-gray-600">{pole.location}</p>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <div className={`text-sm font-medium ${getPoleStatusColor()}`}>
            {getPoleStatusText()}
          </div>
          
          <button
            onClick={handleToggleAll}
            disabled={isLoading || (isPoleDisabled && activeLamps.length === 0)}
            aria-label={activeLamps.length === 0 
              ? `Turn on all lamps in pole ${pole.name}` 
              : `Turn off all lamps in pole ${pole.name}`}
            title={isPoleDisabled && activeLamps.length === 0 ? 'Deactivation in progress - ON disabled' : ''}
            className={`
              px-4 py-2 rounded-md font-medium text-sm transition-all duration-200
              ${activeLamps.length === 0
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }
              ${isLoading || (isPoleDisabled && activeLamps.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
            `}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processing...</span>
              </div>
            ) : (
              activeLamps.length === 0 ? 'Turn All On' : 'Turn All Off'
            )}
          </button>
          {isPoleDisabled && (
            <div className="text-xs text-yellow-600 mt-1">
              Deactivation in progress - ON disabled
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Lamps Grid - Standard Traffic Light Layout */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-center mb-4">
          <h4 className="text-sm font-semibold text-gray-700">Standard Traffic Light Layout</h4>
        </div>
        <div className="flex justify-center space-x-8">
        {/* Side 3 (Left Column) */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Side 3</div>
          {lamps
            .filter(lamp => lamp.side_number === 3)
            .sort((a, b) => a.lamp_number - b.lamp_number)
            .map((lamp) => (
              <div key={lamp.id} className="flex items-center space-x-3">
                <LampIndicator
                  lamp={lamp}
                  size="md"
                  showLabel={false}
                  interactive={true}
                  onToggle={handleToggleLamp}
                  disabled={deactivationInProgress && disabledLampIds.includes(lamp.id) && !lamp.is_on}
                  pending={pendingLampIds.has(lamp.id)}
                  failed={failedLampIds.has(lamp.id)}
                  commandState={lampCommandStates.get(lamp.id)}
                />
                <span className="text-sm font-bold text-blue-600 w-6 text-center">
                  {lamp.lamp_number}
                </span>
              </div>
            ))}
        </div>

        {/* Side 2 (Middle Column) */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Side 2</div>
          {lamps
            .filter(lamp => lamp.side_number === 2)
            .sort((a, b) => a.lamp_number - b.lamp_number)
            .map((lamp) => (
              <div key={lamp.id} className="flex items-center space-x-3">
                <LampIndicator
                  lamp={lamp}
                  size="md"
                  showLabel={false}
                  interactive={true}
                  onToggle={handleToggleLamp}
                  disabled={deactivationInProgress && disabledLampIds.includes(lamp.id) && !lamp.is_on}
                  pending={pendingLampIds.has(lamp.id)}
                  failed={failedLampIds.has(lamp.id)}
                  commandState={lampCommandStates.get(lamp.id)}
                />
                <span className="text-sm font-bold text-blue-600 w-6 text-center">
                  {lamp.lamp_number}
                </span>
              </div>
            ))}
        </div>

        {/* Side 1 (Right Column) */}
        <div className="flex flex-col items-center space-y-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Side 1</div>
          {lamps
            .filter(lamp => lamp.side_number === 1)
            .sort((a, b) => a.lamp_number - b.lamp_number)
            .map((lamp) => (
              <div key={lamp.id} className="flex items-center space-x-3">
                <LampIndicator
                  lamp={lamp}
                  size="md"
                  showLabel={false}
                  interactive={true}
                  onToggle={handleToggleLamp}
                  disabled={deactivationInProgress && disabledLampIds.includes(lamp.id) && !lamp.is_on}
                  pending={pendingLampIds.has(lamp.id)}
                  failed={failedLampIds.has(lamp.id)}
                  commandState={lampCommandStates.get(lamp.id)}
                />
                <span className="text-sm font-bold text-blue-600 w-6 text-center">
                  {lamp.lamp_number}
                </span>
              </div>
            ))}
        </div>
        </div>
      </div>

      {/* Pole Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Gateway ID Range: {lamps[0]?.gateway_id} - {lamps[lamps.length - 1]?.gateway_id}</span>
          <span>Total Lamps: {lamps.length}</span>
        </div>
      </div>
    </div>
  );
};

export default PoleControl;
