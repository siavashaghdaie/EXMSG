import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import { Plus, X, Pin, MoreVertical, Loader2, Megaphone, Check, Clock, Eye, Users, CheckCircle2, ThumbsUp, ThumbsDown, MessageCircle, Share2, Pencil, Trash2 } from 'lucide-react';
import { api, AnnouncementItem } from '@/services/api';

interface AnnouncementBoardProps {
  onClose: () => void;
}

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

interface CreateAnnouncementForm {
  title: string;
  content: string;
  priority: Priority;
  pinned: boolean;
  expiresAt: string;
}

interface EditingAnnouncement {
  id: string;
  form: CreateAnnouncementForm;
}

const AnnouncementBoard: React.FC<AnnouncementBoardProps> = ({ onClose }) => {
  const { user } = useAuthStore();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<EditingAnnouncement | null>(null);
  const [canAnnounce, setCanAnnounce] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingReadsId, setViewingReadsId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Default expiration: 7 days from now
  const getDefaultExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState<CreateAnnouncementForm>({
    title: '',
    content: '',
    priority: 'NORMAL',
    pinned: false,
    expiresAt: getDefaultExpiry(),
  });

  // Load announcements and check permissions
  const loadData = async () => {
    try {
      setLoading(true);
      // Load independently so one failure doesn't block the other
      const [announcementsResult, canAnnounceResult] = await Promise.allSettled([
        api.getAnnouncements(),
        api.canAnnounce(),
      ]);
      if (announcementsResult.status === 'fulfilled') {
        setAnnouncements(announcementsResult.value.announcements || []);
      } else {
        console.error('Failed to load announcements:', announcementsResult.reason);
        setAnnouncements([]);
      }
      if (canAnnounceResult.status === 'fulfilled') {
        setCanAnnounce(canAnnounceResult.value.canAnnounce);
      } else {
        console.error('Failed to check announce permission:', canAnnounceResult.reason);
        setCanAnnounce(false);
      }
    } catch (error) {
      console.error('Failed to load announcements data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (expandedComments) {
      setLoadingComments(true);
      api.getAnnouncementComments(expandedComments).then((data) => {
        setComments(data.comments || []);
        setLoadingComments(false);
      }).catch(() => setLoadingComments(false));
    }
  }, [expandedComments]);

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      priority: 'NORMAL',
      pinned: false,
      expiresAt: getDefaultExpiry(),
    });
    setEditingAnnouncement(null);
  };

  const handleCreateClick = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleEditClick = (announcement: AnnouncementItem) => {
    setEditingAnnouncement({
      id: announcement.id,
      form: {
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority as Priority,
        pinned: announcement.pinned,
        expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt).toISOString().split('T')[0] : getDefaultExpiry(),
      },
    });
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority as Priority,
      pinned: announcement.pinned,
      expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt).toISOString().split('T')[0] : getDefaultExpiry(),
    });
    setShowCreateModal(true);
    setOpenMenuId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Title and content are required');
      return;
    }
    if (!formData.expiresAt) {
      alert('Expiration date is required');
      return;
    }

    try {
      setSubmitting(true);
      if (editingAnnouncement) {
        const updated = await api.updateAnnouncement(editingAnnouncement.id, {
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          pinned: formData.pinned,
          expiresAt: formData.expiresAt,
        });
        setAnnouncements(
          announcements.map((a) => a.id === editingAnnouncement.id ? { ...a, ...updated } : a)
        );
      } else {
        const newAnnouncement = await api.createAnnouncement({
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          pinned: formData.pinned,
          expiresAt: formData.expiresAt,
        });
        setAnnouncements([newAnnouncement, ...announcements]);
      }
      resetForm();
      setShowCreateModal(false);
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error: any) {
      console.error('Failed to save announcement:', error);
      alert(error?.response?.data?.error || 'Failed to save announcement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await api.deleteAnnouncement(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      setOpenMenuId(null);
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      alert('Failed to delete announcement.');
    }
  };

  const handleToggleNoted = async (announcementId: string, currentlyNoted: boolean) => {
    try {
      if (currentlyNoted) {
        await api.unnoteAnnouncement(announcementId);
        setAnnouncements(announcements.map((a) =>
          a.id === announcementId ? { ...a, noted: false, notedAt: null } : a
        ));
      } else {
        const result = await api.noteAnnouncement(announcementId);
        setAnnouncements(announcements.map((a) =>
          a.id === announcementId ? { ...a, noted: true, notedAt: result.notedAt } : a
        ));
      }
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (error) {
      console.error('Failed to toggle noted:', error);
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'LOW': return 'border-l-green-500';
      case 'NORMAL': return 'border-l-blue-500';
      case 'HIGH': return 'border-l-amber-500';
      case 'URGENT': return 'border-l-red-500';
      default: return 'border-l-blue-500';
    }
  };

  const getNotedBg = (noted: boolean, priority: string): string => {
    if (noted) return 'bg-green-50 dark:bg-green-950/40';
    switch (priority) {
      case 'LOW': return 'bg-green-50 dark:bg-green-950';
      case 'NORMAL': return 'bg-blue-50 dark:bg-blue-950';
      case 'HIGH': return 'bg-amber-50 dark:bg-amber-950';
      case 'URGENT': return 'bg-red-50 dark:bg-red-950';
      default: return 'bg-blue-50 dark:bg-blue-950';
    }
  };

  const canEditOrDelete = (announcement: AnnouncementItem): boolean => {
    return user?.id === announcement.author.id;
  };

  const isAuthor = (announcement: AnnouncementItem): boolean => {
    return user?.id === announcement.author.id;
  };

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getExpiryInfo = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = exp.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return { text: 'Expired', color: 'text-red-500' };
    if (days <= 2) return { text: `Expires in ${days}d`, color: 'text-red-500' };
    if (days <= 7) return { text: `Expires in ${days}d`, color: 'text-amber-500' };
    return { text: `Expires ${exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, color: 'text-slate-500 dark:text-slate-400' };
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-slate-700 dark:text-slate-300" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Public Announcements</h1>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* New Announcement Button */}
      {canAnnounce && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={handleCreateClick}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Add Announcement...
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center mb-4">
              <Megaphone className="w-10 h-10 text-blue-500 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Announcements Yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
              Keep your team informed with important updates and company-wide announcements.
            </p>
            {canAnnounce && (
              <button onClick={handleCreateClick} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg">
                <Plus className="w-5 h-5" />
                Create First Announcement
              </button>
            )}
          </div>
        ) : (
          <div className={isMobile ? 'space-y-4' : 'grid grid-cols-2 gap-4'}>
            {sortedAnnouncements.map((announcement) => {
              const noted = announcement.noted || false;
              const expiryInfo = getExpiryInfo(announcement.expiresAt);
              const reads = announcement.reads || [];
              const notedCount = reads.filter((r) => r.noted).length;
              const totalReads = reads.length;

              return (
                <div
                  key={announcement.id}
                  className={`border-l-4 ${noted ? 'border-l-green-500' : getPriorityColor(announcement.priority)} rounded-lg p-4 shadow-sm hover:shadow-md transition-all ${getNotedBg(noted, announcement.priority)} ${noted ? 'opacity-80' : ''}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {noted && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                        <h3 className={`text-lg font-bold break-words ${noted ? 'text-green-800 dark:text-green-300' : 'text-slate-900 dark:text-white'}`}>
                          {announcement.title}
                        </h3>
                        {announcement.pinned && <Pin className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" />}
                      </div>
                    </div>

                    {/* Menu */}
                    {canEditOrDelete(announcement) && (
                      <div className="relative ml-2">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === announcement.id ? null : announcement.id)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </button>
                        {openMenuId === announcement.id && (
                          <div className="absolute right-0 top-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 min-w-max">
                            <button onClick={() => handleEditClick(announcement)} className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors">Edit</button>
                            <button onClick={() => handleDelete(announcement.id)} className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 transition-colors border-t border-slate-200 dark:border-slate-700">Delete</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Content */}
                  <p className={`mb-3 break-words whitespace-pre-wrap ${noted ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {announcement.content}
                  </p>

                  {/* Expiry Info */}
                  {expiryInfo && (
                    <div className={`flex items-center gap-1 text-xs mb-3 ${expiryInfo.color}`}>
                      <Clock className="w-3 h-3" />
                      <span>{expiryInfo.text}</span>
                    </div>
                  )}

                  {/* Noted Checkbox */}
                  <div className="mb-3">
                    <button
                      onClick={() => handleToggleNoted(announcement.id, noted)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full ${
                        noted
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                        noted ? 'bg-green-500 border-green-500' : 'border-slate-400 dark:border-slate-500'
                      }`}>
                        {noted && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span>{noted ? 'Noted' : 'Mark as Noted'}</span>
                    </button>
                  </div>

                  {/* Interaction Bar */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {/* Like */}
                    <button
                      onClick={async () => {
                        await api.reactToAnnouncement(announcement.id, 'like');
                        loadData();
                      }}
                      className={`flex items-center gap-1 text-xs transition ${
                        announcement.userReaction === 'like' ? 'text-blue-500' : 'text-slate-500 hover:text-blue-500'
                      }`}
                    >
                      <ThumbsUp size={14} className={announcement.userReaction === 'like' ? 'fill-current' : ''} />
                      {announcement.likeCount || 0}
                    </button>
                    {/* Dislike */}
                    <button
                      onClick={async () => {
                        await api.reactToAnnouncement(announcement.id, 'dislike');
                        loadData();
                      }}
                      className={`flex items-center gap-1 text-xs transition ${
                        announcement.userReaction === 'dislike' ? 'text-red-500' : 'text-slate-500 hover:text-red-500'
                      }`}
                    >
                      <ThumbsDown size={14} className={announcement.userReaction === 'dislike' ? 'fill-current' : ''} />
                      {announcement.dislikeCount || 0}
                    </button>
                    {/* Comment toggle */}
                    <button
                      onClick={() => setExpandedComments(expandedComments === announcement.id ? null : announcement.id)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                    >
                      <MessageCircle size={14} />
                      {announcement.commentCount || 0}
                    </button>
                    {/* Share */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/announcements/${announcement.id}`);
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition ml-auto"
                    >
                      <Share2 size={14} />
                      Share
                    </button>
                  </div>

                  {/* Comments Section */}
                  {expandedComments === announcement.id && (
                    <div className="mt-3 space-y-2">
                      {/* Comment list */}
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {loadingComments ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          </div>
                        ) : comments.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">No comments yet. Be the first!</p>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="flex gap-2 text-xs group">
                              <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-bold">{(comment.user?.displayName || '?')[0].toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{comment.user?.displayName}</span>
                                {editingCommentId === comment.id ? (
                                  <div className="mt-1 flex gap-1">
                                    <input
                                      type="text"
                                      value={editingCommentText}
                                      onChange={(e) => setEditingCommentText(e.target.value)}
                                      className="flex-1 px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && editingCommentText.trim()) {
                                          try {
                                            await api.updateAnnouncementComment(announcement.id, comment.id, editingCommentText.trim());
                                            setEditingCommentId(null);
                                            const data = await api.getAnnouncementComments(announcement.id);
                                            setComments(data.comments);
                                          } catch (error) {
                                            console.error('Failed to update comment:', error);
                                          }
                                        } else if (e.key === 'Escape') {
                                          setEditingCommentId(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => setEditingCommentId(null)}
                                      className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 dark:text-slate-400 ml-1">{comment.content}</span>
                                )}
                              </div>
                              {/* Edit/Delete buttons — only for comment author */}
                              {user?.id === comment.user?.id && editingCommentId !== comment.id && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingCommentId(comment.id);
                                      setEditingCommentText(comment.content);
                                    }}
                                    className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                                    title="Edit comment"
                                  >
                                    <Pencil className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.deleteAnnouncementComment(announcement.id, comment.id);
                                        const data = await api.getAnnouncementComments(announcement.id);
                                        setComments(data.comments);
                                        loadData();
                                      } catch (error) {
                                        console.error('Failed to delete comment:', error);
                                      }
                                    }}
                                    className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                                    title="Delete comment"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      {/* Add comment input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Write a comment..."
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && newComment.trim()) {
                              try {
                                await api.addAnnouncementComment(announcement.id, newComment.trim());
                                setNewComment('');
                                // Reload comments
                                const data = await api.getAnnouncementComments(announcement.id);
                                setComments(data.comments);
                                loadData();
                              } catch (error) {
                                console.error('Failed to add comment:', error);
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Author row with "Who noted" for announcement author */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-300 dark:border-slate-600">
                    <div className="flex items-center gap-2">
                      <Avatar src={announcement.author.avatarUrl} name={announcement.author.displayName} size="sm" />
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{announcement.author.displayName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(announcement.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {/* Who Noted button — visible to author */}
                    {isAuthor(announcement) && (
                      <button
                        onClick={() => setViewingReadsId(viewingReadsId === announcement.id ? null : announcement.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{notedCount}/{totalReads > notedCount ? totalReads : notedCount} noted</span>
                      </button>
                    )}
                  </div>

                  {/* Who Noted panel */}
                  {viewingReadsId === announcement.id && isAuthor(announcement) && (
                    <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <Users className="w-4 h-4" />
                        <span>Read Status</span>
                      </div>
                      {reads.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No one has seen this yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {reads.map((read) => (
                            <div key={read.userId} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <Avatar src={read.user.avatarUrl} name={read.user.displayName} size="sm" />
                                <span className="text-slate-700 dark:text-slate-300">{read.user.displayName}</span>
                              </div>
                              {read.noted ? (
                                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> Noted
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">Seen</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => { setShowCreateModal(false); resetForm(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
                </h2>
              </div>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} disabled={submitting} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50">
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Announcement title"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Content *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Announcement content"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Expires *</label>
                  <input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.pinned}
                  onChange={(e) => setFormData({ ...formData, pinned: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-white">Pin this announcement</span>
              </label>
            </form>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingAnnouncement ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementBoard;
