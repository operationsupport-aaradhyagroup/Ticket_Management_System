import React, { useState, useEffect, useMemo } from 'react';
import { Ticket, TicketStatus, SLAStatus, SLAUnit, UserSession, TicketPriority, SentEmail, TicketRemarkItem } from '../types';
import { formatSLACountdown, computeSLAStatus, calculateDueDate, formatDateTime } from '../utils';
import { X, Clock, User, ShieldAlert, AlertTriangle, ArrowLeft, Send, CheckCircle2, RefreshCw, FileText, Mail } from 'lucide-react';

interface TicketDetailViewProps {
  ticket: Ticket;
  referenceTime: Date;
  currentUser: UserSession;
  isAdmin: boolean;
  companyUsers: UserSession[];
  onClose: () => void;
  onUpdateTicket: (updatedTicket: Ticket) => void;
  onEscalateTicket?: (ticketId: string, escalationType: 'Manual' | 'Auto-SLA-Breach') => void;
  sentEmails?: SentEmail[];
}

const withoutEmailAddresses = (text: string) =>
  text
    .replace(/\s*<?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export default function TicketDetailView({
  ticket,
  referenceTime,
  currentUser,
  isAdmin,
  companyUsers,
  onClose,
  onUpdateTicket,
  onEscalateTicket,
  sentEmails = []
}: TicketDetailViewProps) {
  const toDateTimeLocalInput = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const [assignedAgent, setAssignedAgent] = useState(ticket.assignedAgent || 'Unassigned');
  const [ticketStatus, setTicketStatus] = useState<TicketStatus>(ticket.status);
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>(ticket.priority);
  const [newRemark, setNewRemark] = useState('');
  const [localRemarks, setLocalRemarks] = useState<TicketRemarkItem[]>(ticket.remarks || []);
  const [editableDueDate, setEditableDueDate] = useState(toDateTimeLocalInput(ticket.slaDueDate));

  // Manual SLA Override Panel State
  const [showSlaOverride, setShowSlaOverride] = useState(false);
  const [overrideValue, setOverrideValue] = useState<number>(ticket.slaDurationValue);
  const [overrideUnit, setOverrideUnit] = useState<SLAUnit>(ticket.slaDurationUnit);

  // Update fields if ticket selected changes
  useEffect(() => {
    setAssignedAgent(ticket.assignedAgent || 'Unassigned');
    setTicketStatus(ticket.status);
    setTicketPriority(ticket.priority);
    setOverrideValue(ticket.slaDurationValue);
    setOverrideUnit(ticket.slaDurationUnit);
    setShowSlaOverride(false);
    setNewRemark('');
    setLocalRemarks(ticket.remarks || []);
    setEditableDueDate(toDateTimeLocalInput(ticket.slaDueDate));
  }, [ticket]);

  // Robust agents resolver list
  const agentsList = useMemo(() => {
    const list = [...(companyUsers || [])];
    const hasCurrent = list.some(u => u.name === assignedAgent);
    if (!hasCurrent && assignedAgent && assignedAgent !== 'Unassigned') {
      list.push({
        email: 'legacy',
        name: assignedAgent,
        role: 'User'
      });
    }
    return list;
  }, [companyUsers, assignedAgent]);

  // SLA Calculation
  const dynamicSlaStatus = useMemo(() => {
    return computeSLAStatus(ticket, referenceTime);
  }, [ticket, referenceTime]);

  const countdown = useMemo(() => {
    return formatSLACountdown(ticket.slaDueDate, referenceTime, ticketStatus);
  }, [ticket.slaDueDate, referenceTime, ticketStatus]);

  // Match corresponding simulated escalation email if sent
  const escalatedEmail = useMemo(() => {
    return sentEmails.find(e => e.ticketId === ticket.id);
  }, [ticket.id, sentEmails]);

  const assignedAgentRecord = useMemo(() => {
    return companyUsers.find(u => u.name === assignedAgent || u.email === ticket.assignedAgentEmail);
  }, [companyUsers, assignedAgent, ticket.assignedAgentEmail]);

  const ticketRemarks = useMemo(() => {
    return localRemarks;
  }, [localRemarks]);

  const isTicketCreator = currentUser.email.toLowerCase() === ticket.creatorEmail.toLowerCase();

  const canEditDueDate = useMemo(() => {
    const currentEmail = currentUser.email.toLowerCase();
    const assignedEmail = (ticket.assignedAgentEmail || '').toLowerCase();
    const assignedName = (ticket.assignedAgent || '').trim().toLowerCase();
    return isAdmin || assignedEmail === currentEmail || (!!currentUser.name && assignedName === currentUser.name.trim().toLowerCase());
  }, [currentUser.email, currentUser.name, isAdmin, ticket.assignedAgent, ticket.assignedAgentEmail]);

  // SLA Container Styles
  const slaContainerStyles = useMemo(() => {
    if (ticketStatus === 'Resolved' || ticketStatus === 'Closed') {
      return {
        bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        title: 'SLA MET & ARCHIVED',
        desc: 'This ticket was successfully resolved within the SLA boundaries.',
        themeColor: 'emerald'
      };
    }

    switch (dynamicSlaStatus) {
      case 'SLA Breached':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse',
          title: 'SLA TARGET BREACHED',
          desc: 'Maximum resolution threshold passed. Escalated to senior supervisor queue.',
          themeColor: 'rose'
        };
      case 'Near SLA Breach':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800 font-semibold',
          title: 'NEAR SLA BREACH LIMITS',
          desc: 'Nearing SLA breach sequence. Ticket must be actioned and resolved immediately.',
          themeColor: 'amber'
        };
      case 'Within SLA':
        return {
          bg: 'bg-blue-50 border-blue-100 text-blue-800',
          title: 'WITHIN SLA',
          desc: 'Operating safely within resolution boundaries. Assign agents to proceed.',
          themeColor: 'blue'
        };
    }
  }, [dynamicSlaStatus, ticketStatus]);

  // Handle saving primary ticket changes
  const handleSaveStandardInfo = (e: React.FormEvent) => {
    e.preventDefault();

    const timestamp = new Date().toISOString();
    const historyEntries = [...ticket.history];

    if (ticketStatus !== ticket.status) {
      let logText = `Ticket status transitioned from '${ticket.status}' to '${ticketStatus}' by ${currentUser.name}`;
      if (ticketStatus === 'Resolved') {
        logText = `Ticket resolved by ${currentUser.name}. SLA recording stopped.`;
      }
      historyEntries.push({
        id: 'hist-' + Date.now(),
        timestamp,
        userEmail: currentUser.email,
        action: logText
      });
    }

    const nextAssignedAgent = isAdmin ? assignedAgent : ticket.assignedAgent;

    if (nextAssignedAgent !== ticket.assignedAgent) {
      historyEntries.push({
        id: 'hist-ag-' + Date.now(),
        timestamp,
        userEmail: currentUser.email,
        action: `Assigned agent updated to '${nextAssignedAgent}'`
      });
    }

    if (ticketPriority !== ticket.priority) {
      historyEntries.push({
        id: 'hist-pr-' + Date.now(),
        timestamp,
        userEmail: currentUser.email,
        action: `Ticket priority changed to '${ticketPriority}'`
      });
    }

    let nextDueDate = ticket.slaDueDate;
    if (canEditDueDate && editableDueDate) {
      const parsedDueDate = new Date(editableDueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        alert('Please enter a valid due date.');
        return;
      }

      nextDueDate = parsedDueDate.toISOString();
      if (nextDueDate !== ticket.slaDueDate) {
        historyEntries.push({
          id: 'hist-dd-' + Date.now(),
          timestamp,
          userEmail: currentUser.email,
          action: `Due date changed from '${formatDateTime(ticket.slaDueDate)}' to '${formatDateTime(parsedDueDate)}'`
        });
      }
    }

    const updatedTicket: Ticket = {
      ...ticket,
      status: ticketStatus,
      assignedAgent: nextAssignedAgent,
      assignedAgentEmail: isAdmin
        ? (assignedAgentRecord?.email || ticket.assignedAgentEmail || '')
        : (ticket.assignedAgentEmail || ''),
      priority: ticketPriority,
      slaDueDate: nextDueDate,
      resolvedAt: ticketStatus === 'Resolved' ? timestamp : ticketStatus === 'Closed' ? (ticket.resolvedAt || timestamp) : null,
      history: historyEntries
    };

    onUpdateTicket(updatedTicket);
  };

  const handleAddRemark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemark.trim()) return;

    const timestamp = new Date().toISOString();
    const remarks: TicketRemarkItem[] = [
      ...ticketRemarks,
      {
        id: 'remark-' + Date.now(),
        timestamp,
        userEmail: currentUser.email,
        userName: currentUser.name,
        message: newRemark.trim()
      }
    ];
    setLocalRemarks(remarks);

    const historyEntries = [...ticket.history];
    historyEntries.push({
      id: 'hist-rm-' + Date.now(),
      timestamp,
      userEmail: currentUser.email,
      action: `Added a discussion remark on the ticket conversation thread`
    });

    onUpdateTicket({
      ...ticket,
      remarks,
      history: historyEntries
    });
    setNewRemark('');
  };

  // Override SLA triggers
  const handleApplySlaOverride = (e: React.FormEvent) => {
    e.preventDefault();

    const timestamp = new Date().toISOString();
    const newDueDate = calculateDueDate(ticket.createdAt, overrideValue, overrideUnit);

    const historyEntries = [...ticket.history];
    historyEntries.push({
      id: 'hist-override-' + Date.now(),
      timestamp,
      userEmail: currentUser.email,
      action: `ADMIN SLA OVERRIDE: SLA limit forced to custom ${overrideValue} ${overrideUnit}. Due limits updated.`
    });

    const updatedTicket: Ticket = {
      ...ticket,
      slaType: 'Custom',
      slaDurationValue: overrideValue,
      slaDurationUnit: overrideUnit,
      slaDueDate: newDueDate,
      history: historyEntries
    };

    onUpdateTicket(updatedTicket);
    setShowSlaOverride(false);
  };

  return (
    <div id={`detail-view-${ticket.id}`} className="space-y-6">
      {/* Back navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-100">
        <button
          id="btn-back-to-list"
          onClick={onClose}
          className="flex items-center space-x-2 text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Complaints Directory</span>
        </button>

        <span className="text-xs font-mono text-gray-400">
          Ticket ID: {ticket.id}
        </span>
      </div>

      {/* Main Grid: Detail Cards & Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Complaint Details & SLA Progress (Takes 2/3 space) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Header Card */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md">
                {ticket.departmentName}
              </span>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                ticket.priority === 'Critical' ? 'bg-red-100 text-red-800' :
                ticket.priority === 'High' ? 'bg-orange-100 text-orange-800' :
                ticket.priority === 'Medium' ? 'bg-amber-100 text-amber-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {ticket.priority} Priority
              </span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {ticket.title}
            </h2>

            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed pt-2 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              {ticket.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 text-xs text-gray-400">
              <div>
                <span className="block font-medium text-gray-400">File Submitter</span>
                <span className="text-gray-700 font-semibold">{ticket.creatorName}</span>
              </div>
              <div>
                <span className="block font-medium text-gray-400">Submitted On</span>
                <span className="text-gray-700 font-semibold">{formatDateTime(ticket.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* ETA and countdown */}
          <div className={`p-4 sm:p-6 rounded-2xl border ${slaContainerStyles.bg} shadow-xs`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] tracking-wider font-extrabold uppercase text-gray-400 bg-white/60 px-2 py-0.5 rounded-sm">
                  ETA Date &amp; Time
                </span>
                <p className="text-sm font-semibold text-gray-800">{formatDateTime(ticket.slaDueDate)}</p>
              </div>

              {/* Countdown timer layout with dynamic size */}
              <div className="flex items-center space-x-2 bg-white px-4 py-2.5 rounded-xl shadow-xs border border-white/50">
                <Clock className={`w-5 h-5 ${countdown.isOverdue ? 'text-rose-500 animate-pulse' : 'text-blue-500'}`} />
                <div className="text-right">
                  <span className={`block text-lg font-mono font-black ${countdown.isOverdue ? 'text-rose-600' : 'text-gray-800'}`}>
                    {countdown.text}
                  </span>
                  <span className="text-[10px] text-gray-400 block tracking-tight">Countdown</span>
                </div>
              </div>
            </div>

            {/* Quick Link/Button for overriding */}
            {isAdmin && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  id="btn-trigger-sla-override"
                  onClick={() => setShowSlaOverride(!showSlaOverride)}
                  className="px-3.5 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-2xs rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{showSlaOverride ? 'Hide SLA Override Tool' : 'Force Custom SLA Override (Admin)'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Escalation audit log */}
          {ticket.isEscalated && (
            <div className="bg-indigo-50/80 border border-indigo-200 p-4 sm:p-6 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center space-x-2 text-indigo-950 font-bold text-sm">
                <Mail className="w-5 h-5 text-indigo-600 animate-pulse" />
                <span>Escalation Audit Log</span>
              </div>
              <p className="text-xs text-indigo-700 leading-normal">
                This complaint was escalated and the designated escalation owner was notified according to the configured workflow.
              </p>
              
              <div className="bg-white p-4 rounded-xl border border-indigo-100 text-xs space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between border-b border-gray-100 pb-1.5 text-gray-500">
                  <span>Escalation Owner:</span>
                  <span className="font-semibold text-gray-800">
                    {escalatedEmail?.toName || `${ticket.departmentName} Escalation Owner`}
                  </span>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between border-b border-gray-100 pb-1.5 text-gray-500">
                  <span>Delivery Status:</span>
                  <span className="font-extrabold text-indigo-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                    Notification recorded and routed
                  </span>
                </div>
                <div className="pt-1.5 text-gray-500">
                  <span className="block font-medium mb-1">Professional Subject:</span>
                  <span className="block italic text-[11px] font-mono text-gray-850 p-2 bg-gray-50 rounded border border-gray-100">
                    {escalatedEmail?.subject || `[URGENT ESCALATION] ${ticket.id} SLA Limit Triggered - ${ticket.title}`}
                  </span>
                </div>
                {escalatedEmail && (
                  <div className="pt-1 text-gray-500">
                    <span className="block font-medium mb-1">Recorded Message:</span>
                    <pre className="block text-[10px] font-mono text-gray-700 p-2.5 bg-gray-50 rounded border border-gray-100 whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                      {escalatedEmail.body}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual Escalation CTA Box */}
          {!ticket.isEscalated && ticketStatus !== 'Resolved' && ticketStatus !== 'Closed' && (
            <div className="bg-red-50/70 border border-red-100 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 animate-pulse" />
                  Operator SLA Escalation Desk
                </h4>
                <p className="text-[11px] text-red-700 max-w-md">
                  Trigger escalation to the head of <strong>{ticket.departmentName}</strong> department. This records an escalation event and routes a notification to the configured escalation owner.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEscalateTicket && onEscalateTicket(ticket.id, 'Manual')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition duration-150 shrink-0 shadow-xs cursor-pointer"
              >
                Escalate Complaint
              </button>
            </div>
          )}

          {/* Form: Force Custom SLA Override Panel */}
          {showSlaOverride && isAdmin && (
            <div className="bg-amber-50/50 border border-amber-200 p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center space-x-2 text-amber-800">
                <Clock className="w-5 h-5 text-amber-500" />
                <h4 className="font-semibold text-md">Force Custom SLA Override</h4>
              </div>
              
              <p className="text-xs text-amber-700">
                As an Admin, you are overriding the default operational limits of this complaint ticket. This recalibrates the due date based on the creation timestamp.
              </p>

              <form onSubmit={handleApplySlaOverride} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Duration Value</label>
                  <input
                    id="input-override-value"
                    type="number"
                    min={1}
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs border border-gray-200 rounded-lg p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Duration Unit</label>
                  <select
                    id="select-override-unit"
                    value={overrideUnit}
                    onChange={(e) => setOverrideUnit(e.target.value as SLAUnit)}
                    className="w-full text-xs border border-gray-200 rounded-lg p-2 bg-white"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>

                <button
                  type="submit"
                  id="btn-apply-override-sla"
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-all shadow-xs"
                >
                  Apply New SLA Limit
                </button>
              </form>
            </div>
          )}

          {/* Ticket Historical Audit Log Trails */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-gray-50">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-800 text-sm">Live Chat</h3>
                <p className="text-[11px] text-gray-400 mt-1">
                  Remarks, replies, and handoff notes between the ticket owner, assigner, and assigned employee.
                </p>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full">
                {ticketRemarks.length} messages
              </span>
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {ticketRemarks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-400">
                  No remarks yet. Add the first note so the assigner and assigned employee can coordinate here.
                </div>
              ) : (
                ticketRemarks.map((remark) => {
                  const isCurrentUser = remark.userEmail.toLowerCase() === currentUser.email.toLowerCase();
                  return (
                    <div
                      key={remark.id}
                      className={`rounded-2xl border p-4 ${isCurrentUser ? 'bg-blue-50 border-blue-100 sm:ml-8' : 'bg-gray-50 border-gray-100 sm:mr-8'}`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{remark.userName}</p>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400">
                          {formatDateTime(remark.timestamp)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{remark.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleAddRemark} className="space-y-3 pt-2 border-t border-gray-50">
              <label className="block text-xs font-semibold text-gray-500">
                Add remark / reply
              </label>
              <textarea
                id="ticket-remark-message"
                rows={3}
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder="Write assignment instructions, progress updates, clarifications, or reply notes here..."
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post Remark</span>
                </button>
              </div>
            </form>
          </div>

          {/* Ticket Historical Audit Log Trails */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-gray-50">
              <FileText className="w-4.5 h-4.5 text-gray-400" />
              <h3 className="font-bold text-gray-800 text-sm">Complaint Operational Audit Logs</h3>
            </div>

            <div className="relative border-l border-gray-100 pl-4 ml-2.5 space-y-4 py-2">
              {ticket.history.map((h, index) => (
                <div key={h.id || index} className="relative text-xs">
                  {/* Bullet */}
                  <div className="absolute -left-[22.5px] top-1 w-2.5 h-2.5 rounded-full border border-white bg-blue-500" />
                  <span className="font-mono text-gray-400 block text-[10px]">
                    {formatDateTime(h.timestamp)}
                  </span>
                  <p className="text-gray-700 font-medium">
                    {withoutEmailAddresses(h.action)}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Update Ticket & Actions Sidebar (1/3 space) */}
        <div className="space-y-6">
          
          {/* Status & Assignment Box */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide border-b border-gray-50 pb-2">
              Operational Desk Controls
            </h3>

            <form onSubmit={handleSaveStandardInfo} className="space-y-4">
              {/* Ticket Status Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ticket Status</label>
                <select
                  id="select-ticket-status"
                  value={ticketStatus}
                  onChange={(e) => setTicketStatus(e.target.value as TicketStatus)}
                  disabled={isTicketCreator}
                  className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2.5 bg-white focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="Open">🟢 Open</option>
                  <option value="In Progress">🔵 In Progress</option>
                  <option value="Resolved">✅ Resolved</option>
                  <option value="Closed">🔒 Closed</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">{isTicketCreator ? 'Ticket creators cannot change status or priority.' : 'Transitioning to Resolved stops the SLA clock permanently.'}</p>
              </div>

              {/* Priority Select */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Priority</label>
                <select
                  id="select-ticket-priority"
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}
                  disabled={isTicketCreator}
                  className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2.5 bg-white focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Critical">Critical Priority</option>
                </select>
              </div>

              {/* Agent Assignment Field */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Assigned Agent</label>
                <select
                  id="select-assigned-agent"
                  value={assignedAgent}
                  onChange={(e) => setAssignedAgent(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg p-2.5 bg-white focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="Unassigned">Unassigned</option>
                  {agentsList.map(u => (
                    <option key={u.email + '-' + u.name} value={u.name}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Due Date</label>
                <input
                  type="datetime-local"
                  value={editableDueDate}
                  onChange={(e) => setEditableDueDate(e.target.value)}
                  disabled={!canEditDueDate}
                  className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2.5 bg-white focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              {/* Submit changes button */}
              <button
                type="submit"
                id="btn-save-ticket-settings"
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-950 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Save Desk Transitions</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
