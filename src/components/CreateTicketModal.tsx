import React, { useState, useEffect, useMemo } from 'react';
import { Department, ComplaintCategory, Ticket, UserSession, SLAUnit, TicketPriority } from '../types';
import { calculateDueDate } from '../utils';
import { X, Check, Clock, AlertCircle } from 'lucide-react';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  categories: ComplaintCategory[];
  currentUser: UserSession;
  companyUsers: UserSession[];
  onSubmit: (newTicket: Ticket) => void;
}

export default function CreateTicketModal({
  isOpen,
  onClose,
  departments,
  categories,
  currentUser,
  companyUsers,
  onSubmit
}: CreateTicketModalProps) {
  const [description, setDescription] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('Medium');
  const [selectedAgentEmail, setSelectedAgentEmail] = useState('');
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [formOpenedAt, setFormOpenedAt] = useState(() => new Date().toISOString());
  
  // SLA overrides
  const [isCustomSla, setIsCustomSla] = useState(false);
  const [slaValue, setSlaValue] = useState<number>(1);
  const [slaUnit, setSlaUnit] = useState<SLAUnit>('hours');

  // Load dynamically compliant categories
  const filteredCategories = useMemo(() => {
    return categories.filter(c => c.departmentId === selectedDeptId);
  }, [categories, selectedDeptId]);

  const availableCompanyUsers = useMemo(() => {
    const usersByEmail = new Map<string, UserSession>();
    for (const user of companyUsers) {
      usersByEmail.set(user.email.toLowerCase().trim(), user);
    }
    if (currentUser?.email && !usersByEmail.has(currentUser.email.toLowerCase().trim())) {
      usersByEmail.set(currentUser.email.toLowerCase().trim(), currentUser);
    }
    return Array.from(usersByEmail.values());
  }, [companyUsers, currentUser]);

  // Filter agents by selected department
  const departmentAgents = useMemo(() => {
    if (!selectedDeptId) return [];
    return availableCompanyUsers.filter(u => u.departmentId === selectedDeptId);
  }, [availableCompanyUsers, selectedDeptId]);

  // Set initial department on open
  useEffect(() => {
    if (isOpen) {
      if (departments.length > 0) {
        setSelectedDeptId(departments[0].id);
      }
      setFormOpenedAt(new Date().toISOString());
      // Reset forms
      setDescription('');
      setPriority('Medium');
      setIsCustomSla(false);
      setSelectedAgentEmail('');
      setSelectedAgentName('');
    }
  }, [isOpen, departments, currentUser]);

  // Auto select first complaint category and first agent when department changes
  useEffect(() => {
    if (filteredCategories.length > 0) {
      setSelectedCatId(filteredCategories[0].id);
    } else {
      setSelectedCatId('');
    }
    
    // Auto-select first agent from department
    if (departmentAgents.length > 0) {
      setSelectedAgentEmail(departmentAgents[0].email);
      setSelectedAgentName(departmentAgents[0].name);
    } else {
      setSelectedAgentEmail('');
      setSelectedAgentName('');
    }
  }, [filteredCategories, departmentAgents]);

  // Read default SLA for current category
  const activeCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCatId);
  }, [categories, selectedCatId]);

  const activeSlaValue = useMemo(() => {
    if (isCustomSla) return slaValue;
    return activeCategory?.defaultSlaValue ?? 0;
  }, [isCustomSla, slaValue, activeCategory]);

  const activeSlaUnit = useMemo(() => {
    if (isCustomSla) return slaUnit;
    return activeCategory?.defaultSlaUnit ?? 'hours';
  }, [isCustomSla, slaUnit, activeCategory]);

  const estimatedDueDate = useMemo(() => {
    if (!activeCategory && !isCustomSla) return null;
    return calculateDueDate(formOpenedAt, activeSlaValue, activeSlaUnit);
  }, [activeCategory, isCustomSla, formOpenedAt, activeSlaValue, activeSlaUnit]);

  const formattedEstimatedDueDate = useMemo(() => {
    if (!estimatedDueDate) return '';
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(new Date(estimatedDueDate));
  }, [estimatedDueDate]);

  // Handle SLA inputs and pre-defined Priority based on activeCategory selection
  useEffect(() => {
    if (activeCategory) {
      if (!isCustomSla) {
        setSlaValue(activeCategory.defaultSlaValue);
        setSlaUnit(activeCategory.defaultSlaUnit);
      }
      if (activeCategory.defaultPriority) {
        setPriority(activeCategory.defaultPriority);
      } else {
        setPriority('Medium');
      }
    }
  }, [activeCategory, isCustomSla]);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim() || !selectedDeptId || !selectedCatId) {
      alert('Please fill out all mandatory fields.');
      return;
    }

    const dept = departments.find(d => d.id === selectedDeptId);
    const cat = categories.find(c => c.id === selectedCatId);

    if (!dept || !cat) return;

    const createdAt = new Date().toISOString();
    
    // Choose SLA to calculate target
    const finalValue = isCustomSla ? slaValue : cat.defaultSlaValue;
    const finalUnit = isCustomSla ? slaUnit : cat.defaultSlaUnit;
    const computedDueDate = calculateDueDate(createdAt, finalValue, finalUnit);

    const newTicket: Ticket = {
      id: 'TKT-PENDING',
      title: description.slice(0, 50).trim() || 'Complaint', // Use first 50 chars of description as title
      description: description.trim(),
      departmentId: dept.id,
      departmentName: dept.name,
      categoryId: cat.id,
      categoryName: cat.name,
      status: 'Open',
      priority,
      creatorEmail: currentUser.email,
      creatorName: currentUser.name,
      assignedAgent: selectedAgentName || 'Unassigned',
      assignedAgentEmail: selectedAgentEmail,
      slaType: isCustomSla ? 'Custom' : 'Default',
      slaDurationValue: finalValue,
      slaDurationUnit: finalUnit,
      slaDueDate: computedDueDate,
      slaStatus: 'Within SLA',
      slaBreachedAt: null,
      createdAt,
      resolvedAt: null,
      history: [
        {
          id: 'hist-' + Date.now(),
          timestamp: createdAt,
          userEmail: currentUser.email,
          action: `Complaint ticket initialized with ${isCustomSla ? 'Custom' : 'Default'} SLA (${finalValue} ${finalUnit})${selectedAgentEmail ? ` and assigned to ${selectedAgentName}` : ''}`
        }
      ]
    };

    onSubmit(newTicket);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={onClose} />
      
      {/* Panel container */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto relative z-10 border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">File a Department Complaint</h3>
            <p className="text-xs text-gray-500">Submit a task and configure default or overrides of SLAs.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-5 flex-1">
          {/* 1. Target Department */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Target Department</label>
            <select
              id="new-ticket-dept"
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-hidden focus:border-blue-500"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* 2. Complaint Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Complaint Category</label>
            <select
              id="new-ticket-cat"
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-hidden focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              disabled={filteredCategories.length === 0}
            >
              {filteredCategories.length === 0 ? (
                <option value="">No categories defined</option>
              ) : (
                filteredCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>

          {/* 3. Detail Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Detail Description</label>
            <textarea
              id="new-ticket-description"
              required
              rows={3}
              placeholder="Provide context, errors or replication logs..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            />
          </div>

          {/* 4. Priority Level */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-widest">Priority Level</label>
              {!isCustomSla && (
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                  <span>● SLA Auto-Fetched</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Low', 'Medium', 'High', 'Critical'] as TicketPriority[]).map(p => {
                const active = priority === p;
                let colorClass = '';
                if (active) {
                  if (p === 'Critical') colorClass = 'bg-red-600 text-white shadow-sm';
                  else if (p === 'High') colorClass = 'bg-orange-500 text-white shadow-sm';
                  else if (p === 'Medium') colorClass = 'bg-amber-500 text-white shadow-sm';
                  else colorClass = 'bg-blue-600 text-white shadow-sm';
                  if (!isCustomSla) {
                    colorClass += ' opacity-80';
                  }
                } else {
                  colorClass = !isCustomSla 
                    ? 'bg-gray-50/50 text-gray-400 border border-gray-150 cursor-not-allowed opacity-60' 
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 cursor-pointer';
                }

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (isCustomSla) {
                        setPriority(p);
                      }
                    }}
                    disabled={!isCustomSla}
                    className={`py-2 text-xs font-semibold rounded-lg transition-all ${colorClass}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            {!isCustomSla && (
              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                Priorities are preset according to corporate SLA guidelines. Use <strong className="font-semibold text-blue-600">Customize SLA & Priority</strong> below if you have special permissions to request an override.
              </p>
            )}
          </div>

          {/* 5. SLA Section */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Service Level Agreement (SLA)</span>
              </div>
              
              {/* Optional override checkbox - ONLY show/allow if current user is Admin standard or if override SLA overrides are configured */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  id="checkbox-custom-sla"
                  type="checkbox"
                  checked={isCustomSla}
                  onChange={(e) => setIsCustomSla(e.checked || e.target.checked)}
                  className="rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="text-xs font-medium text-blue-600 hover:underline">Customize SLA & Priority</span>
              </label>
            </div>

            {estimatedDueDate && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 rounded-full bg-emerald-400 shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                      Estimated Resolution Due Date
                    </p>
                    <p className="mt-1 text-xl font-semibold text-emerald-950">
                      {formattedEstimatedDueDate}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Default SLA Read-only Notice */}
            {!isCustomSla ? (
              <div id="default-sla-notice" className="flex items-start space-x-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5" />
                <div className="text-xs text-gray-500">
                  {activeCategory ? (
                    <p>
                      Selected category auto-applies a default SLA of{' '}
                      <strong className="text-gray-800">
                        {activeCategory.defaultSlaValue} {activeCategory.defaultSlaUnit}
                      </strong>{' '}
                      and preconfigured priority of{' '}
                      <strong className="text-semibold text-blue-700 font-bold bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded ml-0.5">
                        {activeCategory.defaultPriority || 'Medium'}
                      </strong>
                      . This will calculate resolution due limits immediately.
                    </p>
                  ) : (
                    <p>No default SLA defined yet.</p>
                  )}
                </div>
              </div>
            ) : (
              /* Custom SLA Selection Control Panel */
              <div id="custom-sla-form" className="space-y-3 pt-1">
                <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Overriding the standard default SLA values.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Duration Value</label>
                    <input
                      id="custom-sla-value"
                      type="number"
                      min={1}
                      max={120}
                      value={slaValue}
                      onChange={(e) => setSlaValue(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Duration Unit</label>
                    <select
                      id="custom-sla-unit"
                      value={slaUnit}
                      onChange={(e) => setSlaUnit(e.target.value as SLAUnit)}
                      className="w-full text-sm border border-gray-200 rounded-lg p-1.5 bg-white"
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>

                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Custom SLA overrides will immediately update the due date and unlock manual priority selection.
                </div>
              </div>
            )}
          </div>

          {/* 6. Assign to Agent - Department wise */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Assign To (Department-wise Personnel)</label>
            <select
              id="new-ticket-agent"
              value={selectedAgentEmail}
              onChange={(e) => {
                const targetEmail = e.target.value;
                setSelectedAgentEmail(targetEmail);
                const targetAgent = departmentAgents.find(u => u.email === targetEmail);
                if (targetAgent) {
                  setSelectedAgentName(targetAgent.name);
                }
              }}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              disabled={departmentAgents.length === 0}
            >
              {departmentAgents.length === 0 ? (
                <option value="">No agents available for this department</option>
              ) : (
                <>
                  <option value="">-- Select an agent --</option>
                  {departmentAgents.map(agent => (
                    <option key={agent.email} value={agent.email}>
                      {agent.name} ({agent.email})
                    </option>
                  ))}
                </>
              )}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Dropdown automatically populates all members belonging to the target department (e.g. IT, HR etc.).</p>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-ticket"
              type="submit"
              className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-xs"
            >
              File Complaint
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
