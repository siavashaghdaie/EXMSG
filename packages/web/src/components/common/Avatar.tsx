import React from 'react';
import { usePresenceStore } from '@/store/presenceStore';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  userId?: string;
  showPresence?: boolean;
  className?: string;
  username?: string;
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

const getInitials = (name: string | undefined, username: string | undefined): string => {
  if (name) {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (username) {
    return username.charAt(0).toUpperCase();
  }
  // Fallback to generic user icon representation
  return 'U';
};

// Check if this is the Linda AI bot
const isLindaBot = (name: string | undefined, username: string | undefined): boolean => {
  return username === 'linda' || name === 'Linda AI' || name === 'Linda';
};

// Check if this is the TransGuy AI bot
const isTransGuyBot = (name: string | undefined, username: string | undefined): boolean => {
  return username === 'transguy' || name === 'TransGuy' || name === 'TransGuy AI';
};

// Linda AI icon SVG — a distinct bot/AI avatar
const LindaAIIcon: React.FC<{ size: AvatarSize }> = ({ size }) => {
  const dims: Record<AvatarSize, number> = { sm: 18, md: 22, lg: 26, xl: 34 };
  const d = dims[size];
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Brain/circuit icon */}
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="none"/>
      {/* Central node */}
      <circle cx="12" cy="12" r="2.5" fill="white" opacity="0.95"/>
      {/* Orbiting nodes */}
      <circle cx="12" cy="5.5" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="17.5" cy="9" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="17.5" cy="15.5" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="12" cy="18.5" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="6.5" cy="15.5" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="6.5" cy="9" r="1.5" fill="white" opacity="0.8"/>
      {/* Connection lines */}
      <line x1="12" y1="9.5" x2="12" y2="7" stroke="white" strokeWidth="1" opacity="0.6"/>
      <line x1="14.2" y1="10.8" x2="16.2" y2="9.8" stroke="white" strokeWidth="1" opacity="0.6"/>
      <line x1="14.2" y1="13.5" x2="16.2" y2="14.8" stroke="white" strokeWidth="1" opacity="0.6"/>
      <line x1="12" y1="14.5" x2="12" y2="17" stroke="white" strokeWidth="1" opacity="0.6"/>
      <line x1="9.8" y1="13.5" x2="7.8" y2="14.8" stroke="white" strokeWidth="1" opacity="0.6"/>
      <line x1="9.8" y1="10.8" x2="7.8" y2="9.8" stroke="white" strokeWidth="1" opacity="0.6"/>
      {/* Sparkle accent */}
      <path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5L19 3z" fill="white" opacity="0.7"/>
    </svg>
  );
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  online,
  userId,
  showPresence,
  className,
  username,
}) => {
  const sizeClass = sizeClasses[size];
  const onlineIndicatorSize = onlineIndicatorSizeClasses[size];
  const bgColor = getColorFromName(name);
  const initials = getInitials(name, username);
  const isLinda = isLindaBot(name, username);
  const isTransGuy = isTransGuyBot(name, username);

  // Use store for presence if userId and showPresence are provided, otherwise fall back to online prop
  // Linda and TransGuy bots are always online
  const isUserOnline = usePresenceStore((s) => userId ? s.onlineUsers.has(userId) : null);
  const isAgentBot = isLinda || isTransGuy;
  const shouldShowOnline = isAgentBot ? true : (showPresence && userId && isUserOnline !== null ? isUserOnline : online);

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      <div
        className={`${sizeClass} aspect-square rounded-full flex items-center justify-center font-semibold overflow-hidden ${
          isLinda
            ? 'bg-gradient-to-br from-violet-500 to-blue-500'
            : src ? 'bg-gray-200 dark:bg-gray-700' : bgColor
        }`}
      >
        {isLinda ? (
          <LindaAIIcon size={size} />
        ) : src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white">{initials}</span>
        )}
      </div>

      {shouldShowOnline && (
        <div
          className={`${onlineIndicatorSize} absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white dark:border-surface-900`}
        />
      )}
    </div>
  );
};

export default Avatar;
