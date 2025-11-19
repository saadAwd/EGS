import React, { useState, useEffect, useCallback } from 'react';
import { useActivationContext } from '../contexts/ActivationContext';
import { useSystemState } from '../contexts/SystemStateContext';
import apiClient from '../api/client';

interface EmergencyEvent {
  id: number;
  zone_name: string;
  wind_direction: string;
  activation_date: string;
  activation_time: string;
  clear_time: string | null;
  duration_minutes: number | null;
  status: 'active' | 'cleared';
}

const SystemEvents: React.FC = () => {
  const { zoneActivation } = useActivationContext();
  const { systemState } = useSystemState();
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/emergency-events/');
      setEvents(response.data);
      setLastUpdate(new Date().toLocaleString());
    } catch (error) {
      console.error('Error fetching emergency events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Update events when system state changes (emergency activated/cleared)
  useEffect(() => {
    if (systemState.isEmergencyActive && systemState.activeZone) {
      // Emergency is active - refresh events to show new event
      console.log('Emergency active - refreshing events for:', systemState.activeZone);
      fetchEvents();
    } else if (!systemState.isEmergencyActive) {
      // Emergency cleared - refresh events to get updated duration and status
      console.log('Emergency cleared - refreshing events');
      fetchEvents();
    }
  }, [systemState.isEmergencyActive, systemState.activeZone]); // Removed fetchEvents to prevent infinite loop

  // Also refresh when local zone activation changes
  useEffect(() => {
    if (zoneActivation.isActivated) {
      console.log('Zone activation detected - refreshing events');
      fetchEvents();
    } else if (!zoneActivation.isActivated && events.some(e => e.status === 'active')) {
      console.log('Zone deactivated - refreshing events');
      fetchEvents();
    }
  }, [zoneActivation.isActivated]); // Removed fetchEvents and events to prevent infinite loop

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return 'Ongoing';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-red-500 bg-red-100';
      case 'cleared': return 'text-green-500 bg-green-100';
      default: return 'text-gray-500 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">System Events</h1>
            <p className="text-gray-300 mt-1">Emergency activation history and tracking</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Last updated</div>
            <div className="text-sm text-white">{lastUpdate}</div>
          </div>
        </div>
      </div>

      {/* Current Status */}
      {systemState.isEmergencyActive && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-semibold text-red-200">Emergency Currently Active</h3>
              <p className="text-red-300">
                Zone: <strong>{systemState.activeZone}</strong> | 
                Wind: <strong>{systemState.windDirection}</strong> | 
                Started: <strong>{systemState.activationTime}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Emergency Events History</h2>
        </div>
        
        {loading ? (
          <div className="p-6 text-center">
            <div className="text-gray-400">Loading events...</div>
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-gray-400">No emergency events recorded</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Zone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Wind Direction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Activation Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Activation Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Clear Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {event.zone_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.wind_direction}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.activation_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.activation_time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {event.clear_time || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {formatDuration(event.duration_minutes)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-2xl font-bold text-white">
            {events.filter(e => e.status === 'cleared').length}
          </div>
          <div className="text-sm text-gray-400">Total Emergencies</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-2xl font-bold text-white">
            {events.filter(e => e.status === 'active').length}
          </div>
          <div className="text-sm text-gray-400">Active Emergencies</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-2xl font-bold text-white">
            {events.length > 0 ? Math.round(events.reduce((acc, e) => acc + (e.duration_minutes || 0), 0) / events.length) : 0}m
          </div>
          <div className="text-sm text-gray-400">Avg Duration</div>
        </div>
      </div>
    </div>
  );
};

export default SystemEvents;
