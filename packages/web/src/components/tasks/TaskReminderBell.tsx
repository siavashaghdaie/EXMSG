import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertCircle } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED' | 'BLOCKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deadline?: string;
  labels: string[];
  assignedTo: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
  };
  createdBy: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
}

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'LOW':
      return 'bg-green-100 text-green-800 border-green-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
};

const getPriorityDotColor = (priority: string): string => {
  switch (priority) {
    case 'CRITICAL':
      return 'bg-red-500';
    case 'HIGH':
      return 'bg-orange-500';
    case 'MEDIUM':
      return 'bg-yellow-500';
    case 'LOW':
      return 'bg-green-500';
    default:
      return 'bg-slate-500';
  }
};

const isDeadlineSoon = (deadline: string | undefined): boolean => {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const daysUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntilDeadline <= 2 && daysUntilDeadline >= 0;
};

const isDeadlinePassed = (deadline: string | undefined): boolean => {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  const now = new Date();
  return deadlineDate.getTime() < now.getTime();
};

export default function TaskReminderBell() {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Fetch tasks assigned to current user
  const fetchTasks = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const allTasks = await api.getTasks();

      // Filter to show only tasks assigned to current user that are NOT completed
      const userTasks = allTasks.filter(
        (t: Task) => t.assignedTo?.id === user.id && t.status !== 'COMPLETED'
      );

      setTasks(userTasks);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch tasks on mount and when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchTasks();
    }
  }, [isOpen, user?.id]);

  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        bellRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !bellRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const incompleteTasks = tasks.filter(t => t.status !== 'COMPLETED');
  const unassignedCount = incompleteTasks.length;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition ${
          isOpen
            ? 'bg-blue-50 text-blue-600'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
        title={`${unassignedCount} task${unassignedCount !== 1 ? 's' : ''} assigned`}
      >
        <Bell size={20} />

        {/* Badge */}
        {unassignedCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-6">
            {unassignedCount > 99 ? '99+' : unassignedCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Task Reminders</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-100 rounded-lg transition"
            >
              <X size={16} className="text-slate-600" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-96">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500 text-sm">Loading tasks...</div>
              </div>
            ) : incompleteTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No pending tasks</p>
              </div>
            ) : (
              <div className="space-y-2 p-3">
                {incompleteTasks.map((task: Task) => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-lg border transition group ${
                      isDeadlinePassed(task.deadline)
                        ? 'bg-red-50 border-red-200'
                        : isDeadlineSoon(task.deadline)
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Task Title and Priority */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-900 truncate">
                          {task.title}
                        </h4>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>

                    {/* Deadline */}
                    {task.deadline && (
                      <div
                        className={`flex items-center gap-1 text-xs mb-2 ${
                          isDeadlinePassed(task.deadline)
                            ? 'text-red-700 font-semibold'
                            : isDeadlineSoon(task.deadline)
                            ? 'text-yellow-700 font-semibold'
                            : 'text-slate-600'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${getPriorityDotColor(task.priority)}`} />
                        {format(new Date(task.deadline), 'MMM d')}
                        {isDeadlinePassed(task.deadline) && ' (OVERDUE)'}
                      </div>
                    )}

                    {/* Assigned By */}
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span>From: {task.createdBy?.displayName || task.createdBy?.username || 'Unknown'}</span>
                    </div>

                    {/* Status Badge */}
                    <div className="mt-2 inline-block">
                      <span className="inline-block px-2 py-0.5 text-xs bg-slate-200 text-slate-700 rounded">
                        {task.status === 'NOT_STARTED' && 'Not Started'}
                        {task.status === 'IN_PROGRESS' && 'In Progress'}
                        {task.status === 'PENDING_REVIEW' && 'Pending Review'}
                        {task.status === 'BLOCKED' && 'Blocked'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
