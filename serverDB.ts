import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environmental properties
dotenv.config();

// Define DB fallback file path
const DISK_DB_PATH = path.join(process.cwd(), 'db_disk.json');
const EMPLOYEE_IMPORT_PATH = path.join(process.cwd(), 'data', 'employee-import.json');
const ESCALATION_RULES_DISK_PATH = path.join(process.cwd(), 'escalation-rules.json');

interface IImportedEmployeeRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  company: string;
  email: string;
  department: string;
  designation: string;
  reportingManager: string;
}

interface IImportedDepartmentSeed {
  id: string;
  name: string;
  isCustom: boolean;
  headName?: string;
  headEmail?: string;
  createdAt: string;
}

// Interface structures matching types.ts
export interface IUser {
  email: string;
  name: string;
  passwordHash: string;
  role: 'User' | 'Admin';
  departmentId?: string; // Department assignment for agent filtering
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  departmentName?: string;
  designation?: string;
  reportingManager?: string;
  reportingManagerEmail?: string;
  isDeleted?: boolean;
  isManuallyManaged?: boolean;
}

export interface IDepartment {
  id: string; // Mongo will map id
  name: string;
  isCustom: boolean;
  headName?: string;
  headEmail?: string;
  createdAt: string;
}

export interface ISentEmail {
  id: string;
  ticketId: string;
  ticketTitle: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  notificationType: 'Assignment' | 'Escalation' | 'Closure';
  escalationType?: 'Manual' | 'Auto-SLA-Breach';
}

