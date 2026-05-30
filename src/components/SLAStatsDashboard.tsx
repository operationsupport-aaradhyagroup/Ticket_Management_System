import React, { useMemo, useState } from 'react';
import { Ticket, Department, ComplaintCategory, SentEmail, UserSession } from '../types';
import { computeSLAStatus } from '../utils';
import { ShieldAlert, AlertTriangle, CheckCircle, BarChart3, Users, Landmark, Clock, Mail, Download, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import EmployeeTicketInsights from './EmployeeTicketInsights';

interface SLAStatsDashboardProps {
  tickets: Ticket[];
  departments: Department[];
  categories: ComplaintCategory[];
  companyUsers: UserSession[];
  referenceTime: Date;
  sentEmails?: SentEmail[];
  onSelectTicket: (ticket: Ticket) => void;
}

export default function SLAStatsDashboard({ 
  tickets, 
  departments, 
  categories, 
  companyUsers,
  referenceTime,
  sentEmails = [],
  onSelectTicket
}: SLAStatsDashboardProps) {
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardDeptFilter, setDashboardDeptFilter] = useState('all');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState('all');
  const [dashboardSlaFilter, setDashboardSlaFilter] = useState('all');
  const [dashboardPriorityFilter, setDashboardPriorityFilter] = useState('all');
  const [dashboardEscalationFilter, setDashboardEscalationFilter] = useState('all');

  const downloadCsvReport = (fileName: string, rows: Array<Record<string, string | number>>) => {
    if (rows.length === 0) {
      alert('No report data is available to export yet.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const cell = String(row[header] ?? '');
            return `"${cell.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const assignmentMailCount = useMemo(
    () => sentEmails.filter(mail => mail.notificationType === 'Assignment').length,
    [sentEmails]
  );
  const closureMailCount = useMemo(
    () => sentEmails.filter(mail => mail.notificationType === 'Closure').length,
    [sentEmails]
  );
  const escalationMailCount = useMemo(
    () => sentEmails.filter(mail => !mail.notificationType || mail.notificationType === 'Escalation').length,
    [sentEmails]
  );
  const orderedSentEmails = useMemo(
    () => [...sentEmails].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [sentEmails]
  );

  // Recalculate ticket statuses dynamically for stats
  const activeTickets = useMemo(() => {
    return tickets.map(t => ({
      ...t,
      computedSlaStatus: computeSLAStatus(t, referenceTime)
    }));
  }, [tickets, referenceTime]);

  const filteredActiveTickets = useMemo(() => {
    const query = dashboardSearch.trim().toLowerCase();

    return activeTickets.filter((ticket) => {
      const matchesSearch =
        !query ||
        ticket.id.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query) ||
        ticket.departmentName.toLowerCase().includes(query) ||
        ticket.categoryName.toLowerCase().includes(query) ||
        ticket.creatorName.toLowerCase().includes(query) ||
        ticket.creatorEmail.toLowerCase().includes(query) ||
        (ticket.assignedAgent || 'unassigned').toLowerCase().includes(query) ||
        (ticket.assignedAgentEmail || '').toLowerCase().includes(query);

      const matchesDept = dashboardDeptFilter === 'all' || ticket.departmentId === dashboardDeptFilter;
      const matchesStatus = dashboardStatusFilter === 'all' || ticket.status === dashboardStatusFilter;
      const matchesSla = dashboardSlaFilter === 'all' || ticket.computedSlaStatus === dashboardSlaFilter;
      const matchesPriority = dashboardPriorityFilter === 'all' || ticket.priority === dashboardPriorityFilter;
      const matchesEscalation =
        dashboardEscalationFilter === 'all' ||
        (dashboardEscalationFilter === 'escalated' && !!ticket.isEscalated) ||
        (dashboardEscalationFilter === 'not-escalated' && !ticket.isEscalated);

      return matchesSearch && matchesDept && matchesStatus && matchesSla && matchesPriority && matchesEscalation;
    });
  }, [
    activeTickets,
    dashboardDeptFilter,
    dashboardEscalationFilter,
    dashboardPriorityFilter,
    dashboardSearch,
    dashboardSlaFilter,
    dashboardStatusFilter
  ]);

  const resetDashboardFilters = () => {
    setDashboardSearch('');
    setDashboardDeptFilter('all');
    setDashboardStatusFilter('all');
    setDashboardSlaFilter('all');
    setDashboardPriorityFilter('all');
    setDashboardEscalationFilter('all');
  };

  const stats = useMemo(() => {
    let withinSla = 0;
    let nearBreach = 0;
    let breached = 0;

    filteredActiveTickets.forEach(t => {
      // If ticket is resolved/closed, we check whether it was resolved within or breached
      if (t.computedSlaStatus === 'SLA Breached') {
        breached++;
      } else if (t.computedSlaStatus === 'Near SLA Breach') {
        nearBreach++;
      } else {
        withinSla++;
      }
    });

    const total = filteredActiveTickets.length;
    const metSlaRate = total > 0 ? Math.round(((withinSla + nearBreach) / total) * 100) : 100;

    // Department performance
    const deptStatsMap: Record<string, { total: number; breached: number; within: number; near: number }> = {};
    departments.forEach(d => {
      deptStatsMap[d.id] = { total: 0, breached: 0, within: 0, near: 0 };
    });

    filteredActiveTickets.forEach(t => {
      if (!deptStatsMap[t.departmentId]) {
        deptStatsMap[t.departmentId] = { total: 0, breached: 0, within: 0, near: 0 };
      }
      const dept = deptStatsMap[t.departmentId];
      dept.total++;
      if (t.computedSlaStatus === 'SLA Breached') {
        dept.breached++;
      } else if (t.computedSlaStatus === 'Near SLA Breach') {
        dept.near++;
      } else {
        dept.within++;
      }
    });

    const departmentPerformance = departments.map(d => {
      const s = deptStatsMap[d.id] || { total: 0, breached: 0, within: 0, near: 0 };
      // Performance rate = % of tickets NOT breached
      const met = s.total - s.breached;
      const rate = s.total > 0 ? Math.round((met / s.total) * 100) : 100;
      return {
        id: d.id,
        name: d.name,
        total: s.total,
        breached: s.breached,
        near: s.near,
        within: s.within,
        rate
      };
    });

    // Agent performance
    const agentStatsMap: Record<string, { name: string; total: number; breached: number; within: number; near: number }> = {};
    filteredActiveTickets.forEach(t => {
      const agent = t.assignedAgent || 'Unassigned';
      if (!agentStatsMap[agent]) {
        agentStatsMap[agent] = { name: agent, total: 0, breached: 0, within: 0, near: 0 };
      }
      const s = agentStatsMap[agent];
      s.total++;
      if (t.computedSlaStatus === 'SLA Breached') {
        s.breached++;
      } else if (t.computedSlaStatus === 'Near SLA Breach') {
        s.near++;
      } else {
        s.within++;
      }
    });

    const agentPerformance = Object.values(agentStatsMap).map(a => {
      const met = a.total - a.breached;
      const rate = a.total > 0 ? Math.round((met / a.total) * 100) : 100;
      return {
        ...a,
        rate
      };
    }).sort((x, y) => y.rate - x.rate); // Sort by highest SLA meeting rate

    return {
      total,
      withinSla,
      nearBreach,
      breached,
      metSlaRate,
      departmentPerformance,
      agentPerformance
    };
  }, [filteredActiveTickets, departments]);

  const departmentLeaders = useMemo(() => {
    const ranked = [...stats.departmentPerformance].sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (a.breached !== b.breached) return a.breached - b.breached;
      return b.total - a.total;
    });

    return {
      strongest: ranked.find((dept) => dept.total > 0) || null,
      highestRisk: [...ranked]
        .filter((dept) => dept.total > 0)
        .sort((a, b) => {
          if (b.breached !== a.breached) return b.breached - a.breached;
          return a.rate - b.rate;
        })[0] || null
    };
  }, [stats.departmentPerformance]);

  const exportDepartmentReport = () => {
    downloadCsvReport(
      `department-sla-report-${referenceTime.toISOString().slice(0, 10)}.csv`,
      stats.departmentPerformance.map((dept) => ({
        Department: dept.name,
        TotalTickets: dept.total,
        WithinSLA: dept.within,
        NearBreach: dept.near,
        Breached: dept.breached,
        ComplianceRate: `${dept.rate}%`
      }))
    );
  };

  const exportTicketReport = () => {
    downloadCsvReport(
      `sla-ticket-report-${referenceTime.toISOString().slice(0, 10)}.csv`,
      filteredActiveTickets.map((ticket) => ({
        TicketID: ticket.id,
        Title: ticket.title,
        Department: ticket.departmentName,
        Category: ticket.categoryName,
        Priority: ticket.priority,
        Status: ticket.status,
        AssignedAgent: ticket.assignedAgent || 'Unassigned',
        SLAStatus: ticket.computedSlaStatus,
        Escalated: ticket.isEscalated ? 'Yes' : 'No',
        CreatedAt: new Date(ticket.createdAt).toLocaleString(),
        SLADueAt: new Date(ticket.slaDueDate).toLocaleString()
      }))
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={dashboardSearch}
              onChange={(e) => setDashboardSearch(e.target.value)}
              placeholder="Search by ticket ID, title, department, creator, assigned employee..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="button"
            onClick={resetDashboardFilters}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Department</label>
            <select
              value={dashboardDeptFilter}
              onChange={(e) => setDashboardDeptFilter(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Ticket Status</label>
            <select
              value={dashboardStatusFilter}
              onChange={(e) => setDashboardStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">SLA Status</label>
            <select
              value={dashboardSlaFilter}
              onChange={(e) => setDashboardSlaFilter(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All SLA States</option>
              <option value="Within SLA">Within SLA</option>
              <option value="Near SLA Breach">Near SLA Breach</option>
              <option value="SLA Breached">SLA Breached</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Priority</label>
            <select
              value={dashboardPriorityFilter}
              onChange={(e) => setDashboardPriorityFilter(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Escalation</label>
            <select
              value={dashboardEscalationFilter}
              onChange={(e) => setDashboardEscalationFilter(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Tickets</option>
              <option value="escalated">Only Escalated</option>
              <option value="not-escalated">Not Escalated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Visual Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Overall Compliance */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Overall SLA Compliance</p>
            <p className="text-2xl font-bold text-gray-800">{stats.metSlaRate}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Target: 95% compliance</p>
          </div>
        </div>

        {/* KPI: Within SLA */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Healthy (Within SLA)</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.withinSla}</p>
            <p className="text-xs text-gray-400 mt-0.5">Tickets in safe buffer</p>
          </div>
        </div>

        {/* KPI: Near Breach */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl animate-pulse">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Near SLA Breach</p>
            <p className="text-2xl font-bold text-amber-600">{stats.nearBreach}</p>
            <p className="text-xs text-gray-400 mt-0.5">Needs immediate attention</p>
          </div>
        </div>

        {/* KPI: Breached */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">SLA Breached</p>
            <p className="text-2xl font-bold text-rose-600">{stats.breached}</p>
            <p className="text-xs text-gray-400 mt-0.5">Escalated to supervisors</p>
          </div>
        </div>
      </div>

      {/* Reporting tools */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-800 text-lg">Reports & Exports</h3>
            </div>
            <p className="text-sm text-gray-500 max-w-2xl">
              Download department-level SLA summaries or full ticket-level reports for operational reviews and management updates.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={exportDepartmentReport}
              className="px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Department Report</span>
            </button>
            <button
              type="button"
              onClick={exportTicketReport}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Ticket Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Breakdown grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Department-wise SLA Performance */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-4 border-b border-gray-50">
            <div className="flex items-center space-x-2">
              <Landmark className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-lg">Department SLA Performance</h3>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {stats.departmentPerformance.filter((dept) => dept.total > 0).length} active departments
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Top Performer</p>
              <p className="text-base font-semibold text-emerald-950">
                {departmentLeaders.strongest?.name || 'No active department yet'}
              </p>
              <p className="text-sm text-emerald-800">
                {departmentLeaders.strongest ? `${departmentLeaders.strongest.rate}% compliance across ${departmentLeaders.strongest.total} tickets` : 'Performance ranking will appear as tickets accumulate.'}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700">Highest Risk</p>
              <p className="text-base font-semibold text-rose-950">
                {departmentLeaders.highestRisk?.name || 'No active department yet'}
              </p>
              <p className="text-sm text-rose-800">
                {departmentLeaders.highestRisk ? `${departmentLeaders.highestRisk.breached} breached and ${departmentLeaders.highestRisk.near} near-breach tickets need attention` : 'Risk alerts will appear here once departments receive tickets.'}
              </p>
            </div>
          </div>

          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {stats.departmentPerformance.map(dept => {
              // Color map for compliance rate
              let scoreColor = 'bg-emerald-500';
              let textColor = 'text-emerald-600';
              let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
              if (dept.rate < 75) {
                scoreColor = 'bg-rose-500';
                textColor = 'text-rose-600';
                badgeClass = 'bg-rose-50 text-rose-700 border-rose-100';
              } else if (dept.rate < 90) {
                scoreColor = 'bg-amber-500';
                textColor = 'text-amber-500';
                badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
              }

              return (
                <div key={dept.id} id={`dept-perf-${dept.id}`} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-gray-50 transition-colors space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-700 text-sm break-words">{dept.name}</span>
                      <span className="text-xs text-gray-400 sm:ml-2 block sm:inline">({dept.total} tickets total)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${badgeClass}`}>
                        {dept.rate}% compliant
                      </span>
                      <span className={`text-xs font-semibold ${textColor}`}>
                        {dept.breached === 0 ? 'Stable' : `${dept.breached} breach${dept.breached > 1 ? 'es' : ''}`}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full ${scoreColor} transition-all duration-500`}
                      style={{ width: `${dept.rate}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Total</p>
                      <p className="text-sm font-semibold text-gray-800">{dept.total}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Within SLA</p>
                      <p className="text-sm font-semibold text-emerald-700">{dept.within}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Near Breach</p>
                      <p className="text-sm font-semibold text-amber-700">{dept.near}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Breached</p>
                      <p className="text-sm font-semibold text-rose-700">{dept.breached}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="flex items-center text-teal-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      {dept.within + dept.near} meeting target
                    </span>
                    {dept.near > 0 && (
                      <span className="flex items-center text-amber-600 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                        {dept.near} Near Breach
                      </span>
                    )}
                    {dept.breached > 0 && (
                      <span className="flex items-center text-red-500 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>
                        {dept.breached} Breached
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent-wise SLA Performance */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs">
          <div className="flex items-center space-x-2 pb-4 mb-4 border-b border-gray-50">
            <Users className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-800 text-lg">Agent SLA Resolution Stats</h3>
          </div>
          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {stats.agentPerformance.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No tickets assigned to agents yet</p>
            ) : (
              stats.agentPerformance.map((agent, idx) => {
                let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
                if (agent.rate < 75) badgeClass = "bg-rose-50 text-rose-700 border-rose-100";
                else if (agent.rate < 90) badgeClass = "bg-amber-50 text-amber-700 border-amber-100";

                return (
                  <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm break-words">{agent.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                        <span>Total: {agent.total}</span>
                        <span>•</span>
                        <span className="text-emerald-600">SLA Met: {agent.within + agent.near}</span>
                        {agent.breached > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-rose-500 font-semibold">Breaches: {agent.breached}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${badgeClass}`}>
                        {agent.rate}% Success
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      <EmployeeTicketInsights
        departments={departments}
        tickets={tickets}
        companyUsers={companyUsers}
        referenceTime={referenceTime}
        onSelectTicket={onSelectTicket}
      />

      {/* Notification audit log */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs mt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-50">
          <div className="flex items-center space-x-2">
            <Mail className="w-5.5 h-5.5 text-indigo-600 animate-pulse" />
            <h3 className="font-semibold text-gray-805 text-lg">Notification Audit Log</h3>
          </div>
          <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full shrink-0 w-fit">
            Audit Logging Active
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
            Assignment: {assignmentMailCount}
          </span>
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700">
            Escalation: {escalationMailCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">
            Closure: {closureMailCount}
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Dept Heads Registry Grid Column */}
          <div className="xl:col-span-1 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Department Heads</h4>
            <div className="space-y-2.5">
              {departments.map(dept => (
                <div key={dept.id} className="p-3.5 bg-gray-50 border border-gray-100 rounded-xl space-y-1">
                  <div className="flex justify-between items-start gap-3">
                    <span className="font-semibold text-gray-800 text-xs break-words">{dept.name}</span>
                    <span className="text-[9px] text-indigo-600 font-bold bg-indigo-50/70 px-1.5 py-0.5 rounded uppercase tracking-wide">Route On</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700">{dept.headName || 'Unassigned Head'}</p>
                  <p className="text-[10px] font-mono text-gray-400 break-all">{dept.headEmail || 'No Email Registered'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Outbox Table */}
          <div className="xl:col-span-2 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Routed Notification Logs ({sentEmails.length})</h4>
            {sentEmails.length === 0 ? (
              <div className="border border-dashed border-gray-200 p-12 rounded-xl text-center text-gray-400 text-xs space-y-1.5 bg-gray-50/20">
                <Mail className="w-8 h-8 mx-auto text-gray-300 animate-bounce" />
                <p className="font-medium">Simulation Outbox is empty</p>
                <p className="text-[11px] text-gray-400 leading-normal max-w-sm mx-auto">
                  Create, escalate, or close a ticket to generate assignment, escalation, and closure notifications here.
                </p>
              </div>
            ) : (
              <>
              <div className="md:hidden space-y-3">
                {orderedSentEmails.map((mail) => {
                  const notificationType = mail.notificationType || 'Escalation';
                  return (
                    <div key={mail.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-800 break-words">{mail.toName}</p>
                        <p className="text-[10px] font-mono text-gray-400 break-all">{mail.toEmail}</p>
                      </div>
                      <p className="text-xs text-gray-700 break-words">{mail.subject}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          notificationType === 'Assignment'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : notificationType === 'Closure'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : mail.escalationType === 'Manual'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}>
                          {notificationType === 'Escalation' ? (mail.escalationType || 'Escalation') : notificationType}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">
                          {new Date(mail.sentAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          alert(`--- ESCALATION AUDIT RECORD ---\n\nSOURCE: SLA Workflow Engine\nRECIPIENT: ${mail.toName} (${mail.toEmail})\nREFERENCE: ${mail.subject}\nRECORDED AT: ${new Date(mail.sentAt).toLocaleString()}\n\nRECORDED MESSAGE:\n${mail.body}`);
                        }}
                        className="w-full px-2.5 py-2 text-indigo-600 bg-white hover:bg-indigo-50 rounded-lg border border-indigo-100/70 font-bold text-[10px] transition cursor-pointer"
                      >
                        Inspect Msg
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
                <table className="hidden md:table w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="p-3">Recipients</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Trigger Type</th>
                      <th className="p-3">Sent Time</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {orderedSentEmails.map((mail) => {
                      const notificationType = mail.notificationType || 'Escalation';
                      return (
                      <tr key={mail.id} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="p-3">
                          <span className="block font-semibold text-gray-800">{mail.toName}</span>
                          <span className="block text-[10px] font-mono text-gray-400">{mail.toEmail}</span>
                        </td>
                        <td className="p-3 text-gray-600 font-medium truncate max-w-[200px]" title={mail.subject}>
                          {mail.subject}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-2_5 py-0.5 rounded text-[10px] font-extrabold ${
                            notificationType === 'Assignment'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : notificationType === 'Closure'
                                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                : mail.escalationType === 'Manual'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {notificationType === 'Escalation' ? (mail.escalationType || 'Escalation') : notificationType}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400 font-mono text-[10px]">
                          {new Date(mail.sentAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            id={`btn-toggle-mail-${mail.id}`}
                            onClick={() => {
                              alert(`--- ESCALATION AUDIT RECORD ---\n\nSOURCE: SLA Workflow Engine\nRECIPIENT: ${mail.toName} (${mail.toEmail})\nREFERENCE: ${mail.subject}\nRECORDED AT: ${new Date(mail.sentAt).toLocaleString()}\n\nRECORDED MESSAGE:\n${mail.body}`);
                            }}
                            className="px-2.5 py-1 text-indigo-600 bg-indigo-55 hover:bg-indigo-100 rounded border border-indigo-100/50 font-bold text-[10px] transition cursor-pointer"
                          >
                            Inspect Msg
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
