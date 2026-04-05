'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Camera, Type, ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from '@/components/common/Avatar';
import { useAuthStore } from '@/store/authStore';
import { api, StatusItem, UserStatusGroup } from '@/services/api';

interface StatusBarProps {
  onStatusClick?: () => void;
}

interface TextStatusData {
  content: string;
  bgColor: string;
}

interface MediaStatusData {
  file: File;
  caption: string;
}

const BG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
];

// Status Viewer Component
const StatusViewer = ({
  statusGroups,
  initialContactId,
  onClose,
}: {
  statusGroups: UserStatusGroup[];
  initialContactId?: string;
  onClose: () => void;
}) => {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(
    initialContactId
      ? statusGroups.findIndex((g) => g.userId === initialContactId)
      : 0
  );
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const autoPlayRef = useRef<NodeJS.Timeout>();

  const currentGroup = statusGroups[currentGroupIndex];
  const currentStatus = currentGroup?.statuses[currentStatusIndex];

  useEffect(() => {
    if (!isAutoPlay || !currentStatus) return;

    const duration = currentStatus.type === 'text' ? 5000 : 5000;

    autoPlayRef.current = setTimeout(() => {
      if (currentStatusIndex < currentGroup.statuses.length - 1) {
        setCurrentStatusIndex(currentStatusIndex + 1);
      } else if (currentGroupIndex < statusGroups.length - 1) {
        setCurrentGroupIndex(currentGroupIndex + 1);
        setCurrentStatusIndex(0);
      } else {
        onClose();
      }
    }, duration);

    return () => {
      if (autoPlayRef.current) {
        clearTimeout(autoPlayRef.current);
      }
    };
  }, [isAutoPlay, currentStatusIndex, currentGroupIndex, currentStatus, currentGroup.statuses.length, statusGroups.length, onClose]);

  // Mark as viewed
  useEffect(() => {
    if (currentStatus && !currentStatus.viewedByMe) {
      api.viewStatus(currentStatus.id).catch(console.error);
    }
  }, [currentStatus]);

  const handlePrevious = () => {
    setIsAutoPlay(false);
    if (currentStatusIndex > 0) {
      setCurrentStatusIndex(currentStatusIndex - 1);
    } else if (currentGroupIndex > 0) {
      setCurrentGroupIndex(currentGroupIndex - 1);
      setCurrentStatusIndex(statusGroups[currentGroupIndex - 1].statuses.length - 1);
    }
  };

  const handleNext = () => {
    setIsAutoPlay(false);
    if (currentStatusIndex < currentGroup.statuses.length - 1) {
      setCurrentStatusIndex(currentStatusIndex + 1);
    } else if (currentGroupIndex < statusGroups.length - 1) {
      setCurrentGroupIndex(currentGroupIndex + 1);
      setCurrentStatusIndex(0);
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!currentGroup || !currentStatus) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
        {currentGroup.statuses.map((_, idx) => (
          <div
            key={idx}
            className="flex-1 h-0.5 bg-gray-600 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white transition-all duration-300"
              style={{
                width: idx < currentStatusIndex ? '100%' : idx === currentStatusIndex ? '50%' : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* User info */}
      <div className="absolute top-6 left-6 right-6 flex items-center gap-3 z-10">
        <Avatar src={currentGroup.avatarUrl} name={currentGroup.displayName} size="sm" />
        <div>
          <div className="text-white font-semibold text-sm">{currentGroup.displayName}</div>
          <div className="text-gray-400 text-xs">
            {currentStatus.createdAt
              ? new Date(currentStatus.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'now'}
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 p-2 hover:bg-white/20 rounded-full transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Content */}
      <div className="w-full h-full max-w-2xl max-h-screen flex items-center justify-center">
        {currentStatus.type === 'text' ? (
          <div
            className="w-full h-full flex items-center justify-center p-4"
            style={{ backgroundColor: currentStatus.bgColor || '#3b82f6' }}
          >
            <p className="text-white text-center text-4xl font-bold max-w-xl break-words">
              {currentStatus.content}
            </p>
          </div>
        ) : currentStatus.type === 'image' ? (
          <img
            src={currentStatus.content}
            alt="Status"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            src={currentStatus.content}
            autoPlay
            controls
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Navigation */}
      <button
        onClick={handlePrevious}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 hover:bg-white/20 rounded-full transition-colors z-10"
      >
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 hover:bg-white/20 rounded-full transition-colors z-10"
      >
        <ChevronRight className="w-6 h-6 text-white" />
      </button>

      {/* Swipe down hint for mobile */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-sm text-center opacity-60">
        Swipe down to close
      </div>
    </div>
  );
};

// Status Creation Modal
const StatusCreationModal = ({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: TextStatusData | MediaStatusData) => Promise<void>;
  isLoading: boolean;
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'media'>('text');
  const [textData, setTextData] = useState<TextStatusData>({
    content: '',
    bgColor: BG_COLORS[4],
  });
  const [mediaData, setMediaData] = useState<MediaStatusData>({
    file: null as any,
    caption: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = async () => {
    if (!textData.content.trim()) return;
    await onSubmit(textData);
    setTextData({ content: '', bgColor: BG_COLORS[4] });
    onClose();
  };

  const handleMediaSubmit = async () => {
    if (!mediaData.file) return;
    await onSubmit(mediaData);
    setMediaData({ file: null as any, caption: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md max-h-96 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Add Status
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'text'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Type className="w-4 h-4 inline mr-2" />
            Text
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'media'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Camera className="w-4 h-4 inline mr-2" />
            Photo/Video
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'text' ? (
            <div className="space-y-4">
              <textarea
                value={textData.content}
                onChange={(e) => setTextData({ ...textData, content: e.target.value })}
                placeholder="What's on your mind?"
                className="w-full h-24 p-3 border border-slate-200 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Background Color
                </label>
                <div className="flex gap-2">
                  {BG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setTextData({ ...textData, bgColor: color })}
                      className={`w-12 h-12 rounded-lg transition-all ${
                        textData.bgColor === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-center"
              >
                <Camera className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Click to select photo or video
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setMediaData({ ...mediaData, file: e.target.files[0] });
                  }
                }}
                className="hidden"
              />
              {mediaData.file && (
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {mediaData.file.name}
                  </p>
                </div>
              )}
              <textarea
                value={mediaData.caption}
                onChange={(e) => setMediaData({ ...mediaData, caption: e.target.value })}
                placeholder="Add a caption (optional)"
                className="w-full h-16 p-3 border border-slate-200 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={activeTab === 'text' ? handleTextSubmit : handleMediaSubmit}
            disabled={
              isLoading ||
              (activeTab === 'text' && !textData.content.trim()) ||
              (activeTab === 'media' && !mediaData.file)
            }
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main StatusBar Component
export default function StatusBar({ onStatusClick }: StatusBarProps) {
  const user = useAuthStore((state) => state.user);
  const [myStatuses, setMyStatuses] = useState<StatusItem[]>([]);
  const [contactStatuses, setContactStatuses] = useState<UserStatusGroup[]>([]);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load statuses
  useEffect(() => {
    const loadStatuses = async () => {
      try {
        setIsLoadingStatuses(true);
        const [myResponse, contactResponse] = await Promise.all([
          api.getMyStatuses(),
          api.getContactStatuses(),
        ]);
        const { statuses: myStatuses } = myResponse;
        const { users: contactUsers } = contactResponse;
        setMyStatuses(myStatuses);
        setContactStatuses(contactUsers);
      } catch (error) {
        console.error('Failed to load statuses:', error);
      } finally {
        setIsLoadingStatuses(false);
      }
    };

    loadStatuses();
    // Refresh every 30 seconds
    const interval = setInterval(loadStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusSubmit = async (data: TextStatusData | MediaStatusData) => {
    setIsLoading(true);
    try {
      if ('content' in data) {
        await api.createTextStatus(data.content, data.bgColor);
      } else {
        await api.createMediaStatus(data.file, data.caption);
      }
      // Refresh statuses
      const myResponse = await api.getMyStatuses();
      const { statuses } = myResponse;
      setMyStatuses(statuses);
      onStatusClick?.();
    } catch (error) {
      console.error('Failed to create status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasActiveStatus = myStatuses.length > 0;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="px-2 py-3 overflow-x-auto" ref={scrollContainerRef}>
          <div className="flex gap-2 min-w-min">
            {/* My Status Circle */}
            <button
              onClick={() => setShowCreationModal(true)}
              className="flex-shrink-0 relative group"
            >
              <div className="relative w-14 h-14">
                <Avatar
                  src={user?.avatar}
                  name={user?.username || 'You'}
                  size="lg"
                  className="w-full h-full"
                />
                {!hasActiveStatus && (
                  <div className="absolute bottom-0 right-0 bg-blue-600 rounded-full p-1 shadow-lg">
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                )}
                {hasActiveStatus && (
                  <div className="absolute inset-0 rounded-full border-2 border-green-500" />
                )}
              </div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1 text-center truncate w-14">
                Your story
              </p>
            </button>

            {/* Contact Statuses */}
            {isLoadingStatuses ? (
              <div className="flex gap-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 animate-pulse">
                    <div className="w-14 h-14 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              contactStatuses.map((group) => {
                const hasUnviewed = group.statuses.some((s) => !s.viewedByMe);
                return (
                  <button
                    key={group.userId}
                    onClick={() => {
                      setSelectedContactId(group.userId);
                      setShowViewer(true);
                    }}
                    className="flex-shrink-0 group"
                  >
                    <div className="relative w-14 h-14">
                      <Avatar
                        src={group.avatarUrl}
                        name={group.displayName}
                        size="lg"
                        className="w-full h-full"
                      />
                      {/* Status ring - green if unviewed, gray if viewed */}
                      <div
                        className={`absolute inset-0 rounded-full border-2 ${
                          hasUnviewed
                            ? 'border-green-500'
                            : 'border-slate-400 dark:border-slate-600'
                        }`}
                      />
                      {/* Multiple status segments */}
                      {group.statuses.length > 1 && (
                        <div className="absolute bottom-0 right-0 flex gap-0.5 bg-white dark:bg-slate-900 rounded-full p-1">
                          {group.statuses.slice(0, 3).map((_, idx) => (
                            <div
                              key={idx}
                              className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1 text-center truncate w-14">
                      {group.displayName.split(' ')[0]}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreationModal && (
        <StatusCreationModal
          onClose={() => setShowCreationModal(false)}
          onSubmit={handleStatusSubmit}
          isLoading={isLoading}
        />
      )}

      {showViewer && selectedContactId && (
        <StatusViewer
          statusGroups={contactStatuses}
          initialContactId={selectedContactId}
          onClose={() => {
            setShowViewer(false);
            setSelectedContactId(undefined);
          }}
        />
      )}
    </>
  );
}
