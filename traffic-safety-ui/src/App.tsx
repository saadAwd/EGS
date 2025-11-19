import { useState, useEffect } from 'react';
import apiClient from './api/client';
import { unlockAudio } from './utils/audioUnlock';
import EGSOperatorDashboard from './components/EGSOperatorDashboard';
import { TrafficLightDashboard } from './components/TrafficLight';
import SystemEvents from './components/SystemEvents';
import GenerateReport from './components/GenerateReport';
import { ActivationProvider } from './contexts/ActivationContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AlarmProvider } from './contexts/AlarmContext';
import { SystemStateProvider, useSystemState } from './contexts/SystemStateContext';
import { Routes, Route, Navigate } from 'react-router-dom';
import ThemeSelector from './components/ThemeSelector';
import AramcoLogo from './assets/Aramco-logo.png';
import './themes.css';
import ZoneActivation from './pages/ZoneActivation';

interface Device {
  id: number;
  name: string;
  route_id: number;
  location: string;
  description?: string;
  is_active: boolean;
}

interface Zone {
  id: number;
  name: string;
  is_active: boolean;
  active_wind_direction: string | null;
}

interface Route {
  id: number;
  name: string;
  zone_id: number;
  wind_direction: string;
}

const TABS = [
  { key: 'egs', label: '📊 EGS Dashboard' },
  { key: 'traffic-lights', label: '🚦 Traffic Light Management' },
  { key: 'zone-activation', label: '🗺️ Zone Activation' },
  { key: 'system-events', label: '📋 System Events' },
  { key: 'generate-report', label: '📄 Generate Report' },
];

function EmergencyPortalTabs() {
  const { systemState, isFeatureAllowed } = useSystemState();
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [, setRoutes] = useState<Route[]>([]);
  const [loading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'egs' | 'traffic-lights' | 'map' | 'zone-activation' | 'schematic'>('zone-activation');

  const fetchData = async () => {
    const results = await Promise.allSettled([
      apiClient.get('/devices/'),
      apiClient.get('/zones/'),
      apiClient.get('/routes/'),
    ]);

    const [devicesRes, zonesRes, routesRes] = results;

    if (devicesRes.status === 'fulfilled') {
      const allDevices = (devicesRes.value.data as Device[]).filter((device: Device) =>
        device.name.startsWith('TL') && parseInt(device.name.substring(2)) <= 14
      );
      setDevices(allDevices);
    }
    if (zonesRes.status === 'fulfilled') {
      setZones(zonesRes.value.data as Zone[]);
    }
    if (routesRes.status === 'fulfilled') {
      setRoutes(routesRes.value.data as Route[]);
    }

    // Do not surface a global error banner; log instead
    if (devicesRes.status === 'rejected' || zonesRes.status === 'rejected' || routesRes.status === 'rejected') {
      console.warn('Some data failed to fetch (non-blocking).');
      setError(null);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-8">
            {/* Aramco Logo */}
            <img src={AramcoLogo} alt="Aramco Logo" className="h-12 w-auto" />
            <h1 className="text-3xl font-bold">Emergency Guidance System</h1>
          </div>
          <ThemeSelector />
        </div>
        {/* Emergency Status Banner */}
        {systemState.isEmergencyActive && (
          <div className="mb-6 p-4 bg-red-600 text-white rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-2xl">🚨</div>
                <div>
                  <h2 className="text-xl font-bold">EMERGENCY ACTIVE</h2>
                  <p className="text-sm">Zone: {systemState.activeZone} | Wind: {systemState.windDirection}</p>
                  <p className="text-xs">Activated: {systemState.activationTime}</p>
                </div>
              </div>
              <div className="text-sm">
                System Locked - Only EGS Dashboard and Zone Activation available
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          {TABS.map(t => {
            const isAllowed = isFeatureAllowed(t.key);
            const isDisabled = !isAllowed;
            
            return (
              <button
                key={t.key}
                onClick={() => isAllowed && setTab(t.key as typeof tab)}
                disabled={isDisabled}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  tab === t.key 
                    ? 'bg-blue-600 text-white' 
                    : isDisabled 
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
                title={isDisabled ? 'Feature locked during emergency' : ''}
              >
                {t.label} {isDisabled && '🔒'}
              </button>
            );
          })}
        </div>
        {/* Global error banner removed to avoid cross-tab disruption */}
        {tab === 'traffic-lights' && (
          <div>
            <TrafficLightDashboard />
          </div>
        )}
        {tab === 'egs' && (
          <div>
            <EGSOperatorDashboard />
          </div>
        )}
        {tab === 'zone-activation' && (
          <div>
            <div className="glass-card p-2">
              <ZoneActivation />
            </div>
          </div>
        )}
        {tab === 'system-events' && (
          <div>
            <SystemEvents />
          </div>
        )}
        {tab === 'generate-report' && (
          <div>
            <GenerateReport />
          </div>
        )}
        {/* Status Bar */}
        <div className="mt-8 glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-success rounded-full"></div>
                <span>Active Devices: {devices.filter(d => d.is_active).length}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
                <span>Total Devices: {devices.length}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-accent rounded-full"></div>
                <span>Total Zones: {zones.length}</span>
              </div>
            </div>
            <div className="text-sm text-text-muted">
              Last updated: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = async () => {
      await unlockAudio();
      setAudioUnlocked(true);
    };
    
    const handleFirstInteraction = () => {
      unlock();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    
    window.addEventListener('click', handleFirstInteraction, { once: true });
    window.addEventListener('touchstart', handleFirstInteraction, { once: true });
  }, []);

  return (
    <ThemeProvider>
      <ActivationProvider>
        <SystemStateProvider>
          <AlarmProvider>
            {!audioUnlocked && (
              <div className="fixed top-4 right-4 bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-lg z-50">
                <button onClick={() => unlockAudio().then(() => setAudioUnlocked(true))} className="font-bold">
                  🔊 Enable Sound
                </button>
              </div>
            )}
            <Routes>
              <Route path="/" element={<EmergencyPortalTabs />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AlarmProvider>
        </SystemStateProvider>
      </ActivationProvider>
    </ThemeProvider>
  );
}

export default App;