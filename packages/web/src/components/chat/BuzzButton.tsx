import { useState, useCallback } from 'react';
import { Zap } from 'lucide-react';

interface BuzzButtonProps {
  conversationId: string;
  onBuzz: (conversationId: string) => void;
  disabled?: boolean;
}

export default function BuzzButton({ conversationId, onBuzz, disabled }: BuzzButtonProps) {
  const [cooldown, setCooldown] = useState(false);

  const handleBuzz = useCallback(() => {
    if (cooldown || disabled) return;
    onBuzz(conversationId);
    setCooldown(true);
    // 10 second cooldown to prevent spam
    setTimeout(() => setCooldown(false), 10000);
  }, [conversationId, onBuzz, cooldown, disabled]);

  return (
    <button
      onClick={handleBuzz}
      disabled={cooldown || disabled}
      className={`p-2 rounded-lg transition flex-shrink-0 ${
        cooldown
          ? 'bg-amber-100 text-amber-400 cursor-not-allowed'
          : 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 active:scale-95'
      }`}
      title={cooldown ? 'Buzz sent! Wait 10s...' : 'Send BUZZ!'}
    >
      <Zap size={20} className={cooldown ? 'animate-pulse' : ''} />
    </button>
  );
}
