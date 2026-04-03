import React from 'react';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const onlineIndicatorSizeClasses: Record<AvatarSize, string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
};

// Generate a consistent color based on the name
const getColorFromName = (name: string | undefined): string => {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-cyan-500',
    'bg-amber-500',
  ];
  if (!name) return colors[0];
  const hash = name.charCodeAt(0) + name.length;
  return colors[hash % colors.length];
};

const getInitials = (name: string | undefined): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  online,
  className,
}) => {
  const sizeClass = sizeClasses[size];
  const onlineIndicatorSize = onlineIndicatorSizeClasses[size];
  const bgColor = getColorFromName(name);
  const initials = getInitials(name);

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center font-semibold overflow-hidden ${
          src ? 'bg-gray-200 dark:bg-gray-700' : bgColor
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white">{initials}</span>
        )}
      </div>

      {online && (
        <div
          className={`${onlineIndicatorSize} absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white dark:border-surface-900`}
        />
      )}
    </div>
  );
};

export default Avatar;
