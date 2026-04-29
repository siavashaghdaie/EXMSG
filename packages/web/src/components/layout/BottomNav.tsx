import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, ClipboardList, Building2, Settings } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface BottomNavProps {
  onCallsClick?: () => void;
  onPlannerClick?: () => void;
  onOfficeClick?: () => void;
  onSettingsClick?: () => void;
  onChatsClick?: () => void;
  visible?: boolean;
  taskCount?: number;
  activeTab?: string; // Override active tab detection (e.g. when sub-page is open)
}

export const BottomNav: React.FC<BottomNavProps> = ({
  onCallsClick,
  onPlannerClick,
  onOfficeClick,
  onSettingsClick,
  onChatsClick,
  visible,
  taskCount,
  activeTab: activeTabOverride,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems: NavItem[] = [
    {
      id: 'chats',
      label: 'Chats',
      icon: <MessageSquare size={24} />,
      path: '/chat',
    },
    {
      id: 'calls',
      label: 'Calls',
      icon: <Phone size={24} />,
      path: '/calls',
    },
    {
      id: 'planner',
      label: 'Planner',
      icon: <ClipboardList size={24} />,
      path: '/planner',
    },
    {
      id: 'office',
      label: 'Office',
      icon: <Building2 size={24} />,
      path: '/office',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={24} />,
      path: '/settings',
    },
  ];

  const getActiveTab = (): string => {
    const path = location.pathname;
    if (path.includes('/chat')) return 'chats';
    if (path.includes('/calls')) return 'calls';
    if (path.includes('/planner')) return 'planner';
    if (path.includes('/office')) return 'office';
    if (path.includes('/settings')) return 'settings';
    return 'chats';
  };

  const activeTab = activeTabOverride || getActiveTab();

  // Only show on mobile and when visible is not explicitly false
  if (!isMobile || visible === false) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-900 border-t border-gray-200 dark:border-surface-700 z-20">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'calls') {
                  onCallsClick?.();
                } else if (item.id === 'planner') {
                  onPlannerClick?.();
                } else if (item.id === 'office') {
                  onOfficeClick?.();
                } else if (item.id === 'settings') {
                  onSettingsClick ? onSettingsClick() : navigate(item.path);
                } else if (item.id === 'chats') {
                  onChatsClick ? onChatsClick() : navigate(item.path);
                } else {
                  navigate(item.path);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-2 transition-colors min-h-[48px] relative ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title={item.label}
            >
              <span className="relative">
                {item.icon}
                {item.id === 'planner' && typeof taskCount === 'number' && taskCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-none shadow-sm border-2 border-white dark:border-surface-900">
                    {taskCount > 9 ? '9+' : taskCount}
                  </span>
                )}
              </span>
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
