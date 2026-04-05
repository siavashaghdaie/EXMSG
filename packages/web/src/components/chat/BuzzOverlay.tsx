import { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface BuzzOverlayProps {
  senderName: string;
  onComplete: () => void;
}

export default function BuzzOverlay({ senderName, onComplete }: BuzzOverlayProps) {
  useEffect(() => {
    // Play buzz sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Create a buzzing sound
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.setValueAtTime(220, audioCtx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.1);
      oscillator.frequency.linearRampToValueAtTime(220, audioCtx.currentTime + 0.2);
      oscillator.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio not available
    }

    // Vibrate on mobile if supported
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }

    // Auto-dismiss after animation
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center animate-buzz-overlay">
      <div className="bg-amber-500/20 backdrop-blur-sm rounded-2xl p-8 flex flex-col items-center gap-3 animate-buzz-pulse">
        <Zap size={48} className="text-amber-500 animate-bounce" />
        <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
          BUZZ from {senderName}!
        </p>
      </div>
    </div>
  );
}
