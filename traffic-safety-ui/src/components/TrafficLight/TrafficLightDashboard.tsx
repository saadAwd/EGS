import React, { useState, useEffect } from 'react';
import { Pole, Lamp, getPoles, getAllLamps } from '../../api/trafficLights';
import { getGatewayStatus, connectGateway, disconnectGateway, updateLampGatewayMapping, GatewayStatus } from '../../api/gateway';
import PoleControl from './PoleControl';
import { Search, Filter, RefreshCw, Zap, ZapOff, Wifi, WifiOff, Settings, AlertCircle } from 'lucide-react';

const TrafficLightDashboard: React.FC = () => {
  const [poles, setPoles] = useState<Pole[]>([]);
  const [lamps, setLamps] = useState<Lamp[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [polesData, lampsData, gatewayData] = await Promise.all([
        getPoles(),
        getAllLamps(),
        getGatewayStatus().catch(() => null)
      ]);
      
      setPoles(polesData);
      setLamps(lampsData);
      setGatewayStatus(gatewayData);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load traffic light data');
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGatewayConnect = async () => {
    try {
      setIsConnecting(true);
      setGatewayError(null);
      
      // Initiate backend connect; ignore response shape and then read health
      await connectGateway();
      const health = await getGatewayStatus();
      setGatewayStatus(health);
      await fetchData(); // Refresh data
    } catch (err) {
      setGatewayError('Failed to connect to gateway');
      console.error('Gateway connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGatewayDisconnect = async () => {
    try {
      await disconnectGateway();
      setGatewayStatus(null);
      await fetchData(); // Refresh data
    } catch (err) {
      console.error('Gateway disconnect error:', err);
    }
  };

  const handleUpdateMapping = async () => {
    try {
      await updateLampGatewayMapping();
      await fetchData();
      alert('Lamp mapping update requested.');
    } catch (err) {
      alert('Failed to update lamp mapping');
      console.error('Mapping update error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLampUpdate = (updatedLamps: Lamp[]) => {
    setLamps(prevLamps => 
      prevLamps.map(lamp => {
        const updatedLamp = updatedLamps.find(ul => ul.id === lamp.id);
        return updatedLamp || lamp;
      })
    );
  };

  const filteredPoles = poles.filter(pole => {
    const matchesSearch = pole.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pole.location?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    const poleLamps = lamps.filter(lamp => lamp.pole_id === pole.id);
    const activeLamps = poleLamps.filter(lamp => lamp.is_on);
    
    switch (filterStatus) {
      case 'active':
        return activeLamps.length > 0;
      case 'inactive':
        return activeLamps.length === 0;
      default:
        return true;
    }
  });

  const totalLamps = lamps.length;
  const activeLamps = lamps.filter(lamp => lamp.is_on).length;
  const inactiveLamps = totalLamps - activeLamps;

  const handleBulkOperation = async (action: 'activate' | 'deactivate') => {
    try {
      setIsLoading(true);
      setError(null);
      
      // This would be implemented as a bulk API endpoint
      console.log(`Bulk ${action} operation for all poles`);
      
      // For now, we'll refresh the data
      await fetchData();
    } catch (err) {
      setError(`Failed to perform bulk ${action} operation`);
      console.error('Error in bulk operation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && poles.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading traffic light system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Traffic Light Management</h1>
            <p className="text-gray-600 mt-1">
              Manage {poles.length} poles with {totalLamps} total lamps
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <div className="text-sm text-gray-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Lamps</p>
                <p className="text-2xl font-bold text-blue-900">{totalLamps}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Active Lamps</p>
                <p className="text-2xl font-bold text-green-900">{activeLamps}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Zap className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inactive Lamps</p>
                <p className="text-2xl font-bold text-gray-900">{inactiveLamps}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <ZapOff className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Gateway Status */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">ESP32 Gateway Status</h3>
            <div className="flex items-center space-x-2">
              {gatewayStatus?.connection_status === 'connected' ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <Wifi className="w-4 h-4" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-red-600">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-sm font-medium">Disconnected</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div className="text-sm">
              <span className="font-medium text-gray-600">IP Address:</span>
              <span className="ml-2 text-gray-900">{'192.168.4.1'}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-600">TCP Port:</span>
              <span className="ml-2 text-gray-900">{'9000'}</span>
            </div>
             <div className="text-sm">
               <span className="font-medium text-gray-600">WiFi SSID:</span>
               <span className="ml-2 text-gray-900">{'ESP32_AP'}</span>
             </div>
            <div className="text-sm">
              <span className="font-medium text-gray-600">Installed Lamps:</span>
              <span className="ml-2 text-gray-900">{'126'}</span>
              <span className="ml-2 text-xs text-blue-600">(Full System - 14 Devices A-N)</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-600">Last Heartbeat:</span>
              <span className="ml-2 text-gray-900">
                {gatewayStatus?.last_heartbeat ? new Date(gatewayStatus.last_heartbeat).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>

          {gatewayError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <div className="flex items-center">
                <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                <span className="text-sm text-red-600">{gatewayError}</span>
              </div>
            </div>
          )}

           <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
             <div className="flex items-center">
               <AlertCircle className="w-4 h-4 text-blue-600 mr-2" />
               <span className="text-sm text-blue-800">
                 <strong>Full System Coverage:</strong> 14 devices (A-N) with 126 total lamps available. 
                 Each pole has 3 lamps: Straight, Left, Right arrows.
               </span>
             </div>
           </div>

           <div className="flex items-center space-x-3">
             <button
               onClick={handleGatewayConnect}
              disabled={isConnecting || gatewayStatus?.connection_status === 'connected'}
               className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
             >
               <Wifi className="w-4 h-4" />
               <span>{isConnecting ? 'Connecting...' : 'Connect Gateway'}</span>
             </button>
            
            <button
              onClick={handleGatewayDisconnect}
              disabled={gatewayStatus?.connection_status !== 'connected'}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <WifiOff className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
            
            <button
              onClick={handleUpdateMapping}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Update Mapping</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search poles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>
          
          {/* Bulk Operations */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleBulkOperation('activate')}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              Activate All
            </button>
            <button
              onClick={() => handleBulkOperation('deactivate')}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              Deactivate All
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Poles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredPoles.map((pole) => {
          const poleLamps = lamps.filter(lamp => lamp.pole_id === pole.id);
          return (
            <PoleControl
              key={pole.id}
              pole={pole}
              lamps={poleLamps}
              onLampUpdate={(updatedLamps) => handleLampUpdate(updatedLamps)}
            />
          );
        })}
      </div>

      {/* No Results */}
      {filteredPoles.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No poles found</h3>
          <p className="text-gray-600">
            Try adjusting your search term or filter criteria.
          </p>
        </div>
      )}
    </div>
  );
};

export default TrafficLightDashboard;

