import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, MoreVertical, X, Loader2, Search, UserPlus, ThumbsUp, ThumbsDown, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';

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
  reactions?: Array<{ id: string; userId: string; type: string }>;
  _count?: { comments: number };
  createdAt: string;
  updatedAt: string;
}

type TaskFilter = 'my-tasks' | 'assigned-by-me' | 'department' | 'project' | 'all';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Comments & reactions state
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Modal form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedToId: user?.id || '',
    deadline: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    labels: [] as string[],
    lindaFollowing: false,
    lindaFollowInterval: 'daily' as string,
    visibleToDepartmentIds: [] as string[],
    departmentId: '' as string,
    projectId: '' as string,
    projectName: '' as string,
  });
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
  const [labelInput, setLabelInput] = useState('');

  // Assignee search state
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<Array<{ id: string; username: string; email: string; avatar?: string }>>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<{ id: string; displayName: string; username: string; avatarUrl?: string } | null>(null);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [assigneeSearchLoading, setAssigneeSearchLoading] = useState(false);

  // Debounced user search for assignee
  useEffect(() => {
    if (!assigneeSearch || assigneeSearch.length < 2) {
      setAssigneeResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setAssigneeSearchLoading(true);
      try {
        const results = await api.searchUsers(assigneeSearch, 10);
        setAssigneeResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setAssigneeSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [assigneeSearch]);

  // Handle resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

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
      const allTasks = await api.getTasks(params);

      // Filter tasks based on selected filter
      let filtered = allTasks;
      if (filter === 'my-tasks') {
        filtered = allTasks.filter(t => t.assignedToId === user?.id);
      } else if (filter === 'assigned-by-me') {
        filtered = allTasks.filter(t => t.createdById === user?.id);
      }

      // Apply search
      if (searchQuery) {
        filtered = filtered.filter(t =>
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
  }, [filter, searchQuery, selectedDeptFilter, selectedProjectFilter]);

  // Load departments and projects for selectors
  useEffect(() => {
    api.getDepartments().then((res) => {
      setDepartments(res?.departments?.map((d: any) => ({ id: d.id, name: d.name })) || []);
    }).catch(() => {});
    api.getProjects().then((res) => {
      setProjects(res?.projects?.map((p: any) => ({ id: p.id, name: p.name })) || []);
    }).catch(() => {});
  }, []);

  // Handle create/update task
  const handleSaveTask = async () => {
    if (!formData.title.trim()) {
      alert('Task title is required');
      return;
    }

    try {
      if (editingTask) {
        const updated = await api.updateTask(editingTask.id, {
          title: formData.title,
          description: formData.description,
          assignedToId: formData.assignedToId,
          deadline: formData.deadline || null,
          priority: formData.priority,
          labels: formData.labels,
          lindaFollowing: formData.lindaFollowing,
          lindaFollowInterval: formData.lindaFollowing ? formData.lindaFollowInterval : null,
        });
        setTasks(tasks.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await api.createTask({
          title: formData.title,
          description: formData.description,
          assignedToId: formData.assignedToId,
          deadline: formData.deadline || undefined,
          priority: formData.priority,
          labels: formData.labels,
          lindaFollowing: formData.lindaFollowing,
          lindaFollowInterval: formData.lindaFollowing ? formData.lindaFollowInterval : undefined,
          visibleToDepartmentIds: formData.visibleToDepartmentIds.length > 0 ? formData.visibleToDepartmentIds : undefined,
          departmentId: formData.departmentId || undefined,
          projectId: formData.projectId || undefined,
          projectName: formData.projectName || undefined,
        });
        console.log('Task created:', created);
        // Refetch all tasks to ensure consistency with server
        await fetchTasks();
      }

      setShowCreateModal(false);
      setEditingTask(null);
      resetForm();
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to save task:', error);
      alert('Failed to save task');
    }
  };

  // Load comments when expanded
  useEffect(() => {
    if (expandedComments) {
      setLoadingComments(true);
      api.getTaskComments(expandedComments).then((data) => {
        setTaskComments(data.comments || []);
        setLoadingComments(false);
      }).catch(() => setLoadingComments(false));
    }
  }, [expandedComments]);

  // Navigate to chat with a user
  const handleChatWithUser = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    try {
      const conv = await api.createConversation([targetUserId]);
      navigate(`/chat/${conv.id}`);
    } catch (err) {
      console.error('Failed to open chat:', err);
    }
  };

  // Reaction handlers
  const handleReact = async (taskId: string, type: 'like' | 'dislike') => {
    try {
      await api.reactToTask(taskId, type);
      // Reload tasks to get updated reactions
      const data = await api.getTasks(filter === 'my-tasks' ? {} : { view: 'all' });
      setTasks(data || []);
    } catch (err) {
      console.error('React error:', err);
    }
  };

  // Comment handlers
  const handleAddComment = async (taskId: string) => {
    if (!newComment.trim()) return;
    try {
      await api.addTaskComment(taskId, newComment.trim());
      setNewComment('');
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
      // Refresh task list to update comment count
      const tasksData = await api.getTasks(filter === 'my-tasks' ? {} : { view: 'all' });
      setTasks(tasksData || []);
    } catch (err) {
      console.error('Add comment error:', err);
    }
  };

  const handleUpdateComment = async (taskId: string, commentId: string) => {
    if (!editingCommentText.trim()) return;
    try {
      await api.updateTaskComment(taskId, commentId, editingCommentText.trim());
      setEditingCommentId(null);
      setEditingCommentText('');
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
    } catch (err) {
      console.error('Update comment error:', err);
    }
  };

  const handleDeleteComment = async (taskId: string, commentId: string) => {
    try {
      await api.deleteTaskComment(taskId, commentId);
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
      const tasksData = await api.getTasks(filter === 'my-tasks' ? {} : { view: 'all' });
      setTasks(tasksData || []);
    } catch (err) {
      console.error('Delete comment error:', err);
    }
  };

  // Handle delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      await api.deleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  // Handle status change
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
      const updated = await api.updateTask(taskId, { status: newStatus });
      setTasks(tasks.map(t => t.id === updated.id ? updated : t));
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  // Edit task
  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      assignedToId: task.assignedTo.id,
      deadline: task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '',
      priority: task.priority,
      labels: task.labels,
      lindaFollowing: task.lindaFollowing || false,
      lindaFollowInterval: task.lindaFollowInterval || 'daily',
      visibleToDepartmentIds: (task as any).visibleToDepartments?.map((d: any) => d.id) || [],
      departmentId: (task as any).department?.id || '',
      projectId: (task as any).project?.id || '',
      projectName: '',
    });
    setSelectedAssignee(task.assignedTo);
    setAssigneeSearch('');
    setShowAssigneeDropdown(false);
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      assignedToId: user?.id || '',
      deadline: '',
      priority: 'MEDIUM',
      labels: [],
      lindaFollowing: false,
      lindaFollowInterval: 'daily',
      visibleToDepartmentIds: [],
      departmentId: '',
      projectId: '',
      projectName: '',
    });
    setLabelInput('');
    setSelectedAssignee(null);
    setAssigneeSearch('');
    setShowAssigneeDropdown(false);
  };

  // Add label to form
  const handleAddLabel = () => {
    if (labelInput.trim() && !formData.labels.includes(labelInput.trim())) {
      setFormData({
        ...formData,
        labels: [...formData.labels, labelInput.trim()],
      });
      setLabelInput('');
    }
  };

  // Remove label from form
  const handleRemoveLabel = (label: string) => {
    setFormData({
      ...formData,
      labels: formData.labels.filter(l => l !== label),
    });
  };

  // Get deadline color
  const getDeadlineColor = (deadline?: string) => {
    if (!deadline) return 'text-gray-500';

    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) return 'text-red-600 dark:text-red-400';
    if (diffHours < 24) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'MEDIUM':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
      case 'HIGH':
        return 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200';
      case 'CRITICAL':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  };

  // Get priority border color for mobile cards
  const getPriorityBorderColor = (priority: string) => {
    switch (priority) {
      case 'LOW':
        return 'border-l-4 border-l-green-500';
      case 'MEDIUM':
        return 'border-l-4 border-l-blue-500';
      case 'HIGH':
        return 'border-l-4 border-l-amber-500';
      case 'CRITICAL':
        return 'border-l-4 border-l-red-500';
      default:
        return 'border-l-4 border-l-gray-400';
    }
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

  const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
    const likes = (task.reactions || []).filter(r => r.type === 'like').length;
    const dislikes = (task.reactions || []).filter(r => r.type === 'dislike').length;
    const userReaction = (task.reactions || []).find(r => r.userId === user?.id)?.type;
    const commentCount = task._count?.comments || 0;

    if (isMobile) {
      return (
        <div className={`bg-white dark:bg-surface-800 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-surface-700 ${getPriorityBorderColor(task.priority)}`}>
          {/* Title */}
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold text-gray-900 dark:text-white flex-1">
              {task.title}
            </h4>
            <button
              onClick={() => handleDeleteTask(task.id)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded ml-2 flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {task.description}
            </p>
          )}

          {/* Labels */}
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {task.labels.map((label, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Department & Project badges */}
          {((task as any).department || (task as any).project) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(task as any).department && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                  {(task as any).department.name}
                </span>
              )}
              {(task as any).project && (
                <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                  {(task as any).project.name}
                </span>
              )}
            </div>
          )}

          {/* Assignee — clickable */}
          <button
            onClick={() => handleChatWithUser(task.assignedTo.id)}
            className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-surface-700 hover:opacity-80 w-full text-left"
          >
            <Avatar
              name={task.assignedTo.displayName || task.assignedTo.username}
              src={task.assignedTo.avatarUrl}
              size="sm"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {task.assignedTo.displayName || task.assignedTo.username}
            </span>
          </button>

          {/* Date and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="w-3 h-3" />
                <span>
                  {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              {task.deadline && (
                <div className={`flex items-center gap-1 text-xs ${getDeadlineColor(task.deadline)}`}>
                  <span>→</span>
                  <span>
                    {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            <select
              value={task.status}
              onChange={(e) => handleStatusChange(task.id, e.target.value)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-surface-600 cursor-pointer"
            >
              {statusColumns.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleEditTask(task)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Reactions & Comments bar */}
          <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 dark:border-surface-700">
            <button onClick={() => handleReact(task.id, 'like')} className={`flex items-center gap-1 text-xs ${userReaction === 'like' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <ThumbsUp className="w-3.5 h-3.5" /> {likes > 0 && likes}
            </button>
            <button onClick={() => handleReact(task.id, 'dislike')} className={`flex items-center gap-1 text-xs ${userReaction === 'dislike' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              <ThumbsDown className="w-3.5 h-3.5" /> {dislikes > 0 && dislikes}
            </button>
            <button onClick={() => setExpandedComments(expandedComments === task.id ? null : task.id)} className={`flex items-center gap-1 text-xs ${expandedComments === task.id ? 'text-violet-600 font-semibold' : 'text-gray-500'}`}>
              <MessageCircle className="w-3.5 h-3.5" /> {commentCount > 0 && commentCount}
            </button>
          </div>

          {/* Expanded comments */}
          {expandedComments === task.id && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-surface-700 space-y-2">
              {loadingComments ? (
                <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
              ) : (
                <>
                  {taskComments.map((comment) => (
                    <div key={comment.id} className="flex gap-2 text-xs group">
                      <button onClick={() => handleChatWithUser(comment.user?.id)} className="flex-shrink-0">
                        <Avatar name={comment.user?.displayName || '?'} src={comment.user?.avatarUrl} size="sm" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => handleChatWithUser(comment.user?.id)} className="font-semibold text-gray-900 dark:text-white hover:underline">
                          {comment.user?.displayName || comment.user?.username}
                        </button>
                        {editingCommentId === comment.id ? (
                          <input autoFocus value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateComment(task.id, comment.id); if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentText(''); } }}
                            className="block w-full mt-0.5 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-surface-700 border border-gray-300 dark:border-surface-600 text-gray-900 dark:text-white" />
                        ) : (
                          <p className="text-gray-700 dark:text-gray-300 mt-0.5 break-words">{comment.content}</p>
                        )}
                      </div>
                      {user?.id === comment.user?.id && !editingCommentId && (
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }} className="p-0.5 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button>
                          <button onClick={() => handleDeleteComment(task.id, comment.id)} className="p-0.5 hover:bg-gray-100 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  <input placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(task.id); }}
                    className="w-full px-2 py-1.5 text-xs rounded bg-gray-50 dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white placeholder-gray-400" />
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    // Desktop kanban card
    return (
      <div className="bg-white dark:bg-surface-800 rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-surface-700">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-gray-900 dark:text-white flex-1 text-sm line-clamp-2">
            {task.title}
          </h4>
          <button
            onClick={() => handleDeleteTask(task.id)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {task.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-2 mb-2">
          {task.priority && (
            <span className={`text-xs px-2 py-1 rounded font-medium ${getPriorityColor(task.priority)}`}>
              {task.priority}
            </span>
          )}
          {task.lindaFollowing && (
            <span className="text-xs px-2 py-1 rounded font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" title="Linda is following this task">
              🤖 Linda
            </span>
          )}
        </div>

        {task.orderedBy && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-700 dark:text-amber-400">
            <span className="font-medium">📋 Ordered by:</span>
            <button onClick={() => handleChatWithUser(task.orderedBy!.id)} className="hover:underline cursor-pointer">
              {task.orderedBy.displayName || task.orderedBy.username}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs mb-2">
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
          {task.deadline && (
            <div className={`flex items-center gap-1 ${getDeadlineColor(task.deadline)}`}>
              <span>→</span>
              <span>{new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.map((label, idx) => (
              <span
                key={idx}
                className="text-xs bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-surface-700">
          <button
            onClick={() => handleChatWithUser(task.assignedTo.id)}
            className="flex items-center gap-1 hover:opacity-80 cursor-pointer"
            title={`Chat with ${task.assignedTo.displayName || task.assignedTo.username}`}
          >
            <Avatar
              name={task.assignedTo.displayName || task.assignedTo.username}
              src={task.assignedTo.avatarUrl}
              size="sm"
            />
          </button>

          <select
            value={task.status}
            onChange={(e) => handleStatusChange(task.id, e.target.value)}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-surface-600 cursor-pointer"
          >
            {statusColumns.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>

          <button
            onClick={() => handleEditTask(task)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Reactions & Comments bar */}
        <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 dark:border-surface-700">
          <button
            onClick={() => handleReact(task.id, 'like')}
            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${userReaction === 'like' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> {likes > 0 && likes}
          </button>
          <button
            onClick={() => handleReact(task.id, 'dislike')}
            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${userReaction === 'dislike' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> {dislikes > 0 && dislikes}
          </button>
          <button
            onClick={() => setExpandedComments(expandedComments === task.id ? null : task.id)}
            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${expandedComments === task.id ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <MessageCircle className="w-3.5 h-3.5" /> {commentCount > 0 && commentCount}
          </button>
        </div>

        {/* Expanded comments section */}
        {expandedComments === task.id && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-surface-700 space-y-2">
            {loadingComments ? (
              <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : (
              <>
                {taskComments.map((comment) => (
                  <div key={comment.id} className="flex gap-2 text-xs group">
                    <button onClick={() => handleChatWithUser(comment.user?.id)} className="flex-shrink-0 hover:opacity-80">
                      <Avatar name={comment.user?.displayName || '?'} src={comment.user?.avatarUrl} size="sm" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => handleChatWithUser(comment.user?.id)} className="font-semibold text-gray-900 dark:text-white hover:underline">
                        {comment.user?.displayName || comment.user?.username}
                      </button>
                      {editingCommentId === comment.id ? (
                        <input
                          autoFocus
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateComment(task.id, comment.id);
                            if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentText(''); }
                          }}
                          className="block w-full mt-0.5 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-surface-700 border border-gray-300 dark:border-surface-600 text-gray-900 dark:text-white"
                        />
                      ) : (
                        <p className="text-gray-700 dark:text-gray-300 mt-0.5 break-words">{comment.content}</p>
                      )}
                    </div>
                    {user?.id === comment.user?.id && !editingCommentId && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}
                          className="p-0.5 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
                        >
                          <Pencil className="w-3 h-3 text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteComment(task.id, comment.id)}
                          className="p-0.5 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <input
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(task.id); }}
                  className="w-full px-2 py-1.5 text-xs rounded bg-gray-50 dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-surface-950">
      {/* Header */}
      <div className="bg-white dark:bg-surface-900 border-b border-gray-200 dark:border-surface-700 px-4 py-3 md:py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isMobile && onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-surface-800 rounded"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            )}
            <h1 className={`font-bold text-gray-900 dark:text-white ${isMobile ? 'text-lg' : 'text-2xl'}`}>
              Task Wall
            </h1>
          </div>
          <button
            onClick={() => {
              resetForm();
              setEditingTask(null);
              setShowCreateModal(true);
            }}
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
        // Mobile list view
        <div className="flex-1 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">No tasks found in this filter</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Try switching to the 'All' tab to see all tasks</p>
              <button
                onClick={() => {
                  resetForm();
                  setEditingTask(null);
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
                Create your first task
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      ) : view === 'kanban' ? (
        // Desktop kanban view
        <div className="flex-1 overflow-x-auto p-4">
          <div className="grid grid-cols-4 gap-4">
            {statusColumns.map((status) => {
              const statusTasks = tasks.filter(t => t.status === status);
              return (
                <div
                  key={status}
                  className="bg-white dark:bg-surface-800 rounded-lg p-4 flex flex-col"
                >
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
                    {statusLabels[status]} ({statusTasks.length})
                  </h3>
                  <div className="flex-1 overflow-y-auto">
                    {statusTasks.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-xs text-center py-4">
                        No tasks
                      </p>
                    ) : (
                      statusTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // List view (fallback)
        <div className="flex-1 overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">No tasks found in this filter</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Try switching to the 'All' tab to see all tasks</p>
              <button
                onClick={() => {
                  resetForm();
                  setEditingTask(null);
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
                Create your first task
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white dark:bg-surface-900 rounded-t-lg md:rounded-lg w-full md:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-white dark:bg-surface-900 border-b border-gray-200 dark:border-surface-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'Create Task'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTask(null);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter task title"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter task description"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Assign To */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <UserPlus className="w-4 h-4 inline mr-1" />
                  Assign To
                </label>
                {selectedAssignee ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 border border-gray-300 dark:border-surface-700">
                    <Avatar name={selectedAssignee.displayName || selectedAssignee.username} src={selectedAssignee.avatarUrl} size="sm" />
                    <span className="text-sm text-gray-900 dark:text-white flex-1">
                      {selectedAssignee.displayName || selectedAssignee.username}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedAssignee(null);
                        setFormData({ ...formData, assignedToId: user?.id || '' });
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-surface-700 rounded"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={assigneeSearch}
                      onChange={(e) => {
                        setAssigneeSearch(e.target.value);
                        setShowAssigneeDropdown(true);
                      }}
                      onFocus={() => setShowAssigneeDropdown(true)}
                      placeholder="Search users to assign..."
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {assigneeSearchLoading && (
                      <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />
                    )}
                  </div>
                )}
                {showAssigneeDropdown && assigneeResults.length > 0 && !selectedAssignee && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {assigneeResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedAssignee({
                            id: u.id,
                            displayName: u.username,
                            username: u.username,
                            avatarUrl: u.avatar,
                          });
                          setFormData({ ...formData, assignedToId: u.id });
                          setShowAssigneeDropdown(false);
                          setAssigneeSearch('');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-surface-700 text-left"
                      >
                        <Avatar name={u.username} src={u.avatar} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.username}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedAssignee && !assigneeSearch && (
                  <p className="text-xs text-gray-400 mt-1">Leave empty to assign to yourself</p>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Department */}
              {departments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Department
                  </label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project
                </label>
                {projects.length > 0 ? (
                  <select
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value, projectName: '' })}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="__new__">+ New Project...</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value, projectId: '' })}
                    placeholder="Type a project name to create one..."
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400"
                  />
                )}
                {formData.projectId === '__new__' && (
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value, projectId: '' })}
                    placeholder="Enter new project name..."
                    className="w-full mt-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400"
                    autoFocus
                  />
                )}
              </div>

              {/* Labels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Labels
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLabel();
                      }
                    }}
                    placeholder="Add label and press Enter"
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleAddLabel}
                    className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
                  >
                    Add
                  </button>
                </div>
                {formData.labels.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.labels.map((label, idx) => (
                      <span
                        key={idx}
                        className="flex items-center gap-2 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-3 py-1 rounded-full text-sm"
                      >
                        {label}
                        <button
                          onClick={() => handleRemoveLabel(label)}
                          className="p-0 hover:text-primary-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Linda Following */}
              <div>
                <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.lindaFollowing}
                      onChange={(e) => setFormData({ ...formData, lindaFollowing: e.target.checked })}
                      className="w-5 h-5 rounded border-violet-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                        Requires Linda's Following
                      </span>
                      <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                        Linda AI will track this task and send periodic reminders
                      </p>
                    </div>
                    <span className="text-lg">🤖</span>
                  </label>

                  {formData.lindaFollowing && (
                    <div className="mt-3 pl-8">
                      <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1.5">
                        Follow-up Interval
                      </label>
                      <select
                        value={formData.lindaFollowInterval}
                        onChange={(e) => setFormData({ ...formData, lindaFollowInterval: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-surface-800 text-sm text-violet-900 dark:text-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="twice_daily">Twice a day</option>
                        <option value="daily">Daily</option>
                        <option value="every_2_days">Every 2 days</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Visible to Departments */}
                {departments.length > 0 && !editingTask && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                    <label className="block text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                      👥 Visible to Departments
                    </label>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                      All members of selected departments will see this task, even if not directly assigned.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {departments.map((dept) => {
                        const selected = formData.visibleToDepartmentIds.includes(dept.id);
                        return (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                visibleToDepartmentIds: selected
                                  ? prev.visibleToDepartmentIds.filter((id) => id !== dept.id)
                                  : [...prev.visibleToDepartmentIds, dept.id],
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                              selected
                                ? 'bg-blue-600 text-white'
                                : 'bg-white dark:bg-surface-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/30'
                            }`}
                          >
                            {dept.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 bg-gray-50 dark:bg-surface-800 border-t border-gray-200 dark:border-surface-700 px-6 py-4 flex gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTask(null);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-surface-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
              >
                {editingTask ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskWall;
