import { IDepartment, ITicket, IUser, IZohoDeskSettings } from './serverDB';
import { CreateTicketInput } from './ticketService';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
const asText = (value: unknown, max = 10_000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const firstText = (...values: unknown[]) => values.map((value) => asText(value)).find(Boolean) || '';

const asPayloadRecord = (value: unknown): UnknownRecord => {
  const serialized = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (typeof serialized === 'string' && serialized.length <= 256_000) {
    try { return asRecord(JSON.parse(serialized)); } catch {
      const parameters = new URLSearchParams(serialized);
      const entries = [...parameters.entries()];
      return entries.length ? Object.fromEntries(entries) : {};
    }
  }
  return asRecord(serialized);
};

const payloadCandidates = (body: unknown) => {
  const root = asPayloadRecord(body);
  const nested = [root.payload, root.data, root.body, root.ticket].map(asPayloadRecord);
  return [root, ...nested, ...nested.flatMap((value) => [asPayloadRecord(value.payload), asPayloadRecord(value.data), asPayloadRecord(value.ticket)])];
};

export function getZohoEventType(body: unknown) {
  const values = payloadCandidates(body);
  return firstText(...values.flatMap((payload) => [payload.eventType, payload.event, payload.type, payload.eventName])).replace(/[-\s]/g, '_').toUpperCase();
}

export function getZohoTicketPayload(body: unknown): UnknownRecord {
  for (const candidate of payloadCandidates(body)) {
    if (firstText(candidate.id, candidate.ticketId, candidate.subject, candidate.ticketNumber)) return candidate;
  }
  return {};
}

export const mapZohoStatus = (value: unknown): ITicket['status'] => {
  const status = asText(value, 100).toLowerCase();
  if (status === 'resolved') return 'Resolved';
  if (status === 'closed') return 'Closed';
  if (['in progress', 'in_progress', 'on hold', 'on_hold', 'escalated'].includes(status)) return 'In Progress';
  return 'Open';
};

export const mapZohoPriority = (value: unknown): ITicket['priority'] => {
  const priority = asText(value, 100).toLowerCase();
  if (priority === 'low') return 'Low';
  if (priority === 'high') return 'High';
  if (['critical', 'urgent'].includes(priority)) return 'Critical';
  return 'Medium';
};

export function mapZohoTicketToTmsInput(ticketPayload: UnknownRecord, settings: IZohoDeskSettings, departments: IDepartment[], users: IUser[]): CreateTicketInput {
  const contact = asRecord(ticketPayload.contact);
  const requester = asRecord(ticketPayload.requester);
  const owner = asRecord(ticketPayload.assignee || ticketPayload.owner);
  const externalDepartmentId = firstText(ticketPayload.departmentId, asRecord(ticketPayload.department).id, 120);
  const mappedDepartmentId = settings.departmentMappings.find((mapping) => mapping.zohoDepartmentId === externalDepartmentId)?.tmsDepartmentId;
  const departmentId = mappedDepartmentId || settings.defaultDepartmentId || departments[0]?.id;
  const ownerId = firstText(ticketPayload.assigneeId, ticketPayload.ownerId, owner.id, 120);
  const ownerEmail = firstText(ticketPayload.assigneeEmail, ticketPayload.ownerEmail, owner.email, 254).toLowerCase();
  const explicitAssignee = settings.assigneeMappings.find((mapping) => mapping.zohoAssigneeId === ownerId)?.tmsUserEmail;
  const assignedTo = [ownerEmail, explicitAssignee, settings.defaultAssigneeEmail].find((email) => email && users.some((user) => user.email.toLowerCase() === email.toLowerCase()));
  const externalTicketId = firstText(ticketPayload.id, ticketPayload.ticketId, 200);
  const title = firstText(ticketPayload.subject, ticketPayload.title, 'Zoho Desk Ticket', 200) || 'Zoho Desk Ticket';
  const description = firstText(ticketPayload.description, ticketPayload.descriptionPlainText, ticketPayload.summary, title, 10_000) || title;
  const requesterName = firstText(contact.fullName, contact.name, requester.fullName, requester.name, ticketPayload.contactName, 'Zoho Desk Requester', 120) || 'Zoho Desk Requester';
  const requesterEmail = firstText(contact.email, requester.email, ticketPayload.contactEmail, 254).toLowerCase();
  return {
    subject: title, description, requester: { name: requesterName, email: requesterEmail, phone: firstText(contact.phone, requester.phone, ticketPayload.contactPhone, 30) },
    source: 'ZOHO_DESK', priority: mapZohoPriority(ticketPayload.priority || settings.defaultPriority), departmentId, assignedTo,
    createdBy: 'Zoho Desk', integration: {
      provider: 'ZOHO_DESK', externalTicketId, externalTicketNumber: firstText(ticketPayload.ticketNumber, ticketPayload.ticketNo, 200), externalDepartmentId,
      externalOrgId: firstText(ticketPayload.orgId, ticketPayload.organizationId, 200), externalChannel: firstText(ticketPayload.channel, 120), externalAssigneeId: ownerId,
      lastSyncedAt: new Date().toISOString(), attachmentMetadata: Array.isArray(ticketPayload.attachments) ? ticketPayload.attachments.slice(0, 50) : undefined
    }
  };
}
