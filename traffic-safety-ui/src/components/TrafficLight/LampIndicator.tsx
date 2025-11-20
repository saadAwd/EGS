import React from 'react';
import { Zap } from 'lucide-react';

interface Lamp {
  id: number;
  pole_id: number;
  lamp_number: number;
  side_number: number;
  direction: string;
  gateway_id: string;
  is_on: boolean;
}

interface LampIndicatorProps {
  lamp: Lamp;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  interactive?: boolean;
  onToggle?: (lamp: Lamp) => void;
  disabled?: boolean;
  pending?: boolean;
  failed?: boolean;
  commandState?: 'queued' | 'sent' | 'ack' | 'failed';
}

const LampIndicator: React.FC<LampIndicatorProps> = ({
  lamp,
  size = 'md',
  showLabel = true,
  interactive = false,
  onToggle,
  disabled = false,
  pending = false,
  failed = false,
  commandState
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'straight':
        return '↑';
      case 'left':
        return '←';
      case 'right':
        return '→';
      default:
        return '•';
    }
  };

  const getDirectionColor = (direction: string) => {
    // All arrows are green as requested
    return 'text-green-600';
  };

  const handleClick = () => {
    if (interactive && onToggle && !disabled) {
      onToggle(lamp);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-1">
      <div
        role="button"
        tabIndex={interactive && !disabled && !pending && !failed ? 0 : -1}
        aria-label={`${lamp.gateway_id} ${lamp.direction} lamp ${lamp.is_on ? 'ON' : 'OFF'}. ${failed ? 'Command failed' : pending ? `Command ${commandState || 'pending'}` : interactive ? `Click to turn ${lamp.is_on ? 'OFF' : 'ON'}` : ''}`}
        className={`
          ${sizeClasses[size]}
          rounded-lg border-2 flex items-center justify-center font-bold
          transition-all duration-200 ease-in-out
          ${lamp.is_on 
            ? 'bg-yellow-300 border-yellow-400 shadow-lg shadow-yellow-300/50' 
            : failed
              ? 'bg-red-200 border-red-400'
              : pending
                ? 'bg-blue-200 border-blue-400 animate-pulse'
                : 'bg-white border-gray-300 hover:border-gray-400'
          }
          ${interactive && !disabled && !pending && !failed ? 'cursor-pointer hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500' : ''}
          ${disabled || pending || failed ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (interactive && !disabled && !pending && !failed && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleClick();
          }
        }}
        title={`${lamp.gateway_id}: ${lamp.direction} ${
          failed ? '(Failed)' : 
          pending ? `(${commandState || 'Pending'}...)` : 
          lamp.is_on ? '(ON)' : '(OFF)'
        }`}
      >
        <span className={`${getDirectionColor(lamp.direction)} ${lamp.is_on ? 'text-gray-800' : ''} text-lg`}>
          {getDirectionIcon(lamp.direction)}
        </span>
      </div>
      
      {showLabel && (
        <div className="text-center">
          <div className="text-xs font-medium text-gray-700">
            {lamp.gateway_id}
          </div>
          <div className="text-xs text-gray-500">
            {lamp.direction}
          </div>
        </div>
      )}
    </div>
  );
};

export default LampIndicator;
