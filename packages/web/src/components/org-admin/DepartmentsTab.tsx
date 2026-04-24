import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Users, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/services/api';
import Avatar from '@/components/common/Avatar';

interface DepartmentsTabProps {
  orgId: string | null;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  members: { id: string; user: { id: string; username: string; displayName: string; avatarUrl?: string; email: string } }[];
  _count: { members: number; visibleTasks: number };
}

interface OrgMember {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  email: string;
  avatarUrl?: string;
  role: string;
}

export default function DepartmentsTab({ orgId }: DepartmentsTabProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create department
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Expanded departments (to show member list)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Add member
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const loadDepartments = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await api.getDepartments(orgId);
      setDepartments(res.departments || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadOrgMembers = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await api.getOrgAdminMembers(undefined, 1, 200, orgId);
      setOrgMembers(res?.members || []);
    } catch { /* ignore */ }
  }, [orgId]);

  useEffect(() => {
    loadDepartments();
    loadOrgMembers();
  }, [loadDepartments, loadOrgMembers]);

  const handleCreate = async () => {
    if (!newName.trim() || !orgId) return;
    setCreating(true);
    try {
      await api.createDepartment(newName.trim(), newDesc.trim() || undefined, orgId);
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      loadDepartments();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create department');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (deptId: string, deptName: string) => {
    if (!confirm(`Delete department "${deptName}"? Members won't be removed from the organization.`)) return;
    try {
      await api.deleteDepartment(deptId, orgId || undefined);
      loadDepartments();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete department');
    }
  };

  const handleAddMember = async (deptId: string, userId: string) => {
    try {
      await api.addDepartmentMember(deptId, userId, orgId || undefined);
      loadDepartments();
      setAddingTo(null);
      setMemberSearch('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (deptId: string, userId: string) => {
    try {
      await api.removeDepartmentMember(deptId, userId, orgId || undefined);
      loadDepartments();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove member');
    }
  };

  const toggleExpand = (deptId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  // Filter org members not already in a specific department
  const availableMembers = (dept: Department) => {
    const deptUserIds = new Set(dept.members.map((m) => m.user.id));
    return orgMembers
      .filter((m) => !deptUserIds.has(m.userId || m.id))
      .filter((m) => {
        if (!memberSearch.trim()) return true;
        const q = memberSearch.toLowerCase();
        return (
          m.displayName?.toLowerCase().includes(q) ||
          m.username?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q)
        );
      });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-800/30 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header + Create button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Departments ({departments.length})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition"
        >
          <Plus size={16} /> New Department
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Department name (e.g., Engineering, Sales)"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Department list */}
      {departments.length === 0 && !showCreate ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">No departments yet</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Create departments to organize your team members
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {departments.map((dept) => {
            const isExpanded = expanded.has(dept.id);
            const isAdding = addingTo === dept.id;
            return (
              <div
                key={dept.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Department header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                  onClick={() => toggleExpand(dept.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                        {dept.name}
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                        {dept._count.members} {dept._count.members === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    {dept.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {dept.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(dept.id, dept.name); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                      title="Delete department"
                    >
                      <Trash2 size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </div>

                {/* Expanded: member list */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 space-y-2">
                    {/* Add member button */}
                    <button
                      onClick={() => { setAddingTo(isAdding ? null : dept.id); setMemberSearch(''); }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Plus size={14} /> Add Member
                    </button>

                    {/* Add member search */}
                    {isAdding && (
                      <div className="space-y-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Search org members..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {availableMembers(dept).slice(0, 10).map((m) => (
                            <button
                              key={m.userId || m.id}
                              onClick={() => handleAddMember(dept.id, m.userId || m.id)}
                              className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition text-left"
                            >
                              <Avatar name={m.displayName || m.username} src={m.avatarUrl} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{m.displayName || m.username}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{m.email}</p>
                              </div>
                            </button>
                          ))}
                          {availableMembers(dept).length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-2">No available members</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Member list */}
                    {dept.members.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No members in this department</p>
                    ) : (
                      <div className="space-y-1">
                        {dept.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 py-1.5">
                            <Avatar name={m.user.displayName || m.user.username} src={m.user.avatarUrl} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {m.user.displayName || m.user.username}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.user.email}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(dept.id, m.user.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                              title="Remove from department"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
