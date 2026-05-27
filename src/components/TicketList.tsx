import React, { useState, useMemo } from 'react';
import { Ticket, Department, ComplaintCategory, TicketStatus, SLAStatus, TicketPriority } from '../types';
import { formatSLACountdown, computeSLAStatus } from '../utils';
import { Search, Filter, RefreshCw, AlertCircle, Clock, CheckCircle2, User, Play, ChevronRight } from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  departments: Department[];
  categories: ComplaintCategory[];
  referenceTime: Date;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateTicket: () => void;
}

export default function TicketList({
  tickets,
  departments,
  categories,
  referenceTime,
  onSelectTicket,
  onOpenCreateTicket
}: TicketListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSlaStatus, setSelectedSlaStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  // Load categories matching selected department
  const filteredCategoryOptions = useMemo(() => {
    if (selectedDeptId === 'all') return [];
    return categories.filter(c => c.departmentId === selectedDeptId);
  }, [categories, selectedDeptId]);

  // Reset category filter if parent department changes
  const handleDeptFilterChange = (deptId: string) => {
    setSelectedDeptId(deptId);
    setSelectedCatId('all');
  };

  // Process filters
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // 1. Search term (title, description, customer email)
      const matchesSearch = 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.creatorEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Department
      const matchesDept = selectedDeptId === 'all' || t.departmentId === selectedDeptId;

      // 3. Category
      const matchesCat = selectedCatId === 'all' || t.categoryId === selectedCatId;

      // 4. Ticket Status
      const matchesStatus = selectedStatus === 'all' || t.status === selectedStatus;

      // 5. Priority
      const matchesPriority = selectedPriority === 'all' || t.priority === selectedPriority;

      // 6. SLA Status (requires dynamic status computation)
      const compStatus = computeSLAStatus(t, referenceTime);
      const matchesSla = selectedSlaStatus === 'all' || compStatus === selectedSlaStatus;

      return matchesSearch && matchesDept && matchesCat && matchesStatus && matchesPriority && matchesSla;
    });
  }, [tickets, searchTerm, selectedDeptId, selectedCatId, selectedStatus, selectedPriority, selectedSlaStatus, referenceTime]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedDeptId('all');
    setSelectedCatId('all');
    setSelectedStatus('all');
    setSelectedSlaStatus('all');
    setSelectedPriority('all');
  };

  // Helper styles
  const getPriorityBadgeClass = (priority: TicketPriority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-50 text-red-700 border-red-100';
      case 'High': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Medium': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
      case 'Low': return 'bg-blue-50 text-blue-700 border-blue-100';
    }
  };

  const getSlaBadgeStyles = (slaStatus: SLAStatus, status: string) => {
    if (status === 'Resolved' || status === 'Closed') {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        text: 'SLA Met'
      };
    }
    switch (slaStatus) {
      case 'SLA Breached':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse',
          dot: 'bg-rose-600',
          text: 'SLA Breached'
        };
      case 'Near SLA Breach':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
          dot: 'bg-amber-500 animate-ping',
          text: 'Near Breach'
        };
      case 'Within SLA':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-100',
          dot: 'bg-blue-500',
          text: 'Within SLA'
        };
    }
  };

  const getStatusClass = (status: TicketStatus) => {
    switch (status) {
      case 'Open': return 'bg-emerald-100 text-emerald-800';
      case 'In Progress': return 'bg-indigo-100 text-indigo-800';
      case 'Resolved': return 'bg-gray-100 text-gray-700 line-through';
      case 'Closed': return 'bg-slate-200 text-slate-600';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header operations */}
      <div className="p-4 sm:p-5 border-b border-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-50/50">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="ticket-search"
            type="text"
            placeholder="Search by Ticket ID, Title, User email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all bg-white"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            id="btn-clear-filters"
            onClick={clearFilters}
            className="px-3.5 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-100 transition-colors flex items-center justify-center space-x-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          
          <button
            id="btn-open-create-ticket"
            onClick={onOpenCreateTicket}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-xs flex items-center justify-center space-x-1.5"
          >
            <Play className="w-4 h-4" />
            <span>Create Complaint Ticket</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter row */}
      <div className="p-4 bg-white border-b border-gray-50 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Department */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Department</label>
          <select
            id="filter-dept"
            value={selectedDeptId}
            onChange={(e) => handleDeptFilterChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-blue-500 bg-white"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Dynamic Category - only clickable if Dept selected */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Complaint Category</label>
          <select
            id="filter-category"
            value={selectedCatId}
            disabled={selectedDeptId === 'all'}
            onChange={(e) => setSelectedCatId(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="all">
              {selectedDeptId === 'all' ? 'Select Dept First' : 'All Categories'}
            </option>
            {filteredCategoryOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Ticket Status */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Ticket Status</label>
          <select
            id="filter-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-blue-500 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

        {/* SLA Status */}
        <div>
          <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">SLA Breach Status</label>
          <select
            id="filter-sla"
            value={selectedSlaStatus}
            onChange={(e) => setSelectedSlaStatus(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-blue-500 bg-white"
          >
            <option value="all">All SLA States</option>
            <option value="Within SLA">Within SLA</option>
            <option value="Near SLA Breach">Near SLA Breach</option>
            <option value="SLA Breached">SLA Breached</option>
          </select>
        </div>

        {/* Priority */}
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Ticket Priority</label>
          <select
            id="filter-priority"
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-blue-500 bg-white"
          >
            <option value="all">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Ticket List Body */}
      <div className="md:hidden divide-y divide-gray-100">
        {filteredTickets.length === 0 ? (
          <div className="py-12 text-center text-gray-400 px-4">
            <div className="flex flex-col items-center justify-center space-y-2">
              <AlertCircle className="w-8 h-8 text-gray-300" />
              <p className="text-sm">No complaints found matching the criteria.</p>
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : (
          filteredTickets.map(t => {
            const dynamicSlaStatus = computeSLAStatus(t, referenceTime);
            const slaConfig = getSlaBadgeStyles(dynamicSlaStatus, t.status);
            const countdown = formatSLACountdown(t.slaDueDate, referenceTime, t.status);

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTicket(t)}
                className="w-full p-4 text-left hover:bg-blue-50/20 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-sm">
                        {t.id}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        {t.creatorName.split(' ')[0]}
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-800 text-sm leading-snug break-words">
                      {t.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {t.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-gray-700">{t.departmentName}</p>
                    <p className="text-[11px] text-gray-400 font-mono tracking-tight break-words">{t.categoryName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${getPriorityBadgeClass(t.priority)}`}>
                      {t.priority}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${getStatusClass(t.status)}`}>
                      {t.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${slaConfig.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${slaConfig.dot}`} />
                    <span>{slaConfig.text}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-gray-500 font-mono">
                    <Clock className={`w-3.5 h-3.5 ${countdown.isOverdue ? 'text-rose-500' : 'text-gray-400'}`} />
                    <span className={countdown.isOverdue ? 'text-rose-600 font-semibold' : 'text-gray-700'}>
                      {countdown.text}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Due: {new Date(t.slaDueDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} ({t.slaDurationValue} {t.slaDurationUnit} {t.slaType.toLowerCase()})
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/75 text-xs text-gray-400 font-semibold uppercase tracking-widest border-b border-gray-100">
              <th className="py-3 px-5">Ticket Info</th>
              <th className="py-3 px-5">Department & Category</th>
              <th className="py-3 px-5">Priority & Status</th>
              <th className="py-3 px-5">SLA Information</th>
              <th className="py-3 px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-gray-300" />
                    <p className="text-sm">No complaints found matching the criteria.</p>
                    <button 
                      onClick={clearFilters} 
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTickets.map(t => {
                const dynamicSlaStatus = computeSLAStatus(t, referenceTime);
                const slaConfig = getSlaBadgeStyles(dynamicSlaStatus, t.status);
                const countdown = formatSLACountdown(t.slaDueDate, referenceTime, t.status);

                return (
                  <tr 
                    key={t.id} 
                    id={`ticket-row-${t.id}`}
                    onClick={() => onSelectTicket(t)}
                    className="hover:bg-blue-50/20 cursor-pointer transition-colors group"
                  >
                    {/* INFO */}
                    <td className="py-4 px-5 max-w-[280px]">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-sm">
                            {t.id}
                          </span>
                          <span className="text-xs text-gray-400 flex items-center">
                            <User className="w-3 h-3 mr-1" />
                            {t.creatorName.split(' ')[0]}
                          </span>
                        </div>
                        <h4 className="font-semibold text-gray-800 text-sm truncate group-hover:text-blue-600 transition-colors">
                          {t.title}
                        </h4>
                        <p className="text-xs text-gray-400 line-clamp-1">
                          {t.description}
                        </p>
                      </div>
                    </td>

                    {/* DEPT & CAT */}
                    <td className="py-4 px-5">
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-gray-700">{t.departmentName}</p>
                        <p className="text-[11px] text-gray-400 font-mono tracking-tight">{t.categoryName}</p>
                      </div>
                    </td>

                    {/* PRIORITY & STATUS */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${getPriorityBadgeClass(t.priority)}`}>
                          {t.priority}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${getStatusClass(t.status)}`}>
                          {t.status}
                        </span>
                      </div>
                    </td>

                    {/* SLA INFORMATION */}
                    <td className="py-4 px-5">
                      {/* SLA Pill */}
                      <div className="space-y-1">
                        <div className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${slaConfig.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${slaConfig.dot}`} />
                          <span>{slaConfig.text}</span>
                        </div>
                        
                        {/* Countdown duration text */}
                        <div className="flex items-center space-x-1 text-xs text-gray-500 font-mono">
                          <Clock className={`w-3.5 h-3.5 ${countdown.isOverdue ? 'text-rose-500' : 'text-gray-400'}`} />
                          <span className={countdown.isOverdue ? 'text-rose-600 font-semibold' : 'text-gray-700'}>
                            {countdown.text}
                          </span>
                        </div>
                        
                        <div className="text-[10px] text-gray-400" title="SLA Deadline">
                          Due: {new Date(t.slaDueDate).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})} ({t.slaDurationValue} {t.slaDurationUnit} {t.slaType.toLowerCase()})
                        </div>
                      </div>
                    </td>

                    {/* ACTIONS */}
                    <td className="py-4 px-5 text-right">
                      <button 
                        className="p-1 px-2.5 bg-gray-50 text-gray-500 group-hover:bg-blue-600 group-hover:text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center space-x-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicket(t);
                        }}
                      >
                        <span>View</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Ticket List Footer metadata */}
      <div className="p-3 bg-gray-50/75 border-t border-gray-50 text-xs text-gray-400 flex flex-col sm:flex-row justify-between items-center gap-1 px-4 sm:px-5 font-mono text-center sm:text-left">
        <span>Showing {filteredTickets.length} of {tickets.length} complaints</span>
        <span>Standard Clock synchronized with 2026-05-26 UTC</span>
      </div>
    </div>
  );
}
