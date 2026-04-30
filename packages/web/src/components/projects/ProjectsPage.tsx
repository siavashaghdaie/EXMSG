import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, X, GitBranch, HardDrive, Target,
  Users, UserCheck, Trash2, ExternalLink, FolderKanban,
  Archive, RotateCcw, CheckSquare, Calendar,
  UserPlus, Pencil,
  BarChart3, Settings, MessageSquare,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import TaskFormModal from '@/components/tasks/TaskFormModal';
import TaskCard from '@/components/tasks/TaskCard';

interface ProjectsPageProps {
  onClose: () => void;
  embedded?: boolean;
}

interface ChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  completed: boolean;
  position: number;
  assigneeId?: string;
  dueDate?: string;
}

interface Checklist {
  id: string;
  taskId?: string;
  projectId?: string;
  title: string;
  position: number;
  items: ChecklistItem[];
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  labels: string[];
  archived?: boolean;
  deleted?: boolean;
  assignedTo?: { id: string; displayName: string; username: string; avatarUrl?: string };
  createdBy?: { id: string; displayName: string; username: string; avatarUrl?: string };
  department?: { id: string; name: string };
  createdAt: string;
  reactions?: Array<{ id: string; userId: string; type: string }>;
  _count?: { comments: number };
  checklists?: Checklist[];
}

interface Project {
  id: string;
  name: string;
  description?: string;
  specsAndGoals?: string;
  gitUrl?: string;
  storageUrl?: string;
  avatarUrl?: string;
  status: string;
  teamLead?: { id: string; username: string; displayName: string; avatarUrl?: string };
  createdBy: { id: string; username: string; displayName: string; avatarUrl?: string };
  members: Array<{ id: string; role: string; user: { id: string; username: string; displayName: string; avatarUrl?: string; email: string } }>;
  conversationId?: string;
  _count: { tasks: number; members: number };
  tasks?: TaskData[];
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'detail' | 'board' | 'roadmap';

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const ProjectsPage: React.FC<ProjectsPageProps> = ({ onClose, embedded: _embedded }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectMates, setProjectMates] = useState<any[]>([]);

