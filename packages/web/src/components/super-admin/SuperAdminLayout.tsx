import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  Activity,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useSuperAdminStore } from '@/store/superAdminStore';
import SuperAdminDashboard from './SuperAdminDashboard';
import SuperAdminOrgs from './SuperAdminOrgs';
import SuperAdminUsers from './SuperAdminUsers';
import SuperAdminFinancial from './SuperAdminFinancial';
import SuperAdminActivity from './SuperAdminActivity';

const SuperAdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useSuperAdminStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { label: 'Dashboard', path: '/omnilink-backoffice-x7k9', icon: LayoutDashboard },
    { label: 'Organizations', path: '/admin/organizations', icon: Building2 },
    { label: 'Users', path: '/admin/users', icon: Users },
    { label: 'Financial', path: '/admin/financial', icon: DollarSign },
    { label: 'Activity', path: '/admin/activity', icon: Activity },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/omnilink-backoffice-x7k9/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-800 border-r border-slate-700 transition-all duration-300 fixed h-screen flex flex-col z-40`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="text-xl font-bold text-white">OmniLink</h1>
              <p className="text-xs text-slate-400">Back Office</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700'
              }`}
              title={!sidebarOpen ? item.label : ''}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </a>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 w-full px-4 py-3 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`${sidebarOpen ? 'ml-64' : 'ml-20'} flex-1 transition-all duration-300`}>
        {/* Top Bar */}
        <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
          <div className="px-8 py-4">
            <h2 className="text-2xl font-bold text-white">OmniLink Back Office</h2>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<SuperAdminDashboard />} />
            <Route path="/organizations" element={<SuperAdminOrgs />} />
            <Route path="/users" element={<SuperAdminUsers />} />
            <Route path="/financial" element={<SuperAdminFinancial />} />
            <Route path="/activity" element={<SuperAdminActivity />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;
