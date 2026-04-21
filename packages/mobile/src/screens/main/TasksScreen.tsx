import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED' | 'BLOCKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deadline?: string;
  labels: string[];
  assignedTo: TaskUser;
  createdBy: TaskUser;
  orderedBy?: TaskUser | null;
  lindaFollowing?: boolean;
  lindaFollowInterval?: string;
  assignedToId?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

type FilterTab = 'assigned' | 'planned' | 'all';
type TaskStatus = Task['status'];
type TaskPriority = Task['priority'];

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIMARY = '#6C47FF';
const PRIMARY_LIGHT = '#EDE8FF';
const BG = '#F5F5F7';
const CARD_BG = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';
const BORDER = '#E5E7EB';
const DANGER = '#EF4444';

const PRIORITY_COLORS: Record<TaskPriority, { bg: string; text: string }> = {
  LOW: { bg: '#D1FAE5', text: '#065F46' },
  MEDIUM: { bg: '#DBEAFE', text: '#1E40AF' },
  HIGH: { bg: '#FEF3C7', text: '#92400E' },
  CRITICAL: { bg: '#FEE2E2', text: '#991B1B' },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

const STATUS_OPTIONS: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'];

const PRIORITY_OPTIONS: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const LINDA_INTERVALS = [
  { label: 'Every hour', value: '1h' },
  { label: 'Every 4 hours', value: '4h' },
  { label: 'Every 12 hours', value: '12h' },
  { label: 'Daily', value: '1d' },
  { label: 'Weekly', value: '7d' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitial(name?: string): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function formatDeadline(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days < 0) return `${formatted} (overdue)`;
  if (days === 0) return `${formatted} (today)`;
  if (days === 1) return `${formatted} (tomorrow)`;
  return formatted;
}

function isOverdue(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '...';
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TasksScreen() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [activeTab, setActiveTab] = useState<FilterTab>('assigned');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  // Status picker state
  const [statusPickerTaskId, setStatusPickerTaskId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('MEDIUM');
  const [formDeadline, setFormDeadline] = useState('');
  const [formLabels, setFormLabels] = useState<string[]>([]);
  const [formLabelInput, setFormLabelInput] = useState('');
  const [formAssignee, setFormAssignee] = useState<TaskUser | null>(null);
  const [formLindaFollowing, setFormLindaFollowing] = useState(false);
  const [formLindaInterval, setFormLindaInterval] = useState('1d');

  // Assignee search
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<TaskUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError(null);
      const data = await api.getTasks();
      setTasks(data as Task[]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load tasks';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks(false);
  }, [fetchTasks]);

  // ── Filtering ─────────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Tab filter
    if (activeTab === 'assigned') {
      result = result.filter((t) => t.assignedTo?.id === userId || t.assignedToId === userId);
    } else if (activeTab === 'planned') {
      result = result.filter((t) => t.createdBy?.id === userId || t.createdById === userId);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Sort: incomplete first, then by priority weight, then by deadline
    const priorityWeight: Record<TaskPriority, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    result = [...result].sort((a, b) => {
      const aComplete = a.status === 'COMPLETED' ? 1 : 0;
      const bComplete = b.status === 'COMPLETED' ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;
      const pw = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (pw !== 0) return pw;
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    return result;
  }, [tasks, activeTab, userId, searchQuery]);

  // ── User search with debounce ─────────────────────────────────────────

  const searchUsersDebounced = useCallback((query: string) => {
    setAssigneeQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setAssigneeResults([]);
      setSearchingUsers(false);
      return;
    }

    setSearchingUsers(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchUsers(query, 10);
        setAssigneeResults(
          results.map((u: any) => ({
            id: u.id,
            displayName: u.displayName || u.username,
            username: u.username,
            avatarUrl: u.avatarUrl || u.avatar,
          }))
        );
      } catch {
        setAssigneeResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
  }, []);

  // ── Modal helpers ─────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormDescription('');
    setFormPriority('MEDIUM');
    setFormDeadline('');
    setFormLabels([]);
    setFormLabelInput('');
    setFormAssignee(null);
    setFormLindaFollowing(false);
    setFormLindaInterval('1d');
    setAssigneeQuery('');
    setAssigneeResults([]);
    setEditingTask(null);
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setModalVisible(true);
  }, [resetForm]);

  const openEditModal = useCallback((task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormPriority(task.priority);
    setFormDeadline(task.deadline ? task.deadline.split('T')[0] : '');
    setFormLabels([...task.labels]);
    setFormAssignee(task.assignedTo || null);
    setFormLindaFollowing(task.lindaFollowing || false);
    setFormLindaInterval(task.lindaFollowInterval || '1d');
    setAssigneeQuery('');
    setAssigneeResults([]);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  // ── CRUD handlers ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) {
      Alert.alert('Validation Error', 'Title is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        priority: formPriority,
        labels: formLabels,
        lindaFollowing: formLindaFollowing,
        lindaFollowInterval: formLindaFollowing ? formLindaInterval : undefined,
      };

      if (formAssignee) {
        payload.assignedToId = formAssignee.id;
      }

      if (formDeadline) {
        payload.deadline = new Date(formDeadline).toISOString();
      }

      if (editingTask) {
        await api.updateTask(editingTask.id, payload);
      } else {
        await api.createTask(payload);
      }

      closeModal();
      await fetchTasks(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save task';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [
    formTitle, formDescription, formPriority, formDeadline, formLabels,
    formAssignee, formLindaFollowing, formLindaInterval, editingTask,
    closeModal, fetchTasks,
  ]);

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setStatusPickerTaskId(null);
    try {
      await api.updateTask(taskId, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status';
      Alert.alert('Error', msg);
    }
  }, []);

  const handleDelete = useCallback((task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteTask(task.id);
              setTasks((prev) => prev.filter((t) => t.id !== task.id));
            } catch (err: any) {
              const msg = err?.response?.data?.message || err?.message || 'Failed to delete task';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  }, []);

  const addLabel = useCallback(() => {
    const label = formLabelInput.trim();
    if (label && !formLabels.includes(label)) {
      setFormLabels((prev) => [...prev, label]);
    }
    setFormLabelInput('');
  }, [formLabelInput, formLabels]);

  const removeLabel = useCallback((label: string) => {
    setFormLabels((prev) => prev.filter((l) => l !== label));
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────

  const renderPriorityBadge = (priority: TaskPriority) => {
    const colors = PRIORITY_COLORS[priority];
    return (
      <View style={[styles.priorityBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.priorityText, { color: colors.text }]}>{priority}</Text>
      </View>
    );
  };

  const renderStatusButton = (task: Task) => (
    <TouchableOpacity
      style={styles.statusButton}
      onPress={() => setStatusPickerTaskId(statusPickerTaskId === task.id ? null : task.id)}
      activeOpacity={0.7}
    >
      <Text style={styles.statusButtonText}>{STATUS_LABELS[task.status]}</Text>
      <Text style={styles.chevron}>{'\u25BE'}</Text>
    </TouchableOpacity>
  );

  const renderTaskCard = (task: Task) => {
    const completed = task.status === 'COMPLETED';
    const overdue = !completed && isOverdue(task.deadline);

    return (
      <View key={task.id} style={[styles.card, completed && styles.cardCompleted]}>
        {/* Top row: priority + actions */}
        <View style={styles.cardTopRow}>
          {renderPriorityBadge(task.priority)}
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => openEditModal(task)}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.iconText}>{'\u270E'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(task)}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.iconText, { color: DANGER }]}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.cardTitle, completed && styles.cardTitleCompleted]}>
          {task.title}
        </Text>

        {/* Description */}
        {task.description ? (
          <Text style={styles.cardDescription}>{truncate(task.description, 120)}</Text>
        ) : null}

        {/* Status */}
        <View style={styles.cardStatusRow}>
          {renderStatusButton(task)}
        </View>

        {/* Status picker dropdown */}
        {statusPickerTaskId === task.id && (
          <View style={styles.statusDropdown}>
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusOption, task.status === s && styles.statusOptionActive]}
                onPress={() => handleStatusChange(task.id, s)}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    task.status === s && styles.statusOptionTextActive,
                  ]}
                >
                  {STATUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Meta row */}
        <View style={styles.cardMetaRow}>
          {/* Assignee */}
          <View style={styles.metaItem}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitial(task.assignedTo?.displayName)}
              </Text>
            </View>
            <Text style={styles.metaText} numberOfLines={1}>
              {task.assignedTo?.displayName || 'Unassigned'}
            </Text>
          </View>

          {/* Deadline */}
          {task.deadline ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>{'\uD83D\uDCC5'}</Text>
              <Text style={[styles.metaText, overdue && styles.overdueText]}>
                {formatDeadline(task.deadline)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Labels + Linda */}
        {(task.labels.length > 0 || task.lindaFollowing) && (
          <View style={styles.cardFooter}>
            {task.labels.map((label) => (
              <View key={label} style={styles.labelChip}>
                <Text style={styles.labelChipText}>{label}</Text>
              </View>
            ))}
            {task.lindaFollowing && (
              <View style={[styles.labelChip, styles.lindaChip]}>
                <Text style={styles.lindaChipText}>
                  {'\uD83D\uDC41'} Linda
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Task Wall</Text>
        <TouchableOpacity style={styles.createBtn} onPress={openCreateModal} activeOpacity={0.7}>
          <Text style={styles.createBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabRow}>
        {(['assigned', 'planned', 'all'] as FilterTab[]).map((tab) => {
          const labels: Record<FilterTab, string> = {
            assigned: 'Assigned',
            planned: 'Planned',
            all: 'All',
          };
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor={TEXT_SECONDARY}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearSearch}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchTasks()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Task list */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PRIMARY} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {filteredTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
            <Text style={styles.emptyTitle}>No tasks found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Try adjusting your search query'
                : activeTab === 'assigned'
                ? 'No tasks assigned to you yet'
                : activeTab === 'planned'
                ? "You haven't created any tasks yet"
                : 'Get started by creating your first task'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreateModal} activeOpacity={0.7}>
                <Text style={styles.emptyCreateBtnText}>+ Create Task</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredTasks.map(renderTaskCard)
        )}
      </ScrollView>

      {/* ─── Create / Edit Modal ─────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={styles.flex1}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingTask ? 'Edit Task' : 'New Task'}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                {saving ? (
                  <ActivityIndicator size="small" color={PRIMARY} />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title */}
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.textField}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Task title"
                placeholderTextColor={TEXT_SECONDARY}
                autoFocus={!editingTask}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textField, styles.textArea]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Add a description..."
                placeholderTextColor={TEXT_SECONDARY}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Assign To */}
              <Text style={styles.fieldLabel}>Assign To</Text>
              {formAssignee ? (
                <View style={styles.selectedAssignee}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitial(formAssignee.displayName)}</Text>
                  </View>
                  <Text style={styles.selectedAssigneeName}>{formAssignee.displayName}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setFormAssignee(null);
                      setAssigneeQuery('');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeAssignee}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={styles.textField}
                    value={assigneeQuery}
                    onChangeText={searchUsersDebounced}
                    placeholder="Search users..."
                    placeholderTextColor={TEXT_SECONDARY}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {searchingUsers && (
                    <ActivityIndicator size="small" color={PRIMARY} style={styles.searchSpinner} />
                  )}
                  {assigneeResults.length > 0 && (
                    <View style={styles.userResults}>
                      {assigneeResults.map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          style={styles.userResultItem}
                          onPress={() => {
                            setFormAssignee(u);
                            setAssigneeQuery('');
                            setAssigneeResults([]);
                          }}
                        >
                          <View style={styles.avatarSmall}>
                            <Text style={styles.avatarSmallText}>{getInitial(u.displayName)}</Text>
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.userResultName}>{u.displayName}</Text>
                            <Text style={styles.userResultUsername}>@{u.username}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Priority */}
              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.optionRow}>
                {PRIORITY_OPTIONS.map((p) => {
                  const colors = PRIORITY_COLORS[p];
                  const isSelected = formPriority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: isSelected ? colors.bg : '#F3F4F6',
                          borderColor: isSelected ? colors.text : 'transparent',
                        },
                      ]}
                      onPress={() => setFormPriority(p)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          { color: isSelected ? colors.text : TEXT_SECONDARY },
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Deadline */}
              <Text style={styles.fieldLabel}>Deadline (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textField}
                value={formDeadline}
                onChangeText={setFormDeadline}
                placeholder="2026-05-01"
                placeholderTextColor={TEXT_SECONDARY}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />

              {/* Labels */}
              <Text style={styles.fieldLabel}>Labels</Text>
              <View style={styles.labelInputRow}>
                <TextInput
                  style={[styles.textField, styles.labelInputField]}
                  value={formLabelInput}
                  onChangeText={setFormLabelInput}
                  placeholder="Add a label"
                  placeholderTextColor={TEXT_SECONDARY}
                  onSubmitEditing={addLabel}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.addLabelBtn} onPress={addLabel}>
                  <Text style={styles.addLabelBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {formLabels.length > 0 && (
                <View style={styles.labelChipsRow}>
                  {formLabels.map((label) => (
                    <View key={label} style={styles.labelChipEditable}>
                      <Text style={styles.labelChipEditableText}>{label}</Text>
                      <TouchableOpacity
                        onPress={() => removeLabel(label)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={styles.labelChipRemove}>{'\u2715'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Linda Following */}
              <View style={styles.lindaSection}>
                <TouchableOpacity
                  style={styles.lindaToggleRow}
                  onPress={() => setFormLindaFollowing(!formLindaFollowing)}
                  activeOpacity={0.7}
                >
                  <View style={styles.lindaToggleLeft}>
                    <Text style={styles.lindaIcon}>{'\uD83D\uDC41'}</Text>
                    <Text style={styles.fieldLabelInline}>Linda Following</Text>
                  </View>
                  <View style={[styles.toggle, formLindaFollowing && styles.toggleActive]}>
                    <View style={[styles.toggleDot, formLindaFollowing && styles.toggleDotActive]} />
                  </View>
                </TouchableOpacity>

                {formLindaFollowing && (
                  <View style={styles.intervalRow}>
                    {LINDA_INTERVALS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.intervalChip,
                          formLindaInterval === opt.value && styles.intervalChipActive,
                        ]}
                        onPress={() => setFormLindaInterval(opt.value)}
                      >
                        <Text
                          style={[
                            styles.intervalChipText,
                            formLindaInterval === opt.value && styles.intervalChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Bottom spacer for keyboard */}
              <View style={styles.bottomSpacer} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  flex1: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: TEXT_SECONDARY,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  tabActive: {
    backgroundColor: PRIMARY_LIGHT,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  tabTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },

  // Search
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CARD_BG,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    paddingVertical: 0,
  },
  clearSearch: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    paddingLeft: 8,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    flex: 1,
  },
  retryText: {
    color: PRIMARY,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 12,
  },

  // Task List
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCreateBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.65,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  iconText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
    lineHeight: 22,
  },
  cardTitleCompleted: {
    textDecorationLine: 'line-through',
    color: TEXT_SECONDARY,
  },
  cardDescription: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardStatusRow: {
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 13,
  },
  metaText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  overdueText: {
    color: DANGER,
    fontWeight: '500',
  },

  // Avatar
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PRIMARY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarSmallText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY,
  },

  // Priority badge
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Status
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  chevron: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  statusDropdown: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statusOptionActive: {
    backgroundColor: PRIMARY_LIGHT,
  },
  statusOptionText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
  },
  statusOptionTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },

  // Labels on cards
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  labelChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  labelChipText: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    fontWeight: '500',
  },
  lindaChip: {
    backgroundColor: PRIMARY_LIGHT,
  },
  lindaChipText: {
    fontSize: 11,
    color: PRIMARY,
    fontWeight: '500',
  },

  // ─── Modal ────────────────────────────────────────────────────────────

  modalContainer: {
    flex: 1,
    backgroundColor: CARD_BG,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalCancel: {
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
    color: PRIMARY,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
  },

  // Form fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 6,
    marginTop: 16,
  },
  fieldLabelInline: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  textField: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: TEXT_PRIMARY,
    backgroundColor: '#FAFAFA',
    marginBottom: 4,
  },
  textArea: {
    minHeight: 90,
    paddingTop: 12,
  },

  // Assignee
  selectedAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  selectedAssigneeName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  removeAssignee: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  searchSpinner: {
    marginTop: 4,
  },
  userResults: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: CARD_BG,
    maxHeight: 200,
    overflow: 'hidden',
  },
  userResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  userResultName: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  userResultUsername: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 1,
  },

  // Options row (priority)
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Labels (form)
  labelInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelInputField: {
    flex: 1,
    marginBottom: 0,
  },
  addLabelBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  addLabelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  labelChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  labelChipEditable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  labelChipEditableText: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '500',
  },
  labelChipRemove: {
    fontSize: 12,
    color: PRIMARY,
  },

  // Linda section
  lindaSection: {
    marginTop: 20,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  lindaToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lindaToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lindaIcon: {
    fontSize: 18,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleActive: {
    backgroundColor: PRIMARY,
  },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
  intervalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  intervalChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  intervalChipActive: {
    backgroundColor: PRIMARY_LIGHT,
    borderColor: PRIMARY,
  },
  intervalChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  intervalChipTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },

  bottomSpacer: {
    height: 40,
  },
});
