import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useActivationContext } from '../contexts/ActivationContext';

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const { activatedDevices } = useActivationContext();
  const [isScrolled, setIsScrolled] = useState(false);
  const [systemStatus, setSystemStatus] = useState<'clear' | 'warning' | 'emergency'>('clear');

  // Handle scroll events for sticky header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Monitor system status based on activated devices
  useEffect(() => {
    if (activatedDevices.length > 5) {
      setSystemStatus('emergency');
    } else if (activatedDevices.length > 0) {
      setSystemStatus('warning');
    } else {
      setSystemStatus('clear');
    }
  }, [activatedDevices]);

  const navItems = [
    { path: '/', label: 'Zone Manager', icon: '🏢' },
    { path: '/devices', label: 'Device Manager', icon: '📱' },
    { path: '/activation', label: 'Activation Panel', icon: '⚡' },
    { path: '/map', label: 'Map View', icon: '🗺️' },
  ];

  const getStatusColor = () => {
    switch (systemStatus) {
      case 'emergency':
        return 'from-red-500 to-red-600';
      case 'warning':
        return 'from-yellow-500 to-yellow-600';
      default:
        return 'from-green-500 to-green-600';
    }
  };

  const getStatusText = () => {
    switch (systemStatus) {
      case 'emergency':
        return 'Emergency Active';
      case 'warning':
        return 'Warning';
      default:
        return 'All Clear';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--darker-bg)]">
      {/* Animated background shapes */}
      <div className="bg-shape top-[-250px] left-[-250px] opacity-10"></div>
      <div className="bg-shape bottom-[-250px] right-[-250px] opacity-5"></div>

      {/* Sticky Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-[var(--darker-bg)]/95 backdrop-blur-lg shadow-lg' : ''
      }`}>
        <div className="responsive-container">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold neon-text tracking-wider">TSIM CONTROL</h1>
              <div className="hidden md:flex items-center space-x-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                  >
                    <span className="text-lg mr-2">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="btn-premium">
                Emergency Override
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--darker-bg)]/95 backdrop-blur-lg border-t border-white/10">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center p-2 ${
                location.pathname === item.path ? 'text-[var(--neon-cyan)]' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        <div className="responsive-container py-6">
          <Outlet />
        </div>
      </main>

      {/* Status Badge */}
      <div className="status-badge">
        <div className={`absolute inset-2 rounded-full bg-gradient-to-br ${getStatusColor()} opacity-20`}></div>
        <div className="text-center">
          <div className="text-sm font-medium mb-1">System Status</div>
          <div className="text-lg font-bold neon-text">{getStatusText()}</div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout; 