import { useState, useEffect } from 'react';
import {
  Calendar, MoreVertical, Loader2,
  ThumbsUp, ThumbsDown, MessageCircle, Pencil, Trash2,
  Send, Paperclip, Link2, FileText, ExternalLink, CheckSquare,
  MessageSquare, Archive, RotateCcw,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';

// Standalone comment input to prevent parent re-renders from stealing focus
const CommentInput: React.FC<{ taskId: string; onSubmit: (taskId: string, text: string) => Promise<void> }> = ({ taskId, onSubmit }) => {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(taskId, text.trim());
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex gap-1">
      <input
        placeholder="Write a comment..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        className="flex-1 px-2 py-1.5 text-xs rounded bg-gray-50 dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white placeholder-gray-400"
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || submitting}
        className="p-1.5 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="w-3 h-3" />
      </button>
    </div>
  );
};

export interface TaskCardProps {
  task: any;
  isMobile: boolean;
  currentUserId: string;
  onDelete: (taskId: string) => void;
  onEdit: (task: any) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onReact: (taskId: string, type: 'like' | 'dislike') => void;
  onChatWithUser: (userId: string) => void;
  onNavigateToChat: (conversationId: string) => void;
  onStartChat: (taskId: string) => Promise<string | null>;
  onAddAttachment: (taskId: string, data: { type: string; name: string; url: string }) => void;
  onDeleteAttachment: (taskId: string, attachmentId: string) => void;
  onArchive?: (taskId: string, archive: boolean) => void;
  onRestore?: (taskId: string) => void;
}

// Helper functions
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

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'LOW': return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
    case 'MEDIUM': return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
    case 'HIGH': return 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200';
    case 'CRITICAL': return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
    default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
  }
};

const getPriorityBorderColor = (priority: string) => {
  switch (priority) {
    case 'LOW': return 'border-l-4 border-l-green-500';
    case 'MEDIUM': return 'border-l-4 border-l-blue-500';
    case 'HIGH': return 'border-l-4 border-l-amber-500';
    case 'CRITICAL': return 'border-l-4 border-l-red-500';
    default: return 'border-l-4 border-l-gray-400';
  }
};

const statusColumns = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'];
const statusLabels: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

// Get border color based on task status (deleted/archived/active)
const getStatusBorderClass = (task: any) => {
  if (task.deleted) return 'border-2 border-red-400 dark:border-red-500';
  if (task.archived) return 'border-2 border-blue-400 dark:border-blue-500';
  return 'border-2 border-green-400 dark:border-green-500';
};

