import React, { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { zonesApi, activationApi } from '../api';
import type { Zone, ZoneStatus, Device } from '../types';
import { useActivationContext } from '../contexts/ActivationContext';

const ActivationPanel: React.FC = () => {
  const { activatedDevices, setActivatedDevices } = useActivationContext();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zoneStatus, setZoneStatus] = useState<ZoneStatus | null>(null);
  const [selectedWindDirection, setSelectedWindDirection] = useState<string>('');
  
  // Predefined wind directions
  const windDirections = [
    'north', 'south', 'east', 'west', 
    'northeast', 'northwest', 'southeast', 'southwest'
  ];

  useEffect(() => {
    loadZones();
  }, []);

  // Poll for updates
  useEffect(() => {
    if (!selectedZone?.id) return;

    const pollInterval = setInterval(() => {
      fetchZoneStatus(selectedZone.id);
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [selectedZone]);

  const loadZones = async () => {
    try {
      setLoading(true);
      console.log('Fetching zones...');
      const zonesData = await zonesApi.getZones();
      console.log('Zones fetched:', zonesData);
      setZones(zonesData);
      
      // Update selected zone if it exists in the new data
      if (selectedZone) {
        const updatedSelectedZone = zonesData.find(z => z.id === selectedZone.id);
        setSelectedZone(updatedSelectedZone || null);
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      setMessage({ type: 'error', text: 'Failed to load zones. Please try refreshing the page.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchZoneStatus = async (zoneId: number) => {
    try {
      console.log('Fetching status for zone:', zoneId);
      const status = await activationApi.getZoneStatus(zoneId);
      console.log('Zone status:', status);
      setZoneStatus(status);
      
      if (status.zone.is_active && status.active_devices) {
        setActivatedDevices(status.active_devices);
      }
    } catch (error) {
      console.error('Error fetching zone status:', error);
    }
  };

  const handleZoneSelect = (zoneId: string) => {
    const zone = zones.find(z => z.id === parseInt(zoneId));
    setSelectedZone(zone || null);
    if (zone) {
      fetchZoneStatus(zone.id);
    } else {
      setZoneStatus(null);
    }
  };

  const handleWindDirectionSelect = (direction: string) => {
    setSelectedWindDirection(direction);
  };

  const handleActivate = async () => {
    if (!selectedZone || !selectedWindDirection) {
      setMessage({ type: 'error', text: 'Please select both zone and wind direction' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      console.log('Activating zone:', { zone_id: selectedZone.id, wind_direction: selectedWindDirection });
      
      const status = await activationApi.activateZone({
        zone_id: selectedZone.id,
        wind_direction: selectedWindDirection
      });
      
      console.log('Activation response:', status);
      setZoneStatus(status);
      
      // Update activated devices in context
      if (status.zone.is_active && status.active_devices) {
        setActivatedDevices(status.active_devices);
      }
      
      setMessage({ 
        type: 'success', 
        text: `Zone ${status.zone.name} activated successfully! Approach from ${status.active_route?.wind_direction} direction.` 
      });
    } catch (error: any) {
      console.error('Error activating zone:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to activate zone. Please try again.' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedZone) return;

    try {
      setSubmitting(true);
      console.log('Deactivating zone:', selectedZone.id);
      
      await activationApi.deactivateZone({ zone_id: selectedZone.id });
      const status = await activationApi.getZoneStatus(selectedZone.id);
      
      console.log('Deactivation status:', status);
      setZoneStatus(status);
      setActivatedDevices([]);
      
      setMessage({ type: 'success', text: `Zone ${selectedZone.name} has been deactivated` });
    } catch (error: any) {
      console.error('Error deactivating zone:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to deactivate zone' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <LoadingSpinner text="Loading zones..." />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Section */}
      <div className="glass-card p-6">
        <h1 className="text-2xl font-bold neon-text mb-2">Activation Control Center</h1>
        <p className="text-gray-400">Manage zone activations and monitor device states</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Zone Selection */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">Zone Selection</h2>
          <div className="grid grid-cols-3 gap-3">
            {zones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => handleZoneSelect(zone.id.toString())}
                className={`p-4 rounded-xl transition-all duration-300 ${
                  selectedZone?.id === zone.id
                    ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] shadow-lg'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-lg font-medium">Zone {zone.id}</div>
                <div className="text-sm text-gray-400">
                  {zone.is_active ? 'Active' : 'Inactive'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Wind Direction Selection */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">Wind Direction</h2>
          <div className="grid grid-cols-4 gap-3">
            {windDirections.map((direction) => (
              <button
                key={direction}
                onClick={() => handleWindDirectionSelect(direction)}
                className={`p-4 rounded-xl transition-all duration-300 ${
                  selectedWindDirection === direction
                    ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] shadow-lg'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-medium capitalize">{direction}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="glass-card p-6">
        <div className="flex space-x-4">
          <button
            onClick={handleActivate}
            disabled={submitting || !selectedZone || !selectedWindDirection}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 
                     disabled:from-gray-600 disabled:to-gray-500 text-white font-medium py-3 px-6 rounded-lg 
                     transition-colors flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Activating...</span>
              </>
            ) : (
              <span>Activate Zone</span>
            )}
          </button>
          
          {selectedZone?.is_active && (
            <button
              onClick={handleDeactivate}
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 
                       disabled:from-gray-600 disabled:to-gray-500 text-white font-medium py-3 px-6 rounded-lg 
                       transition-colors flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Deactivating...</span>
                </>
              ) : (
                <span>Deactivate Zone</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`glass-card p-4 ${
          message.type === 'success' 
            ? 'border-l-4 border-green-500 bg-green-500/10' 
            : 'border-l-4 border-red-500 bg-red-500/10'
        }`}>
          <p className={`text-${message.type === 'success' ? 'green' : 'red'}-100`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Active Devices Display */}
      {selectedZone && zoneStatus?.active_devices && zoneStatus.active_devices.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Active Devices</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zoneStatus.active_devices.map((device) => (
              <div key={device.id} className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${device.is_green ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <div className="font-medium text-white">{device.name}</div>
                    <div className="text-sm text-gray-400">{device.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivationPanel; 