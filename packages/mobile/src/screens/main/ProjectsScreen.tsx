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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

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
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#D1FAE5', text: '#059669' },
  PAUSED: { bg: '#FEF3C7', text: '#D97706' },
  COMPLETED: { bg: '#DBEAFE', text: '#2563EB' },
  ARCHIVED: { bg: '#F1F5F9', text: '#64748B' },
};

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
  tasks?: any[];
}

type ViewMode = 'list' | 'detail' | 'board';

export default function ProjectsScreen() {
  const { user } = useAuthStore();
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

  // ─── Board View ───────────────────────────────────────────────────────
  if (viewMode === 'board' && selectedProject) {
    const tasks = selectedProject.tasks || [];
    const columns = ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'BLOCKED'];
    const columnLabels: Record<string, string> = {
      NOT_STARTED: 'To Do', IN_PROGRESS: 'In Progress', PENDING_REVIEW: 'Review', COMPLETED: 'Done', BLOCKED: 'Blocked',
    };

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setViewMode('detail')} style={styles.backButton}>
            <Text style={styles.backArrow}>{'\u2039'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedProject.name} — Board</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boardScroll}>
          {columns.map((col) => {
            const colTasks = tasks.filter((t: any) => t.status === col);
            return (
              <View key={col} style={styles.boardColumn}>
                <Text style={styles.boardColumnTitle}>{columnLabels[col]} ({colTasks.length})</Text>
                <ScrollView style={styles.boardColumnScroll}>
                  {colTasks.map((task: any) => (
                    <View key={task.id} style={styles.boardCard}>
                      <Text style={styles.boardCardTitle}>{task.title}</Text>
                      {task.description && <Text style={styles.boardCardDesc} numberOfLines={2}>{task.description}</Text>}
                      <Text style={styles.boardCardAssignee}>{task.assignedTo?.displayName || task.assignedTo?.username || 'Unassigned'}</Text>
                    </View>
                  ))}
                  {colTasks.length === 0 && <Text style={styles.boardEmpty}>No tasks</Text>}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Detail View ──────────────────────────────────────────────────────
  if (viewMode === 'detail' && selectedProject) {
    const p = selectedProject;
    const statusStyle = STATUS_COLORS[p.status] || STATUS_COLORS.ACTIVE;

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
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
          {/* Board button */}
          <TouchableOpacity style={styles.boardButton} onPress={() => openBoard(p.id)}>
            <Text style={styles.boardButtonText}>{'\uD83D\uDCCB'} View Kanban Board</Text>
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
              <Text style={styles.detailLabel}>{'\uD83C\uDFAF'} Specs & Goals</Text>
              <Text style={styles.detailText}>{p.specsAndGoals}</Text>
            </View>
          )}

          {/* Links */}
          {(p.gitUrl || p.storageUrl) && (
            <View style={styles.linksRow}>
              {p.gitUrl && (
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(p.gitUrl!)}>
                  <Text style={styles.linkText}>{'\uD83D\uDD17'} Git Repository</Text>
                </TouchableOpacity>
              )}
              {p.storageUrl && (
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(p.storageUrl!)}>
                  <Text style={styles.linkText}>{'\uD83D\uDCC1'} Storage</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Team Lead */}
          {p.teamLead && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{'\uD83D\uDC51'} Team Lead</Text>
              <Text style={styles.memberName}>{p.teamLead.displayName || p.teamLead.username}</Text>
            </View>
          )}

          {/* Members */}
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{'\uD83D\uDC65'} Members ({p.members.length})</Text>
            {p.members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{(m.user.displayName || m.user.username).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.user.displayName || m.user.username}</Text>
                  <Text style={styles.memberEmail}>{m.user.email}</Text>
                </View>
                {m.role === 'LEAD' && (
                  <View style={styles.leadBadge}><Text style={styles.leadBadgeText}>Lead</Text></View>
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
            <Text style={styles.deleteButtonText}>{'\uD83D\uDDD1'} Delete Project</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── List View ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>{'\uD83D\uDCC2'} Projects</Text>
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
                  <Text style={styles.mateAvatarText}>{(mate.displayName || mate.username).charAt(0).toUpperCase()}</Text>
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
                {item.teamLead && <Text style={styles.projectLead}>{'\uD83D\uDC51'} {item.teamLead.displayName || item.teamLead.username}</Text>}
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
              <Text style={styles.emptyIcon}>{'\uD83D\uDCC2'}</Text>
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

  // Board view
  boardScroll: { flex: 1, padding: 8 },
  boardColumn: { width: 260, backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 10, marginRight: 10, maxHeight: '100%' },
  boardColumnTitle: { fontSize: 13, fontWeight: '700', color: COLORS.secondary, marginBottom: 10 },
  boardColumnScroll: { flex: 1 },
  boardCard: { backgroundColor: COLORS.white, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  boardCardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  boardCardDesc: { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  boardCardAssignee: { fontSize: 11, color: COLORS.violet, fontWeight: '500' },
  boardEmpty: { fontSize: 12, color: COLORS.muted, textAlign: 'center', paddingVertical: 16 },

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
