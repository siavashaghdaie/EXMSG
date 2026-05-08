import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { api, LindaActivity } from '@/services/api';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  purple: '#8B5CF6',
  blue: '#3B82F6',
  pink: '#EC4899',
  emerald: '#10B981',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getActionIcon(type: string): string {
  switch (type) {
    case 'send_message': return '💬';
    case 'assign_task': return '📋';
    case 'create_announcement': return '📢';
    case 'update_task': return '🔄';
    case 'post_story': return '📸';
    default: return '🤖';
  }
}

function getActionLabel(type: string): string {
  switch (type) {
    case 'send_message': return 'Message Delivered';
    case 'assign_task': return 'Task Assigned';
    case 'create_announcement': return 'Announcement Created';
    case 'update_task': return 'Task Updated';
    case 'post_story': return 'Story Posted';
    default: return 'Action';
  }
}

function getActionColor(type: string): string {
  switch (type) {
    case 'send_message': return COLORS.blue;
    case 'assign_task': return COLORS.amber;
    case 'create_announcement': return COLORS.purple;
    case 'update_task': return COLORS.green;
    case 'post_story': return COLORS.pink;
    default: return COLORS.muted;
  }
}

interface Props {
  onClose: () => void;
}

export default function LindaActivitiesPanel({ onClose }: Props) {
  const [activities, setActivities] = useState<LindaActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getLindaActivities();
      setActivities(data.activities || []);
    } catch (err) {
      console.error('Failed to load Linda activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Compute stats
  const totalActions = activities.length;
  const completedActions = activities.filter((a) => a.status === 'completed').length;
  const successRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
  const msgCount = activities.filter((a) => a.actionType === 'send_message').length;
  const taskCount = activities.filter((a) => a.actionType === 'assign_task' || a.actionType === 'update_task').length;
  const announceCount = activities.filter((a) => a.actionType === 'create_announcement').length;
  const activeDays = new Set(activities.map((a) => new Date(a.createdAt).toDateString())).size;

  // Achievement badges
  const badges: { label: string; icon: string; color: string }[] = [];
  if (totalActions >= 10) badges.push({ label: 'Power User', icon: '⚡', color: COLORS.amber });
  if (successRate === 100 && totalActions > 0) badges.push({ label: 'Perfect Score', icon: '✓', color: COLORS.green });
  if (activeDays >= 7) badges.push({ label: 'Week Streak', icon: '📅', color: COLORS.blue });
  if (taskCount >= 5) badges.push({ label: 'Task Master', icon: '📋', color: COLORS.purple });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>{'👁'}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Linda's Activities</Text>
            <Text style={styles.headerSubtitle}>What Linda did for you</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={loadActivities} style={styles.refreshBtn}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.refreshIcon}>{'↻'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeIcon}>{'✕'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Gauge + Stats */}
        <View style={styles.statsSection}>
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeOuter}>
              <View style={styles.gaugeInner}>
                <Text style={styles.gaugePercent}>{successRate}%</Text>
                <Text style={styles.gaugeLabel}>Success</Text>
              </View>
            </View>
          </View>

          {/* Stat Cards */}
          <View style={styles.statGrid}>
            <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
              <Text style={styles.statIcon}>{'💬'}</Text>
              <Text style={styles.statNumber}>{msgCount}</Text>
              <Text style={styles.statLabel}>Messages</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFFBEB' }]}>
              <Text style={styles.statIcon}>{'📋'}</Text>
              <Text style={styles.statNumber}>{taskCount}</Text>
              <Text style={styles.statLabel}>Tasks</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#F5F3FF' }]}>
              <Text style={styles.statIcon}>{'📢'}</Text>
              <Text style={styles.statNumber}>{announceCount}</Text>
              <Text style={styles.statLabel}>Announces</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.statIcon}>{'📅'}</Text>
              <Text style={styles.statNumber}>{activeDays}</Text>
              <Text style={styles.statLabel}>Active Days</Text>
            </View>
          </View>
        </View>

        {/* Achievement Badges */}
        {badges.length > 0 && (
          <View style={styles.badgesSection}>
            {badges.map((badge, i) => (
              <View key={i} style={[styles.badge, { backgroundColor: badge.color + '15', borderColor: badge.color + '30' }]}>
                <Text style={styles.badgeIcon}>{badge.icon}</Text>
                <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineTitle}>RECENT ACTIVITY</Text>

          {loading && activities.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{'🔍'}</Text>
              <Text style={styles.emptyText}>No activities yet</Text>
              <Text style={styles.emptySubtext}>
                Linda will show her actions here as she works for you.
              </Text>
            </View>
          ) : (
            activities.slice(0, 50).map((activity, index) => (
              <View
                key={activity.id || index}
                style={[styles.activityItem, index > 0 && styles.activityItemBorder]}
              >
                <View style={styles.activityLeft}>
                  <View style={[styles.activityAvatar, { backgroundColor: getActionColor(activity.actionType) + '20' }]}>
                    <Text style={styles.activityAvatarIcon}>{getActionIcon(activity.actionType)}</Text>
                  </View>
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityHeaderRow}>
                    <Text style={[styles.activityLabel, { color: getActionColor(activity.actionType) }]}>
                      {getActionLabel(activity.actionType)}
                    </Text>
                    {activity.status === 'completed' ? (
                      <Text style={styles.statusSuccess}>{'✓'}</Text>
                    ) : (
                      <Text style={styles.statusFailed}>{'✗'}</Text>
                    )}
                  </View>
                  <Text style={styles.activitySummary} numberOfLines={2}>
                    {activity.summary}
                  </Text>
                  {activity.targetUser && (
                    <Text style={styles.activityTarget} numberOfLines={1}>
                      → {activity.targetUser.displayName || activity.targetUser.username}
                    </Text>
                  )}
                  <Text style={styles.activityTime}>{timeAgo(activity.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#F5F3FF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: { fontSize: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSubtitle: { fontSize: 12, color: COLORS.secondary },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIcon: { fontSize: 20, color: COLORS.primary },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: { fontSize: 18, color: COLORS.secondary },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  statsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  gaugeContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
  },
  gaugeInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugePercent: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  gaugeLabel: { fontSize: 9, color: COLORS.secondary, marginTop: -2 },
  statGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    width: '47%',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statNumber: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.secondary },
  badgesSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  badgeIcon: { fontSize: 12 },
  badgeLabel: { fontSize: 11, fontWeight: '600' },
  timelineSection: {
    marginBottom: 20,
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1,
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: COLORS.secondary, textAlign: 'center' },
  activityItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    gap: 12,
  },
  activityItemBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  activityLeft: {},
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityAvatarIcon: { fontSize: 16 },
  activityContent: { flex: 1 },
  activityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  activityLabel: { fontSize: 13, fontWeight: '600' },
  statusSuccess: { fontSize: 14, color: COLORS.green, fontWeight: '700' },
  statusFailed: { fontSize: 14, color: COLORS.red, fontWeight: '700' },
  activitySummary: { fontSize: 13, color: COLORS.text, marginBottom: 2 },
  activityTarget: { fontSize: 12, color: COLORS.secondary, fontStyle: 'italic', marginBottom: 2 },
  activityTime: { fontSize: 11, color: COLORS.muted },
});
