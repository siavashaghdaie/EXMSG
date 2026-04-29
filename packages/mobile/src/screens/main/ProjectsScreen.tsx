import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#F1F5F9',
  inputBg: '#F1F5F9',
  green: '#10B981',
  white: '#FFFFFF',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  amber: '#F59E0B',
  red: '#EF4444',
  orange: '#F97316',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#D1FAE5', text: '#059669' },
  PAUSED: { bg: '#FEF3C7', text: '#D97706' },
  COMPLETED: { bg: '#DBEAFE', text: '#2563EB' },
  ARCHIVED: { bg: '#F1F5F9', text: '#64748B' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  LOW: { bg: '#F1F5F9', text: '#64748B' },
  MEDIUM: { bg: '#DBEAFE', text: '#2563EB' },
  HIGH: { bg: '#FFEDD5', text: '#EA580C' },
  CRITICAL: { bg: '#FEE2E2', text: '#DC2626' },
};

const TASK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'To Do', IN_PROGRESS: 'In Progress', PENDING_REVIEW: 'Review', COMPLETED: 'Done', BLOCKED: 'Blocked',
};

const TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

interface ChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  completed: boolean;
  position: number;
  assigneeId?: string;
  dueDate?: string;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  labels: string[];
  archived?: boolean;
  assignedTo?: { id: string; displayName: string; username: string; avatarUrl?: string };
  createdBy?: { id: string; displayName: string; username: string; avatarUrl?: string };
  createdAt?: string;
  reactions?: Array<{ id: string; userId: string; type: string }>;
  _count?: { comments: number };
  checklists?: Checklist[];
}

interface Project {
  id: string;
  name: string;
  description?: string;
  specsAndGoals?: string;
  gitUrl?: string;
  storageUrl?: string;
  status: string;
  teamLead?: { id: string; displayName: string; username: string };
  createdBy: { id: string; displayName: string; username: string };
  members: Array<{ id: string; role: string; user: { id: string; displayName: string; username: string; email: string } }>;
  _count: { tasks: number; members: number };
  tasks?: TaskData[];
}

type ViewMode = 'list' | 'detail' | 'board';

