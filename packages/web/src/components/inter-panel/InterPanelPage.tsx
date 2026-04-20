import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  Building2,
  Send,
  X,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Inbox,
  Globe,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterPanelPageProps {
  onBack: () => void;
}

type TabType = 'discover' | 'sent' | 'received';

interface PublicPanel {
  id: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
}

interface PanelRequest {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  message?: string | null;
  conversationId?: string | null;
  createdAt: string;
  senderOrg?: { id: string; name: string; avatarUrl?: string | null };
  receiverOrg?: { id: string; name: string; avatarUrl?: string | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const extractError = (err: any): string => {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Something went wrong'
  );
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PanelAvatar({
  src,
  name,
  size = 'md',
}: {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };
  const iconSize = { sm: 16, md: 20, lg: 28 };

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} rounded-lg object-cover flex-shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0`}
    >
      <Building2
        size={iconSize[size]}
        className="text-slate-400 dark:text-slate-500"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'PENDING' | 'ACCEPTED' | 'REJECTED' }) {
  const config = {
    PENDING: {
      label: 'Pending',
      classes:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      Icon: Clock,
    },
    ACCEPTED: {
      label: 'Connected',
      classes:
        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      Icon: CheckCircle,
    },
    REJECTED: {
      label: 'Rejected',
      classes:
        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      Icon: XCircle,
    },
  };

  const { label, classes, Icon } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === 'success'
          ? 'bg-green-600 text-white'
          : 'bg-red-600 text-white'
      }`}
    >
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
      <button onClick={onClose} className="ml-2 p-0.5 hover:opacity-80">
        <X size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect Request Modal
// ---------------------------------------------------------------------------

function ConnectModal({
  panel,
  onClose,
  onSuccess,
}: {
  panel: PublicPanel;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await api.sendPanelRequest(panel.id, message.trim() || undefined);
      onSuccess(`Connection request sent to ${panel.name}`);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Send size={18} /> Connect with {panel.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <PanelAvatar src={panel.avatarUrl} name={panel.name} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {panel.name}
              </p>
              {panel.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {panel.description}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Message <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Introduce your panel and why you'd like to connect..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-right">
              {message.length}/500
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InterPanelPage({ onBack }: InterPanelPageProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<TabType>('discover');

  // Discover state
  const [panels, setPanels] = useState<PublicPanel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [connectPanel, setConnectPanel] = useState<PublicPanel | null>(null);

  // Requests state
  const [sentRequests, setSentRequests] = useState<PanelRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<PanelRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const loadPanels = useCallback(async (query?: string) => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const res = query?.trim()
        ? await api.searchPanels(query.trim())
        : await api.getPublicPanels();
      setPanels(res.panels || []);
    } catch (err) {
      console.error('Load panels failed:', err);
      setDiscoverError(extractError(err));
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await api.getPanelRequests();
      setSentRequests(res.sent || []);
      setReceivedRequests(res.received || []);
    } catch (err) {
      console.error('Load requests failed:', err);
      setRequestsError(extractError(err));
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  // Load requests when switching to sent/received tabs
  useEffect(() => {
    if (activeTab === 'sent' || activeTab === 'received') {
      loadRequests();
    }
  }, [activeTab, loadRequests]);

  // -------------------------------------------------------------------------
  // Search handler
  // -------------------------------------------------------------------------

  const handleSearch = () => {
    loadPanels(searchQuery);
  };

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await api.acceptPanelRequest(requestId);
      setToast({ message: 'Connection accepted!', type: 'success' });
      // Update local state
      setReceivedRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: 'ACCEPTED' as const, conversationId: res.conversationId }
            : r
        )
      );
    } catch (err) {
      setToast({ message: extractError(err), type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await api.rejectPanelRequest(requestId);
      setToast({ message: 'Connection request rejected.', type: 'success' });
      setReceivedRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, status: 'REJECTED' as const } : r
        )
      );
    } catch (err) {
      setToast({ message: extractError(err), type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnectSuccess = (msg: string) => {
    setConnectPanel(null);
    setToast({ message: msg, type: 'success' });
    // Refresh sent requests if on that tab
    if (activeTab === 'sent') {
      loadRequests();
    }
  };

  const handleOpenChat = (conversationId: string) => {
    navigate(`/chat/${conversationId}`);
  };

  // -------------------------------------------------------------------------
  // Permission gate
  // -------------------------------------------------------------------------

  if (user?.orgRole !== 'OWNER') {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Inter-Panel Connections
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl p-8 border border-slate-200 dark:border-slate-700 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Panel Owners Only
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Inter-Panel connections are only available to panel owners. Contact
              your organization owner if you believe this is an error.
            </p>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 sticky top-0 z-10 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            Inter-Panel Connections
          </h1>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'discover') loadPanels(searchQuery);
            else loadRequests();
          }}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw size={18} className="text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sticky top-16 z-10">
        <div className="flex gap-1">
          {(
            [
              { id: 'discover' as TabType, label: 'Discover', Icon: Globe },
              { id: 'sent' as TabType, label: 'Sent', Icon: Send },
              { id: 'received' as TabType, label: 'Received', Icon: Inbox },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
              }`}
            >
              <tab.Icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {/* ================================================================= */}
        {/* DISCOVER TAB                                                      */}
        {/* ================================================================= */}
        {activeTab === 'discover' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Search public panels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition flex items-center gap-2"
              >
                <Search size={16} />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>

            {/* Loading */}
            {discoverLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading panels...
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {discoverError && !discoverLoading && (
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{discoverError}</p>
              </div>
            )}

            {/* Empty state */}
            {!discoverLoading && !discoverError && panels.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Globe className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  No panels found
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Try a different search term to discover public panels.'
                    : 'There are no public panels available at the moment. Check back later!'}
                </p>
              </div>
            )}

            {/* Panel cards grid */}
            {!discoverLoading && panels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {panels.map((panel) => (
                  <div
                    key={panel.id}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 hover:shadow-md transition flex flex-col"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <PanelAvatar
                        src={panel.avatarUrl}
                        name={panel.name}
                        size="lg"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {panel.name}
                        </h3>
                        {panel.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {panel.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto pt-3">
                      <button
                        onClick={() => setConnectPanel(panel)}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                      >
                        <Send size={14} />
                        Connect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* SENT TAB                                                          */}
        {/* ================================================================= */}
        {activeTab === 'sent' && (
          <div className="space-y-4">
            {/* Loading */}
            {requestsLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading sent requests...
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {requestsError && !requestsLoading && (
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{requestsError}</p>
              </div>
            )}

            {/* Empty state */}
            {!requestsLoading && !requestsError && sentRequests.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Send className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  No sent requests
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  You haven't sent any connection requests yet. Head to the
                  Discover tab to find panels to connect with.
                </p>
              </div>
            )}

            {/* Sent request cards */}
            {!requestsLoading && sentRequests.length > 0 && (
              <div className="space-y-3">
                {sentRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <PanelAvatar
                        src={req.receiverOrg?.avatarUrl}
                        name={req.receiverOrg?.name || 'Unknown'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {req.receiverOrg?.name || 'Unknown Panel'}
                        </p>
                        {req.message && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            "{req.message}"
                          </p>
                        )}
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {formatDate(req.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={req.status} />
                      {req.status === 'ACCEPTED' && req.conversationId && (
                        <button
                          onClick={() => handleOpenChat(req.conversationId!)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                        >
                          <MessageSquare size={12} />
                          Open Chat
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* RECEIVED TAB                                                      */}
        {/* ================================================================= */}
        {activeTab === 'received' && (
          <div className="space-y-4">
            {/* Loading */}
            {requestsLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading received requests...
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {requestsError && !requestsLoading && (
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{requestsError}</p>
              </div>
            )}

            {/* Empty state */}
            {!requestsLoading && !requestsError && receivedRequests.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Inbox className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  No incoming requests
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  You haven't received any connection requests yet. Make sure
                  your panel is set to public so other panels can discover you.
                </p>
              </div>
            )}

            {/* Received request cards */}
            {!requestsLoading && receivedRequests.length > 0 && (
              <div className="space-y-3">
                {receivedRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <PanelAvatar
                        src={req.senderOrg?.avatarUrl}
                        name={req.senderOrg?.name || 'Unknown'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {req.senderOrg?.name || 'Unknown Panel'}
                        </p>
                        {req.message && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            "{req.message}"
                          </p>
                        )}
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {formatDate(req.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {req.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleAccept(req.id)}
                            disabled={actionLoading === req.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            {actionLoading === req.id ? (
                              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                              <CheckCircle size={12} />
                            )}
                            Accept
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={actionLoading === req.id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            {actionLoading === req.id ? (
                              <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                              <XCircle size={12} />
                            )}
                            Reject
                          </button>
                        </>
                      )}
                      {req.status === 'ACCEPTED' && (
                        <>
                          <StatusBadge status="ACCEPTED" />
                          {req.conversationId && (
                            <button
                              onClick={() => handleOpenChat(req.conversationId!)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                            >
                              <MessageSquare size={12} />
                              Open Chat
                            </button>
                          )}
                        </>
                      )}
                      {req.status === 'REJECTED' && (
                        <StatusBadge status="REJECTED" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect Modal */}
      {connectPanel && (
        <ConnectModal
          panel={connectPanel}
          onClose={() => setConnectPanel(null)}
          onSuccess={handleConnectSuccess}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
