import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1
}) => {
  const baseClasses = 'animate-pulse bg-gray-700 rounded';
  
  const variantClasses = {
    text: 'h-4',
    rectangular: '',
    circular: 'rounded-full'
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  if (variant === 'text' && lines > 1) {
    return (
      <div className={className}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses[variant]} ${i < lines - 1 ? 'mb-2' : ''}`}
            style={i === lines - 1 ? style : { width: width || '100%' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
};

// Pre-built skeleton components
export const DashboardTileSkeleton: React.FC = () => (
  <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-600 shadow-xl">
    <Skeleton variant="text" width="60%" className="mb-3" />
    <Skeleton variant="text" width="40%" height={24} />
  </div>
);

export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
  <tr>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="px-6 py-4">
        <Skeleton variant="text" width={i === 0 ? '80%' : '60%'} />
      </td>
    ))}
  </tr>
);

export const CardSkeleton: React.FC = () => (
  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
    <Skeleton variant="text" width="40%" className="mb-4" />
    <Skeleton variant="text" lines={3} />
  </div>
);

