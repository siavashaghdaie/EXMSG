import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Loader2, Search, Filter } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import TaskCard from '@/components/tasks/TaskCard';
import TaskFormModal from '@/components/tasks/TaskFormModal';

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
  orderedBy?: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
  } | null;
  lindaFollowing?: boolean;
  lindaFollowInterval?: string;
  conversationId?: string;
  reactions?: Array<{ id: string; userId: string; type: string }>;
  _count?: { comments: number };
  archived?: boolean;
  deleted?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

type TaskFilter = 'my-tasks' | 'assigned-by-me' | 'department' | 'project' | 'all';
type StatusKey = 'active' | 'archived' | 'deleted';

interface TaskWallProps {
  onClose?: () => void;
}

const TaskWall: React.FC<TaskWallProps> = ({ onClose }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>('my-tasks');
  const [view] = useState<'list' | 'kanban'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // TaskFormModal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  // Filter sub-selectors
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
  const [statusChecked, setStatusChecked] = useState<Set<StatusKey>>(new Set(['active']));

  // Handle resize for mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch tasks
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter === 'department') {
        params.view = 'department';
        if (selectedDeptFilter) params.departmentId = selectedDeptFilter;
      } else if (filter === 'project') {
        params.view = 'project';
        if (selectedProjectFilter) params.projectId = selectedProjectFilter;
      }
      // Always fetch everything, filter client-side for checkbox combos
      params.showAll = 'true';
      const allTasks = await api.getTasks(params);

      // Client-side status filter
      let filtered = allTasks.filter((t: any) => {
        if (t.deleted) return statusChecked.has('deleted');
        if (t.archived) return statusChecked.has('archived');
        return statusChecked.has('active');
      });
      if (filter === 'my-tasks') {
        filtered = allTasks.filter((t: any) => t.assignedToId === user?.id);
      } else if (filter === 'assigned-by-me') {
        filtered = allTasks.filter((t: any) => t.createdById === user?.id);
      }

      if (searchQuery) {
        filtered = filtered.filter((t: any) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setTasks(filtered);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filter, searchQuery, selectedDeptFilter, selectedProjectFilter, statusChecked]);

  // Load departments and projects for selectors
  useEffect(() => {
    api.getDepartments().then((res) => {
      setDepartments(res?.departments?.map((d: any) => ({ id: d.id, name: d.name })) || []);
    }).catch(() => {});
    api.getProjects().then((res) => {
      setProjects(res?.projects?.map((p: any) => ({ id: p.id, name: p.name })) || []);
    }).catch(() => {});
  }, []);

  // Handle delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  // Handle archive task
  const handleArchiveTask = async (taskId: string, archive: boolean) => {
    try {
      await api.updateTask(taskId, { archived: archive });
      await fetchTasks();
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to archive task:', error);
      alert('Failed to archive task');
    }
  };

  // Handle restore task (undo delete or unarchive)
  const handleRestoreTask = async (taskId: string) => {
    try {
      await api.restoreTask(taskId);
      await fetchTasks();
      window.dispatchEvent(new Event('badges:refresh'));
      window.dispatchEvent(new Event('conversations:refresh'));
    } catch (error) {
      console.error('Failed to restore task:', error);
      alert('Failed to restore task');
    }
  };

  // Handle status change
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const updated = await api.updateTask(taskId, { status: newStatus });
      setTasks(tasks.map(t => t.id === updated.id ? updated : t));
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  // Edit task — open TaskFormModal
  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setShowFormModal(true);
  };

  // Reaction handler
  const handleReact = async (taskId: string, type: 'like' | 'dislike') => {
    try {
      await api.reactToTask(taskId, type);
      const data = await api.getTasks(filter === 'my-tasks' ? {} : { view: 'all' });
      setTasks(data || []);
    } catch (err) {
      console.error('React error:', err);
    }
  };

  // Navigate to chat with a user
  const handleChatWithUser = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    try {
      const conv = await api.createConversation([targetUserId]);
      onClose?.();
      navigate(`/chat/${conv.id}`);
    } catch (err) {
      console.error('Failed to open chat:', err);
    }
  };

  // Navigate to a chat conversation (close task wall first so chat is visible)
  const handleNavigateToChat = (convId: string) => {
    onClose?.();
    navigate(`/chat/${convId}`);
  };

  // Attachment handlers
  const handleAddAttachment = async (taskId: string, data: { type: string; name: string; url: string }) => {
    try {
      await api.addTaskAttachment(taskId, data);
      await fetchTasks();
    } catch (err) {
      console.error('Add attachment error:', err);
    }
  };

  const handleDeleteAttachment = async (taskId: string, attachmentId: string) => {
    try {
      await api.deleteTaskAttachment(taskId, attachmentId);
      await fetchTasks();
    } catch (err) {
      console.error('Delete attachment error:', err);
    }
  };

  // Start chat for a task
  const handleStartChat = async (taskId: string): Promise<string | null> => {
    try {
      const res = await api.createTaskConversation(taskId);
      if (res?.conversationId) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, conversationId: res.conversationId } : t));
        window.dispatchEvent(new Event('conversations:refresh'));
        return res.conversationId;
      }
    } catch (err) {
      console.error('Failed to create task chat:', err);
      alert('Failed to create chat room');
    }
    return null;
  };

  // Kanban view
  const statusColumns = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'];
  const statusLabels: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    PENDING_REVIEW: 'Pending Review',
    COMPLETED: 'Completed',
    BLOCKED: 'Blocked',
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-surface-950">
      {/* Header */}
      <div className="bg-white dark:bg-surface-900 border-b border-gray-200 dark:border-surface-700 px-4 py-3 md:py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isMobile && onClose && (
              <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-surface-800 rounded">
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            )}
            <h1 className={`font-bold text-gray-900 dark:text-white ${isMobile ? 'text-lg' : 'text-2xl'}`}>
              Task Wall
            </h1>
          </div>
          <button
            onClick={() => { setEditingTask(null); setShowFormModal(true); }}
            className="flex items-center gap-2 bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600 text-white px-3 md:px-4 py-2 rounded-lg font-medium transition-colors text-sm md:text-base"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Create Task</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        {/* Filter tabs */}
        <div className={`flex gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
          {(['my-tasks', 'assigned-by-me', 'department', 'project', 'all'] as const).map((filterOption) => {
            const labels: Record<TaskFilter, string> = {
              'my-tasks': 'Assigned',
              'assigned-by-me': 'Planned',
              'department': 'Department',
              'project': 'Project',
              'all': 'All',
            };
            return (
              <button
                key={filterOption}
                onClick={() => { setFilter(filterOption); setSelectedDeptFilter(''); setSelectedProjectFilter(''); }}
                className={`px-3 md:px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                  filter === filterOption
                    ? 'bg-primary-600 dark:bg-primary-500 text-white'
                    : 'bg-gray-200 dark:bg-surface-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-surface-700'
                }`}
              >
                {labels[filterOption]}
              </button>
            );
          })}
        </div>

        {/* Department/Project sub-filter */}
        {filter === 'department' && departments.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            <button
              onClick={() => setSelectedDeptFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${!selectedDeptFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400'}`}
            >All Departments</button>
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDeptFilter(d.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedDeptFilter === d.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400'}`}
              >{d.name}</button>
            ))}
          </div>
        )}
        {filter === 'project' && projects.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            <button
              onClick={() => setSelectedProjectFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${!selectedProjectFilter ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400'}`}
            >All Projects</button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProjectFilter(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedProjectFilter === p.id ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400'}`}
              >{p.name}</button>
            ))}
          </div>
        )}

        {/* Status filter — checkbox combos like Excel */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-surface-700">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Show:</span>
          {([
            { key: 'active' as StatusKey, label: 'Active', dotColor: 'bg-green-500' },
            { key: 'archived' as StatusKey, label: 'Archived', dotColor: 'bg-amber-500' },
            { key: 'deleted' as StatusKey, label: 'Deleted', dotColor: 'bg-red-500' },
          ]).map(({ key, label, dotColor }) => {
            const checked = statusChecked.has(key);
            return (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setStatusChecked(prev => {
                      const next = new Set(prev);
                      if (next.has(key)) { next.delete(key); } else { next.add(key); }
                      if (next.size === 0) next.add('active'); // at least one must be checked
                      return next;
                    });
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className={`text-xs font-medium ${checked ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading tasks...</p>
          </div>
        </div>
      ) : isMobile ? (
        <div className="flex-1 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">No tasks found in this filter</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Try switching to the 'All' tab to see all tasks</p>
              <button
                onClick={() => { setEditingTask(null); setShowFormModal(true); }}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
                Create your first task
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isMobile={isMobile}
                  currentUserId={user?.id || ''}
                  onDelete={handleDeleteTask}
                  onEdit={handleEditTask}
                  onStatusChange={handleStatusChange}
                  onReact={handleReact}
                  onChatWithUser={handleChatWithUser}
                  onNavigateToChat={handleNavigateToChat}
                  onStartChat={handleStartChat}
                  onAddAttachment={handleAddAttachment}
                  onDeleteAttachment={handleDeleteAttachment}
                  onArchive={handleArchiveTask}
                  onRestore={(statusChecked.has('archived') || statusChecked.has('deleted')) ? handleRestoreTask : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : view === 'kanban' ? (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="grid grid-cols-4 gap-4">
            {statusColumns.map((status) => {
              const statusTasks = tasks.filter(t => t.status === status);
              return (
                <div key={status} className="bg-white dark:bg-surface-800 rounded-lg p-4 flex flex-col">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
                    {statusLabels[status]} ({statusTasks.length})
                  </h3>
                  <div className="flex-1 overflow-y-auto">
                    {statusTasks.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-xs text-center py-4">No tasks</p>
                    ) : (
                      statusTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isMobile={false}
                          currentUserId={user?.id || ''}
                          onDelete={handleDeleteTask}
                          onEdit={handleEditTask}
                          onStatusChange={handleStatusChange}
                          onReact={handleReact}
                          onChatWithUser={handleChatWithUser}
                          onNavigateToChat={handleNavigateToChat}
                          onStartChat={handleStartChat}
                          onAddAttachment={handleAddAttachment}
                          onDeleteAttachment={handleDeleteAttachment}
                          onArchive={handleArchiveTask}
                          onRestore={(statusChecked.has('archived') || statusChecked.has('deleted')) ? handleRestoreTask : undefined}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">No tasks found in this filter</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Try switching to the 'All' tab to see all tasks</p>
              <button
                onClick={() => { setEditingTask(null); setShowFormModal(true); }}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
                Create your first task
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isMobile={false}
                  currentUserId={user?.id || ''}
                  onDelete={handleDeleteTask}
                  onEdit={handleEditTask}
                  onStatusChange={handleStatusChange}
                  onReact={handleReact}
                  onChatWithUser={handleChatWithUser}
                  onNavigateToChat={handleNavigateToChat}
                  onStartChat={handleStartChat}
                  onAddAttachment={handleAddAttachment}
                  onDeleteAttachment={handleDeleteAttachment}
                  onArchive={handleArchiveTask}
                  onRestore={(statusChecked.has('archived') || statusChecked.has('deleted')) ? handleRestoreTask : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Task Modal — uses shared TaskFormModal */}
      <TaskFormModal
        visible={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingTask(null); }}
        onSave={async () => {
          await fetchTasks();
          window.dispatchEvent(new Event('badges:refresh'));
        }}
        editingTask={editingTask}
      />
    </div>
  );
};

export default TaskWall;
