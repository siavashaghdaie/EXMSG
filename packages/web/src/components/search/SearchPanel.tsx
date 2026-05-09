import { useState, useCallback, useRef } from 'react';
import { Search, X, Filter, Calendar, Paperclip, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { formatDistanceToNow, format } from 'date-fns';

interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender?: { id: string; displayName?: string; username?: string; avatarUrl?: string };
  conversationId: string;
  conversation?: { id: string; name?: string; type?: string };
  attachments?: any[];
}

interface SearchPanelProps {
  onClose: () => void;
  onNavigateToMessage: (conversationId: string, messageId: string) => void;
}

export default function SearchPanel({ onClose, onNavigateToMessage }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasAttachment, setHasAttachment] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout>();
  const lastQueryRef = useRef('');

  const performSearch = useCallback(async (searchQuery: string, searchPage: number = 1) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    lastQueryRef.current = searchQuery;
    try {
      const data = await api.searchMessages(searchQuery, {
        page: searchPage,
        limit: 20,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        hasAttachment: hasAttachment || undefined,
      });
      setResults(data.messages as unknown as SearchResult[]);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setHasSearched(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [dateFrom, dateTo, hasAttachment]);

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery, 1);
    }, 300);
  }, [performSearch]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    performSearch(query, newPage);
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-amber-200 dark:bg-amber-700 rounded px-0.5">{part}</mark>
        : part
    );
  };

  const activeFilterCount = [dateFrom, dateTo, hasAttachment].filter(Boolean).length;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-surface-900 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg">
      {/* Search Input Bar */}
      <div className="p-3 border-b border-gray-200 dark:border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-surface-800 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search messages across all chats..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder-gray-400"
            autoFocus
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
                setHasSearched(false);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-surface-700 rounded transition-colors"
              title="Clear search"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1 rounded transition-colors relative ${showFilters ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-200 dark:hover:bg-surface-700'}`}
            title="Search filters"
          >
            <Filter size={14} className={showFilters ? 'text-blue-500' : 'text-gray-400'} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-surface-700 rounded transition-colors"
            title="Close search"
          >
            <X size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-2 p-3 bg-gray-50 dark:bg-surface-800 rounded-lg space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar size={12} className="text-gray-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
                  placeholder="From"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
                  placeholder="To"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAttachment}
                  onChange={(e) => setHasAttachment(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <Paperclip size={12} className="text-gray-400" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Has attachment</span>
              </label>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setHasAttachment(false);
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  Clear filters
                </button>
              )}
              <button
                onClick={() => performSearch(query, 1)}
                className="ml-auto text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      {hasSearched && !isSearching && (
        <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-surface-700 flex items-center justify-between">
          <span>{total} result{total !== 1 ? 's' : ''} for "{query}"</span>
          {totalPages > 1 && (
            <span>Page {page} of {totalPages}</span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-blue-500" />
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Search size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No messages found for "{query}"</p>
          </div>
        )}

        {!isSearching && results.map((result) => (
          <button
            key={result.id}
            onClick={() => {
              onNavigateToMessage(result.conversation?.id || result.conversationId, result.id);
              onClose();
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-surface-800 border-b border-gray-100 dark:border-surface-700 transition"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                {result.sender?.displayName || result.sender?.username || 'Unknown'}
              </span>
              <span className="text-[10px] text-gray-400">
                in {result.conversation?.name || 'Direct Message'}
              </span>
              {result.attachments && result.attachments.length > 0 && (
                <Paperclip size={10} className="text-gray-400" />
              )}
              <span className="text-[10px] text-gray-400 ml-auto">
                {format(new Date(result.createdAt), 'MMM d, yyyy')} · {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {highlightMatch(result.content || '', query)}
            </p>
          </button>
        ))}

        {!isSearching && !hasSearched && (
          <div className="text-center py-8 text-gray-400">
            <Search size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Type at least 2 characters to search</p>
            <p className="text-xs mt-1">Search across all your conversations</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {hasSearched && totalPages > 1 && !isSearching && (
        <div className="flex items-center justify-center gap-2 py-2 border-t border-gray-100 dark:border-surface-700 flex-shrink-0">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
            const pageNum = start + i;
            if (pageNum > totalPages) return null;
            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`w-7 h-7 text-xs rounded transition ${
                  pageNum === page
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
}