  // Create project form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', description: '', specsAndGoals: '', gitUrl: '', storageUrl: '', teamLeadId: '',
  });
  const [creating, setCreating] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<any[]>([]);

  // Task detail modal
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  // New task form (legacy inline - replaced by TaskFormModal)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_showNewTask, setShowNewTask] = useState<string | null>(null);
  const [ganttNoDeadlineMode, setGanttNoDeadlineMode] = useState<'bar' | 'milestone'>('bar');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_newTaskAssigneeSearch, setNewTaskAssigneeSearch] = useState('');

  // Full task form modal (shared component)
  const [showTaskFormModal, setShowTaskFormModal] = useState(false);
  const [taskFormDefaultStatus, setTaskFormDefaultStatus] = useState<string>('NOT_STARTED');
  const [taskFormEditingTask, setTaskFormEditingTask] = useState<any>(null);

  // Edit task inline
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Checklist
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newItemTitles, setNewItemTitles] = useState<Record<string, string>>({});

  // Task status filter: multi-select checkboxes
  const [taskStatusChecked, setTaskStatusChecked] = useState<Set<string>>(new Set(['active']));

  // Edit project in list view
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({
    name: '', description: '', specsAndGoals: '', gitUrl: '', storageUrl: '', status: 'ACTIVE',
  });

  // Edit project in detail view
  const [editingDetail, setEditingDetail] = useState(false);
  const [detailForm, setDetailForm] = useState({
    name: '', description: '', specsAndGoals: '', gitUrl: '', storageUrl: '', status: 'ACTIVE',
  });

  const handleChatWithUser = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    try {
      const conv = await api.createConversation([targetUserId]);
      onClose();
      navigate(`/chat/${conv.id}`);
    } catch (err) { console.error('Failed to open chat:', err); }
  };

  // Navigate to a chat conversation (close projects page first so chat is visible)
  const handleNavigateToChat = (convId: string) => {
    onClose();
    navigate(`/chat/${convId}`);
  };

  // Create or navigate to a project chat room
  const handleStartProjectChat = async (project: Project) => {
    try {
      if (project.conversationId) {
        handleNavigateToChat(project.conversationId);
        return;
      }
      const res = await api.createProjectConversation(project.id);
      // Update local state so the button shows "Chat" next time
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, conversationId: res.conversationId } : p));
      if (selectedProject?.id === project.id) {
        setSelectedProject({ ...selectedProject, conversationId: res.conversationId } as Project);
      }
      handleNavigateToChat(res.conversationId);
    } catch (err) {
      console.error('Failed to start project chat:', err);
    }
  };

  const handleReactTask = async (taskId: string, type: 'like' | 'dislike') => {
    try {
      await api.reactToTask(taskId, type);
      if (selectedProject) {
        const res = await api.getProject(selectedProject.id);
        setSelectedProject(res.project);
      }
    } catch (err) { console.error('React error:', err); }
  };

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProjects({ search: searchQuery || undefined });
      setProjects(res.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadProjectMates = useCallback(async () => {
    try {
      const res = await api.getProjectMates();
      setProjectMates(res.mates || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProjects();
    loadProjectMates();
  }, [loadProjects, loadProjectMates]);

  const openProjectDetail = async (projectId: string) => {
    try {
      const res = await api.getProject(projectId);
      setSelectedProject(res.project);
      setViewMode('detail');
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const openProjectBoard = async (projectId: string) => {
    try {
      const res = await api.getProject(projectId);
      setSelectedProject(res.project);
      setViewMode('board');
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const refreshProject = async () => {
    if (!selectedProject) return;
    try {
      const res = await api.getProject(selectedProject.id);
      setSelectedProject(res.project);
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await api.createProject({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        specsAndGoals: createForm.specsAndGoals.trim() || undefined,
        gitUrl: createForm.gitUrl.trim() || undefined,
        storageUrl: createForm.storageUrl.trim() || undefined,
        teamLeadId: createForm.teamLeadId || undefined,
      });
      setCreateForm({ name: '', description: '', specsAndGoals: '', gitUrl: '', storageUrl: '', teamLeadId: '' });
      setShowCreate(false);
      loadProjects();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Tasks will be unlinked but not deleted.`)) return;
    try {
      await api.deleteProject(projectId);
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setViewMode('list');
      }
      loadProjects();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete');
    }
  };

  const handleUpdateProject = async (projectId: string) => {
    try {
      await api.updateProject(projectId, {
        name: editProjectForm.name.trim(),
        description: editProjectForm.description.trim() || undefined,
        specsAndGoals: editProjectForm.specsAndGoals.trim() || undefined,
        gitUrl: editProjectForm.gitUrl.trim() || undefined,
        storageUrl: editProjectForm.storageUrl.trim() || undefined,
        status: editProjectForm.status,
      });
      setEditingProjectId(null);
      loadProjects();
      if (selectedProject?.id === projectId) await refreshProject();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update project');
    }
  };

  const handleUpdateProjectDetail = async () => {
    if (!selectedProject) return;
    try {
      await api.updateProject(selectedProject.id, {
        name: detailForm.name.trim(),
        description: detailForm.description.trim() || undefined,
        specsAndGoals: detailForm.specsAndGoals.trim() || undefined,
        gitUrl: detailForm.gitUrl.trim() || undefined,
        storageUrl: detailForm.storageUrl.trim() || undefined,
        status: detailForm.status,
      });
      setEditingDetail(false);
      await refreshProject();
      loadProjects();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update project');
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedProject) return;
    try {
      await api.addProjectMember(selectedProject.id, userId);
      await refreshProject();
      setMemberSearch('');
      setMemberResults([]);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedProject) return;
    try {
      await api.removeProjectMember(selectedProject.id, userId);
      await refreshProject();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to remove member');
    }
  };

  // ─── Task CRUD ──────────────────────────────────────────────────
  // @ts-ignore - kept for potential future use
  const _handleCreateTask = async (status: string) => {
    if (!newTaskTitle.trim() || !selectedProject) return;
    try {
      await api.createTask({
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        projectId: selectedProject.id,
        assignedToId: newTaskAssignee || user?.id,
        priority: newTaskPriority,
        deadline: newTaskDeadline || undefined,
        ...(status !== 'NOT_STARTED' && { status }),
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskAssignee('');
      setNewTaskPriority('MEDIUM');
      setNewTaskDeadline('');
      setNewTaskAssigneeSearch('');
      setShowNewTask(null);
      await refreshProject();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create task');
    }
  };

  const handleUpdateTask = async (taskId: string, data: any) => {
    try {
      const updated = await api.updateTask(taskId, data);
      await refreshProject();
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, ...updated });
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task permanently?')) return;
    try {
      await api.deleteTask(taskId);
      setShowTaskDetail(false);
      setSelectedTask(null);
      await refreshProject();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete task');
    }
  };

  const handleArchiveTask = async (taskId: string, archive: boolean) => {
    await handleUpdateTask(taskId, { archived: archive });
  };

  const handleRestoreTask = async (taskId: string) => {
    try {
      await api.restoreTask(taskId);
      await loadProjects();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to restore task');
    }
  };

  // ─── Checklist CRUD ─────────────────────────────────────────────
  const handleCreateChecklist = async (taskId: string) => {
    if (!newChecklistTitle.trim()) return;
    try {
      await api.createChecklist({ taskId, title: newChecklistTitle.trim() });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      await refreshProject();
      // Refresh task detail
      if (selectedTask) {
        const res = await api.getChecklists({ taskId });
        setSelectedTask({ ...selectedTask, checklists: res.checklists });
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create checklist');
    }
  };

  const handleDeleteChecklist = async (checklistId: string) => {
    if (!confirm('Delete this checklist?')) return;
    try {
      await api.deleteChecklist(checklistId);
      if (selectedTask) {
        const res = await api.getChecklists({ taskId: selectedTask.id });
        setSelectedTask({ ...selectedTask, checklists: res.checklists });
      }
    } catch { /* ignore */ }
  };

  const handleAddChecklistItem = async (checklistId: string) => {
    const title = newItemTitles[checklistId];
    if (!title?.trim()) return;
    try {
      await api.addChecklistItem(checklistId, { title: title.trim() });
      setNewItemTitles({ ...newItemTitles, [checklistId]: '' });
      if (selectedTask) {
        const res = await api.getChecklists({ taskId: selectedTask.id });
        setSelectedTask({ ...selectedTask, checklists: res.checklists });
      }
    } catch { /* ignore */ }
  };

  const handleToggleItem = async (checklistId: string, itemId: string) => {
    try {
      await api.toggleChecklistItem(checklistId, itemId);
      if (selectedTask) {
        const res = await api.getChecklists({ taskId: selectedTask.id });
        setSelectedTask({ ...selectedTask, checklists: res.checklists });
      }
    } catch { /* ignore */ }
  };

  const handleDeleteChecklistItem = async (checklistId: string, itemId: string) => {
    try {
      await api.deleteChecklistItem(checklistId, itemId);
      if (selectedTask) {
        const res = await api.getChecklists({ taskId: selectedTask.id });
        setSelectedTask({ ...selectedTask, checklists: res.checklists });
      }
    } catch { /* ignore */ }
  };

  // Search users for adding to project
  useEffect(() => {
    if (!memberSearch || memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(memberSearch);
        setMemberResults(results.filter((u: any) => u.id !== user?.id));
      } catch { setMemberResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, user?.id]);

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  const taskStatusGroups = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'BLOCKED'];
  const taskStatusLabels: Record<string, string> = {
    NOT_STARTED: 'To Do', IN_PROGRESS: 'In Progress', PENDING_REVIEW: 'Review', COMPLETED: 'Done', BLOCKED: 'Blocked',
  };
  const taskStatusColors: Record<string, string> = {
    NOT_STARTED: 'bg-gray-100 dark:bg-gray-800', IN_PROGRESS: 'bg-blue-50 dark:bg-blue-900/20',
    PENDING_REVIEW: 'bg-amber-50 dark:bg-amber-900/20', COMPLETED: 'bg-green-50 dark:bg-green-900/20',
    BLOCKED: 'bg-red-50 dark:bg-red-900/20',
  };

  const getChecklistProgress = (checklists?: Checklist[]) => {
    if (!checklists || checklists.length === 0) return null;
    let total = 0;
    let done = 0;
    checklists.forEach(cl => {
      cl.items.forEach(item => {
        total++;
        if (item.completed) done++;
      });
    });
    if (total === 0) return null;
    return { total, done, percent: Math.round((done / total) * 100) };
  };

  // ─── Task Detail Modal ───────────────────────────────────────────
  const renderTaskDetailModal = () => {
    if (!showTaskDetail || !selectedTask) return null;
    const task = selectedTask;
    const progress = getChecklistProgress(task.checklists);

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-16 overflow-y-auto" onClick={() => setShowTaskDetail(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl mx-4 mb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {editingTask === task.id ? (
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    onBlur={() => {
                      if (editForm.title?.trim()) handleUpdateTask(task.id, { title: editForm.title.trim() });
                      setEditingTask(null);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="text-lg font-bold text-slate-900 dark:text-white bg-transparent border-b-2 border-violet-500 focus:outline-none w-full"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="text-lg font-bold text-slate-900 dark:text-white cursor-pointer hover:text-violet-600 dark:hover:text-violet-400"
                    onClick={() => { setEditingTask(task.id); setEditForm({ title: task.title }); }}
                  >
                    {task.title}
                  </h2>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                  {task.createdAt && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Calendar size={12} /> {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  {task.deadline && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      → {new Date(task.deadline).toLocaleDateString()}
                    </span>
                  )}
                  {progress && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <CheckSquare size={12} /> {progress.done}/{progress.total}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleArchiveTask(task.id, !task.archived)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                  title={task.archived ? 'Unarchive' : 'Archive'}
                >
                  {task.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                </button>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setShowTaskDetail(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Status selector */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {taskStatusGroups.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleUpdateTask(task.id, { status: s })}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition ${task.status === s
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                  >
                    {taskStatusLabels[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority selector */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Priority</label>
              <div className="flex gap-1.5">
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleUpdateTask(task.id, { priority: p })}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition ${task.priority === p
                      ? 'ring-2 ring-violet-500 ' + priorityColors[p]
                      : priorityColors[p] + ' opacity-60 hover:opacity-100'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Assigned to</label>
              <div className="flex items-center gap-2">
                <Avatar name={task.assignedTo?.displayName || task.assignedTo?.username || ''} src={task.assignedTo?.avatarUrl} size="sm" />
                <span className="text-sm text-slate-700 dark:text-slate-300">{task.assignedTo?.displayName || task.assignedTo?.username}</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Description</label>
              <textarea
                defaultValue={task.description || ''}
                placeholder="Add a description..."
                onBlur={(e) => {
                  if (e.target.value !== (task.description || '')) {
                    handleUpdateTask(task.id, { description: e.target.value });
                  }
                }}
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Deadline</label>
              <input
                type="date"
                defaultValue={task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => handleUpdateTask(task.id, { deadline: e.target.value || null })}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Checklists */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <CheckSquare size={14} /> Checklists
                </label>
                <button
                  onClick={() => setShowAddChecklist(!showAddChecklist)}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Add Checklist
                </button>
              </div>

              {showAddChecklist && (
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="Checklist title..."
                    className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChecklist(task.id); }}
                    autoFocus
                  />
                  <button onClick={() => handleCreateChecklist(task.id)} className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">Add</button>
                </div>
              )}

              {(task.checklists || []).map((cl) => {
                const clProgress = cl.items.length > 0
                  ? Math.round((cl.items.filter(i => i.completed).length / cl.items.length) * 100)
                  : 0;
                return (
                  <div key={cl.id} className="mb-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <CheckSquare size={14} /> {cl.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{clProgress}%</span>
                        <button onClick={() => handleDeleteChecklist(cl.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {cl.items.length > 0 && (
                      <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 mb-2">
                        <div
                          className={`h-1.5 rounded-full transition-all ${clProgress === 100 ? 'bg-green-500' : 'bg-violet-500'}`}
                          style={{ width: `${clProgress}%` }}
                        />
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1">
                      {cl.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 py-1 group">
                          <button
                            onClick={() => handleToggleItem(cl.id, item.id)}
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition ${item.completed
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'border-slate-300 dark:border-slate-500 hover:border-violet-500'
                              }`}
                          >
                            {item.completed && <span className="text-[10px]">✓</span>}
                          </button>
                          <span className={`text-sm flex-1 ${item.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {item.title}
                          </span>
                          {item.dueDate && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <Calendar size={10} /> {new Date(item.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          <button
                            onClick={() => handleDeleteChecklistItem(cl.id, item.id)}
                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add item */}
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newItemTitles[cl.id] || ''}
                        onChange={(e) => setNewItemTitles({ ...newItemTitles, [cl.id]: e.target.value })}
                        placeholder="Add an item..."
                        className="flex-1 px-2 py-1 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem(cl.id); }}
                      />
                      <button
                        onClick={() => handleAddChecklistItem(cl.id)}
                        disabled={!newItemTitles[cl.id]?.trim()}
                        className="px-2 py-1 bg-violet-600 text-white text-xs rounded hover:bg-violet-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Project Board View ───────────────────────────────────────────────
  if (viewMode === 'board' && selectedProject) {
    const allTasks = selectedProject.tasks || [];
    const tasks = allTasks.filter((t: TaskData) => {
      if (t.deleted) return taskStatusChecked.has('deleted');
      if (t.archived) return taskStatusChecked.has('archived');
      return taskStatusChecked.has('active');
    });

    return (
      <>
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
            <button onClick={() => { setViewMode('detail'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><ArrowLeft size={18} /></button>
            <FolderKanban size={20} className="text-violet-600 dark:text-violet-400" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate flex-1">{selectedProject.name} — Board</h1>
            <button onClick={() => { setSelectedProject(selectedProject); setViewMode('detail'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Project Settings">
              <Settings size={18} className="text-slate-500 dark:text-slate-400" />
            </button>
            <button onClick={() => setViewMode('roadmap')} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
              <BarChart3 size={14} /> Roadmap
            </button>
            <button onClick={() => handleStartProjectChat(selectedProject)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-green-700 transition">
              <MessageSquare size={14} /> {selectedProject.conversationId ? 'Chat' : 'Start Chat'}
            </button>
            {/* Task status filter checkboxes */}
            {([
              { key: 'active', label: 'Active', dotColor: 'bg-green-500' },
              { key: 'archived', label: 'Archived', dotColor: 'bg-amber-500' },
              { key: 'deleted', label: 'Deleted', dotColor: 'bg-red-500' },
            ]).map(({ key, label, dotColor }) => {
              const checked = taskStatusChecked.has(key);
              return (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setTaskStatusChecked(prev => {
                        const next = new Set(prev);
                        if (next.has(key)) { next.delete(key); } else { next.add(key); }
                        if (next.size === 0) next.add('active');
                        return next;
                      });
                    }}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className={`text-xs font-medium ${checked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
                </label>
              );
            })}
          </div>
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-4 min-w-max h-full">
              {taskStatusGroups.map((status) => {
                const columnTasks = tasks.filter((t: TaskData) => t.status === status);
                return (
                  <div key={status} className={`w-72 rounded-xl p-3 ${taskStatusColors[status]} flex-shrink-0 flex flex-col`}>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                      {taskStatusLabels[status]}
                      <span className="text-xs bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded">{columnTasks.length}</span>
                    </h3>
                    <div className="space-y-2 flex-1 overflow-y-auto">
                      {columnTasks.map((task: TaskData) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isMobile={false}
                          currentUserId={user?.id || ''}
                          onDelete={handleDeleteTask}
                          onEdit={(t) => { setTaskFormEditingTask(t); setShowTaskFormModal(true); }}
                          onStatusChange={(taskId, newStatus) => handleUpdateTask(taskId, { status: newStatus })}
                          onReact={handleReactTask}
                          onChatWithUser={handleChatWithUser}
                          onNavigateToChat={handleNavigateToChat}
                          onStartChat={async (taskId) => {
                            try {
                              const res = await api.createTaskConversation(taskId);
                              if (res?.conversationId) {
                                await refreshProject();
                                window.dispatchEvent(new Event('conversations:refresh'));
                                return res.conversationId;
                              }
                            } catch (err) {
                              console.error('Failed to create task chat:', err);
                              alert('Failed to create chat room');
                            }
                            return null;
                          }}
                          onAddAttachment={async (taskId, data) => {
                            try {
                              await api.addTaskAttachment(taskId, data);
                              await refreshProject();
                            } catch (err) { console.error('Add attachment error:', err); }
                          }}
                          onDeleteAttachment={async (taskId, attachmentId) => {
                            try {
                              await api.deleteTaskAttachment(taskId, attachmentId);
                              await refreshProject();
                            } catch (err) { console.error('Delete attachment error:', err); }
                          }}
                          onArchive={(taskId, archive) => handleArchiveTask(taskId, archive)}
                          onRestore={(taskStatusChecked.has('archived') || taskStatusChecked.has('deleted')) ? handleRestoreTask : undefined}
                        />
                      ))}
                      {columnTasks.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No tasks</p>}
                    </div>

                    {/* Add task button */}
                    {taskStatusChecked.has('active') && !taskStatusChecked.has('archived') && !taskStatusChecked.has('deleted') && (
                      <button
                        onClick={() => {
                          setTaskFormEditingTask(null);
                          setTaskFormDefaultStatus(status);
                          setShowTaskFormModal(true);
                        }}
                        className="mt-2 w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-lg flex items-center justify-center gap-1 transition"
                      >
                        <Plus size={14} /> Add a card
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {renderTaskDetailModal()}
        </div>
        <TaskFormModal
          visible={showTaskFormModal}
          onClose={() => { setShowTaskFormModal(false); setTaskFormEditingTask(null); }}
          onSave={async () => {
            await refreshProject();
            window.dispatchEvent(new Event('badges:refresh'));
          }}
          editingTask={taskFormEditingTask}
          defaultProjectId={selectedProject?.id}
          defaultStatus={taskFormDefaultStatus}
        />
      </>
    );
  }

  // ─── Project Roadmap / Gantt View (uses fragment so TaskFormModal renders outside view container) ──
  if (viewMode === 'roadmap' && selectedProject) {
    const allTasks = selectedProject.tasks || [];
    const activeTasks = allTasks.filter(t => !t.archived && !t.deleted);

    // Calculate timeline bounds
    const now = new Date();
    const dates = activeTasks.flatMap(t => {
      const d: Date[] = [new Date(t.createdAt)];
      if (t.deadline) d.push(new Date(t.deadline));
      return d;
    });
    if (dates.length === 0) dates.push(now);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())) - 3 * 86400000); // 3 days padding
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime()) + 14 * 86400000); // 14 days padding
    const totalDays = Math.max(7, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000));
    const dayWidth = 40; // px per day
    const chartWidth = totalDays * dayWidth;

    // Generate month/day labels
    const dayLabels: { date: Date; x: number }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(minDate.getTime() + i * 86400000);
      dayLabels.push({ date: d, x: i * dayWidth });
    }

    const getBarX = (date: Date) => Math.max(0, ((date.getTime() - minDate.getTime()) / 86400000)) * dayWidth;

    const statusBarColors: Record<string, string> = {
      NOT_STARTED: '#9CA3AF', IN_PROGRESS: '#3B82F6', PENDING_REVIEW: '#F59E0B',
      COMPLETED: '#22C55E', BLOCKED: '#EF4444',
    };
    // Sort tasks: by deadline (no deadline last), then by creation date
    const sortedTasks = [...activeTasks].sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const rowHeight = 36;

    return (
      <>
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setViewMode('detail')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><ArrowLeft size={18} /></button>
          <BarChart3 size={20} className="text-violet-600 dark:text-violet-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate flex-1">{selectedProject.name} — Gantt Roadmap</h1>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            <button onClick={() => setGanttNoDeadlineMode('bar')} className={`px-2 py-1 text-xs rounded-md transition ${ganttNoDeadlineMode === 'bar' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>7-day bars</button>
            <button onClick={() => setGanttNoDeadlineMode('milestone')} className={`px-2 py-1 text-xs rounded-md transition ${ganttNoDeadlineMode === 'milestone' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Milestones</button>
          </div>
          <button onClick={() => openProjectBoard(selectedProject.id)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
            <FolderKanban size={14} /> Board
          </button>
        </div>

        {activeTasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">No tasks to display</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="flex" style={{ minWidth: chartWidth + 260 }}>
              {/* Left panel: task names */}
              <div className="w-[260px] flex-shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 sticky left-0 z-10">
                <div className="h-[50px] border-b border-slate-200 dark:border-slate-700 px-3 flex items-center">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Task</span>
                </div>
                {sortedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 px-3 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition" style={{ height: rowHeight }} onClick={() => { setSelectedTask(task); setShowTaskDetail(true); }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusBarColors[task.status] || '#9CA3AF' }} />
                    <span className="text-xs text-slate-900 dark:text-white truncate flex-1" title={task.title}>{task.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>{task.priority[0]}</span>
                  </div>
                ))}
              </div>

              {/* Right panel: Gantt bars */}
              <div className="flex-1 overflow-x-auto">
                {/* Time axis */}
                <div className="h-[50px] border-b border-slate-200 dark:border-slate-700 relative" style={{ width: chartWidth }}>
                  {dayLabels.map((dl, i) => {
                    const d = dl.date;
                    const isMonthStart = d.getDate() === 1;
                    const isToday = d.toDateString() === now.toDateString();
                    const showLabel = isMonthStart || d.getDate() % 7 === 1 || i === 0;
                    return (
                      <div key={i} className="absolute top-0 h-full flex flex-col justify-end pb-1" style={{ left: dl.x, width: dayWidth }}>
                        {showLabel && (
                          <span className={`text-[9px] px-0.5 ${isToday ? 'text-violet-600 font-bold' : isMonthStart ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400'}`}>
                            {isMonthStart ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : d.getDate().toString()}
                          </span>
                        )}
                        <div className={`h-2 border-l ${isToday ? 'border-violet-500' : isMonthStart ? 'border-slate-300 dark:border-slate-600' : 'border-slate-200 dark:border-slate-700/50'}`} />
                      </div>
                    );
                  })}
                </div>

                {/* Task bars */}
                <div className="relative" style={{ width: chartWidth }}>
                  {/* Today line */}
                  <div className="absolute top-0 bottom-0 w-px bg-violet-500/50 z-10" style={{ left: getBarX(now) }} />

                  {/* Grid lines */}
                  {dayLabels.filter((_, i) => {
                    const d = new Date(minDate.getTime() + i * 86400000);
                    return d.getDate() === 1;
                  }).map((dl, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" style={{ left: dl.x }} />
                  ))}

                  {sortedTasks.map((task) => {
                    const created = new Date(task.createdAt);
                    const deadline = task.deadline ? new Date(task.deadline) : null;
                    const isOverdue = deadline && now > deadline && task.status !== 'COMPLETED';
                    const barColor = isOverdue ? '#EF4444' : (statusBarColors[task.status] || '#9CA3AF');

                    if (!deadline && ganttNoDeadlineMode === 'milestone') {
                      // Diamond milestone at creation date
                      const cx = getBarX(created);
                      return (
                        <div key={task.id} className="flex items-center border-b border-slate-100 dark:border-slate-700/30" style={{ height: rowHeight }}>
                          <div
                            className="absolute cursor-pointer hover:scale-125 transition-transform"
                            style={{ left: cx - 5 }}
                            onClick={() => { setSelectedTask(task); setShowTaskDetail(true); }}
                            title={`${task.title} (no deadline)`}
                          >
                            <div className="w-[10px] h-[10px] rotate-45" style={{ backgroundColor: barColor }} />
                          </div>
                        </div>
                      );
                    }

                    // Bar mode
                    const barStart = getBarX(created);
                    const barEnd = deadline ? getBarX(deadline) : getBarX(new Date(created.getTime() + 7 * 86400000));
                    const barWidth = Math.max(8, barEnd - barStart);

                    return (
                      <div key={task.id} className="flex items-center border-b border-slate-100 dark:border-slate-700/30 relative" style={{ height: rowHeight }}>
                        <div
                          className="absolute rounded-sm cursor-pointer hover:brightness-110 transition flex items-center px-1 overflow-hidden"
                          style={{
                            left: barStart,
                            width: barWidth,
                            height: 20,
                            top: (rowHeight - 20) / 2,
                            backgroundColor: barColor,
                            opacity: deadline ? 0.85 : 0.5,
                            borderStyle: deadline ? 'solid' : 'dashed',
                            borderWidth: deadline ? 0 : 1,
                            borderColor: barColor,
                            background: deadline ? barColor : `${barColor}40`,
                          }}
                          onClick={() => { setSelectedTask(task); setShowTaskDetail(true); }}
                          title={`${task.title}${deadline ? ` — Due ${deadline.toLocaleDateString()}` : ' (no deadline, 7-day default)'}`}
                        >
                          {barWidth > 50 && <span className="text-[9px] text-white font-medium truncate">{task.title}</span>}
                        </div>
                        {/* Completion indicator */}
                        {task.status === 'COMPLETED' && (
                          <div className="absolute text-green-500" style={{ left: barStart + barWidth + 4, top: (rowHeight - 14) / 2 }}>
                            <CheckSquare size={14} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {renderTaskDetailModal()}
      </div>
      <TaskFormModal
        visible={showTaskFormModal}
        onClose={() => { setShowTaskFormModal(false); setTaskFormEditingTask(null); }}
        onSave={async () => {
          await refreshProject();
          window.dispatchEvent(new Event('badges:refresh'));
        }}
        editingTask={taskFormEditingTask}
        defaultProjectId={selectedProject?.id}
        defaultStatus={taskFormDefaultStatus}
      />
      </>
    );
  }

  // ─── Project Detail View ──────────────────────────────────────────────
  if (viewMode === 'detail' && selectedProject) {
    const p = selectedProject;
    const existingMemberIds = new Set(p.members.map(m => m.user.id));
    const filteredMemberResults = memberResults.filter(u => !existingMemberIds.has(u.id));

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => { setViewMode('list'); setSelectedProject(null); setEditingDetail(false); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><ArrowLeft size={18} /></button>
          {editingDetail ? (
            <input
              type="text"
              value={detailForm.name}
              onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })}
              className="text-lg font-bold text-slate-900 dark:text-white bg-transparent border-b-2 border-violet-500 focus:outline-none flex-1"
            />
          ) : (
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate flex-1">{p.name}</h1>
          )}
          {editingDetail ? (
            <select
              value={detailForm.status}
              onChange={(e) => setDetailForm({ ...detailForm, status: e.target.value })}
              className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          ) : (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[p.status] || statusColors.ACTIVE}`}>{p.status}</span>
          )}
          {editingDetail ? (
            <>
              <button onClick={handleUpdateProjectDetail} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">Save</button>
              <button onClick={() => setEditingDetail(false)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => { setEditingDetail(true); setDetailForm({ name: p.name, description: p.description || '', specsAndGoals: p.specsAndGoals || '', gitUrl: p.gitUrl || '', storageUrl: p.storageUrl || '', status: p.status }); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition" title="Edit Project">
                <Pencil size={16} className="text-slate-500 dark:text-slate-400" />
              </button>
              <button onClick={() => openProjectBoard(p.id)} className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-violet-700 transition">
                <FolderKanban size={14} /> Board
              </button>
              <button onClick={() => { setSelectedProject(p); setViewMode('roadmap'); }} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
                <BarChart3 size={14} /> Roadmap
              </button>
              <button onClick={() => handleStartProjectChat(p)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-green-700 transition">
                <MessageSquare size={14} /> {p.conversationId ? 'Chat' : 'Start Chat'}
              </button>
            </>
          )}
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {/* Description */}
          {editingDetail ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Description</h3>
              <textarea
                value={detailForm.description}
                onChange={(e) => setDetailForm({ ...detailForm, description: e.target.value })}
                placeholder="Add a description..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>
          ) : p.description ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Description</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.description}</p>
            </div>
          ) : null}

          {/* Specs & Goals */}
          {editingDetail ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Target size={14} /> Specs & Goals</h3>
              <textarea
                value={detailForm.specsAndGoals}
                onChange={(e) => setDetailForm({ ...detailForm, specsAndGoals: e.target.value })}
                placeholder="Add specs and goals..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>
          ) : p.specsAndGoals ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Target size={14} /> Specs & Goals</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.specsAndGoals}</p>
            </div>
          ) : null}

          {/* Links */}
          {editingDetail ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Links</h3>
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-orange-500 flex-shrink-0" />
                <input
                  type="url"
                  value={detailForm.gitUrl}
                  onChange={(e) => setDetailForm({ ...detailForm, gitUrl: e.target.value })}
                  placeholder="Git repository URL"
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-blue-500 flex-shrink-0" />
                <input
                  type="url"
                  value={detailForm.storageUrl}
                  onChange={(e) => setDetailForm({ ...detailForm, storageUrl: e.target.value })}
                  placeholder="Storage URL"
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          ) : (p.gitUrl || p.storageUrl) ? (
            <div className="flex gap-3 flex-wrap">
              {p.gitUrl && (
                <a href={p.gitUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                  <GitBranch size={16} className="text-orange-500" /> Git Repository <ExternalLink size={12} className="text-slate-400" />
                </a>
              )}
              {p.storageUrl && (
                <a href={p.storageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                  <HardDrive size={16} className="text-blue-500" /> Storage <ExternalLink size={12} className="text-slate-400" />
                </a>
              )}
            </div>
          ) : null}

          {/* Team Lead */}
          {p.teamLead && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><UserCheck size={14} /> Team Lead</h3>
              <div className="flex items-center gap-3">
                <Avatar name={p.teamLead.displayName || p.teamLead.username} src={p.teamLead.avatarUrl} size="md" />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{p.teamLead.displayName || p.teamLead.username}</p>
                </div>
              </div>
            </div>
          )}

          {/* Add Members — PROMINENT CTA */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-xl p-5 border-2 border-dashed border-violet-300 dark:border-violet-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                <UserPlus size={20} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-violet-800 dark:text-violet-300">Add Team Members</h3>
                <p className="text-xs text-violet-600 dark:text-violet-400">Search by name or username to add people to this project</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-violet-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Type a name to add members..."
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 border-2 border-violet-200 dark:border-violet-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            {filteredMemberResults.length > 0 && (
              <div className="space-y-1 mt-2 max-h-40 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg p-2 border border-violet-200 dark:border-violet-700">
                {filteredMemberResults.slice(0, 8).map((u: any) => (
                  <button key={u.id} onClick={() => handleAddMember(u.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 transition text-left">
                    <Avatar name={u.username} src={u.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 dark:text-white block truncate">{u.displayName || u.username}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">@{u.username}</span>
                    </div>
                    <Plus size={16} className="text-violet-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current Members */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-4"><Users size={14} /> Members ({p.members.length})</h3>
            <div className="space-y-2">
              {p.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <button onClick={() => handleChatWithUser(m.user.id)} className="hover:opacity-80" title={`Chat with ${m.user.displayName || m.user.username}`}>
                    <Avatar name={m.user.displayName || m.user.username} src={m.user.avatarUrl} size="sm" />
                  </button>
                  <button onClick={() => handleChatWithUser(m.user.id)} className="flex-1 min-w-0 text-left hover:opacity-80">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate hover:underline">{m.user.displayName || m.user.username}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.user.email}</p>
                  </button>
                  {m.role === 'LEAD' && <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">Lead</span>}
                  {m.user.id !== p.createdBy.id && (
                    <button onClick={() => handleRemoveMember(m.user.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{p._count.tasks}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tasks</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{p._count.members}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
            </div>
          </div>

          {/* Delete Project */}
          <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-5 border border-red-200 dark:border-red-800">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h3>
            <p className="text-xs text-red-600 dark:text-red-400 mb-3">Deleting this project will unlink all tasks but not delete them.</p>
            <button
              onClick={() => handleDelete(p.id, p.name)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition"
            >
              <Trash2 size={14} /> Delete Project
            </button>
          </div>
        </div>
        {renderTaskDetailModal()}
      </div>
    );
  }

  // ─── Project List View ────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"><ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" /></button>
        <FolderKanban size={20} className="text-violet-600 dark:text-violet-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-white flex-1">Projects</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition">
          <Plus size={16} /> New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Project Mates badges */}
        {projectMates.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Project Mates</h3>
            <div className="flex flex-wrap gap-2">
              {projectMates.map((mate) => (
                <button
                  key={mate.userId}
                  onClick={() => handleChatWithUser(mate.userId)}
                  className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 px-3 py-1.5 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/40 transition cursor-pointer"
                  title={`Chat with ${mate.displayName || mate.username}`}
                >
                  <Avatar name={mate.displayName || mate.username} src={mate.avatarUrl} size="sm" />
                  <span className="text-xs font-medium text-violet-700 dark:text-violet-300">{mate.displayName || mate.username}</span>
                  <span className="text-[10px] text-violet-500 dark:text-violet-400">
                    {mate.projects.map((p: any) => p.name).join(', ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 space-y-3">
            <input type="text" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Project name *" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" autoFocus />
            <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Description" rows={2} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
            <textarea value={createForm.specsAndGoals} onChange={(e) => setCreateForm({ ...createForm, specsAndGoals: e.target.value })} placeholder="Specs & Goals" rows={3} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <input type="url" value={createForm.gitUrl} onChange={(e) => setCreateForm({ ...createForm, gitUrl: e.target.value })} placeholder="Git repository URL" className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <input type="url" value={createForm.storageUrl} onChange={(e) => setCreateForm({ ...createForm, storageUrl: e.target.value })} placeholder="Storage URL" className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">Cancel</button>
              <button onClick={handleCreate} disabled={!createForm.name.trim() || creating} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">{creating ? 'Creating...' : 'Create Project'}</button>
            </div>
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No projects yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Create your first project or assign a task with a project name</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const projectBorderClass = p.status === 'ARCHIVED'
                ? 'border-2 border-blue-400 dark:border-blue-500'
                : p.status === 'COMPLETED'
                  ? 'border-2 border-blue-300 dark:border-blue-600'
                  : p.status === 'PAUSED'
                    ? 'border-2 border-amber-400 dark:border-amber-500'
                    : 'border-2 border-green-400 dark:border-green-500';
              return (
              <div key={p.id} className={`bg-white dark:bg-slate-800 rounded-xl ${projectBorderClass} hover:shadow-md transition-shadow overflow-hidden relative`}>
                <div className="p-5">
                  {/* Status label for non-active projects */}
                  {p.status === 'ARCHIVED' && (
                    <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">Archived</div>
                  )}
                  {p.status === 'PAUSED' && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">Paused</div>
                  )}
                  {p.status === 'COMPLETED' && (
                    <div className="absolute top-0 right-0 bg-blue-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">Completed</div>
                  )}
                  {editingProjectId === p.id ? (
                    /* ── Inline Edit Form ── */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editProjectForm.name}
                        onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                        placeholder="Project name *"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        autoFocus
                      />
                      <textarea
                        value={editProjectForm.description}
                        onChange={(e) => setEditProjectForm({ ...editProjectForm, description: e.target.value })}
                        placeholder="Description"
                        rows={2}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                      />
                      <textarea
                        value={editProjectForm.specsAndGoals}
                        onChange={(e) => setEditProjectForm({ ...editProjectForm, specsAndGoals: e.target.value })}
                        placeholder="Specs & Goals"
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="url"
                          value={editProjectForm.gitUrl}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, gitUrl: e.target.value })}
                          placeholder="Git repository URL"
                          className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <input
                          type="url"
                          value={editProjectForm.storageUrl}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, storageUrl: e.target.value })}
                          placeholder="Storage URL"
                          className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <select
                        value={editProjectForm.status}
                        onChange={(e) => setEditProjectForm({ ...editProjectForm, status: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="PAUSED">PAUSED</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingProjectId(null)} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">Cancel</button>
                        <button onClick={() => handleUpdateProject(p.id)} disabled={!editProjectForm.name.trim()} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">Save</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal Card Display ── */
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</h3>
                          {p.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{p.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || statusColors.ACTIVE}`}>{p.status}</span>
                          <button onClick={() => {
                            if (p.status === 'ARCHIVED') {
                              alert('Please change this project\'s status to Active before editing.');
                              return;
                            }
                            setEditingProjectId(p.id); setEditProjectForm({ name: p.name, description: p.description || '', specsAndGoals: p.specsAndGoals || '', gitUrl: p.gitUrl || '', storageUrl: p.storageUrl || '', status: p.status });
                          }} className={`p-1 rounded ${p.status === 'ARCHIVED' ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-violet-500'}`}><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="flex gap-2 mb-3">
                        {p.gitUrl && (
                          <a href={p.gitUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline"><GitBranch size={12} /> Git</a>
                        )}
                        {p.storageUrl && (
                          <a href={p.storageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"><HardDrive size={12} /> Storage</a>
                        )}
                      </div>

                      {/* Team lead + member avatars */}
                      <div className="flex items-center gap-2 mb-3">
                        {p.teamLead && (
                          <div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 px-2 py-1 rounded-full">
                            <Avatar name={p.teamLead.displayName} src={p.teamLead.avatarUrl} size="sm" />
                            <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300">Lead</span>
                          </div>
                        )}
                        <div className="flex -space-x-2">
                          {p.members.slice(0, 4).map((m) => (
                            <Avatar key={m.id} name={m.user.displayName || m.user.username} src={m.user.avatarUrl} size="sm" />
                          ))}
                          {p.members.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-slate-600 dark:text-slate-400 border-2 border-white dark:border-slate-800">+{p.members.length - 4}</div>
                          )}
                        </div>
                      </div>

                      {/* Stats + actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{p._count.tasks} tasks</span>
                          <span>{p._count.members} members</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openProjectDetail(p.id)} className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition">Details</button>
                          <button onClick={() => openProjectBoard(p.id)} className="px-2.5 py-1 text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-800/30 transition">Board</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    {/* Task Form Modal — rendered outside inner container for reliable z-index */}
    <TaskFormModal
      visible={showTaskFormModal}
      onClose={() => { setShowTaskFormModal(false); setTaskFormEditingTask(null); }}
      onSave={async () => {
        await refreshProject();
        window.dispatchEvent(new Event('badges:refresh'));
      }}
      editingTask={taskFormEditingTask}
      defaultProjectId={selectedProject?.id}
      defaultStatus={taskFormDefaultStatus}
    />
    </>
  );
};

export default ProjectsPage;
