import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import { Plus, X, Pin, MoreVertical, Loader2, Megaphone } from 'lucide-react';
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

  const [formData, setFormData] = useState<CreateAnnouncementForm>({
    title: '',
    content: '',
    priority: 'NORMAL',
    pinned: false,
  });

  // Load announcements and check permissions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [announcementsResponse, canAnnounceResponse] = await Promise.all([
          api.getAnnouncements(),
          api.canAnnounce(),
        ]);
        const { announcements } = announcementsResponse;
        const { canAnnounce } = canAnnounceResponse;
        setAnnouncements(announcements);
        setCanAnnounce(canAnnounce);
      } catch (error) {
        console.error('Failed to load announcements:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      priority: 'NORMAL',
      pinned: false,
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
      },
    });
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority as Priority,
      pinned: announcement.pinned,
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

    try {
      setSubmitting(true);

      if (editingAnnouncement) {
        // Update existing announcement
        await api.updateAnnouncement(editingAnnouncement.id, {
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          pinned: formData.pinned,
        });

        setAnnouncements(
          announcements.map((a) =>
            a.id === editingAnnouncement.id
              ? {
                  ...a,
                  title: formData.title,
                  content: formData.content,
                  priority: formData.priority,
                  pinned: formData.pinned,
                }
              : a
          )
        );
      } else {
        // Create new announcement
        const newAnnouncement = await api.createAnnouncement({
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          pinned: formData.pinned,
        });

        setAnnouncements([newAnnouncement, ...announcements]);
      }

      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to save announcement:', error);
      alert('Failed to save announcement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) {
      return;
    }

    try {
      await api.deleteAnnouncement(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      alert('Failed to delete announcement. Please try again.');
    }
  };

  const getPriorityColor = (priority: Priority): string => {
    switch (priority) {
      case 'LOW':
        return 'border-l-green-500';
      case 'NORMAL':
        return 'border-l-blue-500';
      case 'HIGH':
        return 'border-l-amber-500';
      case 'URGENT':
        return 'border-l-red-500';
      default:
        return 'border-l-blue-500';
    }
  };

  const getPriorityBgColor = (priority: Priority): string => {
    switch (priority) {
      case 'LOW':
        return 'bg-green-50 dark:bg-green-950';
      case 'NORMAL':
        return 'bg-blue-50 dark:bg-blue-950';
      case 'HIGH':
        return 'bg-amber-50 dark:bg-amber-950';
      case 'URGENT':
        return 'bg-red-50 dark:bg-red-950';
      default:
        return 'bg-blue-50 dark:bg-blue-950';
    }
  };

  const canEditOrDelete = (announcement: AnnouncementItem): boolean => {
    return user?.id === announcement.author.id;
  };

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    // Pinned announcements first
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    // Then by date
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-slate-700 dark:text-slate-300" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Public Announcements</h1>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
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
              <button
                onClick={handleCreateClick}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Create First Announcement
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              isMobile
                ? 'space-y-4'
                : 'grid grid-cols-2 gap-4'
            }
          >
            {sortedAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className={`border-l-4 ${getPriorityColor(announcement.priority)} rounded-lg p-4 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow ${getPriorityBgColor(announcement.priority)}`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white break-words">
                        {announcement.title}
                      </h3>
                      {announcement.pinned && (
                        <Pin className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" />
                      )}
                    </div>
                  </div>

                  {/* Menu */}
                  {canEditOrDelete(announcement) && (
                    <div className="relative ml-2">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === announcement.id ? null : announcement.id)
                        }
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      </button>

                      {openMenuId === announcement.id && (
                        <div className="absolute right-0 top-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 min-w-max">
                          <button
                            onClick={() => handleEditClick(announcement)}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(announcement.id)}
                            className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 transition-colors border-t border-slate-200 dark:border-slate-700"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <p className="text-slate-700 dark:text-slate-300 mb-3 break-words whitespace-pre-wrap">
                  {announcement.content}
                </p>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-300 dark:border-slate-600">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={announcement.author.avatarUrl}
                      name={announcement.author.displayName}
                      size="sm"
                    />
                    <div className="flex flex-col">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {announcement.author.displayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(announcement.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
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
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                disabled={submitting}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Announcement title"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>

              {/* Content Textarea */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="Announcement content"
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  disabled={submitting}
                />
              </div>

              {/* Priority Selector */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value as Priority })
                  }
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              {/* Pin Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.pinned}
                  onChange={(e) =>
                    setFormData({ ...formData, pinned: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  Pin this announcement
                </span>
              </label>
            </form>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
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