// Check if the current user has any role in the task
const userHasRoleInTask = (task: any, userId: string): boolean => {
  if (task.assignedToId === userId) return true;
  if (task.createdById === userId) return true;
  if ((task as any).orderedById === userId) return true;
  if (Array.isArray(task.coAssigneeIds) && task.coAssigneeIds.includes(userId)) return true;
  if (Array.isArray(task.checklists)) {
    for (const cl of task.checklists) {
      if (Array.isArray(cl.items)) {
        for (const item of cl.items) {
          if (Array.isArray(item.assigneeIds) && item.assigneeIds.includes(userId)) return true;
        }
      }
    }
  }
  return false;
};

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  isMobile,
  currentUserId,
  onDelete,
  onEdit,
  onStatusChange,
  onReact,
  onChatWithUser,
  onNavigateToChat,
  onStartChat,
  onAddAttachment,
  onDeleteAttachment,
  onArchive,
  onRestore,
}) => {
  const { user } = useAuthStore();
  const hasMyRole = userHasRoleInTask(task, currentUserId);

  // Dropdown menu state
  const [showMenu, setShowMenu] = useState(false);

  // Internal comment state
  const [expandedComments, setExpandedComments] = useState(false);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Internal attachment form state
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'link' | 'file'>('link');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');

  // Load comments when expanded
  useEffect(() => {
    if (expandedComments) {
      setLoadingComments(true);
      api.getTaskComments(task.id).then((data) => {
        setTaskComments(data.comments || []);
        setLoadingComments(false);
      }).catch(() => setLoadingComments(false));
    }
  }, [expandedComments, task.id]);

  const handleAddComment = async (taskId: string, commentText: string) => {
    if (!commentText.trim()) return;
    try {
      await api.addTaskComment(taskId, commentText.trim());
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
    } catch (err) {
      console.error('Add comment error:', err);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return;
    try {
      await api.updateTaskComment(task.id, commentId, editingCommentText.trim());
      setEditingCommentId(null);
      setEditingCommentText('');
      const data = await api.getTaskComments(task.id);
      setTaskComments(data.comments || []);
    } catch (err) {
      console.error('Update comment error:', err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.deleteTaskComment(task.id, commentId);
      const data = await api.getTaskComments(task.id);
      setTaskComments(data.comments || []);
    } catch (err) {
      console.error('Delete comment error:', err);
    }
  };

  const handleAddAttachmentSubmit = () => {
    if (!attachmentName.trim() || !attachmentUrl.trim()) return;
    onAddAttachment(task.id, {
      type: attachmentType,
      name: attachmentName.trim(),
      url: attachmentUrl.trim(),
    });
    setAttachmentName('');
    setAttachmentUrl('');
    setShowAttachmentForm(false);
  };

  const handleStartChat = async () => {
    if (task.conversationId) {
      onNavigateToChat(task.conversationId);
    } else {
      const conversationId = await onStartChat(task.id);
      if (conversationId) {
        onNavigateToChat(conversationId);
      }
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showMenu]);

  // Render 3-dot dropdown menu
  const renderDropdownMenu = () => {
    if (!showMenu) return null;
    return (
      <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-600 rounded-lg shadow-lg py-1 min-w-[140px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(false);
            if (task.deleted || task.archived) {
              alert('Please restore this task to active status before editing.');
              return;
            }
            onEdit(task);
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${task.deleted || task.archived ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-700'}`}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        {onArchive && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onArchive(task.id, !task.archived); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-700"
          >
            {task.archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {task.archived ? 'Unarchive' : 'Archive'}
          </button>
        )}
        {onRestore && (task.deleted || task.archived) && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRestore(task.id); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-surface-700"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(task.id); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    );
  };

  const likes = (task.reactions || []).filter((r: any) => r.type === 'like').length;
  const dislikes = (task.reactions || []).filter((r: any) => r.type === 'dislike').length;
  const userReaction = (task.reactions || []).find((r: any) => r.userId === currentUserId)?.type;
  const commentCount = task._count?.comments || 0;

  // Render comments section
  const renderComments = () => {
    if (!expandedComments) return null;
    return (
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-surface-700 space-y-2">
        {loadingComments ? (
          <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {taskComments.map((comment) => (
              <div key={comment.id} className="flex gap-2 text-xs group">
                <button onClick={() => onChatWithUser(comment.user?.id)} className="flex-shrink-0 hover:opacity-80">
                  <Avatar name={comment.user?.displayName || '?'} src={comment.user?.avatarUrl} size="sm" />
                </button>
                <div className="flex-1 min-w-0">
                  <button onClick={() => onChatWithUser(comment.user?.id)} className="font-semibold text-gray-900 dark:text-white hover:underline">
                    {comment.user?.displayName || comment.user?.username}
                  </button>
                  {editingCommentId === comment.id ? (
                    <input
                      autoFocus
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateComment(comment.id);
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
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-0.5 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <CommentInput taskId={task.id} onSubmit={handleAddComment} />
          </>
        )}
      </div>
    );
  };

  // Render attachments
  const renderAttachments = () => {
    if (!(task as any).attachments?.length) return null;
    return (
      <div className="mt-2 space-y-1">
        {(task as any).attachments.map((att: any) => (
          <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:underline group">
            {att.type === 'link' ? <Link2 className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
            <span className="truncate">{att.name}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
            {att.uploadedBy?.id === currentUserId && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteAttachment(task.id, att.id); }} className="ml-auto text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </a>
        ))}
      </div>
    );
  };

  // Render attachment form
  const renderAttachmentForm = () => {
    if (!showAttachmentForm) return null;
    return (
      <div className="mt-2 p-2 bg-gray-50 dark:bg-surface-800 rounded border border-gray-200 dark:border-surface-600 space-y-2">
        <div className="flex gap-2">
          <button onClick={() => setAttachmentType('link')} className={`px-2 py-1 text-xs rounded ${attachmentType === 'link' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-surface-700 text-gray-600 dark:text-gray-400'}`}>
            <Link2 className="w-3 h-3 inline mr-1" />Link
          </button>
          <button onClick={() => setAttachmentType('file')} className={`px-2 py-1 text-xs rounded ${attachmentType === 'file' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-surface-700 text-gray-600 dark:text-gray-400'}`}>
            <FileText className="w-3 h-3 inline mr-1" />Document
          </button>
        </div>
        <input placeholder="Name" value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} className="w-full px-2 py-1 text-xs rounded bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white" />
        <input placeholder={attachmentType === 'link' ? 'https://...' : 'Document URL'} value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} className="w-full px-2 py-1 text-xs rounded bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white" />
        <div className="flex gap-1 justify-end">
          <button onClick={() => setShowAttachmentForm(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={handleAddAttachmentSubmit} disabled={!attachmentName.trim() || !attachmentUrl.trim()} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    );
  };

  // Render reactions & comments bar
  const renderReactionsBar = () => (
    <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 dark:border-surface-700">
      <button
        onClick={() => onReact(task.id, 'like')}
        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${userReaction === 'like' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
      >
        <ThumbsUp className="w-3.5 h-3.5" /> {likes > 0 && likes}
      </button>
      <button
        onClick={() => onReact(task.id, 'dislike')}
        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${userReaction === 'dislike' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
      >
        <ThumbsDown className="w-3.5 h-3.5" /> {dislikes > 0 && dislikes}
      </button>
      <button
        onClick={() => setExpandedComments(!expandedComments)}
        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${expandedComments ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
      >
        <MessageCircle className="w-3.5 h-3.5" /> {commentCount > 0 && commentCount}
      </button>
      <button
        onClick={() => setShowAttachmentForm(!showAttachmentForm)}
        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 ${showAttachmentForm ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
      >
        <Paperclip className="w-3.5 h-3.5" /> {(task as any).attachments?.length > 0 && (task as any).attachments.length}
      </button>
      <button
        onClick={handleStartChat}
        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 text-green-600 dark:text-green-400 ml-auto"
        title={task.conversationId ? "Open task chat room" : "Create task chat room"}
      >
        <MessageSquare className="w-3.5 h-3.5" /> {task.conversationId ? 'Chat' : 'Start Chat'}
      </button>
    </div>
  );

  // Render checklists progress
  const renderChecklists = () => {
    if (!(task as any).checklists?.length) return null;
    return (
      <div className="mb-2 space-y-1">
        {(task as any).checklists.map((cl: any) => {
          const total = cl.items?.length || 0;
          const done = cl.items?.filter((i: any) => i.completed).length || 0;
          return (
            <div key={cl.id} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" />
                  {cl.title}
                </span>
                <span className="text-gray-400">{done}/{total}</span>
              </div>
              {total > 0 && (
                <div className="h-1.5 bg-gray-200 dark:bg-surface-600 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div className={`relative bg-white dark:bg-surface-800 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md transition-shadow ${getStatusBorderClass(task)} ${getPriorityBorderColor(task.priority)} ${task.deleted ? 'opacity-70' : task.archived ? 'opacity-80' : ''}`}>
        {/* Green "my role" triangle indicator */}
        {hasMyRole && (
          <div className="absolute top-0 right-0 w-0 h-0" style={{ borderTop: '20px solid #22c55e', borderLeft: '20px solid transparent' }} title="You have a role in this task" />
        )}
        {/* Deleted / Archived banner */}
        {(task.deleted || task.archived) && (
          <div className={`flex items-center justify-between mb-2 px-2 py-1.5 rounded text-xs font-medium ${task.deleted ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
            <span>{task.deleted ? 'Deleted' : 'Archived'}</span>
            {onRestore && (
              <button onClick={() => onRestore(task.id)} className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition">
                <RotateCcw className="w-3 h-3" /> Restore
              </button>
            )}
          </div>
        )}
        {/* Title + menu */}
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-gray-900 dark:text-white flex-1">
            {task.title}
          </h4>
          <div className="relative ml-2 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            {renderDropdownMenu()}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {task.description}
          </p>
        )}

        {/* Labels */}
        {task.labels?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {task.labels.map((label: string, idx: number) => (
              <span key={idx} className="text-xs bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
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

        {/* Checklists progress */}
        {renderChecklists()}

        {/* Assignee */}
        <button
          onClick={() => onChatWithUser(task.assignedTo?.id || task.assignedToId)}
          className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-surface-700 hover:opacity-80 w-full text-left"
        >
          <Avatar
            name={task.assignedTo?.displayName || task.assignedTo?.username || ''}
            src={task.assignedTo?.avatarUrl}
            size="sm"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {task.assignedTo?.displayName || task.assignedTo?.username || ''}
          </span>
        </button>

        {/* Date and Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Calendar className="w-3 h-3" />
              <span>{new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            {task.deadline && (
              <div className={`flex items-center gap-1 text-xs ${getDeadlineColor(task.deadline)}`}>
                <span>&rarr;</span>
                <span>{new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </div>

          <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value)}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-surface-600 cursor-pointer"
          >
            {statusColumns.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>

        </div>

        {/* Attachments */}
        {renderAttachments()}
        {renderAttachmentForm()}

        {/* Reactions & Comments bar */}
        {renderReactionsBar()}

        {/* Expanded comments */}
        {renderComments()}
      </div>
    );
  }

  // Desktop kanban card
  return (
    <div className={`relative bg-white dark:bg-surface-800 rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow ${getStatusBorderClass(task)} ${task.deleted ? 'opacity-70' : task.archived ? 'opacity-80' : ''}`}>
      {/* Green "my role" triangle indicator */}
      {hasMyRole && (
        <div className="absolute top-0 right-0 w-0 h-0" style={{ borderTop: '20px solid #22c55e', borderLeft: '20px solid transparent' }} title="You have a role in this task" />
      )}
      {/* Deleted / Archived banner */}
      {(task.deleted || task.archived) && (
        <div className={`flex items-center justify-between mb-2 px-2 py-1 rounded text-xs font-medium ${task.deleted ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
          <span>{task.deleted ? 'Deleted' : 'Archived'}</span>
          {onRestore && (
            <button onClick={() => onRestore(task.id)} className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition text-xs">
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
          )}
        </div>
      )}
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white flex-1 text-sm line-clamp-2">
          {task.title}
        </h4>
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 hover:bg-gray-100 dark:hover:bg-surface-700 rounded"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>
          {renderDropdownMenu()}
        </div>
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
            Linda
          </span>
        )}
      </div>

      {task.orderedBy && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="font-medium">Ordered by:</span>
          <button onClick={() => onChatWithUser(task.orderedBy!.id)} className="hover:underline cursor-pointer">
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
            <span>&rarr;</span>
            <span>{new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
      </div>

      {task.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label: string, idx: number) => (
            <span key={idx} className="text-xs bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Checklists progress */}
      {renderChecklists()}

      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-surface-700">
        <button
          onClick={() => onChatWithUser(task.assignedTo?.id || task.assignedToId)}
          className="flex items-center gap-1 hover:opacity-80 cursor-pointer"
          title={`Chat with ${task.assignedTo?.displayName || task.assignedTo?.username || ''}`}
        >
          <Avatar
            name={task.assignedTo?.displayName || task.assignedTo?.username || ''}
            src={task.assignedTo?.avatarUrl}
            size="sm"
          />
        </button>

        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-surface-600 cursor-pointer"
        >
          {statusColumns.map((status) => (
            <option key={status} value={status}>{statusLabels[status]}</option>
          ))}
        </select>

      </div>

      {/* Attachments */}
      {renderAttachments()}
      {renderAttachmentForm()}

      {/* Reactions & Comments bar */}
      {renderReactionsBar()}

      {/* Expanded comments */}
      {renderComments()}
    </div>
  );
};

export default TaskCard;
