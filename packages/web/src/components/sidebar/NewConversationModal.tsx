import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users } from 'lucide-react';
import { api, SearchUsersResponse } from '@/services/api';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';

type Tab = 'dm' | 'group' | 'channel';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectedMember {
  id: string;
  username: string;
  avatar?: string;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUsersResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createConversation = useChatStore((state) => state.createConversation);
  const currentUser = useAuthStore((state) => state.user);

  // Search users with debounce
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await api.searchUsers(query);
      setSearchResults(results.filter((u) => u.id !== currentUser?.id));
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const toggleMember = (user: SearchUsersResponse) => {
    setSelectedMembers((prev) => {
      const exists = prev.find((m) => m.id === user.id);
      if (exists) {
        return prev.filter((m) => m.id !== user.id);
      }
      return [...prev, { id: user.id, username: user.username, avatar: user.avatar }];
    });
  };

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  const handleCreate = async () => {
    try {
      setIsCreating(true);

      const participantIds =
        activeTab === 'dm'
          ? [selectedMembers[0]?.id]
          : selectedMembers.map((m) => m.id);

      if (!participantIds.length) {
        return;
      }

      const name = activeTab === 'group' ? groupName : undefined;
      await createConversation(participantIds, name);

      // Reset and close
      setSearchQuery('');
      setSelectedMembers([]);
      setGroupName('');
      setActiveTab('dm');
      onClose();
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = () => {
    if (activeTab === 'dm') {
      return selectedMembers.length === 1;
    }
    if (activeTab === 'group') {
      return selectedMembers.length >= 1 && groupName.trim().length > 0;
    }
    if (activeTab === 'channel') {
      return groupName.trim().length > 0;
    }
    return false;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-surface-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-surface-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {activeTab === 'dm'
              ? 'New Direct Message'
              : activeTab === 'group'
                ? 'New Group'
                : 'New Channel'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-surface-700">
          <button
            onClick={() => {
              setActiveTab('dm');
              setSelectedMembers([]);
              setGroupName('');
            }}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'dm'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Direct Message
          </button>
          <button
            onClick={() => {
              setActiveTab('group');
              setSelectedMembers([]);
              setGroupName('');
            }}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'group'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Group
          </button>
          <button
            onClick={() => {
              setActiveTab('channel');
              setSelectedMembers([]);
              setGroupName('');
            }}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'channel'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Channel
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Group/Channel name input */}
          {activeTab !== 'dm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {activeTab === 'group' ? 'Group Name' : 'Channel Name'}
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={activeTab === 'group' ? 'e.g., Project Team' : 'e.g., announcements'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
          </div>

          {/* Selected members chips */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1 rounded-full text-sm"
                >
                  <span>{member.username}</span>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search results or empty state */}
          {isSearching && (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 dark:border-primary-400 border-t-transparent" />
            </div>
          )}

          {!isSearching && searchQuery && searchResults.length === 0 && (
            <div className="text-center py-6">
              <p className="text-gray-500 dark:text-gray-400 text-sm">No users found</p>
            </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((user) => {
                const isSelected = selectedMembers.some((m) => m.id === user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleMember(user)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-surface-800'
                    }`}
                  >
                    <Avatar src={user.avatar} name={user.username} size="md" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {user.username}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user.email}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-600 dark:bg-primary-500 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!isSearching && !searchQuery && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="w-8 h-8 text-gray-400 dark:text-gray-600 mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Start typing to search for users
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-surface-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-800 transition-colors font-medium"
          >
            Cancel
          </button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate() || isCreating}
            isLoading={isCreating}
            className="flex-1"
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewConversationModal;
