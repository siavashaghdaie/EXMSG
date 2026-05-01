import React, { useState, useEffect } from 'react';
import { Plus, X, Loader2, UserPlus, CheckSquare, Users } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import Avatar from '@/components/common/Avatar';

interface ChecklistFormItem {
  id?: string;
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeIds?: string[];
  assigneeNames?: string[];
  dueDate?: string;
}

interface ChecklistForm {
  id?: string;
  title: string;
  items: ChecklistFormItem[];
}

interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  editingTask?: any;
  defaultProjectId?: string;
  defaultStatus?: string;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({
  visible,
  onClose,
  onSave,
  editingTask,
  defaultProjectId,
  defaultStatus,
}) => {
  const { user } = useAuthStore();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedToId: user?.id || '',
    deadline: '',
    priority: 'MEDIUM' as string,
    labels: [] as string[],
    lindaFollowing: false,
    lindaFollowInterval: 'daily' as string,
    visibleToDepartmentIds: [] as string[],
    departmentId: '' as string,
    projectId: '' as string,
    projectName: '' as string,
  });

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [labelInput, setLabelInput] = useState('');

  // Assignee search
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<Array<{ id: string; username: string; email: string; avatar?: string }>>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<{ id: string; displayName: string; username: string; avatarUrl?: string } | null>(null);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [assigneeSearchLoading, setAssigneeSearchLoading] = useState(false);

  // Co-assignees
  const [coAssignees, setCoAssignees] = useState<Array<{ id: string; displayName: string; username: string; avatarUrl?: string }>>([]);
  const [coAssigneeSearch, setCoAssigneeSearch] = useState('');
  const [coAssigneeResults, setCoAssigneeResults] = useState<Array<{ id: string; username: string; email: string; avatar?: string }>>([]);
  const [showCoAssigneeDropdown, setShowCoAssigneeDropdown] = useState(false);

  // Checklists
  const [formChecklists, setFormChecklists] = useState<ChecklistForm[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  // Checklist item assignee search
  const [itemAssigneeSearch, setItemAssigneeSearch] = useState('');
  const [itemAssigneeResults, setItemAssigneeResults] = useState<Array<{ id: string; username: string; email: string; avatar?: string }>>([]);
  const [itemAssigneeTarget, setItemAssigneeTarget] = useState<{ clIdx: number; itemIdx: number } | null>(null);

  // Load departments and projects
  useEffect(() => {
    if (!visible) return;
    api.getDepartments().then((res) => {
      setDepartments(res?.departments?.map((d: any) => ({ id: d.id, name: d.name })) || []);
    }).catch(() => {});
    api.getProjects().then((res) => {
      setProjects(res?.projects?.map((p: any) => ({ id: p.id, name: p.name })) || []);
    }).catch(() => {});
  }, [visible]);

  // Populate form when editing
  useEffect(() => {
    if (!visible) return;
    if (editingTask) {
      setFormData({
        title: editingTask.title || '',
        description: editingTask.description || '',
        assignedToId: editingTask.assignedTo?.id || editingTask.assignedToId || user?.id || '',
        deadline: editingTask.deadline ? new Date(editingTask.deadline).toISOString().split('T')[0] : '',
        priority: editingTask.priority || 'MEDIUM',
        labels: editingTask.labels || [],
        lindaFollowing: editingTask.lindaFollowing || false,
        lindaFollowInterval: editingTask.lindaFollowInterval || 'daily',
        visibleToDepartmentIds: editingTask.visibleToDepartments?.map((d: any) => d.id) || [],
        departmentId: editingTask.department?.id || editingTask.departmentId || '',
        projectId: editingTask.project?.id || editingTask.projectId || '',
        projectName: '',
      });
      if (editingTask.assignedTo) {
        setSelectedAssignee(editingTask.assignedTo);
      }
      // Load co-assignees from resolved data
      if (Array.isArray(editingTask.coAssignees) && editingTask.coAssignees.length > 0) {
        setCoAssignees(editingTask.coAssignees.map((u: any) => ({
          id: u.id, displayName: u.displayName || u.username, username: u.username, avatarUrl: u.avatarUrl,
        })));
      }
      const existingChecklists = editingTask.checklists || [];
      setFormChecklists(existingChecklists.map((cl: any) => ({
        id: cl.id,
        title: cl.title,
        items: (cl.items || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          assigneeId: item.assigneeIds?.length ? item.assigneeIds[0] : undefined,
          assigneeName: item.assigneeNames?.length ? item.assigneeNames[0] : (item.assignees?.length ? (item.assignees[0].displayName || item.assignees[0].username) : undefined),
          assigneeIds: item.assigneeIds || [],
          assigneeNames: item.assigneeNames || [],
          dueDate: item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : undefined,
        })),
      })));
    } else {
      setFormData({
        title: '',
        description: '',
        assignedToId: user?.id || '',
        deadline: '',
        priority: 'MEDIUM',
        labels: [],
        lindaFollowing: false,
        lindaFollowInterval: 'daily',
        visibleToDepartmentIds: [],
        departmentId: '',
        projectId: defaultProjectId || '',
        projectName: '',
      });
      setSelectedAssignee(null);
      setFormChecklists([]);
    }
    setAssigneeSearch('');
    setShowAssigneeDropdown(false);
    // Only reset co-assignees for new tasks — editing populates from task data above
    if (!editingTask) {
      setCoAssignees([]);
    }
    setCoAssigneeSearch('');
    setCoAssigneeResults([]);
    setShowCoAssigneeDropdown(false);
    setLabelInput('');
    setNewChecklistTitle('');
  }, [visible, editingTask, defaultProjectId]);

  // Debounced search for assignee
  useEffect(() => {
    if (!assigneeSearch || assigneeSearch.length < 2) {
      setAssigneeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setAssigneeSearchLoading(true);
      try {
        const results = await api.searchUsers(assigneeSearch, 10);
        setAssigneeResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setAssigneeSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [assigneeSearch]);

  // Debounced search for co-assignees
  useEffect(() => {
    if (!coAssigneeSearch || coAssigneeSearch.length < 2) {
      setCoAssigneeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(coAssigneeSearch, 10);
        setCoAssigneeResults(results);
      } catch (error) {
        console.error('Error searching co-assignees:', error);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [coAssigneeSearch]);

  // Debounced search for checklist item assignee
  useEffect(() => {
    if (!itemAssigneeSearch || itemAssigneeSearch.length < 2) {
      setItemAssigneeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(itemAssigneeSearch, 10);
        setItemAssigneeResults(results);
      } catch (error) {
        console.error('Error searching users for checklist item:', error);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [itemAssigneeSearch]);

  const handleAddLabel = () => {
    if (labelInput.trim() && !formData.labels.includes(labelInput.trim())) {
      setFormData({ ...formData, labels: [...formData.labels, labelInput.trim()] });
      setLabelInput('');
    }
  };

  const handleRemoveLabel = (label: string) => {
    setFormData({ ...formData, labels: formData.labels.filter(l => l !== label) });
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('Task title is required');
      return;
    }

    try {
      // DEBUG: log checklist state before save
      console.log('[TaskFormModal] formChecklists before save:', JSON.stringify(formChecklists, null, 2));

      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title: formData.title,
          description: formData.description,
          assignedToId: formData.assignedToId,
          deadline: formData.deadline || null,
          priority: formData.priority,
          labels: formData.labels,
          lindaFollowing: formData.lindaFollowing,
          lindaFollowInterval: formData.lindaFollowing ? formData.lindaFollowInterval : null,
          projectId: (formData.projectId && formData.projectId !== '__new__') ? formData.projectId : '',
          projectName: (formData.projectId === '__new__' && formData.projectName) ? formData.projectName : undefined,
          departmentId: formData.departmentId || '',
          coAssigneeIds: coAssignees.map(ca => ca.id),
        } as any);

        // Always handle checklists when editing — delete old ones first, then recreate
        const existingChecklists = editingTask.checklists || [];
        for (const cl of existingChecklists) {
          try { await api.deleteChecklist(cl.id); } catch (e) { console.error('Delete checklist error:', e); }
        }
        for (const cl of formChecklists) {
          try {
            const checklist = await api.createChecklist({ taskId: editingTask.id, title: cl.title });
            console.log('[TaskFormModal] Created checklist:', checklist?.id, 'for task:', editingTask.id);
            if (!checklist?.id) {
              console.error('[TaskFormModal] createChecklist returned no id! Full response:', checklist);
              continue;
            }
            for (const item of cl.items) {
              const payload = {
                title: item.title,
                assigneeIds: (item.assigneeIds && item.assigneeIds.length > 0) ? item.assigneeIds : (item.assigneeId ? [item.assigneeId] : undefined),
                dueDate: item.dueDate || undefined,
              };
              console.log('[TaskFormModal] Adding item to checklist', checklist.id, ':', JSON.stringify(payload));
              const result = await api.addChecklistItem(checklist.id, payload);
              console.log('[TaskFormModal] addChecklistItem result:', JSON.stringify(result));
            }
          } catch (clErr) {
            console.error('Checklist update error:', clErr);
          }
        }
      } else {
        const created = await api.createTask({
          title: formData.title,
          description: formData.description,
          assignedToId: formData.assignedToId,
          deadline: formData.deadline || undefined,
          priority: formData.priority,
          labels: formData.labels,
          lindaFollowing: formData.lindaFollowing,
          lindaFollowInterval: formData.lindaFollowing ? formData.lindaFollowInterval : undefined,
          visibleToDepartmentIds: formData.visibleToDepartmentIds.length > 0 ? formData.visibleToDepartmentIds : undefined,
          departmentId: formData.departmentId || undefined,
          projectId: (formData.projectId && formData.projectId !== '__new__') ? formData.projectId : undefined,
          projectName: formData.projectName || undefined,
          coAssigneeIds: coAssignees.map(ca => ca.id),
        } as any);

        console.log('[TaskFormModal] Created task:', created?.id, 'formChecklists count:', formChecklists.length);

        // Create checklists
        if (formChecklists.length > 0 && created?.id) {
          for (const cl of formChecklists) {
            try {
              const checklist = await api.createChecklist({ taskId: created.id, title: cl.title });
              console.log('[TaskFormModal] Created checklist:', checklist?.id, 'for new task:', created.id);
              if (!checklist?.id) {
                console.error('[TaskFormModal] createChecklist returned no id! Full response:', checklist);
                continue;
              }
              for (const item of cl.items) {
                const payload = {
                  title: item.title,
                  assigneeIds: (item.assigneeIds && item.assigneeIds.length > 0) ? item.assigneeIds : (item.assigneeId ? [item.assigneeId] : undefined),
                  dueDate: item.dueDate || undefined,
                };
                console.log('[TaskFormModal] Adding item to checklist', checklist.id, ':', JSON.stringify(payload));
                const result = await api.addChecklistItem(checklist.id, payload);
                console.log('[TaskFormModal] addChecklistItem result:', JSON.stringify(result));
              }
            } catch (clErr) {
              console.error('Checklist creation error:', clErr);
            }
          }
        }

        // If we have a default status other than NOT_STARTED, update it
        if (defaultStatus && defaultStatus !== 'NOT_STARTED' && created?.id) {
          try {
            await api.updateTask(created.id, { status: defaultStatus });
          } catch (e) { /* ignore */ }
        }
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      alert('Failed to save task');
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white dark:bg-surface-900 rounded-t-lg md:rounded-lg w-full md:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 bg-white dark:bg-surface-900 border-b border-gray-200 dark:border-surface-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {editingTask ? 'Edit Task' : 'Create Task'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-surface-800 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter task title"
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter task description"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Assign To */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <UserPlus className="w-4 h-4 inline mr-1" />Assign To
            </label>
            {selectedAssignee ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 border border-gray-300 dark:border-surface-700">
                <Avatar name={selectedAssignee.displayName || selectedAssignee.username} src={selectedAssignee.avatarUrl} size="sm" />
                <span className="text-sm text-gray-900 dark:text-white flex-1">{selectedAssignee.displayName || selectedAssignee.username}</span>
                <button onClick={() => { setSelectedAssignee(null); setFormData({ ...formData, assignedToId: user?.id || '' }); }} className="p-1 hover:bg-gray-200 dark:hover:bg-surface-700 rounded">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={(e) => { setAssigneeSearch(e.target.value); setShowAssigneeDropdown(true); }}
                  onFocus={() => setShowAssigneeDropdown(true)}
                  placeholder="Search users to assign..."
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {assigneeSearchLoading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />}
              </div>
            )}
            {showAssigneeDropdown && assigneeResults.length > 0 && !selectedAssignee && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {assigneeResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedAssignee({ id: u.id, displayName: u.username, username: u.username, avatarUrl: u.avatar });
                      setFormData({ ...formData, assignedToId: u.id });
                      setShowAssigneeDropdown(false);
                      setAssigneeSearch('');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-surface-700 text-left"
                  >
                    <Avatar name={u.username} src={u.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.username}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!selectedAssignee && !assigneeSearch && (
              <p className="text-xs text-gray-400 mt-1">Leave empty to assign to yourself</p>
            )}
          </div>

          {/* Co-Assignees */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Users className="w-4 h-4 inline mr-1" />Co-Assignees
            </label>
            {coAssignees.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {coAssignees.map(ca => (
                  <span key={ca.id} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full text-xs">
                    <Avatar name={ca.displayName || ca.username} src={ca.avatarUrl} size="sm" />
                    {ca.displayName || ca.username}
                    <button onClick={() => setCoAssignees(prev => prev.filter(a => a.id !== ca.id))} className="ml-1"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              value={coAssigneeSearch}
              onChange={(e) => { setCoAssigneeSearch(e.target.value); setShowCoAssigneeDropdown(true); }}
              onFocus={() => setShowCoAssigneeDropdown(true)}
              placeholder="Search users to add..."
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {showCoAssigneeDropdown && coAssigneeResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {coAssigneeResults.filter(u => u.id !== formData.assignedToId && !coAssignees.some(ca => ca.id === u.id)).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCoAssignees(prev => [...prev, { id: u.id, displayName: u.username, username: u.username, avatarUrl: u.avatar }]);
                      setCoAssigneeSearch('');
                      setShowCoAssigneeDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-surface-700 text-left"
                  >
                    <Avatar name={u.username} src={u.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.username}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Add additional assignees to this task</p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deadline</label>
            <input
              type="date"
              value={formData.deadline}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Department */}
          {departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
              <select
                value={formData.departmentId}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">No department</option>
                {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </select>
            </div>
          )}

          {/* Project */}
          {(!defaultProjectId || editingTask) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
              <select
                value={formData.projectId}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value, projectName: '' })}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">No project</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                <option value="__new__">+ New Project...</option>
              </select>
              {formData.projectId === '__new__' && (
                <input
                  type="text"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="Enter new project name..."
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-400"
                  autoFocus
                />
              )}
            </div>
          )}

          {/* Labels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Labels</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel(); } }}
                placeholder="Add label and press Enter"
                className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button onClick={handleAddLabel} className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">Add</button>
            </div>
            {formData.labels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.labels.map((label, idx) => (
                  <span key={idx} className="flex items-center gap-2 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-3 py-1 rounded-full text-sm">
                    {label}
                    <button onClick={() => handleRemoveLabel(label)} className="p-0 hover:text-primary-600"><X className="w-4 h-4" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Checklists */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CheckSquare className="w-4 h-4 inline mr-1" />Checklists
            </label>

            {formChecklists.map((cl, clIdx) => (
              <div key={clIdx} className="mb-3 p-3 bg-gray-50 dark:bg-surface-800 rounded-lg border border-gray-200 dark:border-surface-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{cl.title}</span>
                  <button onClick={() => setFormChecklists(formChecklists.filter((_, i) => i !== clIdx))} className="p-1 text-gray-400 hover:text-red-500 rounded">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {cl.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center gap-2 mb-1.5 ml-2">
                    <CheckSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{item.title}</span>
                    {item.assigneeName && (
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">{item.assigneeName}</span>
                    )}
                    {item.dueDate && (
                      <span className="text-[10px] text-gray-400">{new Date(item.dueDate).toLocaleDateString()}</span>
                    )}
                    <button onClick={() => {
                      const updated = [...formChecklists];
                      updated[clIdx] = { ...updated[clIdx], items: updated[clIdx].items.filter((_, i) => i !== itemIdx) };
                      setFormChecklists(updated);
                    }} className="p-0.5 text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {/* Add item form */}
                <div className="mt-2 ml-2 space-y-1.5">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Add item..."
                      id={`checklist-item-input-${clIdx}`}
                      className="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white placeholder-gray-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          const updated = [...formChecklists];
                          updated[clIdx] = { ...updated[clIdx], items: [...updated[clIdx].items, { title: (e.target as HTMLInputElement).value.trim() }] };
                          setFormChecklists(updated);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`checklist-item-input-${clIdx}`) as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...formChecklists];
                          updated[clIdx] = { ...updated[clIdx], items: [...updated[clIdx].items, { title: input.value.trim() }] };
                          setFormChecklists(updated);
                          input.value = '';
                          input.focus();
                        }
                      }}
                      className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-medium flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {cl.items.length > 0 && (
                    <div className="space-y-1.5">
                      {cl.items.map((item, itemIdx) => (
                        <div key={`opts-${itemIdx}`} className="flex gap-1 items-center">
                          <span className="text-[10px] text-gray-500 w-16 truncate">{item.title}</span>
                          <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={item.dueDate || ''}
                            className="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white"
                            onChange={(e) => {
                              const updated = [...formChecklists];
                              updated[clIdx].items[itemIdx] = { ...updated[clIdx].items[itemIdx], dueDate: e.target.value || undefined };
                              setFormChecklists(updated);
                            }}
                          />
                          <div className="flex-1 relative">
                            {item.assigneeName ? (
                              <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                                <span className="truncate text-blue-700 dark:text-blue-300">{item.assigneeName}</span>
                                <button onClick={() => {
                                  const updated = [...formChecklists];
                                  updated[clIdx].items[itemIdx] = { ...updated[clIdx].items[itemIdx], assigneeId: undefined, assigneeName: undefined, assigneeIds: [], assigneeNames: [] };
                                  setFormChecklists(updated);
                                }} className="flex-shrink-0">
                                  <X className="w-3 h-3 text-blue-400" />
                                </button>
                              </div>
                            ) : (
                              <input
                                type="text"
                                placeholder="Assign to..."
                                className="w-full px-2 py-1 text-xs rounded bg-white dark:bg-surface-700 border border-gray-200 dark:border-surface-600 text-gray-900 dark:text-white placeholder-gray-400"
                                onFocus={() => { setItemAssigneeTarget({ clIdx, itemIdx }); setItemAssigneeSearch(''); setItemAssigneeResults([]); }}
                                onChange={(e) => { setItemAssigneeTarget({ clIdx, itemIdx }); setItemAssigneeSearch(e.target.value); }}
                              />
                            )}
                            {itemAssigneeTarget?.clIdx === clIdx && itemAssigneeTarget?.itemIdx === itemIdx && itemAssigneeResults.length > 0 && (
                              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                                {itemAssigneeResults.map((u) => (
                                  <button
                                    key={u.id}
                                    onClick={() => {
                                      const updated = [...formChecklists];
                                      updated[clIdx].items[itemIdx] = {
                                        ...updated[clIdx].items[itemIdx],
                                        assigneeId: u.id,
                                        assigneeName: u.username,
                                        assigneeIds: [u.id],
                                        assigneeNames: [u.username],
                                      };
                                      setFormChecklists(updated);
                                      setItemAssigneeTarget(null);
                                      setItemAssigneeSearch('');
                                      setItemAssigneeResults([]);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-surface-700 text-left"
                                  >
                                    <Avatar name={u.username} src={u.avatar} size="sm" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{u.username}</p>
                                      <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add new checklist */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChecklistTitle.trim()) {
                    setFormChecklists([...formChecklists, { title: newChecklistTitle.trim(), items: [] }]);
                    setNewChecklistTitle('');
                  }
                }}
                placeholder="New checklist name..."
                className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-white border border-gray-300 dark:border-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <button
                onClick={() => {
                  if (newChecklistTitle.trim()) {
                    setFormChecklists([...formChecklists, { title: newChecklistTitle.trim(), items: [] }]);
                    setNewChecklistTitle('');
                  }
                }}
                disabled={!newChecklistTitle.trim()}
                className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Linda Following */}
          <div>
            <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.lindaFollowing}
                  onChange={(e) => setFormData({ ...formData, lindaFollowing: e.target.checked })}
                  className="w-5 h-5 rounded border-violet-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-violet-900 dark:text-violet-200">Requires Linda's Following</span>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">Linda AI will track this task and send periodic reminders</p>
                </div>
                <span className="text-lg">&#x1F916;</span>
              </label>
              {formData.lindaFollowing && (
                <div className="mt-3 pl-8">
                  <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1.5">Follow-up Interval</label>
                  <select
                    value={formData.lindaFollowInterval}
                    onChange={(e) => setFormData({ ...formData, lindaFollowInterval: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-surface-800 text-sm text-violet-900 dark:text-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="twice_daily">Twice a day</option>
                    <option value="daily">Daily</option>
                    <option value="every_2_days">Every 2 days</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 bg-gray-50 dark:bg-surface-800 border-t border-gray-200 dark:border-surface-700 px-6 py-4 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-surface-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors">
            {editingTask ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskFormModal;
