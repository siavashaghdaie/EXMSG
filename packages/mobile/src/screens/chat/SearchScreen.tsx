import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
  SafeAreaView,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '@/services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '@/navigation/ChatNavigator';

interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender?: { id: string; displayName?: string; username?: string };
  conversationId: string;
  conversation?: { id: string; name?: string; type?: string };
  attachments?: any[];
}

type NavigationProp = NativeStackNavigationProp<ChatStackParamList>;

export default function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [hasAttachment, setHasAttachment] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout>(null);
  const inputRef = useRef<TextInput>(null);

  const performSearch = useCallback(async (searchQuery: string, searchPage: number = 1) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    try {
      const data = await api.searchMessages(searchQuery, {
        page: searchPage,
        limit: 20,
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
  }, [hasAttachment]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(text, 1);
    }, 400);
  }, [performSearch]);

  const handleResultPress = (result: SearchResult) => {
    const convId = result.conversation?.id || result.conversationId;
    const convName = result.conversation?.name || 'Chat';
    navigation.navigate('Chat', { conversationId: convId, name: convName });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const highlightMatch = (text: string) => {
    if (!query.trim()) return <Text style={styles.resultText}>{text}</Text>;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <Text style={styles.resultText}>
        {parts.map((part, i) =>
          regex.test(part)
            ? <Text key={i} style={styles.highlight}>{part}</Text>
            : part
        )}
      </Text>
    );
  };

  const renderResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.resultItem} onPress={() => handleResultPress(item)} activeOpacity={0.7}>
      <View style={styles.resultHeader}>
        <Text style={styles.senderName} numberOfLines={1}>
          {item.sender?.displayName || item.sender?.username || 'Unknown'}
        </Text>
        <Text style={styles.channelName} numberOfLines={1}>
          in {item.conversation?.name || 'Direct Message'}
        </Text>
        {item.attachments && item.attachments.length > 0 && (
          <Ionicons name="attach" size={12} color="#94A3B8" />
        )}
        <Text style={styles.resultDate}>{formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.resultContent}>
        {highlightMatch(item.content || '')}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={16} color="#94A3B8" />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={handleSearch}
              placeholder="Search messages..."
              placeholderTextColor="#94A3B8"
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => performSearch(query, 1)}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setHasSearched(false); }}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setShowFilters(!showFilters)}
            style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          >
            <Ionicons name="options-outline" size={20} color={showFilters ? '#3B82F6' : '#64748B'} />
          </TouchableOpacity>
        </View>

        {/* Filters */}
        {showFilters && (
          <View style={styles.filtersPanel}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Has attachment</Text>
              <Switch
                value={hasAttachment}
                onValueChange={setHasAttachment}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={hasAttachment ? '#3B82F6' : '#F1F5F9'}
              />
            </View>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => { performSearch(query, 1); setShowFilters(false); }}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results count */}
        {hasSearched && !isSearching && (
          <View style={styles.resultsInfo}>
            <Text style={styles.resultsInfoText}>
              {total} result{total !== 1 ? 's' : ''} for "{query}"
            </Text>
            {totalPages > 1 && (
              <Text style={styles.resultsInfoText}>Page {page}/{totalPages}</Text>
            )}
          </View>
        )}

        {/* Results list */}
        {isSearching ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : hasSearched && results.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="search" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No messages found for "{query}"</Text>
          </View>
        ) : !hasSearched ? (
          <View style={styles.centered}>
            <Ionicons name="search" size={48} color="#E2E8F0" />
            <Text style={styles.emptyText}>Type at least 2 characters to search</Text>
            <Text style={styles.emptySubtext}>Search across all your conversations</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderResult}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Pagination */}
        {hasSearched && totalPages > 1 && !isSearching && (
          <View style={styles.pagination}>
            <TouchableOpacity
              onPress={() => { if (page > 1) performSearch(query, page - 1); }}
              disabled={page <= 1}
              style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
            >
              <Ionicons name="chevron-back" size={20} color={page <= 1 ? '#CBD5E1' : '#3B82F6'} />
            </TouchableOpacity>
            <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
            <TouchableOpacity
              onPress={() => { if (page < totalPages) performSearch(query, page + 1); }}
              disabled={page >= totalPages}
              style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
            >
              <Ionicons name="chevron-forward" size={20} color={page >= totalPages ? '#CBD5E1' : '#3B82F6'} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    padding: 0,
  },
  filterButton: {
    padding: 6,
    borderRadius: 8,
  },
  filterButtonActive: {
    backgroundColor: '#EFF6FF',
  },
  filtersPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 14,
    color: '#475569',
  },
  applyButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultsInfoText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
    maxWidth: 120,
  },
  channelName: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  resultDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  resultContent: {
    marginTop: 2,
  },
  resultText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  highlight: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 16,
  },
  pageButton: {
    padding: 6,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageText: {
    fontSize: 13,
    color: '#64748B',
  },
});
