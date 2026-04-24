import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, X, GitBranch, HardDrive, Target,
  Users, UserCheck, Trash2, ExternalLink, FolderKanban,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';

interface ProjectsPageProps {
  onClose: () => void;
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
  _count: { tasks: number; members: number };
  tasks?: any[];
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'detail' | 'board';

const ProjectsPage: React.FC<ProjectsPageProps> = ({ onClose }) => {
  const { user } = useAuthStore();
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

  const handleAddMember = async (userId: string) => {
    if (!selectedProject) return;
    try {
      await api.addProjectMember(selectedProject.id, userId);
      openProjectDetail(selectedProject.id);
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
      openProjectDetail(selectedProject.id);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to remove member');
    }
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

  // ─── Project Board View ───────────────────────────────────────────────
  if (viewMode === 'board' && selectedProject) {
    const tasks = selectedProject.tasks || [];
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setViewMode('detail'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><ArrowLeft size={18} /></button>
          <FolderKanban size={20} className="text-violet-600 dark:text-violet-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">{selectedProject.name} — Board</h1>
        </div>
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 min-w-max h-full">
            {taskStatusGroups.map((status) => {
              const columnTasks = tasks.filter((t: any) => t.status === status);
              return (
                <div key={status} className={`w-72 rounded-xl p-3 ${taskStatusColors[status]} flex-shrink-0 flex flex-col`}>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    {taskStatusLabels[status]} <span className="text-xs bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded">{columnTasks.length}</span>
                  </h3>
                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {columnTasks.map((task: any) => (
                      <div key={task.id} className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">{task.title}</p>
                        {task.description && <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{task.description}</p>}
                        <div className="flex items-center gap-2">
                          <Avatar name={task.assignedTo?.displayName || task.assignedTo?.username} src={task.assignedTo?.avatarUrl} size="sm" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">{task.assignedTo?.displayName || task.assignedTo?.username}</span>
                        </div>
                      </div>
                    ))}
                    {columnTasks.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No tasks</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
          <button onClick={() => { setViewMode('list'); setSelectedProject(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><ArrowLeft size={18} /></button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate flex-1">{p.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[p.status] || statusColors.ACTIVE}`}>{p.status}</span>
          <button onClick={() => openProjectBoard(p.id)} className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-violet-700 transition">
            <FolderKanban size={14} /> Board
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {/* Description */}
          {p.description && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Description</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.description}</p>
            </div>
          )}

          {/* Specs & Goals */}
          {p.specsAndGoals && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Target size={14} /> Specs & Goals</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.specsAndGoals}</p>
            </div>
          )}

          {/* Links */}
          {(p.gitUrl || p.storageUrl) && (
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
          )}

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

          {/* Members */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Users size={14} /> Members ({p.members.length})</h3>
            </div>

            {/* Add member search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search to add members..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
              />
            </div>
            {filteredMemberResults.length > 0 && (
              <div className="space-y-1 mb-3 max-h-32 overflow-y-auto bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                {filteredMemberResults.slice(0, 5).map((u: any) => (
                  <button key={u.id} onClick={() => handleAddMember(u.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition text-left">
                    <Avatar name={u.username} src={u.avatar} size="sm" />
                    <span className="text-sm text-slate-900 dark:text-white">{u.username}</span>
                    <Plus size={14} className="ml-auto text-blue-500" />
                  </button>
                ))}
              </div>
            )}

            {/* Member list */}
            <div className="space-y-2">
              {p.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <Avatar name={m.user.displayName || m.user.username} src={m.user.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.user.displayName || m.user.username}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.user.email}</p>
                  </div>
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
        </div>
      </div>
    );
  }

  // ─── Project List View ────────────────────────────────────────────────
  return (
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
                <div key={mate.userId} className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 px-3 py-1.5 rounded-full">
                  <Avatar name={mate.displayName || mate.username} src={mate.avatarUrl} size="sm" />
                  <span className="text-xs font-medium text-violet-700 dark:text-violet-300">{mate.displayName || mate.username}</span>
                  <span className="text-[10px] text-violet-500 dark:text-violet-400">
                    {mate.projects.map((p: any) => p.name).join(', ')}
                  </span>
                </div>
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
            {projects.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</h3>
                      {p.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || statusColors.ACTIVE}`}>{p.status}</span>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
