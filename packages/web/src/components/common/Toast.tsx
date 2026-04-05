import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'error',
  onClose,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 300);
  };

  const config = {
    error: {
      bg: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-900/30',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: <Info className="w-5 h-5 text-blue-500" />,
    },
  };

  const c = config[type];

  return (
    <div
      className={`fixed top-4 left-1/2 z-[200] transition-all duration-300 ease-out ${
        isVisible && !isLeaving
          ? 'opacity-100 -translate-x-1/2 translate-y-0'
          : 'opacity-0 -translate-x-1/2 -translate-y-4'
      }`}
      style={{ maxWidth: 'calc(100vw - 32px)', width: '420px' }}
    >
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border ${c.bg} ${c.border} backdrop-blur-sm`}>
        <span className="flex-shrink-0 mt-0.5">{c.icon}</span>
        <p className={`flex-1 text-sm font-medium ${c.text}`}>{message}</p>
        <button
          onClick={handleClose}
          className={`flex-shrink-0 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition ${c.text}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
