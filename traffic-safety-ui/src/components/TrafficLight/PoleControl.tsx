import React, { useState } from 'react';
import { Pole, Lamp, activateAllPoleLamps, deactivateAllPoleLamps, activateLamp, deactivateLamp } from '../../api/trafficLights';
import LampIndicator from './LampIndicator';

interface PoleControlProps {
  pole: Pole;
  lamps: Lamp[];
  onLampUpdate?: (updatedLamps: Lamp[]) => void;
}

const PoleControl: React.FC<PoleControlProps> = ({
  pole,
  lamps,
  onLampUpdate
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLamps = lamps.filter(lamp => lamp.is_on);
  const inactiveLamps = lamps.filter(lamp => !lamp.is_on);

  const handleToggleAll = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let updatedLamps: Lamp[];
      
      if (activeLamps.length === 0) {
        // All lamps are off, turn all on
        updatedLamps = await activateAllPoleLamps(pole.id);
      } else {
        // Some or all lamps are on, turn all off
        updatedLamps = await deactivateAllPoleLamps(pole.id);
      }
      
      onLampUpdate?.(updatedLamps);
    } catch (err) {
      setError('Failed to update pole lamps');
      console.error('Error toggling pole lamps:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLamp = async (lamp: Lamp) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let updatedLamp: Lamp;
      
      if (lamp.is_on) {
        updatedLamp = await deactivateLamp(lamp.id);
      } else {
        updatedLamp = await activateLamp(lamp.id);
      }
      
      // Update the specific lamp in the lamps array
      const updatedLamps = lamps.map(l => 
        l.id === lamp.id ? updatedLamp : l
      );
      
      onLampUpdate?.(updatedLamps);
    } catch (err) {
      setError(`Failed to update lamp ${lamp.gateway_id}`);
      console.error('Error toggling lamp:', err);
    } finally {
      setIsLoading(false);
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
            disabled={isLoading}
            className={`
              px-4 py-2 rounded-md font-medium text-sm transition-all duration-200
              ${activeLamps.length === 0
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}
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
