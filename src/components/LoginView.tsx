import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (token: string, user: { email: string; name: string; role: 'User' | 'Admin' }) => void;
}

const EMPLOYEE_LOGIN_SAMPLES = [
  { email: 'jdofficial0611@gmail.com', name: 'Jaideep Thakur', designation: 'Video Editor', password: 'GBAPL-213' },
  { email: 'kapilrajput883932@gmail.com', name: 'Kapil Mewada', designation: 'Sales Officer', password: 'BAPL-235' },
  { email: 'mishrameghna735@gmail.com', name: 'Meghna Mishra', designation: 'HR Executive', password: 'GBAPL-211' },
  { email: 'kaurgurjeet3010@gmail.com', name: 'Gurjeet Kaur', designation: 'Implementation Trainee', password: 'GBAPL-212' },
  { email: 'mehravineet01@gmail.com', name: 'Vineet Kumar Mehra', designation: 'Counter Sales', password: 'KABPL-16' }
];

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [isRegister, setIsRegister] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmployees, setShowEmployees] = useState(false);

  // Quick Login Demo helper
  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: demoPass })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login mismatch');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const bodyArgs = isRegister 
      ? { email, name, password } 
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyArgs)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication challenge failed.');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[85vh] overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#14213d_24%,#dfeaff_58%,#d5e6ff_100%)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.22),transparent_24%),radial-gradient(circle_at_82%_16%,rgba(59,130,246,0.22),transparent_22%),radial-gradient(circle_at_32%_82%,rgba(34,197,94,0.18),transparent_22%),radial-gradient(circle_at_78%_74%,rgba(99,102,241,0.16),transparent_20%)]" />
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.2),rgba(255,255,255,0.04)_24%,rgba(255,255,255,0.02)_76%,rgba(15,23,42,0.1))]" />
        <div className="absolute left-[10%] top-[16%] h-72 w-72 rounded-full border border-white/20 opacity-40" />
        <div className="absolute left-[14%] top-[20%] h-96 w-96 rounded-full border border-white/10 opacity-25" />
        <div className="absolute right-[7%] bottom-[12%] h-64 w-64 rounded-full border border-white/16 opacity-30" />
      </div>

      <div className="relative z-10 w-full max-w-7xl grid items-center gap-10 xl:grid-cols-[minmax(0,1.08fr)_460px]">
        <div className="hidden xl:block">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-2 backdrop-blur-md shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/80">Enterprise Ticketing</span>
            </div>

            <h1 className="mt-6 max-w-lg text-5xl font-black tracking-tight leading-[1.05] text-white">
              Resolve faster with a sharper Aaradhya Group operations desk.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-200/88">
              A cleaner frontline for complaint intake, department routing, assignment visibility, and SLA-driven escalation management.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="rounded-[1.75rem] border border-white/18 bg-white/10 p-5 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Routing</p>
                <p className="mt-3 text-3xl font-black text-white">6</p>
                <p className="mt-2 text-sm text-slate-200/80">Departments mapped into one workflow.</p>
              </div>
              <div className="rounded-[1.75rem] border border-white/18 bg-white/10 p-5 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Monitoring</p>
                <p className="mt-3 text-3xl font-black text-white">24/7</p>
                <p className="mt-2 text-sm text-slate-200/80">Live SLA countdowns and alerts.</p>
              </div>
              <div className="rounded-[1.75rem] border border-white/18 bg-white/10 p-5 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Escalation</p>
                <p className="mt-3 text-3xl font-black text-white">Auto</p>
                <p className="mt-2 text-sm text-slate-200/80">Triggered when SLA windows are crossed.</p>
              </div>
            </div>

            <div className="mt-8 flex items-start gap-4">
              <div className="rounded-[1.5rem] border border-white/18 bg-white/10 px-5 py-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.14)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-300">SLA Visibility</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2.5 w-28 rounded-full bg-white/20">
                    <div className="h-2.5 w-20 rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300" />
                  </div>
                  <span className="text-sm font-semibold text-white">Live Monitoring</span>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/18 bg-slate-950/25 px-5 py-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-300">Enterprise Security</p>
                <p className="mt-2 max-w-[220px] text-sm leading-6 text-slate-100/90">
                  Role-based access for admins, agents, and complaint submitters.
                </p>
              </div>
            </div>
          </div>
        </div>

      <div className="relative w-full max-w-md xl:max-w-none justify-self-center xl:justify-self-end bg-white/92 rounded-3xl border border-white/60 shadow-[0_25px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl overflow-hidden">
        
        {/* Top Banner Accent */}
        <div className="relative bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#1e293b_100%)] p-6 text-white text-center flex flex-col items-center overflow-hidden">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute -top-10 right-6 h-28 w-28 rounded-full bg-blue-400/25 blur-2xl" />
            <div className="absolute bottom-0 left-8 h-24 w-24 rounded-full bg-amber-300/20 blur-2xl" />
          </div>
          <div className="mb-3 h-20 w-20 rounded-3xl bg-white p-2 shadow-inner ring-1 ring-white/10 overflow-hidden">
            <img
              src="/aaradhya-group-logo.png"
              alt="Aaradhya Group logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="relative">
            <h2 className="text-xl font-extrabold tracking-tight">Aaradhya Group Ticket Management System</h2>
            <p className="text-xs text-slate-300 mt-1">Authenticate to access Aaradhya Group tickets, assignments, and SLA controls</p>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-8 space-y-6">
          <div className="flex justify-center border-b border-gray-100 pb-2 overflow-x-auto">
            <button
              onClick={() => { setIsRegister(false); setError(null); }}
              className={`pb-2.5 px-3 sm:px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                !isRegister 
                  ? 'border-blue-600 text-blue-600 font-extrabold' 
                  : 'border-transparent text-gray-400'
              }`}
            >
              Sign In Account
            </button>
            <button
              onClick={() => { setIsRegister(true); setError(null); }}
              className={`pb-2.5 px-3 sm:px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                isRegister 
                  ? 'border-blue-600 text-blue-600 font-extrabold' 
                  : 'border-transparent text-gray-400'
              }`}
            >
              Sign Up As Member
            </button>
          </div>

          {/* Feedback notice Alert */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* If Registering, ask for human name */}
            {isRegister && (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  placeholder="e.g. Rahul Patel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3.5 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
              <input
                id="auth-email"
                type="email"
                required
                placeholder="e.g. rahulpatel789856@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-xl px-3.5 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Password with visible togglers */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Password passphrase"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-xl pl-3.5 pr-10 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-800">
                New registrations are created as standard users only. Admin access is reserved for the Aaradhya Group Admin account.
              </div>
            )}

            {/* Main Submit Controls */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-xs rounded-xl shadow-xs transition-all tracking-wider font-mono uppercase"
            >
              {loading ? 'Processing authentications...' : isRegister ? 'Launch New Member Account' : 'Authenticate Console Securely'}
            </button>
          </form>

          {/* Quick Demox Accounts Bubbles Spacer */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
              Quick Login Demo Access Keys
            </span>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                id="btn-demo-admin"
                onClick={() => handleQuickLogin('aaradhya.admin@company.com', 'Aaradhya@123')}
                className="p-2.5 text-left bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-100 rounded-xl text-xs space-y-0.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 group transition-colors"
              >
                <div>
                  <span className="text-emerald-900 font-bold block">🔐 Aaradhya Group Admin</span>
                  <span className="text-[10px] text-emerald-700 font-mono break-all">aaradhya.admin@company.com (Aaradhya@123)</span>
                </div>
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-md group-hover:scale-105 transition-transform">
                  Admin
                </span>
              </button>

              <button
                type="button"
                id="btn-demo-user"
                onClick={() => handleQuickLogin('jdofficial0611@gmail.com', 'GBAPL-213')}
                className="p-2.5 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs space-y-0.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 group transition-colors"
              >
                <div>
                  <span className="text-slate-800 font-bold block">🔑 Employee Login Example</span>
                  <span className="text-[10px] text-slate-500 font-mono break-all">jdofficial0611@gmail.com (GBAPL-213)</span>
                </div>
                <span className="text-[10px] font-bold bg-gray-800 text-white px-2 py-0.5 rounded-md group-hover:scale-105 transition-transform">
                  User
                </span>
              </button>
            </div>

            {/* Collapsible company demo employees block */}
            <div className="pt-2">
              <button
                type="button"
                id="btn-toggle-company-employees"
                onClick={() => setShowEmployees(!showEmployees)}
                className="w-full py-2 px-3 border border-dashed border-gray-200 rounded-xl text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 flex justify-between items-center transition-all"
              >
                <span>🏢 Imported Employee Login Samples</span>
                <span className="text-[10px]">{showEmployees ? '▼ Collapse' : '▶ Expand Logins'}</span>
              </button>

              <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                Employee login rule: use the imported <strong className="font-semibold">email address</strong> as username and the <strong className="font-semibold">Employee ID</strong> as the default password.
              </div>

              {showEmployees && (
                <div id="company-employees-grid" className="mt-3 grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                  {EMPLOYEE_LOGIN_SAMPLES.map((emp) => (
                    <button
                      key={emp.email}
                      type="button"
                      onClick={() => handleQuickLogin(emp.email, emp.password)}
                      className="p-2 text-left bg-gray-50/70 hover:bg-blue-50/50 border border-gray-100 rounded-lg text-[11px] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-all group"
                    >
                      <div className="leading-tight">
                        <span className="font-semibold text-gray-800 block group-hover:text-blue-600 transition-colors">
                          {emp.name}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium block break-all">
                          {emp.designation} • {emp.email}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase bg-slate-100 text-slate-600">
                        {emp.password}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      </div>
    </div>
  );
}
