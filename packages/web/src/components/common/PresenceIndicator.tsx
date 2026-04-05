import { usePresenceStore } from '@/store/presenceStore';
import { formatDistanceToNow } from 'date-fns';

interface PresenceIndicatorProps {
  userId: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function PresenceIndicator({ userId, showText = false, size = 'sm' }: PresenceIndicatorProps) {
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(userId));
  const lastSeen = usePresenceStore((s) => s.lastSeen.get(userId));

  const dotSize = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
  }[size];

  const borderSize = {
    sm: 'border',
    md: 'border-2',
    lg: 'border-2',
  }[size];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${dotSize} rounded-full ${borderSize} border-white dark:border-slate-800 ${
          isOnline ? 'bg-green-500' : 'bg-slate-400'
        }`}
      />
      {showText && (
        <span className="text-xs text-slate-500">
          {isOnline
            ? 'Online'
            : lastSeen
            ? `Last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`
            : 'Offline'}
        </span>
      )}
    </span>
  );
}
