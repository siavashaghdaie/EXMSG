import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnnouncementAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface ReadEntry {
  userId: string;
  noted: boolean;
  notedAt?: string | null;
  user: AnnouncementAuthor;
}

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  pinned: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  noted?: boolean;
  notedAt?: string | null;
  reads?: ReadEntry[];
  likeCount?: number;
  dislikeCount?: number;
  userReaction?: 'like' | 'dislike' | null;
  commentCount?: number;
  author: AnnouncementAuthor;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: AnnouncementAuthor;
}

type PriorityLevel = AnnouncementItem['priority'];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIMARY = '#6C47FF';
const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  LOW: '#22C55E',
  NORMAL: '#3B82F6',
  HIGH: '#F59E0B',
  URGENT: '#EF4444',
};
const PRIORITY_OPTIONS: PriorityLevel[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function getInitial(name: string): string {
  return (name ?? '?').charAt(0).toUpperCase();
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function formatExpiry(expiresAt?: string): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (d.getTime() < Date.now()) return 'Expired';
  const diff = d.getTime() - Date.now();
  const days = Math.floor(diff / 86400000);
  if (days > 1) return `Expires in ${days} days`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `Expires in ${hours}h`;
  return 'Expires soon';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InitialAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>
        {getInitial(name)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AnnouncementScreen() {
  const user = useAuthStore((s) => s.user);

  // Data
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState<PriorityLevel>('NORMAL');
  const [formExpiry, setFormExpiry] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentItem[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Set<string>>(new Set());
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({});
  const [editingComment, setEditingComment] = useState<{
    announcementId: string;
    commentId: string;
    content: string;
  } | null>(null);

  // Who Noted
  const [expandedNoted, setExpandedNoted] = useState<Set<string>>(new Set());

  // ------ Data fetching ------

  const fetchAnnouncements = useCallback(async () => {
    try {
      setError(null);
      const [data, allowed] = await Promise.all([
        api.getAnnouncements(),
        api.canAnnounce(),
      ]);
      setAnnouncements(data as AnnouncementItem[]);
      setCanCreate(!!allowed);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load announcements');
    }
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    await fetchAnnouncements();
    setLoading(false);
  }, [fetchAnnouncements]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAnnouncements();
    setRefreshing(false);
  }, [fetchAnnouncements]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  // ------ Noted ------

  const toggleNoted = useCallback(
    async (item: AnnouncementItem) => {
      try {
        if (item.noted) {
          await api.unnoteAnnouncement(item.id);
        } else {
          await api.noteAnnouncement(item.id);
        }
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === item.id ? { ...a, noted: !a.noted, notedAt: a.noted ? null : new Date().toISOString() } : a,
          ),
        );
      } catch {
        Alert.alert('Error', 'Could not update noted status.');
      }
    },
    [],
  );

  // ------ Reactions ------

  const handleReaction = useCallback(
    async (item: AnnouncementItem, type: 'like' | 'dislike') => {
      const prevReaction = item.userReaction;
      const isToggleOff = prevReaction === type;

      // Optimistic update
      setAnnouncements((prev) =>
        prev.map((a) => {
          if (a.id !== item.id) return a;
          let likeCount = a.likeCount ?? 0;
          let dislikeCount = a.dislikeCount ?? 0;

          if (prevReaction === 'like') likeCount--;
          if (prevReaction === 'dislike') dislikeCount--;
          if (!isToggleOff) {
            if (type === 'like') likeCount++;
            if (type === 'dislike') dislikeCount++;
          }

          return {
            ...a,
            likeCount,
            dislikeCount,
            userReaction: isToggleOff ? null : type,
          };
        }),
      );

      try {
        await api.reactToAnnouncement(item.id, type);
      } catch {
        // Revert
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, ...item } : a)),
        );
        Alert.alert('Error', 'Could not save reaction.');
      }
    },
    [],
  );

  // ------ Comments ------

  const toggleComments = useCallback(
    async (announcementId: string) => {
      setExpandedComments((prev) => {
        const next = new Set(prev);
        if (next.has(announcementId)) {
          next.delete(announcementId);
        } else {
          next.add(announcementId);
          if (!commentsMap[announcementId]) {
            loadComments(announcementId);
          }
        }
        return next;
      });
    },
    [commentsMap],
  );

  const loadComments = useCallback(async (announcementId: string) => {
    setCommentsLoading((prev) => new Set(prev).add(announcementId));
    try {
      const data = await api.getAnnouncementComments(announcementId);
      setCommentsMap((prev) => ({ ...prev, [announcementId]: data as CommentItem[] }));
    } catch {
      Alert.alert('Error', 'Could not load comments.');
    } finally {
      setCommentsLoading((prev) => {
        const next = new Set(prev);
        next.delete(announcementId);
        return next;
      });
    }
  }, []);

  const addComment = useCallback(
    async (announcementId: string) => {
      const text = (newCommentText[announcementId] ?? '').trim();
      if (!text) return;
      try {
        await api.addAnnouncementComment(announcementId, text);
        setNewCommentText((prev) => ({ ...prev, [announcementId]: '' }));
        await loadComments(announcementId);
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === announcementId ? { ...a, commentCount: (a.commentCount ?? 0) + 1 } : a,
          ),
        );
      } catch {
        Alert.alert('Error', 'Could not add comment.');
      }
    },
    [newCommentText, loadComments],
  );

  const saveEditComment = useCallback(async () => {
    if (!editingComment) return;
    const { announcementId, commentId, content } = editingComment;
    if (!content.trim()) return;
    try {
      await api.updateAnnouncementComment(announcementId, commentId, content.trim());
      setEditingComment(null);
      await loadComments(announcementId);
    } catch {
      Alert.alert('Error', 'Could not update comment.');
    }
  }, [editingComment, loadComments]);

  const deleteComment = useCallback(
    (announcementId: string, commentId: string) => {
      Alert.alert('Delete Comment', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAnnouncementComment(announcementId, commentId);
              await loadComments(announcementId);
              setAnnouncements((prev) =>
                prev.map((a) =>
                  a.id === announcementId
                    ? { ...a, commentCount: Math.max(0, (a.commentCount ?? 1) - 1) }
                    : a,
                ),
              );
            } catch {
              Alert.alert('Error', 'Could not delete comment.');
            }
          },
        },
      ]);
    },
    [loadComments],
  );

  // ------ Create / Edit ------

  const openCreate = useCallback(() => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormPriority('NORMAL');
    setFormExpiry('');
    setFormPinned(false);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((item: AnnouncementItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormPriority(item.priority);
    setFormExpiry(item.expiresAt ?? '');
    setFormPinned(item.pinned);
    setModalVisible(true);
  }, []);

  const submitForm = useCallback(async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      Alert.alert('Validation', 'Title and content are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        content: formContent.trim(),
        priority: formPriority,
        pinned: formPinned,
      };
      if (formExpiry.trim()) {
        payload.expiresAt = formExpiry.trim();
      }
      if (editingId) {
        await api.updateAnnouncement(editingId, payload);
      } else {
        await api.createAnnouncement(payload);
      }
      setModalVisible(false);
      await fetchAnnouncements();
    } catch {
      Alert.alert('Error', 'Could not save announcement.');
    } finally {
      setSubmitting(false);
    }
  }, [formTitle, formContent, formPriority, formPinned, formExpiry, editingId, fetchAnnouncements]);

  // ------ Delete ------

  const deleteAnnouncement = useCallback(
    (id: string) => {
      Alert.alert('Delete Announcement', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAnnouncement(id);
              setAnnouncements((prev) => prev.filter((a) => a.id !== id));
            } catch {
              Alert.alert('Error', 'Could not delete announcement.');
            }
          },
        },
      ]);
    },
    [],
  );

  // ------ Author menu ------

  const showAuthorMenu = useCallback(
    (item: AnnouncementItem) => {
      Alert.alert('Manage Announcement', undefined, [
        { text: 'Edit', onPress: () => openEdit(item) },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAnnouncement(item.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [openEdit, deleteAnnouncement],
  );

  // ------ Who Noted toggle ------

  const toggleNotedPanel = useCallback((id: string) => {
    setExpandedNoted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ------ Render helpers ------

  const renderComment = (announcementId: string, comment: CommentItem) => {
    const isOwn = comment.author.id === user?.id;
    const isEditing =
      editingComment?.announcementId === announcementId &&
      editingComment?.commentId === comment.id;

    return (
      <View key={comment.id} style={styles.commentRow}>
        <InitialAvatar name={comment.author.displayName} size={26} />
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>{comment.author.displayName}</Text>
            <Text style={styles.commentTime}>{formatDate(comment.createdAt)}</Text>
          </View>
          {isEditing ? (
            <View style={styles.commentEditRow}>
              <TextInput
                style={styles.commentEditInput}
                value={editingComment.content}
                onChangeText={(t) =>
                  setEditingComment((prev) => (prev ? { ...prev, content: t } : prev))
                }
                multiline
                autoFocus
              />
              <View style={styles.commentEditActions}>
                <TouchableOpacity onPress={saveEditComment} style={styles.commentEditBtn}>
                  <Text style={styles.commentEditBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditingComment(null)}
                  style={[styles.commentEditBtn, styles.commentCancelBtn]}
                >
                  <Text style={styles.commentCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.commentContent}>{comment.content}</Text>
          )}
          {isOwn && !isEditing && (
            <View style={styles.commentActions}>
              <TouchableOpacity
                onPress={() =>
                  setEditingComment({
                    announcementId,
                    commentId: comment.id,
                    content: comment.content,
                  })
                }
              >
                <Text style={styles.commentActionText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteComment(announcementId, comment.id)}>
                <Text style={[styles.commentActionText, { marginLeft: 12 }]}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderCard = (item: AnnouncementItem) => {
    const isAuthor = item.author.id === user?.id;
    const expired = isExpired(item.expiresAt);
    const expiryLabel = formatExpiry(item.expiresAt);
    const commentsOpen = expandedComments.has(item.id);
    const notedOpen = expandedNoted.has(item.id);
    const comments = commentsMap[item.id] ?? [];
    const loadingComments = commentsLoading.has(item.id);

    return (
      <View
        key={item.id}
        style={[
          styles.card,
          { borderLeftColor: PRIORITY_COLORS[item.priority] },
          item.noted && styles.cardNoted,
          expired && styles.cardExpired,
        ]}
      >
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {item.pinned && <Text style={styles.pinnedBadge}>📌</Text>}
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: PRIORITY_COLORS[item.priority] + '20' },
              ]}
            >
              <Text
                style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}
              >
                {item.priority}
              </Text>
            </View>
            {expiryLabel && (
              <Text style={[styles.expiryText, expired && styles.expiryExpired]}>
                {expiryLabel}
              </Text>
            )}
          </View>
          {isAuthor && (
            <TouchableOpacity onPress={() => showAuthorMenu(item)} hitSlop={8}>
              <Text style={styles.menuDots}>...</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Title + content */}
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardContent}>{item.content}</Text>

        {/* Author row */}
        <View style={styles.authorRow}>
          <InitialAvatar name={item.author.displayName} size={24} />
          <Text style={styles.authorName}>{item.author.displayName}</Text>
          <Text style={styles.cardTime}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Actions bar */}
        <View style={styles.actionsBar}>
          {/* Noted */}
          <TouchableOpacity style={styles.actionBtn} onPress={() => toggleNoted(item)}>
            <Text style={styles.actionEmoji}>{item.noted ? '✅' : '⬜'}</Text>
            <Text style={[styles.actionLabel, item.noted && styles.actionLabelActive]}>
              Noted
            </Text>
          </TouchableOpacity>

          {/* Like */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleReaction(item, 'like')}
          >
            <Text style={styles.actionEmoji}>👍</Text>
            <Text
              style={[
                styles.actionLabel,
                item.userReaction === 'like' && styles.actionLabelActive,
              ]}
            >
              {item.likeCount ?? 0}
            </Text>
          </TouchableOpacity>

          {/* Dislike */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleReaction(item, 'dislike')}
          >
            <Text style={styles.actionEmoji}>👎</Text>
            <Text
              style={[
                styles.actionLabel,
                item.userReaction === 'dislike' && styles.actionLabelActive,
              ]}
            >
              {item.dislikeCount ?? 0}
            </Text>
          </TouchableOpacity>

          {/* Comments toggle */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => toggleComments(item.id)}
          >
            <Text style={styles.actionEmoji}>💬</Text>
            <Text style={[styles.actionLabel, commentsOpen && styles.actionLabelActive]}>
              {item.commentCount ?? 0}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Who Noted (author only) */}
        {isAuthor && (
          <View style={styles.notedSection}>
            <TouchableOpacity onPress={() => toggleNotedPanel(item.id)}>
              <Text style={styles.notedToggle}>
                {notedOpen ? '▾' : '▸'} Who Noted ({(item.reads ?? []).filter((r) => r.noted).length})
              </Text>
            </TouchableOpacity>
            {notedOpen && (
              <View style={styles.notedList}>
                {(item.reads ?? []).length === 0 && (
                  <Text style={styles.notedEmpty}>No reads yet.</Text>
                )}
                {(item.reads ?? []).map((r) => (
                  <View key={r.userId} style={styles.notedRow}>
                    <InitialAvatar name={r.user.displayName} size={22} />
                    <Text style={styles.notedName}>{r.user.displayName}</Text>
                    <Text style={styles.notedStatus}>
                      {r.noted ? '✅' : '—'}
                    </Text>
                    {r.notedAt && (
                      <Text style={styles.notedTime}>{formatDate(r.notedAt)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Comments panel */}
        {commentsOpen && (
          <View style={styles.commentsSection}>
            <View style={styles.commentsDivider} />
            {loadingComments ? (
              <ActivityIndicator size="small" color={PRIMARY} style={{ marginVertical: 12 }} />
            ) : comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet.</Text>
            ) : (
              comments.map((c) => renderComment(item.id, c))
            )}
            {/* Add comment */}
            <View style={styles.addCommentRow}>
              <TextInput
                style={styles.addCommentInput}
                placeholder="Write a comment..."
                placeholderTextColor="#999"
                value={newCommentText[item.id] ?? ''}
                onChangeText={(t) =>
                  setNewCommentText((prev) => ({ ...prev, [item.id]: t }))
                }
                multiline
              />
              <TouchableOpacity
                style={styles.addCommentBtn}
                onPress={() => addComment(item.id)}
              >
                <Text style={styles.addCommentBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ------ Render ------

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📢 Announcements</Text>
        {canCreate && (
          <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
            <Text style={styles.createBtnText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={initialLoad}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={
          announcements.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        {announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📢</Text>
            <Text style={styles.emptyTitle}>No Announcements</Text>
            <Text style={styles.emptySubtitle}>
              There are no announcements yet. Pull down to refresh.
            </Text>
          </View>
        ) : (
          announcements.map(renderCard)
        )}
      </ScrollView>

      {/* Create / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Announcement' : 'New Announcement'}
              </Text>
              <TouchableOpacity onPress={submitForm} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color={PRIMARY} />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.fieldInput}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Announcement title"
                placeholderTextColor="#999"
              />

              {/* Content */}
              <Text style={styles.fieldLabel}>Content *</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextarea]}
                value={formContent}
                onChangeText={setFormContent}
                placeholder="Announcement content"
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
              />

              {/* Priority */}
              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {PRIORITY_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityOption,
                      {
                        borderColor: PRIORITY_COLORS[p],
                        backgroundColor:
                          formPriority === p ? PRIORITY_COLORS[p] + '20' : 'transparent',
                      },
                    ]}
                    onPress={() => setFormPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityOptionText,
                        { color: PRIORITY_COLORS[p] },
                        formPriority === p && { fontWeight: '700' },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Expiry */}
              <Text style={styles.fieldLabel}>Expiry Date (ISO format, optional)</Text>
              <TextInput
                style={styles.fieldInput}
                value={formExpiry}
                onChangeText={setFormExpiry}
                placeholder="e.g. 2026-05-01T00:00:00Z"
                placeholderTextColor="#999"
              />

              {/* Pin toggle */}
              <TouchableOpacity
                style={styles.pinToggle}
                onPress={() => setFormPinned((v) => !v)}
              >
                <Text style={styles.pinToggleEmoji}>{formPinned ? '📌' : '⬜'}</Text>
                <Text style={styles.pinToggleLabel}>Pin this announcement</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F7' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: { color: '#FFF', fontSize: 22, fontWeight: '600', marginTop: -1 },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: { color: '#B91C1C', fontSize: 14, flex: 1 },
  retryText: { color: PRIMARY, fontWeight: '600', fontSize: 14, marginLeft: 8 },

  // Empty state
  emptyState: { alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#777', textAlign: 'center' },

  // Card
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    marginBottom: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardNoted: { backgroundColor: '#F0FFF4' },
  cardExpired: { opacity: 0.6 },

  // Card header
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pinnedBadge: { fontSize: 14 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  expiryText: { fontSize: 11, color: '#888' },
  expiryExpired: { color: '#EF4444', fontWeight: '600' },
  menuDots: { fontSize: 20, fontWeight: '700', color: '#999', paddingHorizontal: 4 },

  // Card body
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  cardContent: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 10 },

  // Author
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  authorName: { fontSize: 13, color: '#555', fontWeight: '500', marginLeft: 6 },
  cardTime: { fontSize: 12, color: '#AAA', marginLeft: 'auto' },

  // Avatar
  avatar: { backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: '700' },

  // Actions bar
  actionsBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEE',
    paddingTop: 10,
    gap: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionEmoji: { fontSize: 16 },
  actionLabel: { fontSize: 13, color: '#777', marginLeft: 4 },
  actionLabelActive: { color: PRIMARY, fontWeight: '600' },

  // Who Noted
  notedSection: { marginTop: 8 },
  notedToggle: { fontSize: 13, color: PRIMARY, fontWeight: '600', paddingVertical: 4 },
  notedList: { paddingLeft: 4, marginTop: 6 },
  notedEmpty: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  notedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  notedName: { fontSize: 13, color: '#444', flex: 1 },
  notedStatus: { fontSize: 14 },
  notedTime: { fontSize: 11, color: '#AAA' },

  // Comments
  commentsSection: { marginTop: 4 },
  commentsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEE',
    marginBottom: 10,
  },
  noComments: { fontSize: 13, color: '#999', fontStyle: 'italic', marginBottom: 10 },
  commentRow: { flexDirection: 'row', marginBottom: 12 },
  commentBody: { flex: 1, marginLeft: 8 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: '#333' },
  commentTime: { fontSize: 11, color: '#AAA', marginLeft: 8 },
  commentContent: { fontSize: 14, color: '#444', lineHeight: 19 },
  commentActions: { flexDirection: 'row', marginTop: 4 },
  commentActionText: { fontSize: 12, color: PRIMARY },
  commentEditRow: { marginTop: 2 },
  commentEditInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#333',
    minHeight: 40,
  },
  commentEditActions: { flexDirection: 'row', marginTop: 6, gap: 8 },
  commentEditBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  commentEditBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  commentCancelBtn: { backgroundColor: '#EEE' },
  commentCancelBtnText: { color: '#555', fontSize: 13, fontWeight: '600' },

  // Add comment
  addCommentRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  addCommentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#333',
    maxHeight: 80,
  },
  addCommentBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  addCommentBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#FFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  modalCancel: { fontSize: 16, color: '#777' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  modalSave: { fontSize: 16, fontWeight: '600', color: PRIMARY },
  modalBody: { padding: 16 },

  // Form fields
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 14 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  fieldTextarea: { minHeight: 100, textAlignVertical: 'top' },

  // Priority picker
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  priorityOptionText: { fontSize: 12, fontWeight: '600' },

  // Pin toggle
  pinToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 8 },
  pinToggleEmoji: { fontSize: 20 },
  pinToggleLabel: { fontSize: 15, color: '#333' },
});
