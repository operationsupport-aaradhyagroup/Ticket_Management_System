import React, { useEffect, useMemo, useState } from 'react';
import { CreateTicketPayload, Department, TicketPriority, UserSession } from '../types';
import { CalendarClock, Check, UserCheck, X } from 'lucide-react';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  currentUser: UserSession;
  companyUsers: UserSession[];
  onSubmit: (newTicket: CreateTicketPayload) => void;
}

const toDateTimeLocalInput = (value: Date) => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

export default function CreateTicketModal({
  isOpen,
  onClose,
  departments,
  currentUser,
  companyUsers,
  onSubmit
}: CreateTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('Medium');
  const [selectedAgentEmail, setSelectedAgentEmail] = useState('');
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [dueDate, setDueDate] = useState('');

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDeptId) || null,
    [departments, selectedDeptId]
  );

  const departmentAgents = useMemo(() => {
    if (!selectedDeptId) return [];
    return companyUsers
      .filter((user) => user.departmentId === selectedDeptId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companyUsers, selectedDeptId]);

  useEffect(() => {
    if (!isOpen) return;

    const initialDepartmentId = currentUser.departmentId || departments[0]?.id || '';
    const initialDueDate = new Date();
    initialDueDate.setDate(initialDueDate.getDate() + 1);
    initialDueDate.setHours(18, 0, 0, 0);

    setTitle('');
    setDescription('');
    setPriority('Medium');
    setSelectedDeptId(initialDepartmentId);
    setSelectedAgentEmail('');
    setSelectedAgentName('');
    setDueDate(toDateTimeLocalInput(initialDueDate));
  }, [isOpen, currentUser.departmentId, departments]);

  useEffect(() => {
    if (departmentAgents.length === 0) {
      setSelectedAgentEmail('');
      setSelectedAgentName('');
      return;
    }

    const currentSelection = departmentAgents.find((agent) => agent.email === selectedAgentEmail);
    if (currentSelection) {
      setSelectedAgentName(currentSelection.name);
      return;
    }

    setSelectedAgentEmail(departmentAgents[0].email);
    setSelectedAgentName(departmentAgents[0].name);
  }, [departmentAgents, selectedAgentEmail]);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim() || !selectedDeptId || !dueDate) {
      alert('Please fill out title, description, department, and due date.');
      return;
    }

    const dueDateValue = new Date(dueDate);
    if (Number.isNaN(dueDateValue.getTime())) {
      alert('Please enter a valid due date.');
      return;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDateValue.toISOString(),
      priority,
      assignedAgent: selectedAgentName || 'Unassigned',
      assignedAgentEmail: selectedAgentEmail,
      departmentId: selectedDeptId,
      departmentName: selectedDepartment?.name || currentUser.departmentName || ''
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Create New Ticket</h3>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Enter task title"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="Enter task description"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Department</label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Choose the department this complaint should go to.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Due Date</label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-slate-200 px-10 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Priority</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Low', 'Medium', 'High', 'Critical'] as TicketPriority[]).map((level) => {
                  const active = priority === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setPriority(level)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">Assign To</label>
              <div className="relative">
                <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedAgentEmail}
                  onChange={(e) => {
                    const agent = departmentAgents.find((item) => item.email === e.target.value);
                    setSelectedAgentEmail(e.target.value);
                    setSelectedAgentName(agent?.name || '');
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {departmentAgents.map((agent) => (
                    <option key={agent.email} value={agent.email}>
                      {agent.name} ({agent.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Check className="h-4 w-4" />
              Create Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
