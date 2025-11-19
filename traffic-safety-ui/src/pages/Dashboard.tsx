import React, { useEffect, useState } from 'react';
import { useActivationContext } from '../contexts/ActivationContext';
import { Device } from '../types';
import { devicesApi } from '../api/devices';
import { Link } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { activatedDevices } = useActivationContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeDevices: 0,
    activeZones: 0,
    systemHealth: 98
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devicesResponse = await devicesApi.getDevices();
        // Filter to only show Zone 5 devices
        const zone5Devices = devicesResponse.filter(device => 
          ['TL1', 'TL2', 'TL4', 'TL6', 'TL8', 'TL13', 'TL14'].includes(device.name)
        );
        setDevices(zone5Devices);
        
        // Calculate stats for Zone 5 only
        const activeZones = new Set(
          activatedDevices.map(d => {
            const device = zone5Devices.find(dev => dev.id === d.id);
            return device?.route_id;
          }).filter(Boolean)
        );

        setStats({
          totalDevices: zone5Devices.length,
          activeDevices: activatedDevices.length,
          activeZones: activeZones.size,
          systemHealth: Math.max(85, 100 - (activatedDevices.length * 2))
        });
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [activatedDevices]);

  const StatCard: React.FC<{ title: string; value: string | number; subtitle?: string; icon: string; color: string }> = ({ 
    title, value, subtitle, icon, color 
  }) => (
    <div className="glass-card p-6 group hover:scale-105 transition-transform duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className={`text-2xl p-3 rounded-xl bg-gradient-to-br ${color} opacity-20`}>
          {icon}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-sm text-gray-400">{title}</div>
        </div>
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-2">{subtitle}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Hero Section with Parallax */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] p-8 md:p-12">
        {/* Animated background elements */}
        <div className="absolute inset-0">
          <div className="bg-shape top-10 right-10 opacity-20"></div>
          <div className="bg-shape bottom-10 left-10 opacity-15"></div>
        </div>
        
        <div className="relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Zone 5 Traffic Safety
            <span className="block neon-text">Intelligence</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl">
            Advanced traffic management system for Zone 5 with real-time monitoring and intelligent control
          </p>
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg max-w-2xl">
            <div className="text-sm text-blue-300">
              <strong>Zone 5 Routes:</strong><br/>
              • <strong>Northwest:</strong> TL1, TL4, TL8, TL14<br/>
              • <strong>Southeast:</strong> TL2, TL6, TL13 (TL2: GPIO 25 ON=Red, OFF=Green)
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <button className="btn-premium text-lg px-8 py-4">
              View Live Map
            </button>
            <button className="px-8 py-4 rounded-xl font-medium text-white transition-all duration-300
                             border border-white/20 hover:bg-white/10 hover:border-white/40">
              System Overview
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Devices"
          value={stats.totalDevices}
          subtitle="Connected sensors"
          icon="📱"
          color="from-blue-500 to-blue-600"
        />
        <StatCard
          title="Active Devices"
          value={stats.activeDevices}
          subtitle="Currently operational"
          icon="⚡"
          color="from-green-500 to-green-600"
        />
        <StatCard
          title="Active Zones"
          value={stats.activeZones}
          subtitle="Managed areas"
          icon="🏢"
          color="from-purple-500 to-purple-600"
        />
        <StatCard
          title="System Health"
          value={`${stats.systemHealth}%`}
          subtitle="Overall performance"
          icon="❤️"
          color="from-red-500 to-red-600"
        />
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center justify-between">
          <span>Recent Activity</span>
          <Link
            to="/map"
            className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition-all duration-300 flex items-center"
            aria-label="Open Map View"
          >
            <span className="text-xl mr-2">🗺️</span>
            <span className="font-semibold">Map</span>
          </Link>
        </h2>
        <div className="space-y-4">
          {activatedDevices.slice(0, 5).map((device, index) => {
            const deviceInfo = devices.find(d => d.id === device.id);
            return (
              <div key={device.id} className="flex items-center p-4 bg-white/5 rounded-xl">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-4 animate-pulse"></div>
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {deviceInfo?.name || `Device ${device.id}`}
                  </div>
                  <div className="text-sm text-gray-400">
                    Zone {deviceInfo?.route_id} • Activated
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            );
          })}
          {activatedDevices.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-4">🌙</div>
              <div>No recent activity</div>
              <div className="text-sm">System is in standby mode</div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
          <div className="text-4xl mb-4">🚦</div>
          <h3 className="text-lg font-semibold text-white mb-2">Traffic Control</h3>
          <p className="text-gray-400 text-sm mb-4">Manage traffic light sequences and timing</p>
          <button className="btn-premium w-full">Access Control</button>
        </div>
        
        <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">Analytics</h3>
          <p className="text-gray-400 text-sm mb-4">View traffic patterns and performance metrics</p>
          <button className="btn-premium w-full">View Reports</button>
        </div>
        
        <div className="glass-card p-6 text-center group hover:scale-105 transition-transform duration-300">
          <div className="text-4xl mb-4">⚙️</div>
          <h3 className="text-lg font-semibold text-white mb-2">Settings</h3>
          <p className="text-gray-400 text-sm mb-4">Configure system parameters and preferences</p>
          <button className="btn-premium w-full">Open Settings</button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 