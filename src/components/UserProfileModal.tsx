import React from 'react';
import { Building2, Briefcase, IdCard, Mail, Shield, User2, Users, X } from 'lucide-react';
import { UserSession } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  user: UserSession | null;
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

export default function UserProfileModal({ isOpen, user, onClose }: UserProfileModalProps) {
  if (!isOpen || !user) return null;

  const fields = profileFields(user);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-3 sm:px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#16233f_52%,#1d4ed8_100%)] px-4 sm:px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-200">
                <Shield className="h-3.5 w-3.5" />
                <span>Profile Snapshot</span>
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-[-0.03em] break-words">{user.name}</h2>
                <p className="mt-1 text-sm text-slate-200">
                  Database-mapped profile details are visible here. Editing is currently locked.
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
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            This profile is read-only for now. All values shown below are coming from the current database/session mapping.
          </div>

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
        </div>
      </div>
    </div>
  );
}
