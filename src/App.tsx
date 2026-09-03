import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ComplaintCategory, CreateTicketPayload, CreateUserPayload, Department, EscalationRule, SentEmail, SLAStatus, SLAUnit, Ticket, TicketPriority, TicketStatus, UserSession } from './types';
import { computeSLAStatus, isTicketAssignedToUser, isTicketRaisedByUser, wasTicketHistoricallyAssignedToUser } from './utils';

// Import our custom modules
import LoginView from './components/LoginView';
import SLAStatsDashboard from './components/SLAStatsDashboard';
import TicketList from './components/TicketList';
import CreateTicketModal from './components/CreateTicketModal';
import TicketDetailView from './components/TicketDetailView';
import AdminConfigPanel from './components/AdminConfigPanel';
import UserProfileModal from './components/UserProfileModal';

// Icons
import {
  ShieldCheck,
  User,
  LayoutDashboard,
  Ticket as TicketIcon,
  Settings,
  HelpCircle,
  TrendingUp,
  Plus,
  LogOut,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void>;
  }
}

interface EmployeeOptions {
  companies: string[];
  designationsByDepartmentId: Record<string, string[]>;
}

const HIDDEN_CATEGORY_IDS = new Set(['cat-it-1']);

export default function App() {
  // Core Session authentication elements
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sla_token'));
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Database lists
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserSession[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOptions>({
    companies: ['Aaradhya Group'],
    designationsByDepartmentId: {}
  });
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  
  // App states
  const [dbType, setDbType] = useState<string>('Detecting...');
  const [dataLoading, setDataLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Active UI Navigation tabs: 'all' | 'raised' | 'assigned' | 'dashboard' | 'config'
  const [activeTab, setActiveTab] = useState<'all' | 'raised' | 'assigned' | 'breached' | 'dashboard' | 'config'>('raised');
  
  // Selected ticket for detailed view
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // New ticket modal trigger
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const oneSignalInitRef = useRef(false);

  // Live reference time for SLA countdowns and status calculations
  const [referenceTime, setReferenceTime] = useState<Date>(() => new Date());

  // 1. Verify token on startup
  useEffect(() => {
    async function checkAuth() {
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setActiveTab(data.user.role === 'Admin' ? 'all' : 'raised');
        } else {
          // Token expired or invalid
          handleLogout();
        }
      } catch (err) {
        console.error('Failed to verify session connection', err);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, [token]);

  // 2. Fetch active db metrics & variables once authenticated
  const fetchDbData = async () => {
    if (!token) return;
    setDataLoading(true);
    setApiError(null);
    setReferenceTime(new Date());
    try {
      // Check database health & technology mode
      const statusRes = await fetch('/api/health');
      if (statusRes.ok) {
        const health = await statusRes.json();
        setDbType(health.database);
      }

      // Load core entities
      const [deptsRes, catsRes, tktsRes, usersRes, emailsRes, escalationRulesRes] = await Promise.all([
        fetch('/api/departments', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/categories', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/tickets', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/emails', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/escalation-rules', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (!deptsRes.ok || !catsRes.ok || !tktsRes.ok || !usersRes.ok || !emailsRes.ok || !escalationRulesRes.ok) {
        throw new Error('Some database layers failed to retrieve data from server.');
      }

      const deptsData = await deptsRes.json();
      const catsData = await catsRes.json();
      const tktsData = await tktsRes.json();
      const usersData = await usersRes.json();
      const emailsData = await emailsRes.json();
      const escalationRulesData = await escalationRulesRes.json();

      setDepartments(deptsData.departments);
      setCategories(catsData.categories.filter((category: ComplaintCategory) => !HIDDEN_CATEGORY_IDS.has(category.id)));
      setTickets(tktsData.tickets);
      setCompanyUsers(usersData.users || []);
      setEmployeeOptions(usersData.employeeOptions || { companies: ['Aaradhya Group'], designationsByDepartmentId: {} });
      setSentEmails(emailsData.emails || []);
      setEscalationRules(escalationRulesData.rules || []);
    } catch (err: any) {
      setApiError(err.message || 'Error occurred fetching backend resources.');
    } finally {
      setDataLoading(false);
    }
  };

  // Re-fetch any time the Token session transitions
  useEffect(() => {
    if (token && currentUser) {
      fetchDbData();
    }
  }, [token, currentUser]);

  useEffect(() => {
    if (!token || !currentUser || oneSignalInitRef.current) return;

    let cancelled = false;

    const initOneSignal = async () => {
      try {
        const configRes = await fetch('/api/push/config', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!configRes.ok) return;

        const config = await configRes.json();
        if (!config.enabled || !config.appId) return;

        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function (OneSignal: any) {
          if (cancelled) return;

          await OneSignal.init({
            appId: config.appId,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: '/OneSignalSDKWorker.js',
          });

          await OneSignal.login(currentUser.email.toLowerCase().trim());

          const promptKey = `onesignal_prompted_${currentUser.email.toLowerCase().trim()}`;
          const shouldPrompt = !localStorage.getItem(promptKey);
          const isSupported = OneSignal.Notifications.isPushSupported();

          if (isSupported && !OneSignal.Notifications.permission && shouldPrompt) {
            await OneSignal.Notifications.requestPermission();
            localStorage.setItem(promptKey, 'true');
          }
        });

        oneSignalInitRef.current = true;
      } catch (error) {
        console.warn('OneSignal init failed', error);
      }
    };

    initOneSignal();

    return () => {
      cancelled = true;
    };
  }, [token, currentUser]);

  // Handle active sign-ins from LoginView
  const handleLoginSuccess = (newToken: string, user: UserSession) => {
    localStorage.setItem('sla_token', newToken);
    setToken(newToken);
    setCurrentUser(user);
    setActiveTab(user.role === 'Admin' ? 'all' : 'raised');
  };

  const handleLogout = () => {
    localStorage.removeItem('sla_token');
    setToken(null);
    setCurrentUser(null);
    setDepartments([]);
    setCategories([]);
    setTickets([]);
    setCompanyUsers([]);
    setEscalationRules([]);
    setActiveTab('raised');
    oneSignalInitRef.current = false;
  };

  // Find active ticket details
  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  // Compute tickets visible based on active workspace view scope
  const visibleTickets = useMemo(() => {
    if (!currentUser) return [];
    if (activeTab === 'all') {
      return tickets;
    }
    if (activeTab === 'raised') {
      return tickets.filter(t => isTicketRaisedByUser(t, currentUser));
    }
    if (activeTab === 'assigned') {
      return tickets.filter(t => isTicketAssignedToUser(t, currentUser));
    }
    if (activeTab === 'breached') {
      return tickets.filter((ticket) =>
        wasTicketHistoricallyAssignedToUser(ticket, currentUser) &&
        computeSLAStatus(ticket, referenceTime) === 'SLA Breached'
      );
    }
    return tickets;
  }, [tickets, activeTab, currentUser, referenceTime]);

  const profileUser = useMemo(() => {
    if (!currentUser) return null;
    return companyUsers.find(user => user.email.toLowerCase() === currentUser.email.toLowerCase()) || currentUser;
  }, [companyUsers, currentUser]);

  // 4. Mutation callbacks hitting our Express database backend
  const handleCreateTicketInput = async (newTicket: CreateTicketPayload) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newTicket)
      });

      const rawResponse = await res.text();
      let createdPayload: any = {};
      try {
        createdPayload = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        createdPayload = {};
      }

      if (!res.ok) {
        throw new Error(createdPayload.error || rawResponse || 'Ticket creation failed on backend.');
      }

      if (createdPayload?.ticket) {
        setTickets((prev) => [createdPayload.ticket, ...prev]);
      }
      if (createdPayload?.email) {
        setSentEmails((prev) => [createdPayload.email, ...prev]);
      }
      setIsCreateModalOpen(false);

      try {
        await fetchDbData(); // Refresh list cleanly when available
      } catch (refreshError) {
        console.warn('Ticket created, but dashboard refresh failed.', refreshError);
      }
    } catch (err: any) {
      if (err?.message === 'Failed to fetch') {
        console.warn('Ticket create flow reported a network error after submission. If the ticket appears in the list, the create likely succeeded.', err);
        await fetchDbData();
        return;
      }
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleUpdateTicketInput = async (updatedTicket: Ticket) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const previousTicket = tickets.find((ticket) => ticket.id === updatedTicket.id) || null;
      const dueDateChanged = !!previousTicket && previousTicket.slaDueDate !== updatedTicket.slaDueDate;

      const res = await fetch(`/api/tickets/${updatedTicket.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedTicket)
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Ticket update failed on backend.');
      }

      await fetchDbData(); // Refresh list cleanly
      if (dueDateChanged) {
        alert('Due date updated successfully.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleEscalateTicket = async (ticketId: string, escalationType: 'Manual' | 'Auto-SLA-Breach') => {
    if (!token) return 'Your session has expired. Please sign in again.';
    try {
      setDataLoading(true);
      const res = await fetch(`/api/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ escalationType })
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Ticket escalation failed on backend.');
      }

      await fetchDbData(); // Refresh list cleanly
      return null;
    } catch (err: any) {
      console.warn('Escalation failed:', err.message);
      return err.message || 'Ticket escalation failed. Please try again.';
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddNewDepartment = async (name: string) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Department registration failed.');
      }

      await fetchDbData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleCreateUser = async (payload: CreateUserPayload) => {
    if (!token) {
      return { success: false, error: 'Your session has expired. Please sign in again.' };
    }

    try {
      setDataLoading(true);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const rawResponse = await res.text();
      let result: any = {};
      try {
        result = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        result = { error: rawResponse || 'Unexpected server response.' };
      }

      if (!res.ok) {
        throw new Error(result.error || `User creation failed with status ${res.status}.`);
      }

      await fetchDbData();
      return { success: true, user: result.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'User creation failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!token) {
      return { success: false, error: 'Your session has expired. Please sign in again.' };
    }

    try {
      setDataLoading(true);
      const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const rawResponse = await res.text();
      let result: any = {};
      try {
        result = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        result = { error: rawResponse || 'Unexpected server response.' };
      }

      if (!res.ok) {
        throw new Error(result.error || 'User delete failed.');
      }

      await fetchDbData();
      return { success: true, message: result.message as string };
    } catch (error: any) {
      return { success: false, error: error.message || 'User delete failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleSaveEscalationRule = async (departmentId: string, designationLevels: string[]) => {
    if (!token) {
      return { success: false, error: 'Your session has expired. Please sign in again.' };
    }

    try {
      setDataLoading(true);
      const res = await fetch('/api/escalation-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ departmentId, designationLevels })
      });

      const rawResponse = await res.text();
      let result: any = {};
      try {
        result = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        result = { error: rawResponse || 'Unexpected server response.' };
      }

      if (!res.ok) {
        throw new Error(result.error || 'Escalation rule save failed.');
      }

      await fetchDbData();
      return { success: true, rule: result.rule as EscalationRule };
    } catch (error: any) {
      return { success: false, error: error.message || 'Escalation rule save failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleMigrateDatabase = async () => {
    if (!token) return { success: false, error: 'User admin session is expired or not authenticated.' };
    try {
      setDataLoading(true);
      const res = await fetch('/api/admin/migrate-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDbData();
        return { success: true, migratedCount: data.migratedCount };
      } else {
        return { success: false, error: data.error || 'Server migration process completed with anomalies.' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'System connectivity failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleResetEmployeePassword = async (email: string) => {
    if (!token) return { success: false, error: 'Admin session is expired or not authenticated.' };
    try {
      setDataLoading(true);
      const res = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email })
      });

      const rawResponse = await res.text();
      const data = rawResponse ? JSON.parse(rawResponse) : {};

      if (!res.ok) {
        return { success: false, error: data.error || 'Password reset failed.' };
      }

      return { success: true, message: data.message || 'Password reset successfully.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Password reset failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleResetTickets = async () => {
    if (!token) return { success: false, error: 'Admin session is expired or not authenticated.' };
    try {
      setDataLoading(true);
      const res = await fetch('/api/admin/reset-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const rawResponse = await res.text();
      const data = rawResponse ? JSON.parse(rawResponse) : {};

      if (!res.ok) {
        return { success: false, error: data.error || 'Ticket reset failed.' };
      }

      setSelectedTicketId(null);
      await fetchDbData();
      return {
        success: true,
        message: data.message || 'All tickets were deleted. The next ticket will start from TKT-1.'
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Ticket reset failed.' };
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddNewCategory = async (deptId: string, name: string, defaultSlaValue: number, defaultSlaUnit: SLAUnit, defaultPriority: TicketPriority) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          departmentId: deptId,
          name,
          defaultSlaValue,
          defaultSlaUnit,
          defaultPriority
        })
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Category creation failed.');
      }

      await fetchDbData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const res = await fetch(`/api/departments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Failed to purge department.');
      }

      await fetchDbData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!token) return;
    try {
      setDataLoading(true);
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const fail = await res.json();
        throw new Error(fail.error || 'Failed to purge category rules.');
      }

      await fetchDbData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // If still loading session keys from cookie, show styled spinner
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-white text-xs">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin" />
          <p className="font-mono tracking-widest text-slate-400">CONNECTING AARADHYA GROUP TICKET MANAGEMENT SYSTEM...</p>
        </div>
      </div>
    );
  }

  // If not logged-in, enforce userwise login view
  if (!token || !currentUser) {
    return (
      <div className="bg-gray-50 min-h-screen">
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen text-gray-800 antialiased font-sans flex flex-col">
      
      {/* 1. APP HERO HEADER BRAND */}
      <header className="text-white relative overflow-hidden shrink-0 shadow-[0_22px_56px_rgba(15,23,42,0.24)] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22)_0%,transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.18)_0%,transparent_28%),linear-gradient(135deg,#081120_0%,#101a32_46%,#13223c_100%)]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 left-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-400 h-[2px]" />
          <div className="absolute -left-20 top-4 h-44 w-44 rounded-full bg-blue-500/16 blur-3xl" />
          <div className="absolute right-12 top-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute left-[19%] top-6 h-24 w-24 rounded-full border border-white/8 opacity-40" />
          <div className="absolute right-[20%] bottom-4 h-20 w-20 rounded-full border border-cyan-300/10 opacity-35" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/12 to-transparent" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          
          {/* Logo & Headline */}
          <div className="flex min-w-0 items-start sm:items-center gap-3 sm:gap-4 xl:flex-1">
            <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-[22px] bg-white/96 p-1.5 shadow-[0_16px_42px_rgba(15,23,42,0.34)] ring-1 ring-white/20 flex items-center justify-center overflow-hidden">
              <img
                src="/aaradhya-group-logo.png"
                alt="Aaradhya Group logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-[1.26rem] sm:text-[1.52rem] md:text-[1.98rem] font-black tracking-[-0.045em] leading-[1.02] text-white max-w-2xl">
                AARADHYA GROUP
                <span className="mt-1 block font-semibold">(Internal Ticket Management System)</span>
              </h1>
            </div>
          </div>

          {/* Active account controls */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 xl:justify-end xl:pl-4">
            {/* Current Active Account Card */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="w-full sm:w-auto bg-slate-900/34 px-4 py-3 rounded-[24px] flex items-center gap-3 border border-white/10 text-xs text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl text-left transition hover:bg-slate-700/40 hover:border-cyan-300/25"
              title="Open profile details"
            >
              <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_14px_currentColor] ${currentUser?.role === 'Admin' ? 'bg-emerald-400 text-emerald-400' : 'bg-blue-400 text-blue-400'}`} />
              <div className="text-left font-mono leading-none">
                <span className="block text-[9px] text-slate-400 uppercase tracking-[0.14em]">Authenticated {currentUser?.role}</span>
                <span className="font-semibold text-[13px] text-white">{currentUser?.name}</span>
              </div>
            </button>

            {/* Logout anchor */}
            <button
              onClick={handleLogout}
              className="self-end sm:self-auto p-3 bg-slate-900/34 hover:bg-rose-950/55 text-slate-400 hover:text-rose-300 hover:border-rose-900/60 border border-white/10 rounded-[24px] transition-all shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl"
              title="Logout session and change user"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>

          </div>

        </div>
      </header>

      {/* 2. TAB TOGGLES / TOP LEVEL DIRECTORY BAR */}
      <nav id="nav-tabs" className="bg-white border-b border-gray-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2 sm:gap-0 sm:flex-row justify-between sm:items-center py-2 sm:h-14">
          
          <div className="flex space-x-2 md:space-x-4 h-full overflow-x-auto">
            {/* 1. All Complaints (Admin Only) */}
            {currentUser?.role === 'Admin' && (
              <button
                id="tab-btn-all"
                onClick={() => {
                  setActiveTab('all');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'all' && !selectedTicketId
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <TicketIcon className="w-4 h-4 text-indigo-500" />
                <span>All Complaints ({tickets.length})</span>
              </button>
            )}

            {/* 2. My Raised Complaints (Available to Non-Admins only) */}
            {currentUser?.role !== 'Admin' && (
              <button
                id="tab-btn-raised"
                onClick={() => {
                  setActiveTab('raised');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'raised' && !selectedTicketId
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <TicketIcon className="w-4 h-4 text-emerald-500" />
                <span>My Raised Complaints ({tickets.filter(t => isTicketRaisedByUser(t, currentUser)).length})</span>
              </button>
            )}

            {/* 3. My Assigned Tasks (Available to Non-Admins only) */}
            {currentUser?.role !== 'Admin' && (
              <button
                id="tab-btn-assigned"
                onClick={() => {
                  setActiveTab('assigned');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'assigned' && !selectedTicketId
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4 text-amber-500" />
                <span>My Assigned Tasks ({tickets.filter(t => isTicketAssignedToUser(t, currentUser)).length})</span>
              </button>
            )}

            {currentUser?.role !== 'Admin' && (
              <button
                id="tab-btn-breached"
                onClick={() => {
                  setActiveTab('breached');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'breached' && !selectedTicketId
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>
                  My Breached Tickets ({tickets.filter((ticket) =>
                    wasTicketHistoricallyAssignedToUser(ticket, currentUser) &&
                    computeSLAStatus(ticket, referenceTime) === 'SLA Breached'
                  ).length})
                </span>
              </button>
            )}

            {/* 4. SLA Analytics Dashboard (Admin Only) */}
            {currentUser?.role === 'Admin' && (
              <button
                id="tab-btn-dashboard"
                onClick={() => {
                  setActiveTab('dashboard');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'dashboard'
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-blue-500" />
                <span>Admin SLA Dashboard</span>
              </button>
            )}

            {/* 5. SLA Administrative Rules configuration (Admin Only) */}
            {currentUser?.role === 'Admin' && (
              <button
                id="tab-btn-config"
                onClick={() => {
                  setActiveTab('config');
                  setSelectedTicketId(null);
                }}
                className={`px-3 h-full flex items-center space-x-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                  activeTab === 'config'
                    ? 'border-blue-600 text-blue-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Settings &amp; Management</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-4">
            {currentUser?.role === 'Admin' && (
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${
                  dbType === 'MongoDB' && !apiError
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
                title={dbType === 'MongoDB' && !apiError ? 'MongoDB connected' : 'MongoDB not connected'}
                role="status"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    dbType === 'MongoDB' && !apiError ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <span>{dbType === 'MongoDB' && !apiError ? 'MongoDB Connected' : 'MongoDB Not Connected'}</span>
              </div>
            )}

            <button
              onClick={fetchDbData}
              disabled={dataLoading}
              className="p-1 px-2.5 rounded-lg border border-gray-200 text-xs bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1 hover:text-blue-600 transition-colors"
              title="Refresh database entries from backend"
            >
              <RefreshCw className={`w-3 h-3 ${dataLoading ? 'animate-spin text-blue-600' : ''}`} />
              <span className="text-[10px] font-mono">Sync</span>
            </button>
          </div>

        </div>
      </nav>

      {/* 3. CORE ROUTER APPLICATION VIEW SPACE */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full overflow-y-auto">
        
        {/* Dynamic API status warning bar */}
        {apiError && (
          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-2xl mb-6 flex items-start space-x-2">
            <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Local Sync Warning:</strong>
              <span>{apiError}. Try checking the status of server logs or databases.</span>
            </div>
          </div>
        )}

        {/* Dynamic context rendering */}
        {selectedTicket ? (
          /* Render Particular Selected Ticket Detail contextual controller */
            <TicketDetailView
              ticket={selectedTicket}
              referenceTime={referenceTime}
              currentUser={currentUser}
              isAdmin={currentUser?.role === 'Admin'}
              companyUsers={companyUsers}
            onClose={() => setSelectedTicketId(null)}
            onUpdateTicket={handleUpdateTicketInput}
            onEscalateTicket={handleEscalateTicket}
            sentEmails={sentEmails}
          />
        ) : (
          /* Main view Router tabs */
          <div>
            {(activeTab === 'all' || activeTab === 'raised' || activeTab === 'assigned' || activeTab === 'breached') && (
              <TicketList
                tickets={visibleTickets}
                departments={departments}
                referenceTime={referenceTime}
                onSelectTicket={(t) => setSelectedTicketId(t.id)}
                onOpenCreateTicket={() => setIsCreateModalOpen(true)}
              />
            )}

            {activeTab === 'dashboard' && currentUser?.role === 'Admin' && (
              <SLAStatsDashboard
                tickets={tickets}
                departments={departments}
                categories={categories}
                companyUsers={companyUsers}
                referenceTime={referenceTime}
                onSelectTicket={(ticket) => setSelectedTicketId(ticket.id)}
              />
            )}

            {activeTab === 'config' && currentUser?.role === 'Admin' && (
              <AdminConfigPanel
                token={token!}
                departments={departments}
                categories={categories}
                companyUsers={companyUsers}
                employeeOptions={employeeOptions}
                escalationRules={escalationRules}
                dbType={dbType}
                onAddDepartment={handleAddNewDepartment}
                onAddCategory={handleAddNewCategory}
                onCreateUser={handleCreateUser}
                onDeleteUser={handleDeleteUser}
                onSaveEscalationRule={handleSaveEscalationRule}
                onDeleteDepartment={handleDeleteDepartment}
                onDeleteCategory={handleDeleteCategory}
                onMigrateDatabase={handleMigrateDatabase}
                onResetEmployeePassword={handleResetEmployeePassword}
                onResetTickets={handleResetTickets}
              />
            )}

          </div>
        )}

      </main>

      {/* 4. TICKET CREATION MODAL OVERLAY */}
      {isCreateModalOpen && (
        <CreateTicketModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
          }}
          departments={departments}
          currentUser={currentUser}
          companyUsers={companyUsers}
          onSubmit={handleCreateTicketInput}
        />
      )}

      <UserProfileModal
        isOpen={isProfileModalOpen}
        user={profileUser}
        companyUsers={companyUsers}
        token={token}
        onProfileUpdated={(updatedUser) => {
          setCurrentUser(updatedUser);
          setCompanyUsers((users) => users.map((user) => user.email.toLowerCase() === updatedUser.email.toLowerCase() ? updatedUser : user));
        }}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* FOOTER */}
      <footer className="relative overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18)_0%,transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.14)_0%,transparent_28%),linear-gradient(135deg,#081120_0%,#101a32_46%,#13223c_100%)] py-5 shrink-0">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 left-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-400 h-[2px]" />
          <div className="absolute -left-16 bottom-0 h-28 w-28 rounded-full bg-blue-500/14 blur-3xl" />
          <div className="absolute right-10 top-0 h-24 w-24 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:38px_38px]" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:px-6 lg:px-8 sm:text-left">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Aaradhya Group Ticket Management System
            </p>
            <p className="text-xs text-slate-400">
              Active backend persistent store connected successfully.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-900/34 px-4 py-2.5 text-[11px] font-semibold text-slate-200 shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            Developed &amp; Managed by <span className="text-cyan-300">Nexora Automations</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