export interface IEscalationRule {
  id: string;
  departmentId: string;
  departmentName: string;
  designationLevels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IComplaintCategory {
  id: string;
  departmentId: string;
  name: string;
  defaultSlaValue: number;
  defaultSlaUnit: 'minutes' | 'hours' | 'days';
  defaultPriority?: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt: string;
}

export interface ITicketHistoryItem {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
}

export interface ITicketRemarkItem {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  message: string;
}

export interface ITicket {
  id: string; // Friendly dynamic numeric string e.g. TKT-1834
  title: string;
  description: string;
  departmentId: string;
  departmentName: string;
  categoryId: string;
  categoryName: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  creatorEmail: string;
  creatorName: string;
  assignedAgent: string;
  assignedAgentEmail?: string; // Email of assigned agent for easier filtering
  slaType: 'Default' | 'Custom';
  slaDurationValue: number;
  slaDurationUnit: 'minutes' | 'hours' | 'days';
  slaDueDate: string;
  slaStatus: 'Within SLA' | 'Near SLA Breach' | 'SLA Breached';
  slaBreachedAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  history: ITicketHistoryItem[];
  remarks?: ITicketRemarkItem[];
  isEscalated?: boolean;
  lastReminderSentAt?: string | null;
  reminderCount?: number;
  source?: 'ADMIN' | 'PORTAL' | 'API' | 'PUBLIC_FORM' | 'EMAIL' | 'INTEGRATION';
  requesterPhone?: string;
  customFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  integrationClientId?: string;
  updatedAt?: string;
}

export interface IApiClient {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  active: boolean;
  permissions: string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export interface IIdempotencyRecord {
  integrationClientId: string;
  idempotencyKey: string;
  relatedTicketId: string;
  createdAt: string;
}

export interface IApiAuditEvent {
  id: string;
  eventType: string;
  actor: string;
  apiClientId?: string;
  ticketId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// Memory Cache fallback store for disk DB mode
interface IDiskStore {
  users: IUser[];
  departments: IDepartment[];
  categories: IComplaintCategory[];
  tickets: ITicket[];
  emails: ISentEmail[];
  apiClients?: IApiClient[];
  idempotencyRecords?: IIdempotencyRecord[];
  apiAuditEvents?: IApiAuditEvent[];
}

let diskDb: IDiskStore = {
  users: [],
  departments: [],
  categories: [],
  tickets: [],
  emails: []
};

// Check if mongoose should run
const useMongo = !!process.env.MONGODB_URI;
let isMongoConnected = false;

// Register schemas for Mongoose if it's active
let UserSchema: any, DeptSchema: any, CatSchema: any, TicketSchema: any, EmailSchema: any;
let EscalationRuleSchema: any, ApiClientSchema: any, IdempotencySchema: any, ApiAuditSchema: any;
let UserModel: any, DeptModel: any, CatModel: any, TicketModel: any, EmailModel: any, EscalationRuleModel: any;
let ApiClientModel: any, IdempotencyModel: any, ApiAuditModel: any;

if (useMongo) {
  try {
    const Schema = mongoose.Schema;

    UserSchema = new Schema({
      email: { type: String, unique: true, required: true },
      name: { type: String, required: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ['User', 'Admin'], default: 'User' },
      departmentId: { type: String, default: '' },
      employeeId: { type: String, default: '' },
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      company: { type: String, default: '' },
      departmentName: { type: String, default: '' },
      designation: { type: String, default: '' },
      reportingManager: { type: String, default: '' },
      reportingManagerEmail: { type: String, default: '' },
      isDeleted: { type: Boolean, default: false },
      isManuallyManaged: { type: Boolean, default: false }
    });

    DeptSchema = new Schema({
      id: { type: String, unique: true, required: true },
      name: { type: String, required: true },
      isCustom: { type: Boolean, default: false },
      headName: { type: String, default: 'Unassigned' },
      headEmail: { type: String, default: '' },
      createdAt: { type: String, required: true }
    });

    CatSchema = new Schema({
      id: { type: String, unique: true, required: true },
      departmentId: { type: String, required: true },
      name: { type: String, required: true },
      defaultSlaValue: { type: Number, required: true },
      defaultSlaUnit: { type: String, enum: ['minutes', 'hours', 'days'], required: true },
      defaultPriority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
      createdAt: { type: String, required: true }
    });

    TicketSchema = new Schema({
      id: { type: String, unique: true, required: true },
      title: { type: String, required: true },
      description: { type: String, required: true },
      departmentId: { type: String, required: true },
      departmentName: { type: String, required: true },
      categoryId: { type: String, required: true },
      categoryName: { type: String, required: true },
      status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
      priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
      creatorEmail: { type: String, required: true },
      creatorName: { type: String, required: true },
      assignedAgent: { type: String, default: 'Unassigned' },
      assignedAgentEmail: { type: String, default: '' },
      slaType: { type: String, enum: ['Default', 'Custom'], default: 'Default' },
      slaDurationValue: { type: Number, required: true },
      slaDurationUnit: { type: String, enum: ['minutes', 'hours', 'days'], required: true },
      slaDueDate: { type: String, required: true },
      slaStatus: { type: String, enum: ['Within SLA', 'Near SLA Breach', 'SLA Breached'], default: 'Within SLA' },
      slaBreachedAt: { type: String, default: null },
      createdAt: { type: String, required: true },
      resolvedAt: { type: String, default: null },
      history: [{
        id: String,
        timestamp: String,
        userEmail: String,
        action: String
      }],
      remarks: [{
        id: String,
        timestamp: String,
        userEmail: String,
        userName: String,
        message: String
      }],
      isEscalated: { type: Boolean, default: false },
      lastReminderSentAt: { type: String, default: null },
      reminderCount: { type: Number, default: 0 },
      source: { type: String, enum: ['ADMIN', 'PORTAL', 'API', 'PUBLIC_FORM', 'EMAIL', 'INTEGRATION'], default: 'PORTAL', index: true },
      requesterPhone: { type: String, default: '' },
      customFields: { type: Schema.Types.Mixed, default: undefined },
      metadata: { type: Schema.Types.Mixed, default: undefined },
      createdBy: { type: String, default: '' },
      integrationClientId: { type: String, default: '', index: true },
      updatedAt: { type: String, default: '' }
    });

    EmailSchema = new Schema({
      id: { type: String, unique: true, required: true },
      ticketId: { type: String, required: true },
      ticketTitle: { type: String, required: true },
      toName: { type: String, required: true },
      toEmail: { type: String, required: true },
      subject: { type: String, required: true },
      body: { type: String, required: true },
      sentAt: { type: String, required: true },
      notificationType: { type: String, enum: ['Assignment', 'Escalation', 'Closure'], required: true },
      escalationType: { type: String, enum: ['Manual', 'Auto-SLA-Breach'], required: false }
    });

    EscalationRuleSchema = new Schema({
      id: { type: String, unique: true, required: true },
      departmentId: { type: String, required: true },
      departmentName: { type: String, required: true },
      designationLevels: [{ type: String }],
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true }
    });

    ApiClientSchema = new Schema({
      id: { type: String, unique: true, required: true },
      name: { type: String, required: true },
      keyPrefix: { type: String, unique: true, required: true, index: true },
      keyHash: { type: String, required: true, select: false },
      active: { type: Boolean, default: true, index: true },
      permissions: [{ type: String }],
      createdBy: { type: String, required: true },
      createdAt: { type: String, required: true },
      lastUsedAt: { type: String, default: null },
      expiresAt: { type: String, default: null },
      revokedAt: { type: String, default: null }
    });
    IdempotencySchema = new Schema({
      integrationClientId: { type: String, required: true },
      idempotencyKey: { type: String, required: true },
      relatedTicketId: { type: String, required: true },
      createdAt: { type: String, required: true }
    });
    IdempotencySchema.index({ integrationClientId: 1, idempotencyKey: 1 }, { unique: true });
    ApiAuditSchema = new Schema({
      id: { type: String, unique: true, required: true },
      eventType: { type: String, required: true, index: true },
      actor: { type: String, required: true },
      apiClientId: { type: String, default: '' },
      ticketId: { type: String, default: '' },
      createdAt: { type: String, required: true },
      metadata: { type: Schema.Types.Mixed, default: undefined }
    });

    UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
    DeptModel = mongoose.models.Department || mongoose.model('Department', DeptSchema);
    CatModel = mongoose.models.Category || mongoose.model('Category', CatSchema);
    TicketModel = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
    EmailModel = mongoose.models.SentEmail || mongoose.model('SentEmail', EmailSchema);
    EscalationRuleModel = mongoose.models.EscalationRule || mongoose.model('EscalationRule', EscalationRuleSchema);
    ApiClientModel = mongoose.models.ApiClient || mongoose.model('ApiClient', ApiClientSchema);
    IdempotencyModel = mongoose.models.TicketIdempotency || mongoose.model('TicketIdempotency', IdempotencySchema);
    ApiAuditModel = mongoose.models.ApiAuditEvent || mongoose.model('ApiAuditEvent', ApiAuditSchema);
  } catch (err) {
    console.warn('Mongoose Schemas failed to prepare: ', err);
  }
}

function loadEscalationRulesFromDisk(): IEscalationRule[] {
  try {
    if (!fs.existsSync(ESCALATION_RULES_DISK_PATH)) {
      fs.writeFileSync(ESCALATION_RULES_DISK_PATH, JSON.stringify([], null, 2), 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(ESCALATION_RULES_DISK_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed reading escalation rules store', error);
    return [];
  }
}

function saveEscalationRulesToDisk(rules: IEscalationRule[]) {
  try {
    fs.writeFileSync(ESCALATION_RULES_DISK_PATH, JSON.stringify(rules, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed writing escalation rules store', error);
  }
}

function normalizeDesignation(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function designationRank(value: string): number {
  const normalized = normalizeDesignation(value);
  if (!normalized) return 999;
  if (/\b(intern|trainee|apprentice)\b/.test(normalized)) return 10;
  if (/\b(junior|assistant|support|runner|field assistant)\b/.test(normalized)) return 20;
  if (/\b(executive|officer|associate|adviser|advisor|developer|designer|specialist|engineer|accountant|coordinator|controller)\b/.test(normalized)) return 30;
  if (/\b(lead|senior)\b/.test(normalized)) return 40;
  if (/\b(manager|asm)\b/.test(normalized)) return 50;
  if (/\b(head)\b/.test(normalized)) return 60;
  if (/\b(general manager|business head|ceo)\b/.test(normalized)) return 70;
  return 35;
}

function inferEscalationRules(users: IUser[], departments: IDepartment[]): IEscalationRule[] {
  const now = new Date().toISOString();
  return departments.map((department) => {
    const uniqueDesignations = Array.from(
      new Set(
        users
          .filter((user) => user.departmentId === department.id)
          .map((user) => String(user.designation || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => {
      const rankDiff = designationRank(a) - designationRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b);
    });

    const hasHeadLikeDesignation = uniqueDesignations.some((designation) => /\bhead\b/i.test(designation));
    const designationLevels = hasHeadLikeDesignation
      ? uniqueDesignations
      : [...uniqueDesignations, 'Dept Head'].filter(Boolean);

    return {
      id: `esc-rule-${department.id}`,
      departmentId: department.id,
      departmentName: department.name,
      designationLevels,
      createdAt: now,
      updatedAt: now
    };
  });
}

// Synchronous disk reading helpers
function loadFromDisk() {
  try {
    if (fs.existsSync(DISK_DB_PATH)) {
      const data = fs.readFileSync(DISK_DB_PATH, 'utf-8');
      diskDb = JSON.parse(data);
      if (!diskDb.emails) diskDb.emails = [];
      if (!diskDb.apiClients) diskDb.apiClients = [];
      if (!diskDb.idempotencyRecords) diskDb.idempotencyRecords = [];
      if (!diskDb.apiAuditEvents) diskDb.apiAuditEvents = [];
    } else {
      // Seed default mock structure
      diskDb = { users: [], departments: [], categories: [], tickets: [], emails: [], apiClients: [], idempotencyRecords: [], apiAuditEvents: [] };
      saveToDisk();
    }
  } catch (error) {
    console.error('Failed reading disk fallback store', error);
  }
}

function saveToDisk() {
  try {
    fs.writeFileSync(DISK_DB_PATH, JSON.stringify(diskDb, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed writing disk fallback store', error);
  }
}

function loadEmployeeImportRows(): IImportedEmployeeRow[] {
  try {
    if (!fs.existsSync(EMPLOYEE_IMPORT_PATH)) return [];
    const raw = fs.readFileSync(EMPLOYEE_IMPORT_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): IImportedEmployeeRow => ({
        employeeId: String(row.employeeId || '').trim(),
        firstName: String(row.firstName || '').trim(),
        lastName: String(row.lastName || '').trim(),
        name: String(row.name || '').trim(),
        company: String(row.company || '').trim(),
        email: String(row.email || '').trim().toLowerCase(),
        department: String(row.department || '').trim(),
        designation: String(row.designation || '').trim(),
        reportingManager: String(row.reportingManager || '').trim()
      }))
      .filter(row => row.email && row.employeeId && row.department);
  } catch (error) {
    console.error('Failed loading employee import JSON', error);
    return [];
  }
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/\s&\s/g, ' & ');
}

function slugifyDepartment(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveDepartmentSeed(rawDepartment: string): { id: string; name: string; isCustom: boolean } {
  const normalized = rawDepartment.trim().toUpperCase();
  const mappedDefaults: Record<string, { id: string; name: string }> = {
    'HR': { id: 'dept-hr', name: 'HR Department' },
    'ACCOUNTS': { id: 'dept-accounts', name: 'Accounts Department' },
    'SALES': { id: 'dept-sales', name: 'Sales Department' },
    'INFORMATION TECHNOLOGY': { id: 'dept-it', name: 'IT Department' }
  };

  if (mappedDefaults[normalized]) {
    return { ...mappedDefaults[normalized], isCustom: false };
  }

  const cleanName = toTitleCase(rawDepartment);
  return {
    id: `dept-${slugifyDepartment(cleanName)}`,
    name: cleanName.endsWith('Department') ? cleanName : `${cleanName} Department`,
    isCustom: true
  };
}

function parseReportingManagerEmployeeId(reportingManager: string): string {
  const lastToken = reportingManager.trim().split(/\s+/).pop() || '';
  return lastToken.toUpperCase();
}

function buildImportedSeeds(createdAt: string) {
  const employees = loadEmployeeImportRows();
  const employeesById = new Map(
    employees.map(employee => [employee.employeeId.toUpperCase(), employee])
  );

  const departmentStats = new Map<string, {
    seed: IImportedDepartmentSeed;
    managerCounts: Map<string, number>;
    managerDetails: Map<string, { name: string; email: string }>;
  }>();

  for (const employee of employees) {
    const deptSeed = resolveDepartmentSeed(employee.department);
    const managerId = parseReportingManagerEmployeeId(employee.reportingManager);
    const managerRecord = employeesById.get(managerId);
    const managerKey = managerRecord
      ? `${managerRecord.name}|${managerRecord.email}`
      : employee.reportingManager;

    const stat = departmentStats.get(deptSeed.id) || {
      seed: {
        ...deptSeed,
        createdAt
      },
      managerCounts: new Map<string, number>(),
      managerDetails: new Map<string, { name: string; email: string }>()
    };

    stat.managerCounts.set(managerKey, (stat.managerCounts.get(managerKey) || 0) + 1);
    if (managerRecord) {
      stat.managerDetails.set(managerKey, {
        name: managerRecord.name,
        email: managerRecord.email
      });
    }
    departmentStats.set(deptSeed.id, stat);
  }

  const importedDepartments: IImportedDepartmentSeed[] = Array.from(departmentStats.values()).map(stat => {
    const topManager = Array.from(stat.managerCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topManagerDetails = topManager ? stat.managerDetails.get(topManager[0]) : null;
    return {
      ...stat.seed,
      headName: topManagerDetails?.name || 'Unassigned Head',
      headEmail: topManagerDetails?.email || ''
    };
  });

  const importedUsers = employees.map<IUser>(employee => {
    const deptSeed = resolveDepartmentSeed(employee.department);
    const managerId = parseReportingManagerEmployeeId(employee.reportingManager);
    const managerRecord = employeesById.get(managerId);
    return {
      email: employee.email,
      name: employee.name,
      passwordHash: '',
      role: 'User',
      departmentId: deptSeed.id,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      company: employee.company,
      departmentName: deptSeed.name,
      designation: employee.designation,
      reportingManager: employee.reportingManager,
      reportingManagerEmail: managerRecord?.email || ''
    };
  });

  return { importedDepartments, importedUsers };
}

// Seed helper functions
async function seedDefaults() {
  const makeCategory = (
    id: string,
    departmentId: string,
    name: string,
    defaultSlaValue: number,
    defaultSlaUnit: 'minutes' | 'hours' | 'days',
    defaultPriority: 'Low' | 'Medium' | 'High' | 'Critical'
  ): IComplaintCategory => ({
    id,
    departmentId,
    name,
    defaultSlaValue,
    defaultSlaUnit,
    defaultPriority,
    createdAt: '2026-05-20T08:00:00Z'
  });

  // Common core departments
  const INITIAL_DEPARTMENTS: IDepartment[] = [
    { id: 'dept-it', name: 'IT Department', isCustom: false, headName: 'Rajesh Kumar (IT Lead)', headEmail: 'rajesh@company.com', createdAt: '2026-05-20T08:00:00Z' },
    { id: 'dept-hr', name: 'HR Department', isCustom: false, headName: 'Priya Sharma (HR Specialist)', headEmail: 'priya@company.com', createdAt: '2026-05-20T08:00:00Z' },
    { id: 'dept-accounts', name: 'Accounts Department', isCustom: false, headName: 'Amit Patel (Accounts Analyst)', headEmail: 'amit@company.com', createdAt: '2026-05-20T08:00:00Z' },
    { id: 'dept-admin', name: 'Admin Department', isCustom: false, headName: 'Vikram Malhotra (DevOps Lead)', headEmail: 'vikram@company.com', createdAt: '2026-05-20T08:00:00Z' },
    { id: 'dept-sales', name: 'Sales Department', isCustom: false, headName: 'Anjali Gupta (Sales VP)', headEmail: 'anjali@company.com', createdAt: '2026-05-20T08:00:00Z' },
    { id: 'dept-support', name: 'Support Department', isCustom: false, headName: 'Sneha Reddy (Support Lead)', headEmail: 'sneha@company.com', createdAt: '2026-05-20T08:00:00Z' }
  ];

  // Common core complaint categories
  const INITIAL_CATEGORIES: IComplaintCategory[] = [
    makeCategory('cat-it-1', 'dept-it', 'Data not coming properly', 2, 'hours', 'Medium'),
    makeCategory('cat-it-2', 'dept-it', 'Hardware Issue', 1, 'days', 'High'),
    makeCategory('cat-it-3', 'dept-it', 'Software Installation', 4, 'hours', 'Low'),
    makeCategory('cat-it-4', 'dept-it', 'Network Access Request', 12, 'hours', 'Medium'),
    makeCategory('cat-it-5', 'dept-it', 'Email Configuration Issue', 6, 'hours', 'Medium'),
    makeCategory('cat-it-6', 'dept-it', 'ERP / Application Login Issue', 2, 'hours', 'High'),

    makeCategory('cat-hr-1', 'dept-hr', 'Payroll Inquiry', 3, 'days', 'High'),
    makeCategory('cat-hr-2', 'dept-hr', 'Onboarding Assistance', 2, 'days', 'Medium'),
    makeCategory('cat-hr-3', 'dept-hr', 'Leave Correction Request', 1, 'days', 'Medium'),
    makeCategory('cat-hr-4', 'dept-hr', 'Attendance Regularization', 8, 'hours', 'Medium'),
    makeCategory('cat-hr-5', 'dept-hr', 'Offer Letter / HR Letter Request', 2, 'days', 'Low'),

    makeCategory('cat-acc-1', 'dept-accounts', 'Invoice Query', 2, 'days', 'Low'),
    makeCategory('cat-acc-2', 'dept-accounts', 'Expense Reimbursement', 4, 'days', 'Medium'),
    makeCategory('cat-acc-3', 'dept-accounts', 'Vendor Payment Delay', 5, 'days', 'High'),
    makeCategory('cat-acc-4', 'dept-accounts', 'GST / Tax Clarification', 3, 'days', 'Medium'),
    makeCategory('cat-acc-5', 'dept-accounts', 'Salary Advance / Deduction Query', 2, 'days', 'High'),

    makeCategory('cat-adm-1', 'dept-admin', 'Office Supplies Request', 1, 'days', 'Low'),
    makeCategory('cat-adm-2', 'dept-admin', 'Facility Maintenance', 8, 'hours', 'High'),
    makeCategory('cat-adm-3', 'dept-admin', 'ID Card Replacement', 2, 'days', 'Medium'),
    makeCategory('cat-adm-4', 'dept-admin', 'Guest / Meeting Room Support', 4, 'hours', 'Medium'),

    makeCategory('cat-sal-1', 'dept-sales', 'CRM Access Issue', 3, 'hours', 'Medium'),
    makeCategory('cat-sal-2', 'dept-sales', 'Lead Assignment Error', 1, 'hours', 'High'),
    makeCategory('cat-sal-3', 'dept-sales', 'Sales Report Mismatch', 6, 'hours', 'Medium'),
    makeCategory('cat-sal-4', 'dept-sales', 'Distributor Price Approval', 1, 'days', 'High'),

    makeCategory('cat-sup-1', 'dept-support', 'Customer Escalation', 30, 'minutes', 'Critical'),
    makeCategory('cat-sup-2', 'dept-support', 'Bug Report Routing', 4, 'hours', 'High'),
    makeCategory('cat-sup-3', 'dept-support', 'Complaint Reopen Request', 2, 'hours', 'High'),
    makeCategory('cat-sup-4', 'dept-support', 'Warranty / Service Follow-Up', 1, 'days', 'Medium'),

    makeCategory('cat-mgt-1', 'dept-management', 'MIS Dashboard Review', 1, 'days', 'Medium'),
    makeCategory('cat-mgt-2', 'dept-management', 'Approval Pending', 4, 'hours', 'High'),
    makeCategory('cat-mgt-3', 'dept-management', 'Policy Escalation', 2, 'days', 'High'),

    makeCategory('cat-con-1', 'dept-construction', 'Material Requirement', 1, 'days', 'High'),
    makeCategory('cat-con-2', 'dept-construction', 'Site Breakdown / Utility Issue', 4, 'hours', 'Critical'),
    makeCategory('cat-con-3', 'dept-construction', 'Contractor Billing Issue', 3, 'days', 'Medium'),

    makeCategory('cat-pro-1', 'dept-production', 'Machine Breakdown', 2, 'hours', 'Critical'),
    makeCategory('cat-pro-2', 'dept-production', 'Production Line Delay', 4, 'hours', 'High'),
    makeCategory('cat-pro-3', 'dept-production', 'Quality Hold Clearance', 8, 'hours', 'High'),

    makeCategory('cat-farm-1', 'dept-farm-operations', 'Irrigation Issue', 4, 'hours', 'Critical'),
    makeCategory('cat-farm-2', 'dept-farm-operations', 'Field Staff Allocation', 1, 'days', 'Medium'),
    makeCategory('cat-farm-3', 'dept-farm-operations', 'Input Stock Shortage', 6, 'hours', 'High'),

    makeCategory('cat-fin-1', 'dept-finance-and-audit', 'Audit Document Request', 2, 'days', 'Medium'),
    makeCategory('cat-fin-2', 'dept-finance-and-audit', 'Budget Approval Delay', 3, 'days', 'High'),
    makeCategory('cat-fin-3', 'dept-finance-and-audit', 'Ledger Mismatch', 1, 'days', 'High'),

    makeCategory('cat-mar-1', 'dept-marketing', 'Campaign Asset Request', 1, 'days', 'Medium'),
    makeCategory('cat-mar-2', 'dept-marketing', 'Lead Data Requirement', 4, 'hours', 'High'),
    makeCategory('cat-mar-3', 'dept-marketing', 'Vendor Creative Delay', 2, 'days', 'Medium'),

    makeCategory('cat-log-1', 'dept-logistics', 'Dispatch Delay', 2, 'hours', 'Critical'),
    makeCategory('cat-log-2', 'dept-logistics', 'Vehicle Allocation', 6, 'hours', 'High'),
    makeCategory('cat-log-3', 'dept-logistics', 'POD / Delivery Confirmation', 1, 'days', 'Medium'),

    makeCategory('cat-dm-1', 'dept-digital-marketing', 'Ad Account Access Issue', 2, 'hours', 'High'),
    makeCategory('cat-dm-2', 'dept-digital-marketing', 'Website Lead Tracking Issue', 4, 'hours', 'High'),
    makeCategory('cat-dm-3', 'dept-digital-marketing', 'Campaign Budget Approval', 1, 'days', 'Medium'),

    makeCategory('cat-store-1', 'dept-store-sales', 'POS Billing Issue', 30, 'minutes', 'Critical'),
    makeCategory('cat-store-2', 'dept-store-sales', 'Stock Transfer Request', 8, 'hours', 'High'),
    makeCategory('cat-store-3', 'dept-store-sales', 'Customer Return Approval', 4, 'hours', 'Medium'),

    makeCategory('cat-ops-1', 'dept-operation', 'Manpower Allocation', 8, 'hours', 'Medium'),
    makeCategory('cat-ops-2', 'dept-operation', 'Process Deviation', 2, 'hours', 'High'),
    makeCategory('cat-ops-3', 'dept-operation', 'Daily Operations Blocker', 1, 'hours', 'Critical')
  ];

  const { importedDepartments, importedUsers } = buildImportedSeeds('2026-05-20T08:00:00Z');

  // Helper relative dates
  const LEGACY_DEMO_TICKET_IDS = ['TKT-2491', 'TKT-1082'];

  // Only the administrator is seeded as a login account. Imported employees are
  // retained for department metadata but are not automatic/sample user accounts.
  const salt = await bcrypt.genSalt(10);
  const aaradhyaAdminHash = await bcrypt.hash('Aaradhya@123', salt);
  const importedEmployeeEmails = importedUsers.map(user => user.email.toLowerCase().trim());

  const INITIAL_USERS: IUser[] = [
    { email: 'aaradhya.admin@company.com', name: 'Aaradhya Group Admin', passwordHash: aaradhyaAdminHash, role: 'Admin', departmentId: 'dept-admin', employeeId: 'AARADHYA-ADMIN', designation: 'Super Admin', departmentName: 'Admin Department', company: 'Aaradhya Group' }
  ];

  const MERGED_DEPARTMENTS: IDepartment[] = [...INITIAL_DEPARTMENTS];
  for (const importedDepartment of importedDepartments) {
    const existingIndex = MERGED_DEPARTMENTS.findIndex(dept => dept.id === importedDepartment.id);
    if (existingIndex === -1) {
      MERGED_DEPARTMENTS.push(importedDepartment);
    } else {
      MERGED_DEPARTMENTS[existingIndex] = {
        ...MERGED_DEPARTMENTS[existingIndex],
        headName: importedDepartment.headName || MERGED_DEPARTMENTS[existingIndex].headName,
        headEmail: importedDepartment.headEmail || MERGED_DEPARTMENTS[existingIndex].headEmail
      };
    }
  }

  const mergeSeedUsers = (existingUsers: IUser[]): IUser[] => {
    const usersByEmail = new Map(
      existingUsers.map(user => [user.email.toLowerCase().trim(), user])
    );

    for (const seedUser of INITIAL_USERS) {
      const emailKey = seedUser.email.toLowerCase().trim();
      const existingUser = usersByEmail.get(emailKey);

      if (!existingUser) {
        usersByEmail.set(emailKey, seedUser);
        continue;
      }

      usersByEmail.set(emailKey, {
        ...existingUser,
        name: seedUser.name || existingUser.name,
        departmentId: seedUser.departmentId || existingUser.departmentId,
        role: seedUser.role,
        employeeId: seedUser.employeeId || existingUser.employeeId,
        firstName: seedUser.firstName || existingUser.firstName,
        lastName: seedUser.lastName || existingUser.lastName,
        company: seedUser.company || existingUser.company,
        departmentName: seedUser.departmentName || existingUser.departmentName,
        designation: seedUser.designation || existingUser.designation,
        reportingManager: seedUser.reportingManager || existingUser.reportingManager,
        reportingManagerEmail: seedUser.reportingManagerEmail || existingUser.reportingManagerEmail
      });
    }

    return Array.from(usersByEmail.values());
  };

  if (isMongoConnected) {
    try {
      // Automatic migration: merge any local disk cache data into MongoDB on startup
      loadFromDisk();
      
      const existingUsers = await UserModel.find({}).lean();
      if (existingUsers.length === 0) {
        await UserModel.insertMany(INITIAL_USERS);
        console.log('Seeded MongoDB administrator account.');
      } else {
        for (const seedUser of INITIAL_USERS) {
          await UserModel.updateOne(
            { email: seedUser.email.toLowerCase().trim() },
            {
              $set: {
                name: seedUser.name,
                passwordHash: seedUser.passwordHash,
                departmentId: seedUser.departmentId,
                role: seedUser.role,
                employeeId: seedUser.employeeId,
                firstName: seedUser.firstName,
                lastName: seedUser.lastName,
                company: seedUser.company,
                departmentName: seedUser.departmentName,
                designation: seedUser.designation,
                reportingManager: seedUser.reportingManager,
                reportingManagerEmail: seedUser.reportingManagerEmail
              },
              $setOnInsert: {
                email: seedUser.email.toLowerCase().trim()
              }
            },
            { upsert: true }
          );
        }
      }

      const deptCount = await DeptModel.countDocuments();
      if (deptCount === 0) {
        await DeptModel.insertMany(MERGED_DEPARTMENTS);
        console.log('Seeded MongoDB default departments.');
      } else {
        // Migration: ensure department heads are populated
        for (const d of MERGED_DEPARTMENTS) {
          await DeptModel.updateOne(
            { id: d.id },
            {
              $setOnInsert: { id: d.id },
              $set: { name: d.name, isCustom: d.isCustom, headName: d.headName, headEmail: d.headEmail, createdAt: d.createdAt }
            },
            { upsert: true }
          );
        }
      }
      const catCount = await CatModel.countDocuments();
      if (catCount === 0) {
        await CatModel.insertMany(INITIAL_CATEGORIES);
        console.log('Seeded MongoDB default complaint categories.');
      } else {
        // Migration: ensure default categories exist and stay synced with practical SLA rules.
        for (const c of INITIAL_CATEGORIES) {
          await CatModel.updateOne(
            { id: c.id },
            {
              $setOnInsert: { id: c.id },
              $set: {
                departmentId: c.departmentId,
                name: c.name,
                defaultSlaValue: c.defaultSlaValue,
                defaultSlaUnit: c.defaultSlaUnit,
                defaultPriority: c.defaultPriority,
                createdAt: c.createdAt
              }
            },
            { upsert: true }
          );
        }
      }

      // Live migration routine of any custom departments/categories/tickets/emails from local disk
      let uCount = 0;
      for (const diskUser of diskDb.users) {
        const ext = await UserModel.findOne({ email: diskUser.email.toLowerCase().trim() });
        if (!ext) {
          await UserModel.create(diskUser);
          uCount++;
        }
      }

      let dCount = 0;
      for (const diskDept of diskDb.departments) {
        const ext = await DeptModel.findOne({ id: diskDept.id });
        if (!ext) {
          await DeptModel.create(diskDept);
          dCount++;
        }
      }

      let cCount = 0;
      for (const diskCat of diskDb.categories) {
        const ext = await CatModel.findOne({ id: diskCat.id });
        if (!ext) {
          await CatModel.create(diskCat);
          cCount++;
        }
      }

      let tCount = 0;
      for (const diskTkt of diskDb.tickets) {
        const ext = await TicketModel.findOne({ id: diskTkt.id });
        if (!ext) {
          await TicketModel.create(diskTkt);
          tCount++;
        }
      }

      let eCount = 0;
      if (diskDb.emails) {
        for (const diskEmail of diskDb.emails) {
          const ext = await EmailModel.findOne({ id: diskEmail.id });
          if (!ext) {
            await EmailModel.create(diskEmail);
            eCount++;
          }
        }
      }

      if (uCount > 0 || dCount > 0 || cCount > 0 || tCount > 0 || eCount > 0) {
        console.log(`Auto-Migrated local data to MongoDB: ${uCount} users, ${dCount} depts, ${cCount} cats, ${tCount} tkts, ${eCount} emails.`);
      }

      if (importedEmployeeEmails.length > 0) {
        await UserModel.updateMany(
          { email: { $in: importedEmployeeEmails }, role: { $ne: 'Admin' }, isManuallyManaged: { $ne: true } },
          { $set: { isDeleted: true } }
        );
      }

      await TicketModel.deleteMany({ id: { $in: LEGACY_DEMO_TICKET_IDS } });
      await EmailModel.deleteMany({ ticketId: { $in: LEGACY_DEMO_TICKET_IDS } });

    } catch (e) {
      console.error('Mongo Seeding and migration error:', e);
    }
  } else {
    // Disk DB Mock Seeding
    diskDb.users = mergeSeedUsers(diskDb.users);
    const importedEmailSet = new Set(importedEmployeeEmails);
    diskDb.users = diskDb.users.map(user =>
      user.role !== 'Admin' && !user.isManuallyManaged && importedEmailSet.has(user.email.toLowerCase().trim())
        ? { ...user, isDeleted: true }
        : user
    );
    if (diskDb.departments.length === 0) {
      diskDb.departments = MERGED_DEPARTMENTS;
    } else {
      // Ensure existing default departments are migrated to have heads
      for (const d of MERGED_DEPARTMENTS) {
        const idx = diskDb.departments.findIndex(dept => dept.id === d.id);
        if (idx !== -1) {
          if (!diskDb.departments[idx].headEmail) {
            diskDb.departments[idx].headName = d.headName;
            diskDb.departments[idx].headEmail = d.headEmail;
          }
          diskDb.departments[idx].name = d.name;
          diskDb.departments[idx].isCustom = d.isCustom;
        } else {
          diskDb.departments.push(d);
        }
      }
    }
    if (diskDb.categories.length === 0) {
      diskDb.categories = INITIAL_CATEGORIES;
    } else {
      // Ensure default categories exist and are aligned with current SLA defaults.
      for (const c of INITIAL_CATEGORIES) {
        const idx = diskDb.categories.findIndex(cat => cat.id === c.id);
        if (idx !== -1) {
          diskDb.categories[idx] = {
            ...diskDb.categories[idx],
            departmentId: c.departmentId,
            name: c.name,
            defaultSlaValue: c.defaultSlaValue,
            defaultSlaUnit: c.defaultSlaUnit,
            defaultPriority: c.defaultPriority,
            createdAt: diskDb.categories[idx].createdAt || c.createdAt
          };
        } else {
          diskDb.categories.push(c);
        }
      }
    }
    diskDb.tickets = diskDb.tickets.filter(ticket => !LEGACY_DEMO_TICKET_IDS.includes(ticket.id));
    diskDb.emails = diskDb.emails.filter(email => !LEGACY_DEMO_TICKET_IDS.includes(email.ticketId));
    saveToDisk();
    console.log('Seeded JSON-Disk database defaults.');
  }
}

// Initialize Database Connection
export async function initializeDb() {
  loadFromDisk();

  if (useMongo) {
    console.log('Attempting MongoDB connection...');
    try {
      mongoose.set('strictQuery', false);
      await mongoose.connect(process.env.MONGODB_URI!, {
        serverSelectionTimeoutMS: 4000
      });
      isMongoConnected = true;
      console.log('MongoDB Mongoose initialized successfully!');
    } catch (error) {
      console.error('MongoDB Connection Failed. Falling back to static JSON store gracefully', error);
      isMongoConnected = false;
    }
  } else {
    console.log('No MONGODB_URI found. Utilizing resilient JSON Disk-Adapter fallback.');
    isMongoConnected = false;
  }

  // Seed default items
  await seedDefaults();
}

// General DB Actions Adapter
export const dbActions = {
  isUsingMongo: () => isMongoConnected,

  // --- USERS SECTION ---
  findUserByEmail: async (email: string): Promise<IUser | null> => {
    if (isMongoConnected) {
      const u = await UserModel.findOne({
        email: email.toLowerCase().trim(),
        isDeleted: { $ne: true }
      });
      return u ? u.toObject() : null;
    }
    const emailKey = email.toLowerCase().trim();
    return diskDb.users.find(u => u.email.toLowerCase().trim() === emailKey && !u.isDeleted) || null;
  },

  createUser: async (user: IUser): Promise<IUser> => {
    user.email = user.email.toLowerCase().trim();
    if (isMongoConnected) {
      return await UserModel.findOneAndUpdate(
        { email: user.email },
        { $set: { ...user, isDeleted: false, isManuallyManaged: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
    }
    const existingIndex = diskDb.users.findIndex(
      existingUser => existingUser.email.toLowerCase().trim() === user.email
    );
    if (existingIndex === -1) {
      diskDb.users.push({ ...user, isDeleted: false, isManuallyManaged: true });
    } else {
      diskDb.users[existingIndex] = { ...user, isDeleted: false, isManuallyManaged: true };
    }
    saveToDisk();
    return user;
  },

  getUsers: async (): Promise<IUser[]> => {
    if (isMongoConnected) {
      return await UserModel.find({ isDeleted: { $ne: true } }).lean();
    }
    return diskDb.users.filter(user => !user.isDeleted);
  },

  getEmployeeOptions: async (): Promise<{
    companies: string[];
    designationsByDepartmentId: Record<string, string[]>;
  }> => {
    const storedUsers: IUser[] = isMongoConnected
      ? await UserModel.find({ role: { $ne: 'Admin' } }).lean()
      : diskDb.users.filter(user => user.role !== 'Admin');
    const importedRows = loadEmployeeImportRows();
    const companies = new Set<string>(['Aaradhya Group']);
    const designationSets = new Map<string, Set<string>>();

    const addOption = (departmentId: string, designation?: string, company?: string) => {
      const cleanCompany = String(company || '').trim();
      const cleanDesignation = String(designation || '').trim();
      if (cleanCompany) companies.add(cleanCompany);
      if (!departmentId || !cleanDesignation) return;
      if (!designationSets.has(departmentId)) designationSets.set(departmentId, new Set());
      designationSets.get(departmentId)!.add(cleanDesignation);
    };

    storedUsers.forEach(user => addOption(user.departmentId || '', user.designation, user.company));
    importedRows.forEach(row => {
      const department = resolveDepartmentSeed(row.department);
      addOption(department.id, row.designation, row.company);
    });

    return {
      companies: Array.from(companies).sort((a, b) => a.localeCompare(b)),
      designationsByDepartmentId: Object.fromEntries(
        Array.from(designationSets.entries()).map(([departmentId, values]) => [
          departmentId,
          Array.from(values).sort((a, b) => a.localeCompare(b))
        ])
      )
    };
  },

  updateUserPassword: async (email: string, passwordHash: string): Promise<IUser | null> => {
    const emailKey = email.toLowerCase().trim();
    if (isMongoConnected) {
      const updated = await UserModel.findOneAndUpdate(
        { email: emailKey },
        { $set: { passwordHash } },
        { new: true }
      ).lean();
      return updated;
    }

    const userIndex = diskDb.users.findIndex((user) => user.email.toLowerCase().trim() === emailKey);
    if (userIndex === -1) return null;

    diskDb.users[userIndex] = {
      ...diskDb.users[userIndex],
      passwordHash
    };
    saveToDisk();
    return diskDb.users[userIndex];
  },

  deleteUser: async (email: string): Promise<boolean> => {
    const emailKey = email.toLowerCase().trim();
    if (isMongoConnected) {
      const result = await UserModel.updateOne(
        { email: emailKey, isDeleted: { $ne: true } },
        { $set: { isDeleted: true } }
      );
      return result.modifiedCount > 0;
    }

    const userIndex = diskDb.users.findIndex(
      user => user.email.toLowerCase().trim() === emailKey && !user.isDeleted
    );
    if (userIndex === -1) return false;
    diskDb.users[userIndex] = { ...diskDb.users[userIndex], isDeleted: true };
    saveToDisk();
    return true;
  },

  // --- DEPARTMENTS SECTION ---
  getDepartments: async (): Promise<IDepartment[]> => {
    if (isMongoConnected) {
      return await DeptModel.find({}).lean();
    }
    return diskDb.departments;
  },

  createDepartment: async (dept: IDepartment): Promise<IDepartment> => {
    if (isMongoConnected) {
      const created = await DeptModel.create(dept);
      return created.toObject();
    }
    diskDb.departments.push(dept);
    saveToDisk();
    return dept;
  },

  deleteDepartment: async (id: string): Promise<boolean> => {
    if (isMongoConnected) {
      await DeptModel.deleteOne({ id });
      await CatModel.deleteMany({ departmentId: id });
      return true;
    }
    diskDb.departments = diskDb.departments.filter(d => d.id !== id);
    diskDb.categories = diskDb.categories.filter(c => c.departmentId !== id);
    saveToDisk();
    return true;
  },

  // --- CATEGORIES SECTION ---
  getCategories: async (): Promise<IComplaintCategory[]> => {
    if (isMongoConnected) {
      return await CatModel.find({}).lean();
    }
    return diskDb.categories;
  },

  createCategory: async (cat: IComplaintCategory): Promise<IComplaintCategory> => {
    if (isMongoConnected) {
      const created = await CatModel.create(cat);
      return created.toObject();
    }
    diskDb.categories.push(cat);
    saveToDisk();
    return cat;
  },

  deleteCategory: async (id: string): Promise<boolean> => {
    if (isMongoConnected) {
      await CatModel.deleteOne({ id });
      return true;
    }
    diskDb.categories = diskDb.categories.filter(c => c.id !== id);
    saveToDisk();
    return true;
  },

  // --- TICKETS SECTION ---
  getTickets: async (): Promise<ITicket[]> => {
    if (isMongoConnected) {
      return await TicketModel.find({}).sort({ createdAt: -1 }).lean();
    }
    // Return sorted newest first
    return [...diskDb.tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createTicket: async (ticket: ITicket): Promise<ITicket> => {
    if (isMongoConnected) {
      const created = await TicketModel.create(ticket);
      return created.toObject();
    }
    diskDb.tickets.unshift(ticket);
    saveToDisk();
    return ticket;
  },

  updateTicket: async (ticketId: string, updates: Partial<ITicket>): Promise<ITicket | null> => {
    if (isMongoConnected) {
      const updated = await TicketModel.findOneAndUpdate({ id: ticketId }, { $set: updates }, { new: true }).lean();
      return updated;
    }
    const idx = diskDb.tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) return null;
    diskDb.tickets[idx] = { ...diskDb.tickets[idx], ...updates };
    saveToDisk();
    return diskDb.tickets[idx];
  },

  resetTickets: async (): Promise<{ deletedTickets: number; deletedEmails: number }> => {
    if (isMongoConnected) {
      const [ticketResult, emailResult] = await Promise.all([
        TicketModel.deleteMany({}),
        EmailModel.deleteMany({})
      ]);

      return {
        deletedTickets: ticketResult.deletedCount || 0,
        deletedEmails: emailResult.deletedCount || 0
      };
    }

    const deletedTickets = diskDb.tickets.length;
    const deletedEmails = diskDb.emails.length;
    diskDb.tickets = [];
    diskDb.emails = [];
    saveToDisk();
    return { deletedTickets, deletedEmails };
  },

  // --- EMAILS SECTION ---
  getEmails: async (): Promise<ISentEmail[]> => {
    if (isMongoConnected) {
      return await EmailModel.find({}).sort({ sentAt: -1 }).lean();
    }
    return [...diskDb.emails].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  },

  createEmail: async (email: ISentEmail): Promise<ISentEmail> => {
    if (isMongoConnected) {
      const created = await EmailModel.create(email);
      return created.toObject();
    }
    diskDb.emails.unshift(email);
    saveToDisk();
    return email;
  },

  findTicketById: async (ticketId: string): Promise<ITicket | null> => {
    if (isMongoConnected) return await TicketModel.findOne({ id: ticketId }).lean();
    return diskDb.tickets.find(ticket => ticket.id === ticketId) || null;
  },

  listApiClients: async (): Promise<IApiClient[]> => {
    if (isMongoConnected) return await ApiClientModel.find({}).select('+keyHash').sort({ createdAt: -1 }).lean();
    return [...(diskDb.apiClients || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  findApiClientByPrefix: async (keyPrefix: string): Promise<IApiClient | null> => {
    if (isMongoConnected) return await ApiClientModel.findOne({ keyPrefix }).select('+keyHash').lean();
    return (diskDb.apiClients || []).find(client => client.keyPrefix === keyPrefix) || null;
  },
  createApiClient: async (client: IApiClient): Promise<IApiClient> => {
    if (isMongoConnected) return (await ApiClientModel.create(client)).toObject();
    diskDb.apiClients = diskDb.apiClients || [];
    diskDb.apiClients.push(client);
    saveToDisk();
    return client;
  },
  updateApiClient: async (id: string, updates: Partial<IApiClient>): Promise<IApiClient | null> => {
    if (isMongoConnected) return await ApiClientModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).select('+keyHash').lean();
    diskDb.apiClients = diskDb.apiClients || [];
    const index = diskDb.apiClients.findIndex(client => client.id === id);
    if (index === -1) return null;
    diskDb.apiClients[index] = { ...diskDb.apiClients[index], ...updates };
    saveToDisk();
    return diskDb.apiClients[index];
  },
  findIdempotency: async (clientId: string, key: string): Promise<IIdempotencyRecord | null> => {
    if (isMongoConnected) return await IdempotencyModel.findOne({ integrationClientId: clientId, idempotencyKey: key }).lean();
    return (diskDb.idempotencyRecords || []).find(record => record.integrationClientId === clientId && record.idempotencyKey === key) || null;
  },
  createIdempotency: async (record: IIdempotencyRecord): Promise<IIdempotencyRecord> => {
    if (isMongoConnected) return (await IdempotencyModel.create(record)).toObject();
    diskDb.idempotencyRecords = diskDb.idempotencyRecords || [];
    if (diskDb.idempotencyRecords.some(item => item.integrationClientId === record.integrationClientId && item.idempotencyKey === record.idempotencyKey)) {
      throw new Error('IDEMPOTENCY_CONFLICT');
    }
    diskDb.idempotencyRecords.push(record);
    saveToDisk();
    return record;
  },
  createApiAuditEvent: async (event: IApiAuditEvent): Promise<IApiAuditEvent> => {
    if (isMongoConnected) return (await ApiAuditModel.create(event)).toObject();
    diskDb.apiAuditEvents = diskDb.apiAuditEvents || [];
    diskDb.apiAuditEvents.push(event);
    saveToDisk();
    return event;
  },

  // --- ESCALATION RULES SECTION ---
  getEscalationRules: async (): Promise<IEscalationRule[]> => {
    if (isMongoConnected) {
      const existingRules = await EscalationRuleModel.find({}).lean();
      const departments = await dbActions.getDepartments();
      const users = await dbActions.getUsers();
      const inferredRules = inferEscalationRules(users, departments);

      for (const inferredRule of inferredRules) {
        const existingRule = existingRules.find((rule) => rule.departmentId === inferredRule.departmentId);
        if (!existingRule) {
          await EscalationRuleModel.updateOne(
            { departmentId: inferredRule.departmentId },
            {
              $set: {
                departmentName: inferredRule.departmentName,
                designationLevels: inferredRule.designationLevels,
                updatedAt: inferredRule.updatedAt
              },
              $setOnInsert: {
                id: inferredRule.id,
                createdAt: inferredRule.createdAt
              }
            },
            { upsert: true }
          );
        }
      }

      return await EscalationRuleModel.find({}).sort({ departmentName: 1 }).lean();
    }
    const existingRules = loadEscalationRulesFromDisk();
    const inferredRules = inferEscalationRules(diskDb.users, diskDb.departments);
    const mergedRules = [...existingRules];
    let rulesChanged = false;

    for (const inferredRule of inferredRules) {
      if (!mergedRules.some((rule) => rule.departmentId === inferredRule.departmentId)) {
        mergedRules.push(inferredRule);
        rulesChanged = true;
      }
    }

    if (rulesChanged) {
      saveEscalationRulesToDisk(mergedRules);
    }
    return mergedRules.sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  },

  upsertEscalationRule: async (rule: IEscalationRule): Promise<IEscalationRule> => {
    if (isMongoConnected) {
      const { id, createdAt, ...updatableFields } = rule;
      await EscalationRuleModel.updateOne(
        { departmentId: rule.departmentId },
        { $set: updatableFields, $setOnInsert: { id, createdAt } },
        { upsert: true }
      );
      const saved = await EscalationRuleModel.findOne({ departmentId: rule.departmentId }).lean();
      return saved;
    }

    const rules = loadEscalationRulesFromDisk();
    const index = rules.findIndex((item) => item.departmentId === rule.departmentId);
    if (index === -1) {
      rules.push(rule);
    } else {
      rules[index] = {
        ...rules[index],
        ...rule
      };
    }
    saveEscalationRulesToDisk(rules);
    return rules.find((item) => item.departmentId === rule.departmentId)!;
  },

  // Manual Triggered Full Migration/Transfer method from JSON Disk fallback to MongoDB
  migrateDiskToMongo: async (): Promise<{ success: boolean; migratedCount: any; error?: string }> => {
    if (!isMongoConnected) {
      return { success: false, migratedCount: {}, error: 'MongoDB is not currently connected. Please configure MONGODB_URI first!' };
    }
    try {
      loadFromDisk();
      let usersMigrated = 0;
      let deptsMigrated = 0;
      let catsMigrated = 0;
      let ticketsMigrated = 0;
      let emailsMigrated = 0;

      // 1. Users
      for (const u of diskDb.users) {
        const exists = await UserModel.findOne({ email: u.email.toLowerCase().trim() });
        if (!exists) {
          await UserModel.create(u);
          usersMigrated++;
        }
      }

      // 2. Departments
      for (const d of diskDb.departments) {
        const exists = await DeptModel.findOne({ id: d.id });
        if (!exists) {
          await DeptModel.create(d);
          deptsMigrated++;
        }
      }

      // 3. Categories
      for (const c of diskDb.categories) {
        const exists = await CatModel.findOne({ id: c.id });
        if (!exists) {
          await CatModel.create(c);
          catsMigrated++;
        }
      }

      // 4. Tickets
      for (const t of diskDb.tickets) {
        const exists = await TicketModel.findOne({ id: t.id });
        if (!exists) {
          await TicketModel.create(t);
          ticketsMigrated++;
        }
      }

      // 5. Emails
      if (diskDb.emails) {
        for (const e of diskDb.emails) {
          const exists = await EmailModel.findOne({ id: e.id });
          if (!exists) {
            await EmailModel.create(e);
            emailsMigrated++;
          }
        }
      }

      return {
        success: true,
        migratedCount: {
          users: usersMigrated,
          departments: deptsMigrated,
          categories: catsMigrated,
          tickets: ticketsMigrated,
          emails: emailsMigrated
        }
      };
    } catch (err: any) {
      console.error('Migration execution error:', err);
      return { success: false, migratedCount: {}, error: err.message };
    }
  }
};
