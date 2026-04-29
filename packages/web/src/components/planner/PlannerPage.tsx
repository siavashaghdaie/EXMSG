import React, { useState } from 'react';
import { ArrowLeft, ClipboardList, FolderKanban } from 'lucide-react';
import TaskWall from '@/components/tasks/TaskWall';
import ProjectsPage from '@/components/projects/ProjectsPage';

interface PlannerPageProps {
  onClose: () => void;
  initialTab?: 'tasks' | 'projects';
}

export default function PlannerPage({ onClose, initialTab = 'tasks' }: PlannerPageProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'projects'>(initialTab);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-surface-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 dark:hover:bg-surface-700 rounded-lg transition"
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Planner</h1>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-surface-700 flex-shrink-0">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition border-b-2 ${
            activeTab === 'tasks'
              ? 'text-primary-600 border-primary-600'
              : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ClipboardList size={18} />
          Tasks
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition border-b-2 ${
            activeTab === 'projects'
              ? 'text-primary-600 border-primary-600'
              : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FolderKanban size={18} />
          Projects
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' ? (
          <TaskWall onClose={() => {}} embedded />
        ) : (
          <ProjectsPage onClose={() => {}} embedded />
        )}
      </div>
    </div>
  );
}
