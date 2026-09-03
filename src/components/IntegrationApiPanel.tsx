import React, { useEffect, useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';

interface IntegrationApiPanelProps { token: string; }

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
};

export default function IntegrationApiPanel({ token }: IntegrationApiPanelProps) {
  const [apiClients, setApiClients] = useState<any[]>([]);
  const [apiClientName, setApiClientName] = useState('');
  const [apiClientExpiry, setApiClientExpiry] = useState('');
  const [apiPermissions, setApiPermissions] = useState<string[]>(['tickets:create', 'tickets:read']);
  const [newApiKey, setNewApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState('');
  const [emailSettings, setEmailSettings] = useState({ enabled: false, subjectPrefix: 'Resolve this Ticket --', defaultAssigneeEmail: 'operation_support@kisansuvidha.com' });
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [emailStatus, setEmailStatus] = useState('');
  const [gmail, setGmail] = useState<{ configured: boolean; inboxEmail: string; connected: boolean; connectedEmail: string | null }>({ configured: false, inboxEmail: '', connected: false, connectedEmail: null });
  const [gmailStatus, setGmailStatus] = useState('');
  const [syncingGmail, setSyncingGmail] = useState(false);

  const loadData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [clientsResponse, settingsResponse, logsResponse, gmailResponse] = await Promise.all([
        fetch('/api/admin/api-clients', { headers }), fetch('/api/admin/email-ticket/settings', { headers }), fetch('/api/admin/email-ticket/logs', { headers }), fetch('/api/admin/integrations/gmail/status', { headers })
      ]);
      const [clients, settings, logs, gmailData] = await Promise.all([clientsResponse.json(), settingsResponse.json(), logsResponse.json(), gmailResponse.json()]);
      if (!clientsResponse.ok || !settingsResponse.ok || !logsResponse.ok || !gmailResponse.ok) throw new Error(clients.error || settings.error || logs.error || gmailData.error || 'Integration settings could not be loaded.');
      setApiClients(clients.data || []);
      setEmailSettings(settings.data);
      setEmailLogs(logs.data || []);
      setGmail(gmailData.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Integration settings could not be loaded.';
      setApiStatus(message);
      setEmailStatus(message);
    }
  };

  useEffect(() => { void loadData(); }, [token]);

  const createApiClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiStatus('');
    try {
      const response = await fetch('/api/admin/api-clients', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: apiClientName, permissions: apiPermissions, expiresAt: apiClientExpiry || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API client creation failed.');
      setNewApiKey(data.data.apiKey);
      setApiClientName('');
      setApiClientExpiry('');
      setApiStatus('API client created. Copy the key now; it will not be shown again.');
      await loadData();
    } catch (error) { setApiStatus(error instanceof Error ? error.message : 'API client creation failed.'); }
  };

  const updateApiClient = async (id: string, action: string) => {
    try {
      const response = await fetch(`/api/admin/api-clients/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API client update failed.');
      if (data.data.apiKey) setNewApiKey(data.data.apiKey);
      await loadData();
    } catch (error) { setApiStatus(error instanceof Error ? error.message : 'API client update failed.'); }
  };

  const saveEmailSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailStatus('');
    try {
      const response = await fetch('/api/admin/email-ticket/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(emailSettings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email ticket settings could not be saved.');
      setEmailSettings(data.data);
      setEmailStatus('Email ticket settings saved.');
      await loadData();
    } catch (error) { setEmailStatus(error instanceof Error ? error.message : 'Email ticket settings could not be saved.'); }
  };

  const syncGmail = async () => {
    setSyncingGmail(true);
    setGmailStatus('');
    try {
      const response = await fetch('/api/admin/integrations/gmail/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gmail sync failed.');
      setGmailStatus(`Sync complete: ${data.data.created} created, ${data.data.ignored} ignored, ${data.data.duplicates} duplicates, ${data.data.failed} failed.`);
      await loadData();
    } catch (error) { setGmailStatus(error instanceof Error ? error.message : 'Gmail sync failed.'); } finally { setSyncingGmail(false); }
  };

  const connectGmail = async () => {
    setGmailStatus('');
    try {
      const response = await fetch('/api/admin/integrations/gmail/authorize', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gmail authorization could not be started.');
      window.location.assign(data.data.authorizationUrl);
    } catch (error) { setGmailStatus(error instanceof Error ? error.message : 'Gmail authorization could not be started.'); }
  };

  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-3"><div className="rounded-2xl bg-indigo-50 p-2 text-indigo-600"><KeyRound className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-slate-800">Developer API Access</h2><p className="text-[11px] text-slate-400">Issue and manage secure integration credentials.</p></div></div>
      {apiStatus && <p className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">{apiStatus}</p>}
      {newApiKey && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="mb-2 font-bold">Copy this key now. It will not be shown again.</p><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-white p-2 text-[11px] text-slate-700">{newApiKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(newApiKey)} className="rounded-lg bg-amber-600 px-3 font-bold text-white">Copy</button></div></div>}
      <form onSubmit={createApiClient} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><input required minLength={3} value={apiClientName} onChange={(event) => setApiClientName(event.target.value)} placeholder="API client name" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs" /><label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Optional expiry<input type="datetime-local" value={apiClientExpiry} onChange={(event) => setApiClientExpiry(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal" /></label><div className="flex flex-wrap gap-2">{['tickets:create', 'tickets:read', 'tickets:update', 'tickets:reply', 'tickets:assign'].map((permission) => <label key={permission} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"><input type="checkbox" checked={apiPermissions.includes(permission)} onChange={(event) => setApiPermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permission}</label>)}</div><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">Create API Client</button></form>
      <div className="space-y-2">{apiClients.length === 0 ? <p className="text-xs text-slate-400">No API clients created.</p> : apiClients.map((client) => <div key={client.id} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-800">{client.name}</p><p className="font-mono text-[10px] text-slate-400">{client.keyPrefix}… · {client.active ? 'Active' : 'Disabled'}</p></div><div className="flex gap-1.5"><button type="button" onClick={() => updateApiClient(client.id, client.active ? 'disable' : 'enable')} className="rounded-lg border px-2 py-1 text-[10px]">{client.active ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => updateApiClient(client.id, 'regenerate')} className="rounded-lg border px-2 py-1 text-[10px]">Regenerate</button><button type="button" onClick={() => updateApiClient(client.id, 'revoke')} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] text-rose-600">Revoke</button></div></div><p className="mt-2 text-[10px] text-slate-500">Permissions: {client.permissions.join(', ')} · Created: {formatDateTime(client.createdAt)}</p></div>)}</div>
    </section>
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] space-y-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-3"><div className="rounded-2xl bg-sky-50 p-2 text-sky-600"><Mail className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-slate-800">Email Ticket Integration</h2><p className="text-[11px] text-slate-400">Configure inbound email ticket creation and inspect its event logs.</p></div></div>
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900"><p className="font-bold">Gmail inbox: {gmail.inboxEmail || 'Not configured'}</p><p className="mt-1">{gmail.connected ? `Connected as ${gmail.connectedEmail}` : 'Not connected'}</p><div className="mt-3 flex flex-wrap gap-2">{!gmail.connected && <button type="button" onClick={connectGmail} disabled={!gmail.configured} className="rounded-lg bg-sky-600 px-3 py-2 font-bold text-white disabled:bg-slate-300">Connect Gmail</button>}{gmail.connected && <button type="button" disabled={syncingGmail} onClick={syncGmail} className="rounded-lg bg-sky-600 px-3 py-2 font-bold text-white disabled:bg-sky-300">{syncingGmail ? 'Syncing…' : 'Sync Gmail Inbox'}</button>}</div>{gmailStatus && <p className="mt-2 text-sky-800">{gmailStatus}</p>}</div>
      {emailStatus && <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-800">{emailStatus}</p>}
      <form onSubmit={saveEmailSettings} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={emailSettings.enabled} onChange={(event) => setEmailSettings((current) => ({ ...current, enabled: event.target.checked }))} />Enable Email Ticket Creation</label><label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject Prefix<input required value={emailSettings.subjectPrefix} onChange={(event) => setEmailSettings((current) => ({ ...current, subjectPrefix: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal" /></label><label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Default Assignee Email<input type="email" value={emailSettings.defaultAssigneeEmail} onChange={(event) => setEmailSettings((current) => ({ ...current, defaultAssigneeEmail: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case tracking-normal" /></label><button type="submit" className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white">Save Email Settings</button></form>
      <div className="overflow-x-auto rounded-2xl border border-slate-100"><table className="min-w-full text-left text-[10px] text-slate-600"><thead className="bg-slate-50 uppercase tracking-wider text-slate-400"><tr><th className="p-2">Received</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Subject</th><th className="p-2">Status</th><th className="p-2">Assigned</th><th className="p-2">Ticket</th><th className="p-2">Error</th></tr></thead><tbody>{emailLogs.length === 0 ? <tr><td colSpan={8} className="p-3 text-center text-slate-400">No inbound email events.</td></tr> : emailLogs.map((log) => <tr key={log.messageId} className="border-t border-slate-100 align-top"><td className="p-2 whitespace-nowrap">{formatDateTime(log.receivedAt)}</td><td className="p-2">{log.fromEmail}</td><td className="p-2">{(log.originalToEmails?.length ? log.originalToEmails : log.toEmails || []).join(', ')}</td><td className="p-2">{log.subject}</td><td className="p-2 font-semibold">{log.status}</td><td className="p-2">{log.assignedAgentEmail || 'Unassigned'}</td><td className="p-2">{log.ticketId || '—'}</td><td className="p-2 text-rose-600">{log.errorMessage || log.errorCode || '—'}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
