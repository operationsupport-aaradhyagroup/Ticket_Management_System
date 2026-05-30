import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Search, Ticket as TicketIcon } from 'lucide-react';
import { Department, Ticket, UserSession } from '../types';
import { computeSLAStatus, resolveAccountableAssignedUser } from '../utils';

interface EmployeeTicketInsightsProps {
  departments: Department[];
  tickets: Ticket[];
  companyUsers: UserSession[];
  referenceTime: Date;
  onSelectTicket: (ticket: Ticket) => void;
}

export default function EmployeeTicketInsights({
  departments,
  tickets,
  companyUsers,
  referenceTime,
  onSelectTicket
}: EmployeeTicketInsightsProps) {
  const [employeeTicketSearch, setEmployeeTicketSearch] = useState('');
  const [employeeTicketDeptFilter, setEmployeeTicketDeptFilter] = useState('all');
  const [employeeTicketStatusFilter, setEmployeeTicketStatusFilter] = useState('all');
  const [employeeTicketSlaFilter, setEmployeeTicketSlaFilter] = useState('all');
  const [employeeTicketPriorityFilter, setEmployeeTicketPriorityFilter] = useState('all');
  const [employeeTicketRelationshipFilter, setEmployeeTicketRelationshipFilter] = useState('all');
  const [assignedEscalationSearch, setAssignedEscalationSearch] = useState('');
  const [assignedEscalationDeptFilter, setAssignedEscalationDeptFilter] = useState('all');
  const [assignedEscalationStatusFilter, setAssignedEscalationStatusFilter] = useState('all');
  const [assignedEscalationSlaFilter, setAssignedEscalationSlaFilter] = useState('all');
  const [assignedEscalationPriorityFilter, setAssignedEscalationPriorityFilter] = useState('all');
  const [assignedEscalationIssueFilter, setAssignedEscalationIssueFilter] = useState('all');
  const [expandedEmployeeEmail, setExpandedEmployeeEmail] = useState<string | null>(null);

  const usersByEmail = useMemo(
    () => new Map(companyUsers.map((user) => [user.email.toLowerCase(), user])),
    [companyUsers]
  );

  const resolveHistoricalAssignedUser = (ticket: Ticket) => {
    const matchedUser = resolveAccountableAssignedUser(ticket, companyUsers);
    if (matchedUser) return matchedUser;

    if (ticket.assignedAgentEmail) {
      return usersByEmail.get(ticket.assignedAgentEmail.toLowerCase()) || {
        email: ticket.assignedAgentEmail.toLowerCase(),
        name: ticket.assignedAgent || ticket.assignedAgentEmail,
        employeeId: 'Not available',
        departmentName: ticket.departmentName || 'Not available',
        role: 'User' as const
      };
    }

    if (ticket.assignedAgent && ticket.assignedAgent !== 'Unassigned') {
      return {
        email: `${ticket.assignedAgent.toLowerCase().replace(/\s+/g, '.')}@unknown.local`,
        name: ticket.assignedAgent,
        employeeId: 'Not available',
        departmentName: ticket.departmentName || 'Not available',
        role: 'User' as const
      };
    }

    return null;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Open':
        return 'border-emerald-100 bg-emerald-50 text-emerald-700';
      case 'In Progress':
        return 'border-indigo-100 bg-indigo-50 text-indigo-700';
      case 'Resolved':
        return 'border-slate-200 bg-slate-100 text-slate-700';
      case 'Closed':
        return 'border-gray-200 bg-gray-100 text-gray-600';
      default:
        return 'border-gray-200 bg-white text-gray-600';
    }
  };

  const getSlaBadgeClass = (status: string) => {
    switch (status) {
      case 'Within SLA':
        return 'border-blue-100 bg-blue-50 text-blue-700';
      case 'Near SLA Breach':
        return 'border-amber-100 bg-amber-50 text-amber-700';
      case 'SLA Breached':
        return 'border-rose-100 bg-rose-50 text-rose-700';
      default:
        return 'border-gray-200 bg-white text-gray-600';
    }
  };

  const employeeTicketRows = useMemo(() => {
    const query = employeeTicketSearch.trim().toLowerCase();
    const ticketMap = new Map<string, { raised: Ticket[]; assigned: Ticket[] }>();

    const ensureBucket = (email: string) => {
      const key = email.toLowerCase();
      if (!ticketMap.has(key)) {
        ticketMap.set(key, { raised: [], assigned: [] });
      }
      return ticketMap.get(key)!;
    };

    tickets.forEach((ticket) => {
      if (ticket.creatorEmail) {
        ensureBucket(ticket.creatorEmail).raised.push(ticket);
      }
      const accountableAssignedUser = resolveHistoricalAssignedUser(ticket);
      if (accountableAssignedUser?.email) {
        ensureBucket(accountableAssignedUser.email).assigned.push(ticket);
      }
    });

    return Array.from(ticketMap.entries())
      .map(([email, employeeTicketGroups]) => {
        const user = usersByEmail.get(email);
        const employeeTicketMap = new Map<string, Ticket & {
          relationship: 'Raised' | 'Assigned' | 'Raised + Assigned';
          computedSlaStatus: ReturnType<typeof computeSLAStatus>;
        }>();

        employeeTicketGroups.raised.forEach((ticket) => {
          employeeTicketMap.set(ticket.id, {
            ...ticket,
            relationship: 'Raised',
            computedSlaStatus: computeSLAStatus(ticket, referenceTime)
          });
        });

        employeeTicketGroups.assigned.forEach((ticket) => {
          const existing = employeeTicketMap.get(ticket.id);
          if (existing) {
            employeeTicketMap.set(ticket.id, {
              ...existing,
              relationship: 'Raised + Assigned'
            });
            return;
          }

          employeeTicketMap.set(ticket.id, {
            ...ticket,
            relationship: 'Assigned',
            computedSlaStatus: computeSLAStatus(ticket, referenceTime)
          });
        });

        const enrichedTickets = Array.from(employeeTicketMap.values())
          .filter((ticket) => {
            const matchesDept = employeeTicketDeptFilter === 'all' || ticket.departmentId === employeeTicketDeptFilter;
            const matchesStatus = employeeTicketStatusFilter === 'all' || ticket.status === employeeTicketStatusFilter;
            const matchesSla = employeeTicketSlaFilter === 'all' || ticket.computedSlaStatus === employeeTicketSlaFilter;
            const matchesPriority = employeeTicketPriorityFilter === 'all' || ticket.priority === employeeTicketPriorityFilter;
            const matchesRelationship =
              employeeTicketRelationshipFilter === 'all' ||
              ticket.relationship === employeeTicketRelationshipFilter ||
              ticket.relationship === 'Raised + Assigned';
            return matchesDept && matchesStatus && matchesSla && matchesPriority && matchesRelationship;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (enrichedTickets.length === 0) return null;

        const filteredStatusCounts = {
          Open: 0,
          'In Progress': 0,
          Resolved: 0,
          Closed: 0
        } as Record<string, number>;

        enrichedTickets.forEach((ticket) => {
          filteredStatusCounts[ticket.status] = (filteredStatusCounts[ticket.status] || 0) + 1;
        });

        return {
          email,
          name: user?.name || employeeTicketGroups.raised[0]?.creatorName || employeeTicketGroups.assigned[0]?.assignedAgent || email,
          employeeId: user?.employeeId || 'Not available',
          departmentName: user?.departmentName || employeeTicketGroups.raised[0]?.departmentName || employeeTicketGroups.assigned[0]?.departmentName || 'Not available',
          total: enrichedTickets.length,
          raisedCount: enrichedTickets.filter((ticket) => ticket.relationship === 'Raised' || ticket.relationship === 'Raised + Assigned').length,
          assignedCount: enrichedTickets.filter((ticket) => ticket.relationship === 'Assigned' || ticket.relationship === 'Raised + Assigned').length,
          statusCounts: filteredStatusCounts,
          tickets: enrichedTickets
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          row.email.toLowerCase().includes(query) ||
          row.employeeId.toLowerCase().includes(query) ||
          row.departmentName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [
    companyUsers,
    employeeTicketDeptFilter,
    employeeTicketPriorityFilter,
    employeeTicketRelationshipFilter,
    employeeTicketSearch,
    employeeTicketSlaFilter,
    employeeTicketStatusFilter,
    referenceTime,
    tickets,
    usersByEmail
  ]);

  const assignedEmployeeEscalationRows = useMemo(() => {
    const query = assignedEscalationSearch.trim().toLowerCase();
    const assignedTicketMap = new Map<string, Ticket[]>();

    tickets.forEach((ticket) => {
      const accountableUser = resolveHistoricalAssignedUser(ticket);
      if (!accountableUser?.email) return;

      const key = accountableUser.email.toLowerCase();
      const existing = assignedTicketMap.get(key) || [];
      existing.push(ticket);
      assignedTicketMap.set(key, existing);
    });

    return Array.from(assignedTicketMap.entries())
      .map(([email, assignedTickets]) => {
        const user = usersByEmail.get(email) || resolveHistoricalAssignedUser(assignedTickets[0]);
        const enrichedTickets = assignedTickets
          .map((ticket) => ({
            ...ticket,
            computedSlaStatus: computeSLAStatus(ticket, referenceTime)
          }))
          .filter((ticket) => {
            const matchesDept = assignedEscalationDeptFilter === 'all' || ticket.departmentId === assignedEscalationDeptFilter;
            const matchesStatus = assignedEscalationStatusFilter === 'all' || ticket.status === assignedEscalationStatusFilter;
            const matchesSla = assignedEscalationSlaFilter === 'all' || ticket.computedSlaStatus === assignedEscalationSlaFilter;
            const matchesPriority = assignedEscalationPriorityFilter === 'all' || ticket.priority === assignedEscalationPriorityFilter;
            const matchesIssue =
              assignedEscalationIssueFilter === 'all' ||
              (assignedEscalationIssueFilter === 'breached' && ticket.computedSlaStatus === 'SLA Breached') ||
              (assignedEscalationIssueFilter === 'escalated' && !!ticket.isEscalated) ||
              (assignedEscalationIssueFilter === 'breached-escalated' && ticket.computedSlaStatus === 'SLA Breached' && !!ticket.isEscalated);

            return matchesDept && matchesStatus && matchesSla && matchesPriority && matchesIssue;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (enrichedTickets.length === 0) return null;

        const breachedTickets = enrichedTickets.filter((ticket) => ticket.computedSlaStatus === 'SLA Breached');
        const escalatedTickets = enrichedTickets.filter((ticket) => ticket.isEscalated);
        const breachedAndEscalatedTickets = enrichedTickets.filter(
          (ticket) => ticket.computedSlaStatus === 'SLA Breached' && ticket.isEscalated
        );

        return {
          email,
          name: user?.name || enrichedTickets[0]?.assignedAgent || email,
          employeeId: user?.employeeId || 'Not available',
          departmentName: user?.departmentName || 'Not available',
          totalAssigned: enrichedTickets.length,
          breachedCount: breachedTickets.length,
          escalatedCount: escalatedTickets.length,
          breachedAndEscalatedCount: breachedAndEscalatedTickets.length,
          tickets: enrichedTickets
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          row.email.toLowerCase().includes(query) ||
          row.employeeId.toLowerCase().includes(query) ||
          row.departmentName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (b.breachedAndEscalatedCount !== a.breachedAndEscalatedCount) return b.breachedAndEscalatedCount - a.breachedAndEscalatedCount;
        if (b.escalatedCount !== a.escalatedCount) return b.escalatedCount - a.escalatedCount;
        return b.totalAssigned - a.totalAssigned;
      });
  }, [
    assignedEscalationDeptFilter,
    assignedEscalationIssueFilter,
    assignedEscalationPriorityFilter,
    assignedEscalationSearch,
    assignedEscalationSlaFilter,
    assignedEscalationStatusFilter,
    referenceTime,
    tickets,
    usersByEmail
  ]);

  const resetEmployeeTicketFilters = () => {
    setEmployeeTicketSearch('');
    setEmployeeTicketDeptFilter('all');
    setEmployeeTicketStatusFilter('all');
    setEmployeeTicketSlaFilter('all');
    setEmployeeTicketPriorityFilter('all');
    setEmployeeTicketRelationshipFilter('all');
  };

  const resetAssignedEscalationFilters = () => {
    setAssignedEscalationSearch('');
    setAssignedEscalationDeptFilter('all');
    setAssignedEscalationStatusFilter('all');
    setAssignedEscalationSlaFilter('all');
    setAssignedEscalationPriorityFilter('all');
    setAssignedEscalationIssueFilter('all');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-[28px] border border-gray-200 shadow-[0_18px_50px_rgba(15,23,42,0.07)] space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-gray-50">
          <div className="flex items-center space-x-3">
            <div className="rounded-2xl bg-blue-50 p-2 text-blue-600">
              <TicketIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Employee Ticket Activity Overview</h3>
              <p className="text-[11px] text-gray-400">Review each employee's full ticket activity across raised and assigned complaints.</p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {employeeTicketRows.length} employees with tickets
          </span>
        </div>

        <p className="text-xs text-gray-500">
          This view combines tickets employees created and tickets currently mapped to them, so admins can review workload, ownership, current status, and SLA state in one place.
        </p>
        <p className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[11px] text-blue-800">
          Counts in this section include both relationships: <strong>Raised</strong> and <strong>Assigned</strong>.
        </p>

        <div className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={employeeTicketSearch}
                onChange={(e) => setEmployeeTicketSearch(e.target.value)}
                placeholder="Search by employee name, email, employee ID, department..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={resetEmployeeTicketFilters}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Department</label>
              <select value={employeeTicketDeptFilter} onChange={(e) => setEmployeeTicketDeptFilter(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white">
                <option value="all">All Departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Ticket Status</label>
              <select value={employeeTicketStatusFilter} onChange={(e) => setEmployeeTicketStatusFilter(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white">
                <option value="all">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">SLA Breach Status</label>
              <select value={employeeTicketSlaFilter} onChange={(e) => setEmployeeTicketSlaFilter(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white">
                <option value="all">All SLA States</option>
                <option value="Within SLA">Within SLA</option>
                <option value="Near SLA Breach">Near SLA Breach</option>
                <option value="SLA Breached">SLA Breached</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Ticket Priority</label>
              <select value={employeeTicketPriorityFilter} onChange={(e) => setEmployeeTicketPriorityFilter(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white">
                <option value="all">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Relationship</label>
              <select value={employeeTicketRelationshipFilter} onChange={(e) => setEmployeeTicketRelationshipFilter(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-white">
                <option value="all">All Tickets</option>
                <option value="Raised">Raised</option>
                <option value="Assigned">Assigned</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
          {employeeTicketRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400">
              No employee ticket records matched your search.
            </div>
          ) : (
            employeeTicketRows.map((row) => {
              const isExpanded = expandedEmployeeEmail === row.email;
              return (
                <div key={row.email} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f8fbff)] shadow-sm">
                  <button type="button" onClick={() => setExpandedEmployeeEmail(isExpanded ? null : row.email)} className="w-full px-4 py-3 text-left">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{row.name}</span>
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{row.employeeId}</span>
                          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600">{row.total} tickets</span>
                        </div>
                        <p className="break-all text-[11px] font-mono text-gray-500">{row.email}</p>
                        <p className="text-[11px] text-gray-400">{row.departmentName}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px]">
                          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Raised: {row.raisedCount}</span>
                          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700">Assigned: {row.assignedCount}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(row.statusCounts).map(([status, count]) => (
                          <span key={status} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusBadgeClass(status)}`}>
                            {status}: {count}
                          </span>
                        ))}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-white px-4 py-3 space-y-2">
                      {row.tickets.map((ticket) => (
                        <div key={`${row.email}-${ticket.relationship}-${ticket.id}`} className="rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-3 shadow-sm">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-500">{ticket.id}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                  ticket.relationship === 'Raised + Assigned'
                                    ? 'border-violet-100 bg-violet-50 text-violet-700'
                                    : ticket.relationship === 'Assigned'
                                      ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                                      : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                }`}>
                                  {ticket.relationship}
                                </span>
                                <span className="text-xs font-semibold text-gray-800">{ticket.title}</span>
                              </div>
                              <p className="text-[11px] text-gray-500 break-words">{ticket.description}</p>
                              <p className="text-[10px] text-gray-400">
                                {ticket.departmentName} • {ticket.categoryName} • Created {new Date(ticket.createdAt).toLocaleString()}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getSlaBadgeClass(ticket.computedSlaStatus)}`}>{ticket.computedSlaStatus}</span>
                              <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">{ticket.priority}</span>
                              <button
                                type="button"
                                onClick={() => onSelectTicket(ticket)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                              >
                                Open Ticket
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bg-white p-5 rounded-[28px] border border-gray-200 shadow-[0_18px_50px_rgba(15,23,42,0.07)] space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-gray-50">
          <div className="flex items-center space-x-3">
            <div className="rounded-2xl bg-rose-50 p-2 text-rose-600">
              <TicketIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Assigned Ticket Risk & Accountability</h3>
              <p className="text-[11px] text-gray-400">Track assigned-ticket performance by employee, with focus on breach and escalation outcomes.</p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {assignedEmployeeEscalationRows.length} assigned employees
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Assigned Employees</p>
            <p className="mt-2 text-2xl font-black text-slate-800">{assignedEmployeeEscalationRows.length}</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-500">Total Assigned Tickets</p>
            <p className="mt-2 text-2xl font-black text-blue-700">{assignedEmployeeEscalationRows.reduce((sum, row) => sum + row.totalAssigned, 0)}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Breached Tickets</p>
            <p className="mt-2 text-2xl font-black text-amber-700">{assignedEmployeeEscalationRows.reduce((sum, row) => sum + row.breachedCount, 0)}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">Escalated After Assignment</p>
            <p className="mt-2 text-2xl font-black text-rose-700">{assignedEmployeeEscalationRows.reduce((sum, row) => sum + row.escalatedCount, 0)}</p>
          </div>
        </div>

        <p className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-[11px] text-rose-800">
          Counts in this section include <strong>assigned tickets only</strong>. Raised-only tickets are intentionally excluded from accountability totals here.
        </p>

        <div className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={assignedEscalationSearch}
                onChange={(e) => setAssignedEscalationSearch(e.target.value)}
                placeholder="Search by employee name, email, employee ID, department..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={resetAssignedEscalationFilters}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Department</label>
              <select value={assignedEscalationDeptFilter} onChange={(e) => setAssignedEscalationDeptFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Ticket Status</label>
              <select value={assignedEscalationStatusFilter} onChange={(e) => setAssignedEscalationStatusFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">SLA Status</label>
              <select value={assignedEscalationSlaFilter} onChange={(e) => setAssignedEscalationSlaFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="all">All SLA States</option>
                <option value="Within SLA">Within SLA</option>
                <option value="Near SLA Breach">Near SLA Breach</option>
                <option value="SLA Breached">SLA Breached</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Priority</label>
              <select value={assignedEscalationPriorityFilter} onChange={(e) => setAssignedEscalationPriorityFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Issue Type</label>
              <select value={assignedEscalationIssueFilter} onChange={(e) => setAssignedEscalationIssueFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Records</option>
                <option value="breached">Only Breached</option>
                <option value="escalated">Only Escalated</option>
                <option value="breached-escalated">Breached + Escalated</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {assignedEmployeeEscalationRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400">
              No assigned employee accountability records are available yet.
            </div>
          ) : (
            assignedEmployeeEscalationRows.map((row) => (
              <div key={row.email} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#fff9f9)] px-4 py-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{row.name}</span>
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{row.employeeId}</span>
                    </div>
                    <p className="break-all text-[11px] font-mono text-gray-500">{row.email}</p>
                    <p className="text-[11px] text-gray-400">{row.departmentName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Assigned</p>
                      <p className="text-sm font-semibold text-slate-800">{row.totalAssigned}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-amber-600 font-bold">Breached</p>
                      <p className="text-sm font-semibold text-amber-700">{row.breachedCount}</p>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-rose-600 font-bold">Escalated</p>
                      <p className="text-sm font-semibold text-rose-700">{row.escalatedCount}</p>
                    </div>
                    <div className="rounded-xl border border-red-100 bg-red-50/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-red-600 font-bold">Breached + Esc.</p>
                      <p className="text-sm font-semibold text-red-700">{row.breachedAndEscalatedCount}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {row.tickets.map((ticket) => (
                    <div key={`${row.email}-${ticket.id}`} className="rounded-2xl border border-gray-100 bg-white px-3 py-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-500">{ticket.id}</span>
                            <span className="text-xs font-semibold text-gray-800">{ticket.title}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 break-words">{ticket.description}</p>
                          <p className="text-[10px] text-gray-400">Raised by {ticket.creatorName} • {ticket.departmentName} • {ticket.categoryName}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getSlaBadgeClass(ticket.computedSlaStatus)}`}>{ticket.computedSlaStatus}</span>
                          {ticket.isEscalated && (
                            <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700">Escalated</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectTicket(ticket)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            Open Ticket
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
