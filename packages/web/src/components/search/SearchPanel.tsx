import { useState, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '@/services/api';
import { formatDistanceToNow } from 'date-fns';

interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender?: { id: string; displayName?: string; username?: string; avatarUrl?: string };
  conversationId: string;
  conversation?: { id: string; name?: string; type: string };
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
  const debounceRef = useRef<NodeJS.Timeout>();

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await api.searchMessages(searchQuery);
        setResults(data as unknown as SearchResult[]);
        setHasSearched(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-amber-200 dark:bg-amber-700 rounded px-0.5">{part}</mark>
        : part
    );
  };

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
            placeholder="Search messages..."
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
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-surface-700 rounded transition-colors"
            title="Close search"
          >
            <X size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Results Dropdown */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-primary-600 dark:border-primary-400 border-t-transparent rounded-full" />
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
              <span className="text-[10px] text-gray-400 ml-auto">
                {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}
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
          </div>
        )}
      </div>
    </div>
  );
}
