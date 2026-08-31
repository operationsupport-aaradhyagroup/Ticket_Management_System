import React, { useState } from 'react';
import { Building2, Briefcase, IdCard, KeyRound, Mail, Shield, User2, Users, X } from 'lucide-react';
import { UserSession } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  user: UserSession | null;
  token: string | null;
  onClose: () => void;
}

const profileFields = (user: UserSession | null) => {
  if (!user) return [];

  return [
    { label: 'Full Name', value: user.name || 'Not available', icon: User2 },
    { label: 'Email Address', value: user.email || 'Not available', icon: Mail },
    { label: 'Role', value: user.role || 'Not available', icon: Shield },
    { label: 'Employee ID', value: user.employeeId || 'Not available', icon: IdCard },
    { label: 'Company', value: user.company || 'Aaradhya Group', icon: Building2 },
    { label: 'Department', value: user.departmentName || 'Not available', icon: Building2 },
    { label: 'Designation', value: user.designation || 'Not available', icon: Briefcase },
    { label: 'Reporting Manager', value: user.reportingManager || 'Not available', icon: Users },
    { label: 'Reporting Manager Email', value: user.reportingManagerEmail || 'Not available', icon: Mail }
  ];
};

export default function UserProfileModal({ isOpen, user, token, onClose }: UserProfileModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const fields = profileFields(user);

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setPasswordError('Your session has expired. Please sign in again.');
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(null);
    setIsSavingPassword(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });

      const rawResponse = await response.text();
      const data = rawResponse ? JSON.parse(rawResponse) : {};
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update password.');
      }

      setPasswordSuccess(data.message || 'Password updated successfully.');
      resetPasswordForm();
    } catch (error: any) {
      setPasswordError(error.message || 'Unable to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-3 sm:px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#16233f_52%,#1d4ed8_100%)] px-4 sm:px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-[-0.03em] break-words">{user.name}</h2>
                <p className="mt-1 text-sm text-slate-200">
                  View your account details and update your password securely from this panel.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/8 p-2 text-slate-200 transition hover:bg-white/14 hover:text-white"
              title="Close profile"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="bg-slate-50 px-4 sm:px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  <Icon className="h-3.5 w-3.5 text-blue-500" />
                  <span>{label}</span>
                </div>
                <div className="break-words text-sm font-semibold text-slate-800">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <span>Change Password</span>
            </div>

            {passwordError && (
              <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="Enter your current password"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  After changing your password, use the new password for future sign-ins.
                </p>
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSavingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