export default function ProjectsScreen({ embedded }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const { createConversation } = useChatStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectMates, setProjectMates] = useState<any[]>([]);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSpecs, setCreateSpecs] = useState('');
  const [createGitUrl, setCreateGitUrl] = useState('');
  const [createStorageUrl, setCreateStorageUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<any[]>([]);

  // Task detail modal
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  // New task in board
  const [newTaskColumn, setNewTaskColumn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Show archived
  const [showArchived, setShowArchived] = useState(false);

  // Checklist
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTitles, setNewItemTitles] = useState<Record<string, string>>({});

  // Comments & reactions
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  useEffect(() => {
    if (expandedComments) {
      setLoadingComments(true);
      api.getTaskComments(expandedComments).then((data) => {
        setTaskComments(data.comments || []);
        setLoadingComments(false);
      }).catch(() => setLoadingComments(false));
    }
  }, [expandedComments]);

  const handleChatWithUser = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    try {
      const conv = await createConversation([targetUserId]);
      navigation.navigate('Chats', { screen: 'Chat', params: { conversationId: conv.id } });
    } catch (err) { console.error('Failed to open chat:', err); }
  };

  const handleReactTask = async (taskId: string, type: 'like' | 'dislike') => {
    try {
      await api.reactToTask(taskId, type);
      if (selectedProject) {
        const res = await api.getProject(selectedProject.id);
        setSelectedProject(res);
      }
    } catch (err) { console.error('React error:', err); }
  };

  const handleAddTaskComment = async (taskId: string) => {
    if (!newComment.trim()) return;
    try {
      await api.addTaskComment(taskId, newComment.trim());
      setNewComment('');
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
      if (selectedProject) { const res = await api.getProject(selectedProject.id); setSelectedProject(res); }
    } catch (err) { console.error('Add comment error:', err); }
  };

  const handleUpdateTaskComment = async (taskId: string, commentId: string) => {
    if (!editingCommentText.trim()) return;
    try {
      await api.updateTaskComment(taskId, commentId, editingCommentText.trim());
      setEditingCommentId(null); setEditingCommentText('');
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
    } catch (err) { console.error('Update comment error:', err); }
  };

  const handleDeleteTaskComment = async (taskId: string, commentId: string) => {
    try {
      await api.deleteTaskComment(taskId, commentId);
      const data = await api.getTaskComments(taskId);
      setTaskComments(data.comments || []);
      if (selectedProject) { const res = await api.getProject(selectedProject.id); setSelectedProject(res); }
    } catch (err) { console.error('Delete comment error:', err); }
  };

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.getProjects({ search: searchQuery || undefined });
      setProjects(res.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadMates = useCallback(async () => {
    try {
      const res = await api.getProjectMates();
      setProjectMates(res.mates || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProjects();
    loadMates();
  }, [loadProjects, loadMates]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProjects(), loadMates()]);
    setRefreshing(false);
  }, [loadProjects, loadMates]);

  const refreshProject = async () => {
    if (!selectedProject) return;
    try {
      const res = await api.getProject(selectedProject.id);
      setSelectedProject(res.project);
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await api.createProject({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        specsAndGoals: createSpecs.trim() || undefined,
        gitUrl: createGitUrl.trim() || undefined,
        storageUrl: createStorageUrl.trim() || undefined,
      });
      setCreateName(''); setCreateDesc(''); setCreateSpecs('');
      setCreateGitUrl(''); setCreateStorageUrl('');
      setShowCreate(false);
      loadProjects();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (projectId: string, name: string) => {
    Alert.alert('Delete Project', `Delete "${name}"? Tasks will be unlinked but not deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteProject(projectId);
            if (selectedProject?.id === projectId) {
              setSelectedProject(null);
              setViewMode('list');
            }
            loadProjects();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const openDetail = async (projectId: string) => {
    try {
      const res = await api.getProject(projectId);
      setSelectedProject(res.project);
      setViewMode('detail');
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const openBoard = async (projectId: string) => {
    try {
      const res = await api.getProject(projectId);
      setSelectedProject(res.project);
      setViewMode('board');
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  // ─── Member management ──────────────────────────────────────────
  useEffect(() => {
    if (!memberSearch || memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(memberSearch);
        setMemberResults(results.filter((u: any) => u.id !== user?.id));
      } catch { setMemberResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, user?.id]);

  const handleAddMember = async (userId: string) => {
    if (!selectedProject) return;
    try {
      await api.addProjectMember(selectedProject.id, userId);
      await refreshProject();
      setMemberSearch('');
      setMemberResults([]);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedProject) return;
    Alert.alert('Remove Member', 'Remove this member from the project?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.removeProjectMember(selectedProject.id, userId);
            await refreshProject();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to remove');
          }
        },
      },
    ]);
  };

  // ─── Task CRUD ──────────────────────────────────────────────────
  const handleCreateTask = async (status: string) => {
    if (!newTaskTitle.trim() || !selectedProject) return;
    try {
      await api.createTask({
        title: newTaskTitle.trim(),
        projectId: selectedProject.id,
        assignedToId: user?.id,
        ...(status !== 'NOT_STARTED' && { status }),
      });
      setNewTaskTitle('');
      setNewTaskColumn(null);
      await refreshProject();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create task');
    }
  };

  const handleUpdateTask = async (taskId: string, data: any) => {
    try {
      const updated = await api.updateTask(taskId, data);
      await refreshProject();
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, ...updated });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update');
    }
  };

  const handleDeleteTask = (taskId: string) => {
    Alert.alert('Delete Task', 'Delete this task permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteTask(taskId);
            setShowTaskDetail(false);
            setSelectedTask(null);
            await refreshProject();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleArchiveTask = async (taskId: string, archive: boolean) => {
    await handleUpdateTask(taskId, { archived: archive });
  };

  // ─── Checklist CRUD ─────────────────────────────────────────────
  const refreshTaskChecklists = async () => {
    if (!selectedTask) return;
    try {
      const res = await api.getChecklists({ taskId: selectedTask.id });
      setSelectedTask({ ...selectedTask, checklists: res.checklists });
    } catch { /* ignore */ }
  };

  const handleCreateChecklist = async (taskId: string) => {
    if (!newChecklistTitle.trim()) return;
    try {
      await api.createChecklist({ taskId, title: newChecklistTitle.trim() });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      await refreshTaskChecklists();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create checklist');
    }
  };

  const handleDeleteChecklist = (checklistId: string) => {
    Alert.alert('Delete Checklist', 'Delete this checklist and all its items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteChecklist(checklistId);
            await refreshTaskChecklists();
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleAddChecklistItem = async (checklistId: string) => {
    const title = newItemTitles[checklistId];
    if (!title?.trim()) return;
    try {
      await api.addChecklistItem(checklistId, { title: title.trim() });
      setNewItemTitles({ ...newItemTitles, [checklistId]: '' });
      await refreshTaskChecklists();
    } catch { /* ignore */ }
  };

  const handleToggleItem = async (checklistId: string, itemId: string) => {
    try {
      await api.toggleChecklistItem(checklistId, itemId);
      await refreshTaskChecklists();
    } catch { /* ignore */ }
  };

  const handleDeleteChecklistItem = async (checklistId: string, itemId: string) => {
    try {
      await api.deleteChecklistItem(checklistId, itemId);
      await refreshTaskChecklists();
    } catch { /* ignore */ }
  };

  // ─── Helpers ────────────────────────────────────────────────────
  const getChecklistProgress = (checklists?: Checklist[]) => {
    if (!checklists || checklists.length === 0) return null;
    let total = 0; let done = 0;
    checklists.forEach(cl => cl.items.forEach(item => { total++; if (item.completed) done++; }));
    if (total === 0) return null;
    return { total, done, percent: Math.round((done / total) * 100) };
  };

  const initial = (name?: string) => (name || '?').charAt(0).toUpperCase();

  // ─── Task Detail Modal ────────────────────────────────────────
  const renderTaskDetailModal = () => {
    if (!showTaskDetail || !selectedTask) return null;
    const task = selectedTask;
    const progress = getChecklistProgress(task.checklists);

    return (
      <Modal visible={showTaskDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTaskDetail(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTaskDetail(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>Task Detail</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => handleArchiveTask(task.id, !task.archived)}>
                <Text style={{ fontSize: 16 }}>{task.archived ? '↩️' : '📥'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteTask(task.id)}>
                <Text style={{ fontSize: 16 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          >
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{task.title}</Text>

              {/* Priority + dates badges */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <View style={[styles.badge, { backgroundColor: PRIORITY_COLORS[task.priority]?.bg }]}>
                  <Text style={[styles.badgeText, { color: PRIORITY_COLORS[task.priority]?.text }]}>{task.priority}</Text>
                </View>
                {task.createdAt && (
                  <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={[styles.badgeText, { color: '#64748B' }]}>📅 {new Date(task.createdAt).toLocaleDateString()}</Text>
                  </View>
                )}
                {task.deadline && (
                  <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.badgeText, { color: '#92400E' }]}>⏰ {new Date(task.deadline).toLocaleDateString()}</Text>
                  </View>
                )}
                {progress && (
                  <View style={[styles.badge, { backgroundColor: progress.percent === 100 ? '#D1FAE5' : '#F1F5F9' }]}>
                    <Text style={[styles.badgeText, { color: progress.percent === 100 ? '#059669' : '#64748B' }]}>☑ {progress.done}/{progress.total}</Text>
                  </View>
                )}
              </View>

              {/* Status selector */}
              <View>
                <Text style={styles.sectionLabel}>Status</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {TASK_STATUSES.map(s => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => handleUpdateTask(task.id, { status: s })}
                        style={[styles.chipBtn, task.status === s && { backgroundColor: COLORS.violet }]}
                      >
                        <Text style={[styles.chipBtnText, task.status === s && { color: COLORS.white }]}>{TASK_STATUS_LABELS[s]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Priority selector */}
              <View>
                <Text style={styles.sectionLabel}>Priority</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {PRIORITIES.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => handleUpdateTask(task.id, { priority: p })}
                      style={[styles.chipBtn, { backgroundColor: PRIORITY_COLORS[p]?.bg }, task.priority === p && { borderWidth: 2, borderColor: COLORS.violet }]}
                    >
                      <Text style={[styles.chipBtnText, { color: PRIORITY_COLORS[p]?.text }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Assignee */}
              {task.assignedTo && (
                <View>
                  <Text style={styles.sectionLabel}>Assigned To</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.avatarSm}>
                      <Text style={styles.avatarSmText}>{initial(task.assignedTo.displayName || task.assignedTo.username)}</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: '500' }}>{task.assignedTo.displayName || task.assignedTo.username}</Text>
                  </View>
                </View>
              )}

              {/* Description */}
              <View>
                <Text style={styles.sectionLabel}>Description</Text>
                <Text style={{ fontSize: 14, color: task.description ? COLORS.text : COLORS.muted, lineHeight: 20 }}>
                  {task.description || 'No description'}
                </Text>
              </View>

              {/* Checklists */}
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.sectionLabel}>☑ Checklists</Text>
                  <TouchableOpacity onPress={() => setShowAddChecklist(!showAddChecklist)}>
                    <Text style={{ fontSize: 13, color: COLORS.violet, fontWeight: '600' }}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {showAddChecklist && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={newChecklistTitle}
                      onChangeText={setNewChecklistTitle}
                      placeholder="Checklist title..."
                      placeholderTextColor={COLORS.muted}
                      onSubmitEditing={() => handleCreateChecklist(task.id)}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleCreateChecklist(task.id)}>
                      <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {(task.checklists || []).map(cl => {
                  const clDone = cl.items.filter(i => i.completed).length;
                  const clTotal = cl.items.length;
                  const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0;

                  return (
                    <View key={cl.id} style={styles.checklistBlock}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>☑ {cl.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 11, color: COLORS.muted }}>{clPct}%</Text>
                          <TouchableOpacity onPress={() => handleDeleteChecklist(cl.id)}>
                            <Text style={{ fontSize: 12, color: COLORS.red }}>🗑</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Progress bar */}
                      {clTotal > 0 && (
                        <View style={styles.progressBar}>
                          <View style={[styles.progressFill, { width: `${clPct}%` as any, backgroundColor: clPct === 100 ? COLORS.green : COLORS.violet }]} />
                        </View>
                      )}

                      {/* Items */}
                      {cl.items.map(item => (
                        <View key={item.id} style={styles.checklistItemRow}>
                          <TouchableOpacity onPress={() => handleToggleItem(cl.id, item.id)} style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
                            {item.completed && <Text style={{ color: COLORS.white, fontSize: 10 }}>✓</Text>}
                          </TouchableOpacity>
                          <Text style={[styles.checklistItemText, item.completed && styles.checklistItemDone]} numberOfLines={2}>{item.title}</Text>
                          <TouchableOpacity onPress={() => handleDeleteChecklistItem(cl.id, item.id)} style={{ padding: 4 }}>
                            <Text style={{ fontSize: 10, color: COLORS.muted }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}

                      {/* Add item */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        <TextInput
                          style={[styles.textInput, { flex: 1, paddingVertical: 6, fontSize: 13 }]}
                          value={newItemTitles[cl.id] || ''}
                          onChangeText={(v) => setNewItemTitles({ ...newItemTitles, [cl.id]: v })}
                          placeholder="Add an item..."
                          placeholderTextColor={COLORS.muted}
                          onSubmitEditing={() => handleAddChecklistItem(cl.id)}
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={[styles.addBtn, { paddingVertical: 6 }]}
                          onPress={() => handleAddChecklistItem(cl.id)}
                          disabled={!newItemTitles[cl.id]?.trim()}
                        >
                          <Text style={styles.addBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Reactions & Comments section */}
              {(() => {
                const likes = ((task as any).reactions || []).filter((r: any) => r.type === 'like').length;
                const dislikes = ((task as any).reactions || []).filter((r: any) => r.type === 'dislike').length;
                const myReaction = ((task as any).reactions || []).find((r: any) => r.userId === user?.id)?.type;
                const cmtCount = (task as any)._count?.comments || 0;
                return (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 10 }}>Reactions & Comments</Text>
                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
                      <TouchableOpacity onPress={() => handleReactTask(task.id, 'like')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: myReaction === 'like' ? '#DBEAFE' : '#F1F5F9' }}>
                        <Text>👍</Text><Text style={{ fontSize: 12, fontWeight: myReaction === 'like' ? '700' : '400', color: myReaction === 'like' ? '#2563EB' : '#64748B' }}>{likes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleReactTask(task.id, 'dislike')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: myReaction === 'dislike' ? '#FEE2E2' : '#F1F5F9' }}>
                        <Text>👎</Text><Text style={{ fontSize: 12, fontWeight: myReaction === 'dislike' ? '700' : '400', color: myReaction === 'dislike' ? '#EF4444' : '#64748B' }}>{dislikes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setExpandedComments(expandedComments === task.id ? null : task.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: expandedComments === task.id ? '#EDE9FE' : '#F1F5F9' }}>
                        <Text>💬</Text><Text style={{ fontSize: 12, fontWeight: expandedComments === task.id ? '700' : '400', color: expandedComments === task.id ? '#7C3AED' : '#64748B' }}>{cmtCount}</Text>
                      </TouchableOpacity>
                    </View>

                    {expandedComments === task.id && (
                      <View>
                        {loadingComments ? (
                          <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                          <>
                            {taskComments.map((c) => (
                              <View key={c.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TouchableOpacity onPress={() => handleChatWithUser(c.user?.id)}>
                                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 10, fontWeight: '700' }}>{(c.user?.displayName || '?')[0]}</Text>
                                  </View>
                                </TouchableOpacity>
                                <View style={{ flex: 1 }}>
                                  <TouchableOpacity onPress={() => handleChatWithUser(c.user?.id)}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{c.user?.displayName || c.user?.username}</Text>
                                  </TouchableOpacity>
                                  {editingCommentId === c.id ? (
                                    <TextInput value={editingCommentText} onChangeText={setEditingCommentText}
                                      onSubmitEditing={() => handleUpdateTaskComment(task.id, c.id)}
                                      style={{ fontSize: 12, backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 }} autoFocus />
                                  ) : (
                                    <Text style={{ fontSize: 12, color: COLORS.secondary, marginTop: 1 }}>{c.content}</Text>
                                  )}
                                </View>
                                {user?.id === c.user?.id && !editingCommentId && (
                                  <View style={{ flexDirection: 'row', gap: 6 }}>
                                    <TouchableOpacity onPress={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}>
                                      <Text style={{ fontSize: 12, color: '#94A3B8' }}>✏️</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteTaskComment(task.id, c.id)}>
                                      <Text style={{ fontSize: 12, color: '#EF4444' }}>🗑</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            ))}
                            <TextInput placeholder="Write a comment..." value={newComment} onChangeText={setNewComment}
                              onSubmitEditing={() => handleAddTaskComment(task.id)} returnKeyType="send"
                              style={{ fontSize: 12, backgroundColor: COLORS.white, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 4 }}
                              placeholderTextColor={COLORS.muted} />
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Board View ───────────────────────────────────────────────────────
  if (viewMode === 'board' && selectedProject) {
    const allTasks = selectedProject.tasks || [];
    const tasks = showArchived ? allTasks.filter(t => t.archived) : allTasks.filter(t => !t.archived);

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setViewMode('detail')} style={styles.backButton}>
            <Text style={styles.backArrow}>{'\u2039'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedProject.name} — Board</Text>
          <TouchableOpacity
            style={[styles.archiveToggle, showArchived && { backgroundColor: '#FEF3C7' }]}
            onPress={() => setShowArchived(!showArchived)}
          >
            <Text style={{ fontSize: 12, color: showArchived ? '#92400E' : COLORS.muted }}>📥 {showArchived ? 'Archived' : 'Archive'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boardScroll}>
          {TASK_STATUSES.map((col) => {
            const colTasks = tasks.filter((t: TaskData) => t.status === col);
            return (
              <View key={col} style={styles.boardColumn}>
                <Text style={styles.boardColumnTitle}>{TASK_STATUS_LABELS[col]} ({colTasks.length})</Text>
                <ScrollView style={styles.boardColumnScroll}>
                  {colTasks.map((task: TaskData) => {
                    const progress = getChecklistProgress(task.checklists);
                    return (
                      <TouchableOpacity
                        key={task.id}
                        style={styles.boardCard}
                        onPress={() => { setSelectedTask(task); setShowTaskDetail(true); }}
                        onLongPress={() => {
                          Alert.alert(task.title, 'Choose an action', [
                            { text: task.archived ? 'Unarchive' : 'Archive', onPress: () => handleArchiveTask(task.id, !task.archived) },
                            { text: 'Delete', style: 'destructive', onPress: () => handleDeleteTask(task.id) },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }}
                      >
                        <Text style={styles.boardCardTitle}>{task.title}</Text>
                        {task.description && <Text style={styles.boardCardDesc} numberOfLines={2}>{task.description}</Text>}

                        {/* Badges */}
                        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          <View style={[styles.badge, { backgroundColor: PRIORITY_COLORS[task.priority]?.bg }]}>
                            <Text style={[styles.badgeText, { color: PRIORITY_COLORS[task.priority]?.text }]}>{task.priority}</Text>
                          </View>
                          {task.createdAt && (
                            <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
                              <Text style={[styles.badgeText, { color: '#64748B' }]}>📅 {new Date(task.createdAt).toLocaleDateString()}</Text>
                            </View>
                          )}
                          {task.deadline && (
                            <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                              <Text style={[styles.badgeText, { color: '#92400E' }]}>⏰ {new Date(task.deadline).toLocaleDateString()}</Text>
                            </View>
                          )}
                          {progress && (
                            <View style={[styles.badge, { backgroundColor: progress.percent === 100 ? '#D1FAE5' : '#F1F5F9' }]}>
                              <Text style={[styles.badgeText, { color: progress.percent === 100 ? '#059669' : '#64748B' }]}>☑ {progress.done}/{progress.total}</Text>
                            </View>
                          )}
                        </View>

                        {/* Progress bar */}
                        {progress && (
                          <View style={[styles.progressBar, { marginTop: 6 }]}>
                            <View style={[styles.progressFill, { width: `${progress.percent}%` as any, backgroundColor: progress.percent === 100 ? COLORS.green : COLORS.violet }]} />
                          </View>
                        )}

                        <TouchableOpacity onPress={() => handleChatWithUser(task.assignedTo?.id || '')}>
                          <Text style={[styles.boardCardAssignee, { textDecorationLine: 'underline' }]}>{task.assignedTo?.displayName || task.assignedTo?.username || 'Unassigned'}</Text>
                        </TouchableOpacity>

                        {/* Reactions row */}
                        {(() => {
                          const likes = ((task as any).reactions || []).filter((r: any) => r.type === 'like').length;
                          const dislikes = ((task as any).reactions || []).filter((r: any) => r.type === 'dislike').length;
                          const myReaction = ((task as any).reactions || []).find((r: any) => r.userId === user?.id)?.type;
                          const cmtCount = (task as any)._count?.comments || 0;
                          return (
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 6 }}>
                              <TouchableOpacity onPress={() => handleReactTask(task.id, 'like')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={{ fontSize: 11, color: myReaction === 'like' ? '#2563EB' : '#94A3B8' }}>👍 {likes > 0 ? likes : ''}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleReactTask(task.id, 'dislike')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={{ fontSize: 11, color: myReaction === 'dislike' ? '#EF4444' : '#94A3B8' }}>👎 {dislikes > 0 ? dislikes : ''}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setExpandedComments(expandedComments === task.id ? null : task.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Text style={{ fontSize: 11, color: expandedComments === task.id ? '#7C3AED' : '#94A3B8' }}>💬 {cmtCount > 0 ? cmtCount : ''}</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })()}

                        {/* Expanded comments */}
                        {expandedComments === task.id && (
                          <View style={{ marginTop: 6 }}>
                            {loadingComments ? (
                              <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                              <>
                                {taskComments.map((c) => (
                                  <View key={c.id} style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                                    <TouchableOpacity onPress={() => handleChatWithUser(c.user?.id)}>
                                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '700' }}>{(c.user?.displayName || '?')[0]}</Text>
                                      </View>
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }}>
                                      <TouchableOpacity onPress={() => handleChatWithUser(c.user?.id)}>
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.text }}>{c.user?.displayName || c.user?.username}</Text>
                                      </TouchableOpacity>
                                      {editingCommentId === c.id ? (
                                        <TextInput
                                          value={editingCommentText}
                                          onChangeText={setEditingCommentText}
                                          onSubmitEditing={() => handleUpdateTaskComment(task.id, c.id)}
                                          style={{ fontSize: 10, backgroundColor: '#F1F5F9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 }}
                                          autoFocus
                                        />
                                      ) : (
                                        <Text style={{ fontSize: 10, color: COLORS.secondary }}>{c.content}</Text>
                                      )}
                                    </View>
                                    {user?.id === c.user?.id && !editingCommentId && (
                                      <View style={{ flexDirection: 'row', gap: 4 }}>
                                        <TouchableOpacity onPress={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}>
                                          <Text style={{ fontSize: 10, color: '#94A3B8' }}>✏️</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteTaskComment(task.id, c.id)}>
                                          <Text style={{ fontSize: 10, color: '#EF4444' }}>🗑</Text>
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                ))}
                                <TextInput
                                  placeholder="Write a comment..."
                                  value={newComment}
                                  onChangeText={setNewComment}
                                  onSubmitEditing={() => handleAddTaskComment(task.id)}
                                  style={{ fontSize: 10, backgroundColor: '#F8FAFC', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 2 }}
                                />
                              </>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {colTasks.length === 0 && <Text style={styles.boardEmpty}>No tasks</Text>}
                </ScrollView>

                {/* Add card */}
                {!showArchived && (
                  newTaskColumn === col ? (
                    <View style={{ marginTop: 8 }}>
                      <TextInput
                        style={[styles.textInput, { marginBottom: 6 }]}
                        value={newTaskTitle}
                        onChangeText={setNewTaskTitle}
                        placeholder="Enter a title..."
                        placeholderTextColor={COLORS.muted}
                        autoFocus
                        onSubmitEditing={() => handleCreateTask(col)}
                        returnKeyType="done"
                      />
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.addBtn, { flex: 1 }]}
                          onPress={() => handleCreateTask(col)}
                          disabled={!newTaskTitle.trim()}
                        >
                          <Text style={styles.addBtnText}>Add Card</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ justifyContent: 'center', paddingHorizontal: 8 }}
                          onPress={() => { setNewTaskColumn(null); setNewTaskTitle(''); }}
                        >
                          <Text style={{ color: COLORS.muted, fontSize: 13 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addCardBtn}
                      onPress={() => setNewTaskColumn(col)}
                    >
                      <Text style={{ fontSize: 13, color: COLORS.muted }}>+ Add a card</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            );
          })}
        </ScrollView>
        {renderTaskDetailModal()}
      </SafeAreaView>
    );
  }

  // ─── Detail View ──────────────────────────────────────────────────────
  if (viewMode === 'detail' && selectedProject) {
    const p = selectedProject;
    const statusStyle = STATUS_COLORS[p.status] || STATUS_COLORS.ACTIVE;
    const existingMemberIds = new Set(p.members.map(m => m.user.id));
    const filteredMemberResults = memberResults.filter(u => !existingMemberIds.has(u.id));

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setViewMode('list'); setSelectedProject(null); }} style={styles.backButton}>
            <Text style={styles.backArrow}>{'\u2039'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{p.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{p.status}</Text>
          </View>
        </View>
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
          {/* Board button */}
          <TouchableOpacity style={styles.boardButton} onPress={() => openBoard(p.id)}>
            <Text style={styles.boardButtonText}>📋 View Kanban Board</Text>
          </TouchableOpacity>

          {/* Description */}
          {p.description && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.detailText}>{p.description}</Text>
            </View>
          )}

          {/* Specs & Goals */}
          {p.specsAndGoals && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>🎯 Specs & Goals</Text>
              <Text style={styles.detailText}>{p.specsAndGoals}</Text>
            </View>
          )}

          {/* Links */}
          {(p.gitUrl || p.storageUrl) && (
            <View style={styles.linksRow}>
              {p.gitUrl && (
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(p.gitUrl!)}>
                  <Text style={styles.linkText}>🔗 Git Repository</Text>
                </TouchableOpacity>
              )}
              {p.storageUrl && (
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(p.storageUrl!)}>
                  <Text style={styles.linkText}>📁 Storage</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Team Lead */}
          {p.teamLead && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>👑 Team Lead</Text>
              <Text style={styles.memberName}>{p.teamLead.displayName || p.teamLead.username}</Text>
            </View>
          )}

          {/* ADD MEMBERS — Prominent */}
          <View style={styles.addMemberSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={styles.addMemberIcon}>
                <Text style={{ fontSize: 20 }}>👥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.violet }}>Add Team Members</Text>
                <Text style={{ fontSize: 12, color: COLORS.muted }}>Search by name to add people</Text>
              </View>
            </View>
            <TextInput
              style={styles.addMemberInput}
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Type a name to add members..."
              placeholderTextColor={COLORS.muted}
            />
            {filteredMemberResults.length > 0 && (
              <View style={styles.memberSearchResults}>
                {filteredMemberResults.slice(0, 6).map((u: any) => (
                  <TouchableOpacity key={u.id} style={styles.memberSearchRow} onPress={() => handleAddMember(u.id)}>
                    <View style={styles.avatarSm}>
                      <Text style={styles.avatarSmText}>{initial(u.displayName || u.username)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text }}>{u.displayName || u.username}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.muted }}>@{u.username}</Text>
                    </View>
                    <Text style={{ fontSize: 16, color: COLORS.violet }}>+</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Current Members */}
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>👥 Members ({p.members.length})</Text>
            {p.members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{initial(m.user.displayName || m.user.username)}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.user.displayName || m.user.username}</Text>
                  <Text style={styles.memberEmail}>{m.user.email}</Text>
                </View>
                {m.role === 'LEAD' && (
                  <View style={styles.leadBadge}><Text style={styles.leadBadgeText}>Lead</Text></View>
                )}
                {m.user.id !== p.createdBy.id && (
                  <TouchableOpacity onPress={() => handleRemoveMember(m.user.id)} style={{ padding: 4 }}>
                    <Text style={{ color: COLORS.red, fontSize: 14 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{p._count.tasks}</Text>
              <Text style={styles.statLabel}>Tasks</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{p._count.members}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
          </View>

          {/* Delete */}
          <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(p.id, p.name)}>
            <Text style={styles.deleteButtonText}>🗑️ Delete Project</Text>
          </TouchableOpacity>
        </ScrollView>
        {renderTaskDetailModal()}
      </SafeAreaView>
    );
  }

  // ─── List View ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>📂 Projects</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreate(true)}>
          <Text style={styles.createButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search projects..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={loadProjects}
          returnKeyType="search"
        />
      </View>

      {/* Project Mates */}
      {projectMates.length > 0 && (
        <View style={styles.matesContainer}>
          <Text style={styles.matesTitle}>Project Mates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {projectMates.map((mate) => (
              <View key={mate.userId} style={styles.mateBadge}>
                <View style={styles.mateAvatar}>
                  <Text style={styles.mateAvatarText}>{initial(mate.displayName || mate.username)}</Text>
                </View>
                <Text style={styles.mateName} numberOfLines={1}>{mate.displayName || mate.username}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Project List */}
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.ACTIVE;
          return (
            <TouchableOpacity style={styles.projectCard} onPress={() => openDetail(item.id)}>
              <View style={styles.projectCardHeader}>
                <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
                </View>
              </View>
              {item.description && <Text style={styles.projectDesc} numberOfLines={2}>{item.description}</Text>}
              <View style={styles.projectFooter}>
                <Text style={styles.projectStat}>{item._count.tasks} tasks</Text>
                <Text style={styles.projectStat}>{item._count.members} members</Text>
                {item.teamLead && <Text style={styles.projectLead}>👑 {item.teamLead.displayName || item.teamLead.username}</Text>}
              </View>
              <View style={styles.projectActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openDetail(item.id)}>
                  <Text style={styles.actionBtnText}>Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBoard]} onPress={() => openBoard(item.id)}>
                  <Text style={[styles.actionBtnText, { color: COLORS.violet }]}>Board</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptySubtitle}>Create your first project or assign a task with a project name</Text>
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={projects.length === 0 ? { flexGrow: 1 } : { paddingBottom: 20 }}
      />

      {/* Create Project Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>New Project</Text>
            <TouchableOpacity onPress={handleCreate} disabled={!createName.trim() || creating}>
              <Text style={[styles.modalSave, (!createName.trim() || creating) && { opacity: 0.5 }]}>{creating ? 'Creating...' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Project Name *</Text>
            <TextInput style={styles.textInput} value={createName} onChangeText={setCreateName} placeholder="e.g., Project Alpha" placeholderTextColor={COLORS.muted} autoFocus />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={createDesc} onChangeText={setCreateDesc} placeholder="What is this project?" placeholderTextColor={COLORS.muted} multiline />

            <Text style={styles.fieldLabel}>Specs & Goals</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={createSpecs} onChangeText={setCreateSpecs} placeholder="Specifications, goals, milestones..." placeholderTextColor={COLORS.muted} multiline numberOfLines={4} />

            <Text style={styles.fieldLabel}>Git Repository URL</Text>
            <TextInput style={styles.textInput} value={createGitUrl} onChangeText={setCreateGitUrl} placeholder="https://github.com/..." placeholderTextColor={COLORS.muted} keyboardType="url" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Storage URL</Text>
            <TextInput style={styles.textInput} value={createStorageUrl} onChangeText={setCreateStorageUrl} placeholder="https://drive.google.com/..." placeholderTextColor={COLORS.muted} keyboardType="url" autoCapitalize="none" />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  screenTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1, marginHorizontal: 8 },
  backButton: { padding: 4 },
  backArrow: { fontSize: 28, color: COLORS.primary, fontWeight: '300' },
  createButton: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: COLORS.violet, borderRadius: 8 },
  createButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: COLORS.text },

  // Project mates
  matesContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  matesTitle: { fontSize: 11, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  mateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E8FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8 },
  mateAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.violet, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  mateAvatarText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  mateName: { fontSize: 12, fontWeight: '500', color: COLORS.violet, maxWidth: 80 },

  // Project card
  projectCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  projectCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  projectName: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '600' },
  projectDesc: { fontSize: 13, color: COLORS.secondary, marginBottom: 10, lineHeight: 18 },
  projectFooter: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  projectStat: { fontSize: 12, color: COLORS.muted },
  projectLead: { fontSize: 12, color: COLORS.violet, fontWeight: '500' },
  projectActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.inputBg, alignItems: 'center' },
  actionBtnBoard: { backgroundColor: '#F3E8FF' },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // Detail view
  detailScroll: { flex: 1 },
  detailContent: { padding: 16, gap: 16 },
  detailSection: { backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 14 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  detailText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  linksRow: { flexDirection: 'row', gap: 10 },
  linkButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.inputBg, alignItems: 'center' },
  linkText: { fontSize: 13, fontWeight: '600', color: COLORS.blue },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.violet, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  memberAvatarText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  memberEmail: { fontSize: 11, color: COLORS.muted },
  leadBadge: { backgroundColor: '#F3E8FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  leadBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.violet },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 16, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  boardButton: { backgroundColor: '#F3E8FF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  boardButtonText: { fontSize: 15, fontWeight: '600', color: COLORS.violet },
  deleteButton: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteButtonText: { fontSize: 14, fontWeight: '600', color: COLORS.red },

  // Add member section (prominent)
  addMemberSection: {
    backgroundColor: '#F3E8FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C4B5FD',
  },
  addMemberIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  addMemberInput: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 2,
    borderColor: '#C4B5FD',
  },
  memberSearchResults: {
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    overflow: 'hidden',
  },
  memberSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  // Board view
  boardScroll: { flex: 1, padding: 8 },
  boardColumn: { width: 270, backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 10, marginRight: 10 },
  boardColumnTitle: { fontSize: 13, fontWeight: '700', color: COLORS.secondary, marginBottom: 10 },
  boardColumnScroll: { flex: 1 },
  boardCard: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  boardCardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  boardCardDesc: { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  boardCardAssignee: { fontSize: 11, color: COLORS.violet, fontWeight: '500', marginTop: 6 },
  boardEmpty: { fontSize: 12, color: COLORS.muted, textAlign: 'center', paddingVertical: 16 },
  addCardBtn: { marginTop: 8, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)' },

  // Archive toggle
  archiveToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: COLORS.inputBg },

  // Badges
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600' },

  // Progress bar
  progressBar: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: 4, borderRadius: 2 },

  // Checklist
  checklistBlock: { backgroundColor: COLORS.inputBg, borderRadius: 10, padding: 12, marginBottom: 10 },
  checklistItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.muted, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: COLORS.violet, borderColor: COLORS.violet },
  checklistItemText: { flex: 1, fontSize: 13, color: COLORS.text },
  checklistItemDone: { textDecorationLine: 'line-through', color: COLORS.muted },

  // Chips
  chipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.inputBg },
  chipBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.secondary },

  // Helpers
  avatarSm: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.violet, justifyContent: 'center', alignItems: 'center' },
  avatarSmText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.violet, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: COLORS.secondary, textAlign: 'center' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalCancel: { fontSize: 16, color: COLORS.secondary },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalSave: { fontSize: 16, fontWeight: '600', color: COLORS.violet },
  modalContent: { flex: 1, padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  textInput: { backgroundColor: COLORS.inputBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
});
