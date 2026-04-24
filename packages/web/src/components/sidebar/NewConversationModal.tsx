import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, Building2, Plus, Mail, Loader2 } from 'lucide-react';
import { api, SearchUsersResponse } from '@/services/api';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';

type Tab = 'dm' | 'group' | 'channel' | 'workspace';

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

  // Workspace tab state
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [workspaceStep, setWorkspaceStep] = useState<'create' | 'invite'>('create');
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<{ email: string; ok: boolean; msg: string }[]>([]);

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
      if (activeTab !== 'workspace') {
        searchUsers(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers, activeTab]);

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

  const resetAll = () => {
    setSearchQuery('');
    setSelectedMembers([]);
    setGroupName('');
    setWorkspaceName('');
    setWorkspaceDescription('');
    setInviteEmails('');
    setWorkspaceStep('create');
    setCreatedOrgId(null);
    setInviteResults([]);
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
      resetAll();
      setActiveTab('dm');
      onClose();
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return;
    setIsCreating(true);
    try {
      const result = await api.createOrgAdminOrganization({
        name: workspaceName.trim(),
        description: workspaceDescription.trim() || undefined,
      });
      const orgId = result?.organization?.id || result?.id;
      setCreatedOrgId(orgId);
      setWorkspaceStep('invite');
    } catch (error: any) {
      console.error('Failed to create workspace:', error);
      const msg = error?.response?.data?.error || error?.message || 'Failed to create workspace';
      alert(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendInvites = async () => {
    if (!createdOrgId || !inviteEmails.trim()) return;
    setInviteSending(true);
    setInviteResults([]);

    const emails = inviteEmails
      .split(/[,;\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes('@'));

    const results: { email: string; ok: boolean; msg: string }[] = [];

    for (const email of emails) {
      try {
        await api.addOrgAdminMember({ email, role: 'MEMBER' }, createdOrgId);
        results.push({ email, ok: true, msg: 'Invite sent' });
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Failed';
        results.push({ email, ok: false, msg });
      }
    }

    setInviteResults(results);
    setInviteSending(false);
  };

  const handleFinishWorkspace = () => {
    resetAll();
    setActiveTab('dm');
    onClose();
    // Reload the page to pick up the new org
    window.location.reload();
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
    if (activeTab === 'workspace') {
      return workspaceName.trim().length > 0;
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
                : activeTab === 'channel'
                  ? 'New Channel'
                  : workspaceStep === 'invite'
                    ? 'Invite Members'
                    : 'New Workspace'}
          </h2>
          <button
            onClick={() => { resetAll(); setActiveTab('dm'); onClose(); }}
            className="p-1 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-surface-700 overflow-x-auto">
          {[
            { id: 'dm' as Tab, label: 'Direct Message' },
            { id: 'group' as Tab, label: 'Group' },
            { id: 'channel' as Tab, label: 'Channel' },
            { id: 'workspace' as Tab, label: 'Workspace' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedMembers([]);
                setGroupName('');
                setWorkspaceName('');
                setWorkspaceDescription('');
                setWorkspaceStep('create');
                setCreatedOrgId(null);
                setInviteResults([]);
              }}
              className={`flex-1 py-3 px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* ─── Workspace Tab ─── */}
          {activeTab === 'workspace' && workspaceStep === 'create' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g., W3TURN Technologies"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={workspaceDescription}
                  onChange={(e) => setWorkspaceDescription(e.target.value)}
                  placeholder="What is this workspace for?"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none"
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  You'll become the workspace owner and can invite members in the next step.
                </p>
              </div>
            </>
          )}

          {activeTab === 'workspace' && workspaceStep === 'invite' && (
            <>
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  Workspace "{workspaceName}" created!
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Invite members by email
                </label>
                <textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  placeholder={"john@example.com\njane@example.com\nteam@company.com"}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 resize-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  One email per line, or separated by commas. Each will receive an invitation link.
                </p>
              </div>

              {/* Invite results */}
              {inviteResults.length > 0 && (
                <div className="space-y-1.5">
                  {inviteResults.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                        r.ok
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      }`}
                    >
                      <span className="font-medium truncate">{r.email}</span>
                      <span className="ml-auto flex-shrink-0">{r.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── DM / Group / Channel content ─── */}
          {activeTab !== 'workspace' && (
            <>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-surface-700">
          {activeTab === 'workspace' ? (
            workspaceStep === 'create' ? (
              <>
                <button
                  onClick={() => { resetAll(); setActiveTab('dm'); onClose(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-800 transition-colors font-medium"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={!workspaceName.trim() || isCreating}
                  isLoading={isCreating}
                  className="flex-1"
                >
                  Create Workspace
                </Button>
              </>
            ) : (
              <>
                <button
                  onClick={handleFinishWorkspace}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-800 transition-colors font-medium"
                >
                  {inviteResults.length > 0 ? 'Done' : 'Skip'}
                </button>
                <Button
                  onClick={inviteResults.length > 0 ? handleFinishWorkspace : handleSendInvites}
                  disabled={inviteSending || (!inviteEmails.trim() && inviteResults.length === 0)}
                  isLoading={inviteSending}
                  className="flex-1"
                >
                  {inviteResults.length > 0 ? 'Finish' : 'Send Invites'}
                </Button>
              </>
            )
          ) : (
            <>
              <button
                onClick={() => { resetAll(); setActiveTab('dm'); onClose(); }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewConversationModal;
