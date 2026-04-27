import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  green: '#10B981',
  red: '#EF4444',
  orange: '#F59E0B',
  blue: '#3B82F6',
  inputBg: '#F1F5F9',
};

interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  type: 'audio' | 'video';
  status: string;
  duration: number | null;
  createdAt: string;
  caller: { id: string; displayName?: string; username: string; avatarUrl?: string };
  callee: { id: string; displayName?: string; username: string; avatarUrl?: string };
}

export default function CallsScreen() {
  const currentUser = useAuthStore((s) => s.user);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCalls = useCallback(async () => {
    try {
      const data = await api.getCallHistory(1, 50);
      setCalls(data.calls || data || []);
    } catch (err) {
      console.error('[CallsScreen] Failed to load calls:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCalls();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getStatusIcon = (status: string, isOutgoing: boolean) => {
    switch (status) {
      case 'ENDED': return isOutgoing ? '↗️' : '↙️';
      case 'MISSED': return '📵';
      case 'REJECTED': return '❌';
      case 'BUSY': return '🔴';
      default: return isOutgoing ? '↗️' : '↙️';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ENDED': return COLORS.green;
      case 'MISSED': return COLORS.red;
      case 'REJECTED': return COLORS.orange;
      case 'BUSY': return COLORS.red;
      default: return COLORS.muted;
    }
  };

  const renderCall = ({ item }: { item: CallRecord }) => {
    const isOutgoing = item.callerId === currentUser?.id;
    const otherUser = isOutgoing ? item.callee : item.caller;
    const otherName = otherUser?.displayName || otherUser?.username || 'Unknown';
    const initials = otherName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <View style={styles.callItem}>
        <View style={styles.callAvatar}>
          <Text style={styles.callAvatarText}>{initials}</Text>
        </View>
        <View style={styles.callInfo}>
          <Text style={styles.callName} numberOfLines={1}>{otherName}</Text>
          <View style={styles.callMeta}>
            <Text style={{ fontSize: 14 }}>{getStatusIcon(item.status, isOutgoing)}</Text>
            <Text style={[styles.callStatusText, { color: getStatusColor(item.status) }]}>
              {item.status === 'ENDED'
                ? (isOutgoing ? 'Outgoing' : 'Incoming')
                : item.status.charAt(0) + item.status.slice(1).toLowerCase()
              }
            </Text>
            <Text style={styles.callTypeIcon}>{item.type === 'video' ? '📹' : '📞'}</Text>
          </View>
        </View>
        <View style={styles.callRight}>
          <Text style={styles.callTime}>{formatTime(item.createdAt)}</Text>
          {item.duration != null && item.duration > 0 && (
            <Text style={styles.callDuration}>{formatDuration(item.duration)}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={renderCall}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          contentContainerStyle={calls.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📞</Text>
              <Text style={styles.emptyTitle}>No Calls Yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a voice or video call from any chat conversation.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  callAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  callInfo: {
    flex: 1,
  },
  callName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  callStatusText: {
    fontSize: 13,
  },
  callTypeIcon: {
    fontSize: 12,
  },
  callRight: {
    alignItems: 'flex-end',
  },
  callTime: {
    fontSize: 13,
    color: COLORS.muted,
  },
  callDuration: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
