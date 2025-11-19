import React from 'react';
import type { Zone } from '../types';

interface ZoneCardProps {
  zone: Zone;
}

const ZoneCard: React.FC<ZoneCardProps> = ({ zone }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{zone.name}</h3>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            Zone {zone.id}
          </span>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-center text-gray-600">
            <span className="font-medium mr-2">ID:</span>
            <span>{zone.id}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <span className="font-medium mr-2">Name:</span>
            <span>{zone.name}</span>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        <p className="text-sm text-gray-500">
          Use the activation panel to activate this zone with specific wind directions.
        </p>
      </div>
    </div>
  );
};

export default ZoneCard; 