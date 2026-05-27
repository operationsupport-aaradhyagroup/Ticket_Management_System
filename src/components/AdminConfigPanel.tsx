import React, { useState, useMemo } from 'react';
import { Department, ComplaintCategory, SLAUnit, TicketPriority, UserSession } from '../types';
import { Landmark, Plus, Trash2, ShieldCheck, FolderPlus, Clock, AlertCircle, Database, RefreshCw, KeyRound, Search } from 'lucide-react';

interface AdminConfigPanelProps {
  departments: Department[];
  categories: ComplaintCategory[];
  companyUsers: UserSession[];
  dbType: string;
  onAddDepartment: (name: string) => void;
  onAddCategory: (deptId: string, name: string, defaultValue: number, defaultUnit: SLAUnit, defaultPriority: TicketPriority) => void;
  onDeleteDepartment?: (id: string) => void;
  onDeleteCategory?: (id: string) => void;
  onMigrateDatabase: () => Promise<{ success: boolean; migratedCount?: any; error?: string }>;
  onResetEmployeePassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export default function AdminConfigPanel({
  departments,
  categories,
  companyUsers,
  dbType,
  onAddDepartment,
  onAddCategory,
  onDeleteDepartment,
  onDeleteCategory,
  onMigrateDatabase,
  onResetEmployeePassword
}: AdminConfigPanelProps) {
  const [newDeptName, setNewDeptName] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id || '');
  
  // Category entry states
  const [newCatName, setNewCatName] = useState('');
  const [slaValue, setSlaValue] = useState<number>(4);
  const [slaUnit, setSlaUnit] = useState<SLAUnit>('hours');
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>('Medium');

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
    return categories.filter(c => c.departmentId === selectedDeptId);
  }, [categories, selectedDeptId]);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* 1. DEPARTMENTS PANEL & DB SYNC (Left 1/3) */}
      <div className="space-y-6 md:col-span-1">
        
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-gray-50">
            <Landmark className="w-5 h-5 text-gray-400" />
            <h3 className="font-bold text-gray-800 text-sm">Complaint Departments</h3>
          </div>

        {/* Create Department Form */}
        <form onSubmit={handleCreateDept} className="space-y-2">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Create Custom Department</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="input-new-dept-name"
              type="text"
              placeholder="e.g. Legal Department"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
            />
            <button
              id="btn-add-dept"
              type="submit"
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center transition-all"
              title="Add Department"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Departments List */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {departments.map(d => {
            const isSelected = d.id === selectedDeptId;
            return (
              <div
                key={d.id}
                id={`dept-item-${d.id}`}
                onClick={() => setSelectedDeptId(d.id)}
                className={`w-full flex items-start sm:items-center justify-between gap-3 p-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                  isSelected 
                    ? 'bg-blue-50 border-blue-100 text-blue-700 font-semibold' 
                    : 'bg-white border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="break-words">{d.name} {d.isCustom && <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-100 px-1 rounded-sm ml-1">Custom</span>}</span>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[10px] text-gray-400">
                    {categories.filter(c => c.departmentId === d.id).length} cats
                  </span>
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

      {/* Database Management & Hand-Off card */}
      {false && (
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
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

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-gray-50">
          <KeyRound className="w-5 h-5 text-indigo-500" />
          <h3 className="font-bold text-gray-800 text-sm">Employee Password Reset</h3>
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
              <div key={user.email} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
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
                    className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* 2. CATEGORIES AND SLA CONFIGURATION (Right 2/3) */}
      <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col space-y-4">
        
        {/* Selected department header */}
        <div className="pb-3 border-b border-gray-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="space-y-0.5 min-w-0">
            <h3 className="font-bold text-gray-800 text-sm">
              SLA Category Rules: {departments.find(d => d.id === selectedDeptId)?.name || 'Select Department'}
            </h3>
            <p className="text-xs text-gray-400">Define operational default limits for newly filed tickets.</p>
          </div>
          <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Control Panel</span>
          </div>
        </div>

        {/* Dynamic Category Creation Form */}
        {selectedDeptId ? (
          <form onSubmit={handleCreateCat} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
              <FolderPlus className="w-4 h-4 text-gray-400" />
              <span>Create Complaint Category with Default SLA</span>
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
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2.5 bg-white"
                />
              </div>

              {/* Predefined Priority Column */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Default Priority</label>
                <select
                  id="select-new-cat-priority"
                  value={defaultPriority}
                  onChange={(e) => setDefaultPriority(e.target.value as TicketPriority)}
                  className="w-full text-xs border border-gray-200 rounded-lg p-2.5 bg-white font-medium"
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
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2.5 bg-white"
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
                    className="flex-1 text-xs border border-gray-200 rounded-lg p-2.5 bg-white"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <button
                    id="btn-add-cat"
                    type="submit"
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-950 text-white rounded-lg text-xs font-semibold flex items-center justify-center transition-all shadow-xs"
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
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Existing Dynamic SLA Mappings ({currentCategories.length})
          </span>
          {currentCategories.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
              No categories configured for this department yet. Standard tickets require at least one category mapping.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] sm:max-h-[220px] overflow-y-auto pr-1">
              {currentCategories.map(c => (
                <div
                  key={c.id}
                  id={`cat-card-${c.id}`}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-gray-50/50 hover:bg-white transition-all duration-200"
                >
                    <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-gray-700 text-xs break-words">{c.name}</p>
                    <div className="flex items-center space-x-2 text-[10px] text-gray-400 flex-wrap gap-y-1">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>SLA: {c.defaultSlaValue} {c.defaultSlaUnit}</span>
                      </div>
                      <span className="text-gray-300">•</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                        c.defaultPriority === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                        c.defaultPriority === 'High' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        c.defaultPriority === 'Low' ? 'bg-gray-50 text-gray-600 border-gray-100' :
                        'bg-blue-50 text-blue-700 border-blue-105'
                      }`}>
                        {c.defaultPriority || 'Medium'}
                      </span>
                    </div>
                  </div>

                  {onDeleteCategory && (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informative Guidance */}
        <div className="p-3 bg-blue-50 text-blue-700 rounded-xl flex items-start space-x-2 text-[11px] font-medium border border-blue-100">
          <AlertCircle className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
          <p>
            When users file complaints under these categories, the system will instantly load and lock operational SLAs unless an Admin manually uses custom parameters.
          </p>
        </div>

      </div>

    </div>
  );
}
