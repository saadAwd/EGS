import React, { useEffect, useState, useCallback } from 'react';
import { useActivationContext } from '../contexts/ActivationContext';
import { Device, Zone } from '../types';
import { devicesApi } from '../api/devices';
import { activationApi } from '../api/activation';
import { zonesApi } from '../api/zones';

const ActivationPanel: React.FC = () => {
  const { activatedDevices, setActivatedDevices } = useActivationContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [windDirection, setWindDirection] = useState<string>('northwest');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const devicesResponse = await devicesApi.getDevices();
      setDevices(devicesResponse);
      const active = devicesResponse.filter(d => d.is_active);
      setActivatedDevices(active);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch devices';
      setError(errorMessage);
    }
  }, [setActivatedDevices]);

  const fetchZones = useCallback(async () => {
    try {
      const zonesResponse = await zonesApi.getZones();
      // Only show Zone 5
      const filteredZones = zonesResponse.filter(zone => zone.id === 5);
      setZones(filteredZones);
      
      // Auto-select Zone 5 if available
      if (filteredZones.length > 0 && !selectedZone) {
        setSelectedZone(5);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch zones';
      setError(errorMessage);
    }
  }, [selectedZone]);

  useEffect(() => {
    fetchDevices();
    fetchZones();
    const interval = setInterval(fetchDevices, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [fetchDevices, fetchZones]);

  const handleActivate = async () => {
    if (!selectedZone) return;
    setIsLoading(true);
    setError(null);
    try {
      await activationApi.activateZone({
        zone_id: selectedZone,
        wind_direction: windDirection,
      });
      await fetchDevices(); // Refresh data after activation
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to activate zone');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedZone) return;
    setIsLoading(true);
    setError(null);
    try {
      await activationApi.deactivateZone({
        zone_id: selectedZone,
      });
      await fetchDevices(); // Refresh data after deactivation
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to deactivate zone');
    } finally {
      setIsLoading(false);
    }
  };

  const isZoneActive = (zoneId: number) => {
    return devices.some(d => d.route_id === zoneId && d.is_active);
  };

  // Only allow northwest and southeast wind directions
  const allowedWindDirections = ['northwest', 'southeast'];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Section */}
      <div className="glass-card p-6">
        <h1 className="text-2xl font-bold neon-text mb-2">Zone 5 Activation Control</h1>
        <p className="text-gray-400">Manage Zone 5 activations with northwest and southeast wind directions.</p>
        <div className="mt-4 flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-sm text-gray-400">Polling for updates every 5 seconds</span>
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-100">
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Zone Selection */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">Zone Selection</h2>
          <div className="grid grid-cols-1 gap-3">
            {zones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setSelectedZone(zone.id)}
                className={`p-4 rounded-xl transition-all duration-300 ${
                  selectedZone === zone.id
                    ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] shadow-lg'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-lg font-medium">{zone.name}</div>
                <div className="text-sm text-gray-400">
                  {isZoneActive(zone.id) ? 'Active' : 'Inactive'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Wind Direction */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">Wind Direction</h2>
          <div className="grid grid-cols-2 gap-4">
            {allowedWindDirections.map((direction) => (
              <button
                key={direction}
                onClick={() => setWindDirection(direction)}
                className={`p-4 rounded-xl capitalize transition-all duration-300 ${
                  windDirection === direction
                    ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] shadow-lg'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {direction}
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="text-sm text-blue-300">
              <strong>Route Information:</strong><br/>
              • <strong>Northwest:</strong> Route 1 (TL1, TL4, TL8, TL14)<br/>
              • <strong>Southeast:</strong> Route 2 (TL2, TL6, TL13) - TL2 GPIO control
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="glass-card p-6 flex gap-4">
        <button
          onClick={handleActivate}
          disabled={isLoading || (selectedZone !== null && isZoneActive(selectedZone))}
          className="flex-1 btn-primary disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Activating...' : 'Activate Zone'}
        </button>
        <button
          onClick={handleDeactivate}
          disabled={isLoading || (selectedZone !== null && !isZoneActive(selectedZone))}
          className="flex-1 btn-secondary disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Deactivating...' : 'Deactivate Zone'}
        </button>
      </div>
    </div>
  );
};

export default ActivationPanel; 