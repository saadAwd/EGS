import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = 'Failed to load',
  message = 'An error occurred while loading data.',
  onRetry,
  className = ''
}) => {
  return (
    <div className={`bg-red-900/30 border border-red-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-red-300 mb-1">{title}</div>
          <div className="text-xs text-red-200 mb-3">{message}</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center space-x-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-md text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

