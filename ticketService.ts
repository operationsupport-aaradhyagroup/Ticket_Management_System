import { IComplaintCategory, IDepartment, ITicket, IUser } from './serverDB';

export type TicketSource = 'ADMIN' | 'PORTAL' | 'API' | 'PUBLIC_FORM' | 'EMAIL' | 'INTEGRATION' | 'ZOHO_DESK';

export interface CreateTicketInput {
  subject: string;
  description: string;
  requester: { name?: string; email?: string; phone?: string; userId?: string };
  source: TicketSource;
  priority?: string;
  departmentId?: string;
  categoryId?: string;
  assignedTo?: string;
  dueDate?: string;
  customFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  integrationClientId?: string;
  integration?: ITicket['integration'];
}

export class TicketValidationError extends Error {
  constructor(message: string, public details: string[] = []) {
    super(message);
  }
}

export interface TicketServiceDependencies {
  getDepartments(): Promise<IDepartment[]>;
  getCategories(): Promise<IComplaintCategory[]>;
  getUsers(): Promise<IUser[]>;
  generateTicketNumber(): Promise<string>;
  persistTicket(ticket: ITicket): Promise<ITicket>;
  onCreated?(ticket: ITicket): Promise<void>;
}

const cleanText = (value: unknown, max: number) => String(value || '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const allowedPriorities: Record<string, ITicket['priority']> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical'
};

function safeRecord(value: unknown, maxBytes: number) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TicketValidationError('Validation failed.', ['customFields and metadata must be objects.']);
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new TicketValidationError('Validation failed.', ['Metadata payload is too large.']);
  }
  const parsed = JSON.parse(serialized);
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new TicketValidationError('Validation failed.', ['Metadata contains an unsafe key.']);
    }
  }
  return parsed as Record<string, unknown>;
}

export async function createTicket(input: CreateTicketInput, deps: TicketServiceDependencies) {
  const subject = cleanText(input.subject, 200);
  const description = cleanText(input.description, 10_000);
  const requesterName = cleanText(input.requester?.name, 120);
  const requesterEmail = cleanText(input.requester?.email, 254).toLowerCase();
  const requesterPhone = cleanText(input.requester?.phone, 30);
  const errors: string[] = [];
  if (subject.length < 3) errors.push('subject must contain at least 3 characters.');
  if (description.length < 3) errors.push('description must contain at least 3 characters.');
  if (input.source !== 'ZOHO_DESK' && (!requesterEmail || !isEmail(requesterEmail))) errors.push('requester.email must be a valid email address.');
  if (input.source !== 'ZOHO_DESK' && !requesterName) errors.push('requester.name is required.');
  const normalizedPriority = allowedPriorities[String(input.priority || 'medium').toLowerCase()];
  if (!normalizedPriority) errors.push('priority must be low, medium, high, or critical.');
  if (errors.length) throw new TicketValidationError('Validation failed.', errors);

  const [departments, categories, users] = await Promise.all([
    deps.getDepartments(), deps.getCategories(), deps.getUsers()
  ]);
  const department = input.departmentId
    ? departments.find(item => item.id === input.departmentId)
    : departments[0];
  if (!department) throw new TicketValidationError('Validation failed.', ['departmentId is invalid or no department is configured.']);

  const category = input.categoryId
    ? categories.find(item => item.id === input.categoryId && item.departmentId === department.id)
    : categories.find(item => item.departmentId === department.id);
  if (input.categoryId && !category) throw new TicketValidationError('Validation failed.', ['categoryId is invalid for the selected department.']);

  const assignedUser = input.assignedTo
    ? users.find(user => user.email.toLowerCase() === input.assignedTo!.toLowerCase())
    : undefined;
  if (input.assignedTo && !assignedUser) throw new TicketValidationError('Validation failed.', ['assignedTo is not an active employee.']);

  const createdAt = new Date();
  const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(createdAt);
  if (input.dueDate && Number.isNaN(dueDate.getTime())) throw new TicketValidationError('Validation failed.', ['dueDate is invalid.']);
  if (!input.dueDate) {
    const value = category?.defaultSlaValue || 2;
    const unit = category?.defaultSlaUnit || 'days';
    if (unit === 'minutes') dueDate.setMinutes(dueDate.getMinutes() + value);
    if (unit === 'hours') dueDate.setHours(dueDate.getHours() + value);
    if (unit === 'days') dueDate.setDate(dueDate.getDate() + value);
  }
  if (dueDate <= createdAt) throw new TicketValidationError('Validation failed.', ['dueDate must be in the future.']);

  const diffMinutes = Math.max(1, Math.ceil((dueDate.getTime() - createdAt.getTime()) / 60000));
  const duration = diffMinutes >= 1440
    ? { value: Math.ceil(diffMinutes / 1440), unit: 'days' as const }
    : diffMinutes >= 60
      ? { value: Math.ceil(diffMinutes / 60), unit: 'hours' as const }
      : { value: diffMinutes, unit: 'minutes' as const };
  const ticketNumber = await deps.generateTicketNumber();
  const timestamp = createdAt.toISOString();

  const ticket: ITicket = {
    id: ticketNumber,
    title: subject,
    description,
    departmentId: department.id,
    departmentName: department.name,
    categoryId: category?.id || `manual-entry-${department.id}`,
    categoryName: category?.name || 'Manual Entry',
    status: 'Open',
    priority: normalizedPriority,
    creatorEmail: requesterEmail,
    creatorName: requesterName || 'Zoho Desk Requester',
    requesterPhone,
    assignedAgent: assignedUser?.name || 'Unassigned',
    assignedAgentEmail: assignedUser?.email || '',
    slaType: input.dueDate ? 'Custom' : 'Default',
    slaDurationValue: duration.value,
    slaDurationUnit: duration.unit,
    slaDueDate: dueDate.toISOString(),
    slaStatus: 'Within SLA',
    slaBreachedAt: null,
    createdAt: timestamp,
    resolvedAt: null,
    source: input.source,
    customFields: safeRecord(input.customFields, 16_384),
    metadata: safeRecord(input.metadata, 16_384),
    createdBy: cleanText(input.createdBy, 254),
    integrationClientId: cleanText(input.integrationClientId, 120),
    integration: input.integration,
    remarks: [],
    history: [{
      id: `hist-${Date.now()}`,
      timestamp,
      userEmail: requesterEmail,
      action: `Ticket created via ${input.source}`
    }]
  };
  const created = await deps.persistTicket(ticket);
  if (deps.onCreated) await deps.onCreated(created);
  return created;
}

export function toPublicTicket(ticket: ITicket) {
  return {
    id: ticket.id,
    ticketNumber: ticket.id,
    subject: ticket.title,
    description: ticket.description,
    requester: { name: ticket.creatorName, email: ticket.creatorEmail, phone: ticket.requesterPhone || undefined },
    status: ticket.status.toLowerCase().replace(/\s+/g, '_'),
    priority: ticket.priority.toLowerCase(),
    source: (ticket.source || 'PORTAL').toLowerCase(),
    departmentId: ticket.departmentId,
    assignedTo: ticket.assignedAgentEmail || null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt || ticket.createdAt
  };
}
