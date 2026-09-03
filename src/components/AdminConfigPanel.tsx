import React, { useEffect, useMemo, useState } from 'react';
import { ComplaintCategory, CreateUserPayload, Department, EscalationRule, SLAUnit, TicketPriority, UserSession } from '../types';
import { Landmark, Plus, Trash2, ShieldCheck, FolderPlus, Clock, AlertCircle, Database, RefreshCw, KeyRound, Search, UserPlus, Building2, Briefcase, Mail, IdCard, GitBranch } from 'lucide-react';

interface AdminConfigPanelProps {
  token: string;
  departments: Department[];
  categories: ComplaintCategory[];
  companyUsers: UserSession[];
  employeeOptions: {
    companies: string[];
    designationsByDepartmentId: Record<string, string[]>;
  };
  escalationRules: EscalationRule[];
  dbType: string;
  onAddDepartment: (name: string) => void;
  onAddCategory: (deptId: string, name: string, defaultValue: number, defaultUnit: SLAUnit, defaultPriority: TicketPriority) => void;
  onCreateUser: (payload: CreateUserPayload) => Promise<{ success: boolean; user?: UserSession; error?: string }>;
  onDeleteUser: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onSaveEscalationRule: (departmentId: string, designationLevels: string[]) => Promise<{ success: boolean; rule?: EscalationRule; error?: string }>;
  onDeleteDepartment?: (id: string) => void;
  onDeleteCategory?: (id: string) => void;
  onMigrateDatabase: () => Promise<{ success: boolean; migratedCount?: any; error?: string }>;
  onResetEmployeePassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onResetTickets: () => Promise<{ success: boolean; message?: string; error?: string }>;
}

const formatApiDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  const part = (number: number) => String(number).padStart(2, '0');
  return `${part(date.getDate())}-${part(date.getMonth() + 1)}-${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
};

export default function AdminConfigPanel({
  token,
  departments,
  categories,
  companyUsers,
  employeeOptions,
  escalationRules,
  dbType,
  onAddDepartment,
  onAddCategory,
  onCreateUser,
  onDeleteUser,
  onSaveEscalationRule,
  onDeleteDepartment,
  onDeleteCategory,
  onMigrateDatabase,
  onResetEmployeePassword,
  onResetTickets
}: AdminConfigPanelProps) {
  const [newDeptName, setNewDeptName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id || '');
  
  // Category entry states
  const [newCatName, setNewCatName] = useState('');
  const [slaValue, setSlaValue] = useState<number>(4);
  const [slaUnit, setSlaUnit] = useState<SLAUnit>('hours');
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>('Medium');
  const [escalationLadderInput, setEscalationLadderInput] = useState('');
  const [savingEscalationRule, setSavingEscalationRule] = useState(false);
  const [escalationRuleStatus, setEscalationRuleStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserStatus, setCreateUserStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [employeeListSearch, setEmployeeListSearch] = useState('');
  const [deletingEmployeeEmail, setDeletingEmployeeEmail] = useState<string | null>(null);
  const [isCustomDesignation, setIsCustomDesignation] = useState(false);
  const [apiClients, setApiClients] = useState<any[]>([]);
  const [apiClientName, setApiClientName] = useState('');
  const [apiClientExpiry, setApiClientExpiry] = useState('');
  const [apiPermissions, setApiPermissions] = useState<string[]>(['tickets:create', 'tickets:read']);
  const [newApiKey, setNewApiKey] = useState('');
  const [apiClientStatus, setApiClientStatus] = useState('');
  const [emailTicketSettings, setEmailTicketSettings] = useState({ enabled: false, subjectPrefix: 'Resolve this Ticket --', defaultAssigneeEmail: 'operation_support@kisansuvidha.com' });
  const [emailTicketLogs, setEmailTicketLogs] = useState<any[]>([]);
  const [emailTicketStatus, setEmailTicketStatus] = useState('');
  const [userForm, setUserForm] = useState<CreateUserPayload>({
    firstName: '',
    lastName: '',
    email: '',
    employeeId: '',
    departmentId: departments[0]?.id || '',
    designation: '',
    reportingManager: '',
    reportingManagerEmail: '',
    company: 'Aaradhya Group',
    role: 'User',
    password: ''
  });

  useEffect(() => {
    if (!userForm.departmentId && departments[0]?.id) {
      setUserForm((prev) => ({
        ...prev,
        departmentId: departments[0].id
      }));
    }
  }, [departments, userForm.departmentId]);

  const loadApiClients = async () => {
    try {
      const response = await fetch('/api/admin/api-clients', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API clients could not be loaded.');
      setApiClients(data.data || []);
    } catch (error) {
      setApiClientStatus(error instanceof Error ? error.message : 'API clients could not be loaded.');
    }
  };

  useEffect(() => { void loadApiClients(); }, [token]);

  const loadEmailTicketIntegration = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [settingsResponse, logsResponse] = await Promise.all([
        fetch('/api/admin/email-ticket/settings', { headers }),
        fetch('/api/admin/email-ticket/logs', { headers })
      ]);
      const settingsData = await settingsResponse.json();
      const logsData = await logsResponse.json();
      if (!settingsResponse.ok) throw new Error(settingsData.error || 'Email ticket settings could not be loaded.');
      if (!logsResponse.ok) throw new Error(logsData.error || 'Email ticket logs could not be loaded.');
      setEmailTicketSettings(settingsData.data);
      setEmailTicketLogs(logsData.data || []);
    } catch (error) {
      setEmailTicketStatus(error instanceof Error ? error.message : 'Email ticket integration could not be loaded.');
    }
  };

  useEffect(() => { void loadEmailTicketIntegration(); }, [token]);

  const saveEmailTicketSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailTicketStatus('');
    try {
      const response = await fetch('/api/admin/email-ticket/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(emailTicketSettings)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email ticket settings could not be saved.');
      setEmailTicketSettings(data.data);
      setEmailTicketStatus('Email ticket settings saved.');
      await loadEmailTicketIntegration();
    } catch (error) {
      setEmailTicketStatus(error instanceof Error ? error.message : 'Email ticket settings could not be saved.');
    }
  };

  const createApiClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiClientStatus('');
    try {
      const response = await fetch('/api/admin/api-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: apiClientName, permissions: apiPermissions, expiresAt: apiClientExpiry || undefined })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API client creation failed.');
      setNewApiKey(data.data.apiKey);
      setApiClientName('');
      setApiClientExpiry('');
      setApiClientStatus('API client created. Copy the key now; it will not be shown again.');
      await loadApiClients();
    } catch (error) {
      setApiClientStatus(error instanceof Error ? error.message : 'API client creation failed.');
    }
  };

  const updateApiClient = async (id: string, action: string) => {
    const response = await fetch(`/api/admin/api-clients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action })
    });
    const data = await response.json();
    if (!response.ok) return setApiClientStatus(data.error || 'API client update failed.');
    if (data.data.apiKey) {
      setNewApiKey(data.data.apiKey);
      setApiClientStatus('Key regenerated. Copy it now; the previous key is invalid.');
    }
    await loadApiClients();
  };

  // Migration control states
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    success: boolean;
    counts?: {
      users: number;
      departments: number;
      categories: number;
      tickets: number;
      emails?: number;
    };
    error?: string;
  } | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [passwordResetStatus, setPasswordResetStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [resettingTickets, setResettingTickets] = useState(false);
  const [ticketResetStatus, setTicketResetStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrationStatus(null);
    try {
      const res = await onMigrateDatabase();
      if (res.success) {
        setMigrationStatus({
          success: true,
          counts: res.migratedCount
        });
      } else {
        setMigrationStatus({
          success: false,
          error: res.error || 'Unknown migration error.'
        });
      }
    } catch (err: any) {
      setMigrationStatus({
        success: false,
        error: err.message || 'System failed to send migration request.'
      });
    } finally {
      setMigrating(false);
    }
  };

  // Load categories of currently highlighted department
  const currentCategories = useMemo(() => {
    return categories
      .filter(c => c.departmentId === selectedDeptId)
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [categories, selectedDeptId]);

  const sortedDepartments = useMemo(() => (
    [...departments].sort((first, second) => first.name.localeCompare(second.name))
  ), [departments]);

  const selectedDepartment = departments.find((department) => department.id === selectedDeptId);

  const inferDesignationRank = (designation: string) => {
    const normalized = designation
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return 999;
    if (/\b(intern|trainee|apprentice)\b/.test(normalized)) return 10;
    if (/\b(junior|assistant|support|runner|field assistant)\b/.test(normalized)) return 20;
    if (/\b(executive|officer|associate|adviser|advisor|developer|designer|specialist|engineer|accountant|coordinator|controller)\b/.test(normalized)) return 30;
    if (/\b(lead|senior)\b/.test(normalized)) return 40;
    if (/\b(manager|asm)\b/.test(normalized)) return 50;
    if (/\bhead\b/.test(normalized)) return 60;
    if (/\b(general manager|business head|ceo)\b/.test(normalized)) return 70;
    return 35;
  };

  const displayedEscalationRules = useMemo(() => {
    if (escalationRules.length > 0) {
      return escalationRules;
    }

    return departments.map((department) => {
      const uniqueDesignations = Array.from(
        new Set(
          companyUsers
            .filter((user) => user.departmentId === department.id)
            .map((user) => String(user.designation || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => {
        const rankDiff = inferDesignationRank(a) - inferDesignationRank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.localeCompare(b);
      });

      const hasHeadLikeDesignation = uniqueDesignations.some((designation) => /\bhead\b/i.test(designation));
      return {
        id: `fallback-${department.id}`,
        departmentId: department.id,
        departmentName: department.name,
        designationLevels: hasHeadLikeDesignation ? uniqueDesignations : [...uniqueDesignations, 'Dept Head'].filter(Boolean),
        createdAt: '',
        updatedAt: ''
      } satisfies EscalationRule;
    });
  }, [companyUsers, departments, escalationRules]);

  const selectedEscalationRule = useMemo(
    () => displayedEscalationRules.find((rule) => rule.departmentId === selectedDeptId) || null,
    [displayedEscalationRules, selectedDeptId]
  );

  useEffect(() => {
    setEscalationLadderInput(selectedEscalationRule?.designationLevels.join(', ') || '');
    setEscalationRuleStatus(null);
  }, [selectedEscalationRule, selectedDeptId]);

  const resettableEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return companyUsers
      .filter((user) => user.role !== 'Admin')
      .filter((user) => user.employeeId)
      .filter((user) => {
        if (!query) return true;
        return (
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.employeeId || '').toLowerCase().includes(query) ||
          (user.departmentName || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companyUsers, employeeSearch]);

  const managedEmployees = useMemo(() => {
    const query = employeeListSearch.trim().toLowerCase();
    return companyUsers
      .filter((user) => user.role !== 'Admin')
      .filter((user) => {
        if (!query) return true;
        return (
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.employeeId || '').toLowerCase().includes(query) ||
          (user.departmentName || '').toLowerCase().includes(query) ||
          (user.designation || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companyUsers, employeeListSearch]);

  const companyOptions = useMemo(() => {
    const options = new Set<string>(['Aaradhya Group', ...employeeOptions.companies]);
    companyUsers.forEach((user) => {
      const companyName = String(user.company || '').trim();
      if (companyName) {
        options.add(companyName);
      }
    });
    const draftCompany = String(userForm.company || '').trim();
    if (draftCompany) {
      options.add(draftCompany);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [companyUsers, employeeOptions.companies, userForm.company]);

  const designationOptions = useMemo(() => {
    const options = new Set<string>(employeeOptions.designationsByDepartmentId[userForm.departmentId] || []);
    companyUsers.forEach((user) => {
      if (user.departmentId === userForm.departmentId && user.designation?.trim()) {
        options.add(user.designation.trim());
      }
    });
    if (!isCustomDesignation && userForm.designation.trim()) options.add(userForm.designation.trim());
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [companyUsers, employeeOptions.designationsByDepartmentId, isCustomDesignation, userForm.departmentId, userForm.designation]);

  const handleCreateDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    onAddDepartment(newDeptName.trim());
    setNewDeptName('');
  };

  const handleCreateCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || !selectedDeptId) return;
    onAddCategory(selectedDeptId, newCatName.trim(), slaValue, slaUnit, defaultPriority);
    setNewCatName('');
  };

  const handleUserFieldChange = (field: keyof CreateUserPayload, value: string) => {
    setUserForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserStatus(null);

    if (
      !userForm.firstName.trim() ||
      !userForm.lastName.trim() ||
      !userForm.email.trim() ||
      !userForm.employeeId.trim() ||
      !userForm.departmentId ||
      !userForm.designation.trim()
    ) {
      setCreateUserStatus({
        type: 'error',
        message: 'First name, last name, email, employee ID, department, and designation are required.'
      });
      return;
    }

    setCreatingUser(true);
    try {
      const result = await onCreateUser({
        ...userForm,
        firstName: userForm.firstName.trim(),
        lastName: userForm.lastName.trim(),
        email: userForm.email.trim(),
        employeeId: userForm.employeeId.trim(),
        designation: userForm.designation.trim(),
        reportingManager: userForm.reportingManager.trim(),
        reportingManagerEmail: userForm.reportingManagerEmail.trim(),
        company: userForm.company?.trim() || 'Aaradhya Group',
        password: userForm.password?.trim() || undefined
      });

      if (!result.success) {
        setCreateUserStatus({
          type: 'error',
          message: result.error || 'User onboarding failed.'
        });
        return;
      }

      setCreateUserStatus({
        type: 'success',
        message: `${result.user?.name || 'Employee'} account created successfully. Default password is employee ID unless a custom password was entered.`
      });
      setUserForm((prev) => ({
        ...prev,
        firstName: '',
        lastName: '',
        email: '',
        employeeId: '',
        designation: '',
        reportingManager: '',
        reportingManagerEmail: '',
        password: '',
        role: 'User'
      }));
      setIsCustomDesignation(false);
    } catch (error: any) {
      setCreateUserStatus({
        type: 'error',
        message: error.message || 'User onboarding failed.'
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveEscalationConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setEscalationRuleStatus(null);

    const designationLevels = escalationLadderInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!selectedDeptId || designationLevels.length === 0) {
      setEscalationRuleStatus({
        type: 'error',
        message: 'Select a department and provide at least one designation tier.'
      });
      return;
    }

    setSavingEscalationRule(true);
    try {
      const result = await onSaveEscalationRule(selectedDeptId, designationLevels);
      if (!result.success) {
        setEscalationRuleStatus({
          type: 'error',
          message: result.error || 'Escalation ladder save failed.'
        });
        return;
      }

      setEscalationRuleStatus({
        type: 'success',
        message: 'Department-wise escalation ladder saved successfully.'
      });
    } finally {
      setSavingEscalationRule(false);
    }
  };

  const handleDeleteEmployee = async (user: UserSession) => {
    const confirmed = confirm(`Delete employee account for ${user.name} (${user.email})?`);
    if (!confirmed) return;

    setDeletingEmployeeEmail(user.email);
    setCreateUserStatus(null);
    try {
      const result = await onDeleteUser(user.email);
      if (!result.success) {
        setCreateUserStatus({
          type: 'error',
          message: result.error || 'Employee delete failed.'
        });
        return;
      }

      setCreateUserStatus({
        type: 'success',
        message: result.message || `${user.name} deleted successfully.`
      });
    } finally {
      setDeletingEmployeeEmail(null);
    }
  };

  const handleResetEmployeePassword = async (user: UserSession) => {
    if (!user.employeeId) return;

    const confirmed = confirm(
      `Reset ${user.name}'s password to the default Employee ID password (${user.employeeId})?`
    );
    if (!confirmed) return;

    setResettingEmail(user.email);
    setPasswordResetStatus(null);
    try {
      const result = await onResetEmployeePassword(user.email);
      if (result.success) {
        setPasswordResetStatus({
          type: 'success',
          message: result.message || `${user.name}'s password was reset successfully.`
        });
      } else {
        setPasswordResetStatus({
          type: 'error',
          message: result.error || 'Employee password reset failed.'
        });
      }
    } catch (error: any) {
      setPasswordResetStatus({
        type: 'error',
        message: error.message || 'Employee password reset failed.'
      });
    } finally {
      setResettingEmail(null);
    }
  };

  const handleResetTickets = async () => {
    const confirmed = confirm(
      'Delete all tickets and reset numbering back to TKT-1? This will also clear ticket email records.'
    );
    if (!confirmed) return;

    setResettingTickets(true);
    setTicketResetStatus(null);
    try {
      const result = await onResetTickets();
      if (result.success) {
        setTicketResetStatus({
          type: 'success',
          message: result.message || 'All tickets were deleted. The next ticket will start from TKT-1.'
        });
      } else {
        setTicketResetStatus({
          type: 'error',
          message: result.error || 'Ticket reset failed.'
        });
      }
    } catch (error: any) {
      setTicketResetStatus({
        type: 'error',
        message: error.message || 'Ticket reset failed.'
      });
    } finally {
      setResettingTickets(false);
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* 1. DEPARTMENTS PANEL & DB SYNC (Left 1/3) */}
      <div className="space-y-6 md:col-span-1">
        
        <div className="bg-white p-5 rounded-[26px] border border-slate-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
            <div className="rounded-2xl bg-blue-50 p-2 text-blue-600">
              <Landmark className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">1. Select Department</h3>
              <p className="text-[11px] text-gray-400">Choose where its SLA rules will apply.</p>
            </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{departments.length}</span>
          </div>

        {/* Create Department Form */}
        <form onSubmit={handleCreateDept} className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Add Department</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="input-new-dept-name"
              type="text"
              placeholder="e.g. Legal Department"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
            />
            <button
              id="btn-add-dept"
              type="submit"
              className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center transition-all shadow-sm"
              title="Add Department"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Departments List */}
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {sortedDepartments.map(d => {
            const isSelected = d.id === selectedDeptId;
            return (
              <div
                key={d.id}
                id={`dept-item-${d.id}`}
                onClick={() => setSelectedDeptId(d.id)}
                className={`w-full flex items-start sm:items-center justify-between gap-3 p-3 rounded-2xl text-xs font-medium cursor-pointer transition-all border ${
                  isSelected 
                    ? 'bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] border-blue-200 text-blue-700 font-semibold shadow-sm' 
                    : 'bg-white border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="min-w-0">
                  <span className="block break-words">{d.name}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-gray-400">{categories.filter(c => c.departmentId === d.id).length} SLA {categories.filter(c => c.departmentId === d.id).length === 1 ? 'rule' : 'rules'}{d.isCustom ? ' · Custom' : ''}</span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  {isSelected && <span className="rounded-full bg-blue-600 px-2 py-1 text-[9px] font-bold text-white">Selected</span>}
                  {d.isCustom && onDeleteDepartment && (
                    <button
                      type="button"
                      id={`btn-del-dept-${d.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete the department and all its associated category SLAs?`)) {
                          onDeleteDepartment(d.id);
                          if (selectedDeptId === d.id && departments.length > 1) {
                            setSelectedDeptId(departments[0].id);
                          }
                        }
                      }}
                      className="p-1 hover:bg-rose-50 rounded-md text-rose-500 hover:text-rose-600 transition-colors"
                      title="Delete Custom Department"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-gray-50">
          <div className="rounded-2xl bg-rose-50 p-2 text-rose-600">
            <Trash2 className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Ticket Reset</h3>
            <p className="text-[11px] text-gray-400">Clear all complaint tickets and restart numbering from TKT-1.</p>
          </div>
        </div>

        {ticketResetStatus && (
          <div className={`rounded-2xl border px-3.5 py-3 text-xs ${
            ticketResetStatus.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-rose-100 bg-rose-50 text-rose-800'
          }`}>
            {ticketResetStatus.message}
          </div>
        )}

        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[11px] leading-relaxed text-rose-800">
          This will delete all current tickets and ticket email logs. The next created ticket will restart from <strong>TKT-1</strong>.
        </div>

        <button
          type="button"
          onClick={handleResetTickets}
          disabled={resettingTickets}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          <Trash2 className="h-4 w-4" />
          {resettingTickets ? 'Resetting Tickets...' : 'Delete All Tickets & Restart IDs'}
        </button>
      </div>

      {/* Database Management & Hand-Off card */}
      {false && (
      <div className="bg-white p-5 rounded-[26px] border border-gray-100 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-gray-50">
          <Database className="w-5 h-5 text-blue-500 font-bold" />
          <h3 className="font-bold text-gray-800 text-sm">Database Sync & Shift</h3>
        </div>
        
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Active Database:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                dbType === 'MongoDB' 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                  : 'bg-amber-50 text-amber-700 border border-amber-100'
              }`}>
                {dbType === 'MongoDB' ? 'Cloud MongoDB' : 'db_disk.json'}
              </span>
            </div>
            
            <p className="text-[11px] text-gray-400 leading-relaxed pt-1.5">
              {dbType === 'MongoDB' 
                ? 'Your deployment is fully connected to the cloud MongoDB instance. Custom categories, departments, and complaint tickets are stored persistently.'
                : 'All complaints and categories are currently writing to the local workspace file "db_disk.json". Once MONGODB_URI is provided, data shifts over.'
              }
            </p>
          </div>

          {/* Migrate / Sync Button */}
          {dbType === 'MongoDB' ? (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50/80 border border-emerald-100 rounded-xl text-emerald-900 space-y-1.5">
                <p className="font-bold text-[10.5px] uppercase tracking-wider">Auto Sync Active</p>
                <p className="text-[10.5px] leading-relaxed text-emerald-800">
                  MongoDB is live. New departments, categories, users, and tickets are writing directly to MongoDB automatically.
                </p>
                <p className="text-[10px] leading-relaxed text-emerald-700">
                  Legacy local records from <strong className="font-semibold">db_disk.json</strong> are auto-imported during server startup when MongoDB is connected.
                </p>
              </div>

              <button
                type="button"
                id="btn-migrate-db-manual"
                onClick={handleMigrate}
                disabled={migrating}
                className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
              >
                {migrating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
                    <span>Running one-time disk import...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5 text-slate-500" />
                    <span>Run one-time disk import manually</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-gray-400">
                Manual import is only for older local fallback data that may still exist outside MongoDB.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-blue-50/50 border border-blue-100/40 rounded-xl text-blue-800 space-y-1">
              <p className="font-bold text-[10.5px] text-blue-900 uppercase tracking-wider">How to connect MongoDB:</p>
              <ul className="list-disc list-inside text-[10px] text-blue-700 space-y-1 leading-relaxed">
                <li>Add <strong className="font-bold">MONGODB_URI</strong> to your project environment variables.</li>
                <li>The server will boot and auto-migrate all records from "db_disk.json" to MongoDB.</li>
              </ul>
            </div>
          )}

          {migrationStatus && (
            <div className={`p-3 rounded-xl border text-xs leading-normal ${
              migrationStatus.success 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                : 'bg-rose-50 text-rose-800 border-rose-100'
            }`}>
              <p className="font-bold">{migrationStatus.success ? 'Shifting Completed!' : 'Transfer Failed'}</p>
              {migrationStatus.success && migrationStatus.counts && (
                <div className="mt-1.5 space-y-1 font-mono text-[9px] bg-white/60 p-2 rounded-lg border border-emerald-100/60 text-emerald-900 grid grid-cols-2">
                  <div>• Users: +{migrationStatus.counts.users}</div>
                  <div>• Depts: +{migrationStatus.counts.departments}</div>
                  <div>• Cats: +{migrationStatus.counts.categories}</div>
                  <div>• Tickets: +{migrationStatus.counts.tickets}</div>
                </div>
              )}
              {migrationStatus.error && <p className="text-[10px] mt-1 text-rose-700">{migrationStatus.error}</p>}
            </div>
          )}
        </div>
      </div>
      )}

      <div className="bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-50">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Employee Directory</h4>
            <p className="text-[11px] text-slate-400">View and delete employee accounts from the admin panel.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-600">
            {managedEmployees.length} Employees
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={employeeListSearch}
            onChange={(e) => setEmployeeListSearch(e.target.value)}
            placeholder="Search employee list by name, email, ID, department, or designation"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs"
          />
        </div>

        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {managedEmployees.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-400">
              No employee accounts matched your search.
            </div>
          ) : (
            managedEmployees.map((user) => (
              <div key={user.email} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-800 break-words">{user.name}</p>
                    <p className="text-[10px] font-mono text-slate-400 break-all">{user.email}</p>
                    <p className="text-[11px] text-slate-500">
                      {(user.departmentName || 'No Department')} • {(user.designation || 'No Designation')} • {(user.employeeId || 'No Employee ID')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEmployee(user)}
                    disabled={deletingEmployeeEmail === user.email}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{deletingEmployeeEmail === user.email ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-gray-50">
          <div className="rounded-2xl bg-indigo-50 p-2 text-indigo-600">
            <KeyRound className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Employee Password Reset</h3>
            <p className="text-[11px] text-gray-400">Restore default Employee ID passwords for staff.</p>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-500">
          If an employee forgets their password, reset it here and their default password will become their Employee ID again.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search by name, email, employee ID, or department"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs"
          />
        </div>

        {passwordResetStatus && (
          <div className={`rounded-xl border px-3 py-2.5 text-xs ${
            passwordResetStatus.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-rose-100 bg-rose-50 text-rose-800'
          }`}>
            {passwordResetStatus.message}
          </div>
        )}

        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {resettableEmployees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
              No employee accounts matched your search.
            </div>
          ) : (
            resettableEmployees.map((user) => (
              <div key={user.email} className="rounded-2xl border border-gray-100 bg-[linear-gradient(135deg,#ffffff,#f8fbff)] p-3.5 shadow-sm">
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{user.name}</span>
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {user.employeeId}
                      </span>
                    </div>
                    <p className="break-all text-[11px] font-mono text-gray-500">{user.email}</p>
                    <p className="text-[11px] text-gray-400">{user.departmentName || 'No department assigned'}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResetEmployeePassword(user)}
                    disabled={resettingEmail === user.email}
                    className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resettingEmail === user.email ? 'Resetting Password...' : 'Reset to Employee ID'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      <div className="md:col-span-2 flex flex-col gap-6">
      <div className="order-2 bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-gray-50">
          <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-600">
            <UserPlus className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Employee Onboarding</h3>
            <p className="text-[11px] text-gray-400">Create department-wise user accounts for the admin portal.</p>
          </div>
        </div>

        <form onSubmit={handleCreateUser} className="space-y-4">
          {createUserStatus && (
            <div className={`rounded-2xl border px-3.5 py-3 text-xs ${
              createUserStatus.type === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : 'border-rose-100 bg-rose-50 text-rose-800'
            }`}>
              {createUserStatus.message}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">First Name</label>
              <div className="relative">
                <UserPlus className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={userForm.firstName} onChange={(e) => handleUserFieldChange('firstName', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Last Name</label>
              <input value={userForm.lastName} onChange={(e) => handleUserFieldChange('lastName', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs" />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input type="email" value={userForm.email} onChange={(e) => handleUserFieldChange('email', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Employee ID</label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={userForm.employeeId} onChange={(e) => handleUserFieldChange('employeeId', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Department</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <select
                  value={userForm.departmentId}
                  onChange={(e) => {
                    setUserForm((prev) => ({ ...prev, departmentId: e.target.value, designation: '' }));
                    setIsCustomDesignation(false);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs"
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Designation</label>
              <div className="relative space-y-2">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <select
                  value={isCustomDesignation ? '__custom__' : userForm.designation}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomDesignation(true);
                      handleUserFieldChange('designation', '');
                    } else {
                      setIsCustomDesignation(false);
                      handleUserFieldChange('designation', e.target.value);
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs"
                >
                  <option value="">Select designation</option>
                  {designationOptions.map((designation) => (
                    <option key={designation} value={designation}>{designation}</option>
                  ))}
                  <option value="__custom__">＋ Add new designation</option>
                </select>
              </div>
              {isCustomDesignation && (
                <input
                  autoFocus
                  value={userForm.designation}
                  onChange={(e) => handleUserFieldChange('designation', e.target.value)}
                  placeholder="Enter new designation"
                  className="mt-2 w-full rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Reporting Manager</label>
              <input value={userForm.reportingManager} onChange={(e) => handleUserFieldChange('reportingManager', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs" />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Manager Email</label>
              <input type="email" value={userForm.reportingManagerEmail} onChange={(e) => handleUserFieldChange('reportingManagerEmail', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs" />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Company</label>
              <select
                value={userForm.company}
                onChange={(e) => handleUserFieldChange('company', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs"
              >
                {companyOptions.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Custom Password (Optional)</label>
              <input type="text" value={userForm.password} onChange={(e) => handleUserFieldChange('password', e.target.value)} placeholder="Leave blank to use Employee ID" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs" />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] leading-relaxed text-blue-800">
            The onboarding form stores the employee profile details directly on the user account, so the same data appears in the profile view after login.
          </div>

          <button
            type="submit"
            disabled={creatingUser}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            <UserPlus className="h-4 w-4" />
            {creatingUser ? 'Creating Account...' : 'Create Employee Account'}
          </button>
        </form>
      </div>

      {false && <>
      <div className="order-3 bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 border-b border-gray-50 pb-3">
          <div className="rounded-2xl bg-indigo-50 p-2 text-indigo-600"><KeyRound className="h-4.5 w-4.5" /></div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Developer / API Access</h3>
            <p className="text-[11px] text-gray-400">Create and manage secure integration credentials.</p>
          </div>
        </div>

        {apiClientStatus && <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">{apiClientStatus}</div>}
        {newApiKey && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">This API key will only be shown once. Copy and store it securely.</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white p-2 text-[11px] text-slate-700">{newApiKey}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(newApiKey)} className="rounded-lg bg-amber-600 px-3 text-xs font-bold text-white">Copy</button>
            </div>
          </div>
        )}

        <form onSubmit={createApiClient} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <input required minLength={3} value={apiClientName} onChange={(e) => setApiClientName(e.target.value)} placeholder="API client name" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs" />
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Optional expiry
            <input type="datetime-local" value={apiClientExpiry} onChange={(e) => setApiClientExpiry(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-slate-700" />
          </label>
          <div className="flex flex-wrap gap-2">
            {['tickets:create','tickets:read','tickets:update','tickets:reply','tickets:assign'].map(permission => (
              <label key={permission} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] text-slate-700">
                <input type="checkbox" checked={apiPermissions.includes(permission)} onChange={(e) => setApiPermissions(current => e.target.checked ? [...current, permission] : current.filter(item => item !== permission))} />
                {permission}
              </label>
            ))}
          </div>
          <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">Create API Client</button>
        </form>

        <div className="space-y-2">
          {apiClients.length === 0 ? <p className="text-xs text-gray-400">No API clients created.</p> : apiClients.map(client => (
            <div key={client.id} className="rounded-xl border border-slate-200 p-3 text-xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-bold text-slate-800">{client.name}</p><p className="font-mono text-[10px] text-slate-400">{client.keyPrefix}… · {client.active ? 'Active' : 'Disabled'}</p></div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => updateApiClient(client.id, client.active ? 'disable' : 'enable')} className="rounded-lg border px-2 py-1 text-[10px]">{client.active ? 'Disable' : 'Enable'}</button>
                  <button type="button" onClick={() => updateApiClient(client.id, 'regenerate')} className="rounded-lg border px-2 py-1 text-[10px]">Regenerate</button>
                  <button type="button" onClick={() => updateApiClient(client.id, 'revoke')} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] text-rose-600">Revoke</button>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Permissions: {client.permissions.join(', ')}</p>
              <p className="text-[10px] text-slate-400">Created: {formatApiDateTime(client.createdAt)} · Last used: {formatApiDateTime(client.lastUsedAt)}</p>
              <p className="text-[10px] text-slate-400">Expires: {client.expiresAt ? formatApiDateTime(client.expiresAt) : 'No expiry'}{client.revokedAt ? ` · Revoked: ${formatApiDateTime(client.revokedAt)}` : ''}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="order-3 bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 border-b border-gray-50 pb-3">
          <div className="rounded-2xl bg-sky-50 p-2 text-sky-600"><Mail className="h-4.5 w-4.5" /></div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Email Ticket Integration</h3>
            <p className="text-[11px] text-gray-400">Configure provider-independent inbound email ticket creation.</p>
          </div>
        </div>
        {emailTicketStatus && <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-800">{emailTicketStatus}</div>}
        <form onSubmit={saveEmailTicketSettings} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={emailTicketSettings.enabled} onChange={(e) => setEmailTicketSettings(current => ({ ...current, enabled: e.target.checked }))} /> Enable Email Ticket Creation</label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject Prefix<input required value={emailTicketSettings.subjectPrefix} onChange={(e) => setEmailTicketSettings(current => ({ ...current, subjectPrefix: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal" /></label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Default Assignee Email<input type="email" value={emailTicketSettings.defaultAssigneeEmail} onChange={(e) => setEmailTicketSettings(current => ({ ...current, defaultAssigneeEmail: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal" /></label>
          <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white">Save Email Settings</button>
        </form>
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-full text-left text-[10px] text-slate-600"><thead className="bg-slate-50 uppercase tracking-wider text-slate-400"><tr><th className="p-2">Received</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Subject</th><th className="p-2">Status</th><th className="p-2">Assigned</th><th className="p-2">Ticket ID</th><th className="p-2">Error</th></tr></thead><tbody>{emailTicketLogs.length === 0 ? <tr><td colSpan={8} className="p-3 text-center text-slate-400">No inbound email events.</td></tr> : emailTicketLogs.map(log => <tr key={log.messageId} className="border-t border-slate-100 align-top"><td className="p-2 whitespace-nowrap">{formatApiDateTime(log.receivedAt)}</td><td className="p-2">{log.fromEmail}</td><td className="p-2">{(log.originalToEmails?.length ? log.originalToEmails : log.toEmails || []).join(', ')}</td><td className="p-2">{log.subject}</td><td className="p-2 font-semibold">{log.status}</td><td className="p-2">{log.assignedAgentEmail || 'Unassigned'}</td><td className="p-2">{log.ticketId || '—'}</td><td className="p-2 text-rose-600">{log.errorMessage || log.errorCode || '—'}</td></tr>)}</tbody></table>
        </div>
      </div>

      </>}
      <div className="order-4 grid grid-cols-1 xl:grid-cols-1 gap-6">
      <div className="bg-white p-5 rounded-[26px] border border-gray-200 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-gray-50">
          <div className="rounded-2xl bg-amber-50 p-2 text-amber-600">
            <GitBranch className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Escalation Ladder</h3>
            <p className="text-[11px] text-gray-400">Set designation-wise escalation flow for the selected department.</p>
          </div>
        </div>

        {escalationRuleStatus && (
          <div className={`rounded-2xl border px-3.5 py-3 text-xs ${
            escalationRuleStatus.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-rose-100 bg-rose-50 text-rose-800'
          }`}>
            {escalationRuleStatus.message}
          </div>
        )}

        <form onSubmit={handleSaveEscalationConfig} className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Selected Department</p>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Designation Ladder
            </label>
            <textarea
              rows={4}
              value={escalationLadderInput}
              onChange={(e) => setEscalationLadderInput(e.target.value)}
              placeholder="Example: Intern, Trainee, Manager, Dept Head"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs leading-relaxed"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
              Add designation levels in escalation order, separated by commas. Final fallback remains the department head.
            </p>
          </div>

          {selectedEscalationRule && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] text-blue-800">
              Active ladder: {selectedEscalationRule.designationLevels.join(' -> ')}
            </div>
          )}

          <button
            type="submit"
            disabled={savingEscalationRule}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
          >
            <GitBranch className="h-4 w-4" />
            {savingEscalationRule ? 'Saving Ladder...' : 'Save Escalation Ladder'}
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800">All Department Ladders</h4>
              <p className="text-[11px] text-slate-400">Auto-generated from current department and designation data, with manual edits supported.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-600">
              {displayedEscalationRules.length} Ladders
            </span>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {displayedEscalationRules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-400">
                No department ladder is available yet.
              </div>
            ) : (
              displayedEscalationRules
                .slice()
                .sort((a, b) => a.departmentName.localeCompare(b.departmentName))
                .map((rule) => (
                  <div key={rule.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{rule.departmentName}</p>
                      <button
                        type="button"
                        onClick={() => setSelectedDeptId(rule.departmentId)}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-700 transition hover:bg-amber-50"
                      >
                        Open
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      {rule.designationLevels.length > 0 ? rule.designationLevels.join(' -> ') : 'No ladder configured'}
                    </p>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
      </div>

      {/* 2. CATEGORIES AND SLA CONFIGURATION (Right 2/3) */}
      <div className="order-1 bg-white p-5 rounded-[28px] border border-gray-200 shadow-[0_18px_50px_rgba(15,23,42,0.07)] flex flex-col space-y-4">
        
        {/* Selected department header */}
        <div className="pb-4 border-b border-gray-100 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="space-y-0.5 min-w-0">
            <h3 className="font-bold text-gray-800 text-sm">
              2. Configure SLA Rules: {selectedDepartment?.name || 'Select Department'}
            </h3>
            <p className="text-xs text-gray-400">Each category receives one default priority and response window.</p>
          </div>
          <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Control Panel</span>
          </div>
        </div>

        {/* Dynamic Category Creation Form */}
        {selectedDeptId ? (
          <form onSubmit={handleCreateCat} className="bg-[linear-gradient(135deg,#f8fbff,#f8fafc)] p-4 rounded-[24px] border border-slate-200 space-y-4 shadow-inner">
            <h4 className="text-xs font-semibold text-gray-700 flex items-center space-x-2">
              <span className="rounded-xl bg-white p-2 text-blue-600 shadow-sm">
                <FolderPlus className="w-4 h-4" />
              </span>
              <span>Add a category rule for {selectedDepartment?.name}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* Category Name Column */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Category Title</label>
                <input
                  id="input-new-cat-name"
                  type="text"
                  required
                  placeholder="e.g. Account lockout"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
                />
              </div>

              {/* Predefined Priority Column */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Default Priority</label>
                <select
                  id="select-new-cat-priority"
                  value={defaultPriority}
                  onChange={(e) => setDefaultPriority(e.target.value as TicketPriority)}
                  className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white font-medium"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Default SLA Value Column */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">SLA Duration</label>
                <input
                  id="input-new-cat-sla-value"
                  type="number"
                  min={1}
                  required
                  value={slaValue}
                  onChange={(e) => setSlaValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
                />
              </div>

              {/* Default SLA Unit Column */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Duration Unit</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    id="select-new-cat-sla-unit"
                    value={slaUnit}
                    onChange={(e) => setSlaUnit(e.target.value as SLAUnit)}
                    className="flex-1 text-xs border border-gray-200 rounded-xl p-2.5 bg-white"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <button
                    id="btn-add-cat"
                    type="submit"
                    className="px-4 py-2.5 bg-gray-900 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center transition-all shadow-sm"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-8 text-center text-gray-400 text-xs">
            Please define or click a department on the left side menu.
          </div>
        )}

        {/* Category List */}
        <div className="flex-1 space-y-2 mt-2">
          <div className="flex items-center justify-between gap-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">3. Review Active SLA Rules</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{currentCategories.length} total</span>
          </div>
          {currentCategories.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
              No categories configured for this department yet. Standard tickets require at least one category mapping.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                  <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Response SLA</th><th className="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody>
              {currentCategories.map(c => (
                <tr
                  key={c.id}
                  id={`cat-card-${c.id}`}
                  className="border-t border-slate-100 transition-colors hover:bg-blue-50/40"
                >
                  <td className="px-4 py-3 font-semibold text-slate-700">{c.name}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold ${
                        c.defaultPriority === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                        c.defaultPriority === 'High' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        c.defaultPriority === 'Low' ? 'bg-gray-50 text-gray-600 border-gray-100' :
                        'bg-blue-50 text-blue-700 border-blue-105'
                      }`}>
                        {c.defaultPriority || 'Medium'}
                      </span></td>
                  <td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{c.defaultSlaValue} {c.defaultSlaUnit}</span></td>

                  <td className="px-4 py-3 text-right">{onDeleteCategory && (
                    <button
                      type="button"
                      id={`btn-del-cat-${c.id}`}
                      onClick={() => {
                        if (confirm(`Delete the complaint category "${c.name}"?`)) {
                          onDeleteCategory(c.id);
                        }
                      }}
                      className="p-1 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-500 transition-colors shrink-0"
                      title="Delete Specific SLA category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}</td>
                </tr>
              ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Informative Guidance */}
        <div className="p-3.5 bg-[linear-gradient(135deg,#eff6ff,#f5f9ff)] text-blue-700 rounded-2xl flex items-start space-x-2 text-[11px] font-medium border border-blue-100">
          <AlertCircle className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
          <p>
            When users file complaints under these categories, the system will instantly load and lock operational SLAs unless an Admin manually uses custom parameters.
          </p>
        </div>

      </div>
      </div>

    </div>

    </>
  );
}
