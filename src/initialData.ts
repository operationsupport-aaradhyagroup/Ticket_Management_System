import { Department, ComplaintCategory, Ticket, UserSession } from './types';

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-it', name: 'IT Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'dept-hr', name: 'HR Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'dept-accounts', name: 'Accounts Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'dept-admin', name: 'Admin Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'dept-sales', name: 'Sales Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'dept-support', name: 'Support Department', isCustom: false, createdAt: '2026-05-20T08:00:00Z' }
];

export const INITIAL_CATEGORIES: ComplaintCategory[] = [
  // IT Department
  { id: 'cat-it-1', departmentId: 'dept-it', name: 'Data not coming properly', defaultSlaValue: 2, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-it-2', departmentId: 'dept-it', name: 'Hardware Issue', defaultSlaValue: 1, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-it-3', departmentId: 'dept-it', name: 'Software Installation', defaultSlaValue: 4, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-it-4', departmentId: 'dept-it', name: 'Network Access Request', defaultSlaValue: 12, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },

  // HR Department
  { id: 'cat-hr-1', departmentId: 'dept-hr', name: 'Payroll Inquiry', defaultSlaValue: 3, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-hr-2', departmentId: 'dept-hr', name: 'Onboarding Assistance', defaultSlaValue: 2, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-hr-3', departmentId: 'dept-hr', name: 'Leave correction request', defaultSlaValue: 1, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },

  // Accounts Department
  { id: 'cat-acc-1', departmentId: 'dept-accounts', name: 'Invoice Query', defaultSlaValue: 2, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-acc-2', departmentId: 'dept-accounts', name: 'Expense Reimbursement', defaultSlaValue: 4, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-acc-3', departmentId: 'dept-accounts', name: 'Vendor Payment Delay', defaultSlaValue: 5, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },

  // Admin Department
  { id: 'cat-adm-1', departmentId: 'dept-admin', name: 'Office Supplies Request', defaultSlaValue: 1, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-adm-2', departmentId: 'dept-admin', name: 'Facility Maintenance', defaultSlaValue: 8, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-adm-3', departmentId: 'dept-admin', name: 'ID Card Replacement', defaultSlaValue: 2, defaultSlaUnit: 'days', createdAt: '2026-05-20T08:00:00Z' },

  // Sales Department
  { id: 'cat-sal-1', departmentId: 'dept-sales', name: 'CRM Access Issue', defaultSlaValue: 3, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-sal-2', departmentId: 'dept-sales', name: 'Lead Assignment Error', defaultSlaValue: 1, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' },

  // Support Department
  { id: 'cat-sup-1', departmentId: 'dept-support', name: 'Customer Escalation', defaultSlaValue: 30, defaultSlaUnit: 'minutes', createdAt: '2026-05-20T08:00:00Z' },
  { id: 'cat-sup-2', departmentId: 'dept-support', name: 'Bug Report Routing', defaultSlaValue: 4, defaultSlaUnit: 'hours', createdAt: '2026-05-20T08:00:00Z' }
];

export const INITIAL_COMPANY_USERS: UserSession[] = [
  { email: 'aaradhya.admin@company.com', name: 'Aaradhya Group Admin', role: 'Admin', departmentId: 'dept-admin' },
  { email: 'rahulpatel789856@gmail.com', name: 'Rahul Patel', role: 'User', departmentId: 'dept-it' },
  { email: 'admin@company.com', name: 'System Admin', role: 'User', departmentId: 'dept-admin' },
  { email: 'jane.smith@company.com', name: 'Jane Smith', role: 'User', departmentId: 'dept-hr' },
  { email: 'rajesh@company.com', name: 'Rajesh Kumar', role: 'User', departmentId: 'dept-it' },
  { email: 'vikram@company.com', name: 'Vikram Malhotra', role: 'User', departmentId: 'dept-it' },
  { email: 'arjun@company.com', name: 'Arjun Mehta', role: 'User', departmentId: 'dept-it' },
  { email: 'neha@company.com', name: 'Neha Chopra', role: 'User', departmentId: 'dept-it' },
  { email: 'priya@company.com', name: 'Priya Sharma', role: 'User', departmentId: 'dept-hr' },
  { email: 'divya@company.com', name: 'Divya Nair', role: 'User', departmentId: 'dept-hr' },
  { email: 'meera@company.com', name: 'Meera Joshi', role: 'User', departmentId: 'dept-hr' },
  { email: 'amit@company.com', name: 'Amit Patel', role: 'User', departmentId: 'dept-accounts' },
  { email: 'kabir@company.com', name: 'Kabir Singh', role: 'User', departmentId: 'dept-accounts' },
  { email: 'sneha@company.com', name: 'Sneha Reddy', role: 'User', departmentId: 'dept-support' },
  { email: 'rohan@company.com', name: 'Rohan Gupta', role: 'User', departmentId: 'dept-support' },
  { email: 'anjali@company.com', name: 'Anjali Gupta', role: 'User', departmentId: 'dept-sales' },
  { email: 'rajiv@company.com', name: 'Rajiv Kapoor', role: 'User', departmentId: 'dept-admin' }
];

// Helper to construct dates relative to right now "2026-05-26T04:35:05"
const getRelativeDate = (offsetMinutes: number): string => {
  const base = new Date('2026-05-26T04:35:05Z');
  base.setMinutes(base.getMinutes() + offsetMinutes);
  return base.toISOString();
};

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: 'tkt-101',
    title: 'E-commerce API data sync syncing slow',
    description: 'Data sync has been delayed since morning. Sales statistics are not populated in the internal dashboard.',
    departmentId: 'dept-it',
    departmentName: 'IT Department',
    categoryId: 'cat-it-1',
    categoryName: 'Data not coming properly',
    status: 'In Progress',
    priority: 'High',
    creatorEmail: 'rahulpatel789856@gmail.com',
    creatorName: 'Rahul Patel',
    assignedAgent: 'Rajesh Kumar',
    assignedAgentEmail: 'rajesh@company.com',
    slaType: 'Default',
    slaDurationValue: 2,
    slaDurationUnit: 'hours',
    slaDueDate: getRelativeDate(60), // Created 1 hr ago, SLA 2 hours -> 1 hr remaining (Within SLA)
    slaStatus: 'Within SLA',
    slaBreachedAt: null,
    createdAt: getRelativeDate(-60),
    resolvedAt: null,
    history: [
      { id: 'h1', timestamp: getRelativeDate(-60), userEmail: 'rahulpatel789856@gmail.com', action: 'Ticket created with default SLA (2 hours)' },
      { id: 'h2', timestamp: getRelativeDate(-45), userEmail: 'admin@company.com', action: 'Assigned to Rajesh Kumar & marked In Progress' }
    ]
  },
  {
    id: 'tkt-102',
    title: 'Offboarding procedure guidelines missing in portal',
    description: 'Need the latest copy of offboarding protocols for employees leaving the Accounts department.',
    departmentId: 'dept-hr',
    departmentName: 'HR Department',
    categoryId: 'cat-hr-2',
    categoryName: 'Onboarding Assistance',
    status: 'Open',
    priority: 'Medium',
    creatorEmail: 'jane.smith@company.com',
    creatorName: 'Jane Smith',
    assignedAgent: 'Priya Sharma',
    assignedAgentEmail: 'priya@company.com',
    slaType: 'Default',
    slaDurationValue: 2,
    slaDurationUnit: 'days',
    slaDueDate: getRelativeDate(-2880), // Due 2 days ago (Breached) - wait, -2880 mins is 2 days ago. Created 4 days ago.
    slaStatus: 'SLA Breached',
    slaBreachedAt: getRelativeDate(-2880),
    createdAt: getRelativeDate(-5760), // Created 4 days ago
    resolvedAt: null,
    history: [
      { id: 'h3', timestamp: getRelativeDate(-5760), userEmail: 'jane.smith@company.com', action: 'Ticket created with default SLA (2 days)' },
      { id: 'h4', timestamp: getRelativeDate(-2880), userEmail: 'system', action: 'SLA breached automatically' }
    ]
  },
  {
    id: 'tkt-103',
    title: 'Urgent vendor reimbursement block',
    description: 'Accounts team has delayed processing the hardware supplier invoice due to discrepancy in PO-4482.',
    departmentId: 'dept-accounts',
    departmentName: 'Accounts Department',
    categoryId: 'cat-acc-1',
    categoryName: 'Invoice Query',
    status: 'In Progress',
    priority: 'Critical',
    creatorEmail: 'rahulpatel789856@gmail.com',
    creatorName: 'Rahul Patel',
    assignedAgent: 'Amit Patel',
    assignedAgentEmail: 'amit@company.com',
    slaType: 'Custom',
    slaDurationValue: 2,
    slaDurationUnit: 'hours',
    slaDueDate: getRelativeDate(10), // Created 1 hour 50 minutes ago, SLA 2 hours -> 10 mins left (Near SLA Breach)
    slaStatus: 'Near SLA Breach',
    slaBreachedAt: null,
    createdAt: getRelativeDate(-110),
    resolvedAt: null,
    history: [
      { id: 'h5', timestamp: getRelativeDate(-110), userEmail: 'rahulpatel789856@gmail.com', action: 'Ticket created with custom fast-track SLA (2 hours) by Admin' },
      { id: 'h6', timestamp: getRelativeDate(-100), userEmail: 'admin@company.com', action: 'Assigned to Amit Patel' }
    ]
  },
  {
    id: 'tkt-104',
    title: 'Customer payout failure escalation',
    description: 'Customer reporting refund for Txn-9018 is not credited. Need support to check with gateway merchant.',
    departmentId: 'dept-support',
    departmentName: 'Support Department',
    categoryId: 'cat-sup-1',
    categoryName: 'Customer Escalation',
    status: 'Resolved',
    priority: 'High',
    creatorEmail: 'mark.support@company.com',
    creatorName: 'Mark Support',
    assignedAgent: 'Sneha Reddy',
    assignedAgentEmail: 'sneha@company.com',
    slaType: 'Default',
    slaDurationValue: 30,
    slaDurationUnit: 'minutes',
    slaDueDate: getRelativeDate(-15), // Created 45 mins ago, due 30 mins -> resolved 25 mins after creation, so resolved within SLA.
    slaStatus: 'Within SLA',
    slaBreachedAt: null,
    createdAt: getRelativeDate(-45),
    resolvedAt: getRelativeDate(-20),
    history: [
      { id: 'h7', timestamp: getRelativeDate(-45), userEmail: 'mark.support@company.com', action: 'Ticket created with default SLA (30 minutes)' },
      { id: 'h8', timestamp: getRelativeDate(-20), userEmail: 'sneha@company.com', action: 'Ticket resolved within SLA duration (25 minutes elapsed)' }
    ]
  },
  {
    id: 'tkt-105',
    title: 'AC leaking water near backup server rack',
    description: 'We noticed a slow leak from the split AC unit. Needs immediate fixing to prevent moisture damage.',
    departmentId: 'dept-admin',
    departmentName: 'Admin Department',
    categoryId: 'cat-adm-2',
    categoryName: 'Facility Maintenance',
    status: 'Open',
    priority: 'High',
    creatorEmail: 'rahulpatel789856@gmail.com',
    creatorName: 'Rahul Patel',
    assignedAgent: 'Unassigned',
    slaType: 'Default',
    slaDurationValue: 8,
    slaDurationUnit: 'hours',
    slaDueDate: getRelativeDate(450), // Created 30 mins ago, SLA 8 hours -> 7.5 hr left
    slaStatus: 'Within SLA',
    slaBreachedAt: null,
    createdAt: getRelativeDate(-30),
    resolvedAt: null,
    history: [
      { id: 'h9', timestamp: getRelativeDate(-30), userEmail: 'rahulpatel789856@gmail.com', action: 'Ticket created with default SLA (8 hours)' }
    ]
  }
];
