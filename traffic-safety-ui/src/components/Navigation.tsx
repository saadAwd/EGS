import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { id: '/', label: 'Dashboard', icon: '🏠' },
    { id: '/devices', label: 'Device Manager', icon: '📱' },
    { id: '/activation', label: 'Activation Panel', icon: '🚨' },
    { id: '/map', label: 'Map View', icon: '🗺️' }
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex space-x-8">
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={item.id}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentPath === item.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navigation; 