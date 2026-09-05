import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getZohoEventType, getZohoTicketPayload, mapZohoPriority, mapZohoStatus, mapZohoTicketToTmsInput } from '../zohoDeskService';

const settings = {
  id: 'zoho-desk' as const, enabled: true, syncNewTickets: true, defaultDepartmentId: 'dept-default', defaultAssigneeEmail: 'fallback@example.com', defaultPriority: 'Medium' as const,
  departmentMappings: [{ zohoDepartmentId: 'zoho-it', tmsDepartmentId: 'dept-it' }], assigneeMappings: [], portalAssigneeMappings: [{ zohoPortal: 'Bhoodhan', tmsUserEmail: 'agent@example.com' }], updatedAt: '', updatedBy: 'admin@example.com'
};
const departments = [{ id: 'dept-it', name: 'IT', isCustom: false, createdAt: '' }, { id: 'dept-default', name: 'Default', isCustom: false, createdAt: '' }];
const users = [{ email: 'agent@example.com', name: 'Agent', passwordHash: '', role: 'User' as const }, { email: 'fallback@example.com', name: 'Fallback', passwordHash: '', role: 'User' as const }];
const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
const zohoServiceSource = fs.readFileSync(path.join(process.cwd(), 'zohoDeskService.ts'), 'utf8');

test('Zoho status mapping handles known and unknown values', () => {
  assert.equal(mapZohoStatus('On Hold'), 'In Progress');
  assert.equal(mapZohoStatus('Resolved'), 'Resolved');
  assert.equal(mapZohoStatus('Custom status'), 'Open');
});

test('Zoho priority mapping handles known and unknown values', () => {
  assert.equal(mapZohoPriority('Urgent'), 'Critical');
  assert.equal(mapZohoPriority('High'), 'High');
  assert.equal(mapZohoPriority('Unknown'), 'Medium');
});

test('Zoho webhook parser accepts form-encoded JSON payloads', () => {
  const body = { data: JSON.stringify({ eventType: 'Ticket Add', id: '80003', subject: 'Printer issue' }) };
  assert.equal(getZohoEventType(body), 'TICKET_ADD');
  assert.equal(getZohoTicketPayload(body).id, '80003');
});

test('Zoho webhook parser accepts raw form payloads', () => {
  const body = Buffer.from(`data=${encodeURIComponent(JSON.stringify({ eventType: 'Ticket Add', id: '80004', subject: 'Network issue' }))}`);
  assert.equal(getZohoEventType(body), 'TICKET_ADD');
  assert.equal(getZohoTicketPayload(body).id, '80004');
});

test('Zoho mapper preserves external ticket metadata and maps department/assignee', () => {
  const input = mapZohoTicketToTmsInput({ id: '80001', ticketNumber: '101', subject: 'Printer issue', description: 'Printer is unavailable.', departmentId: 'zoho-it', assigneeEmail: 'agent@example.com', contact: { fullName: 'Rahul', email: 'rahul@example.com' } }, settings, departments, users);
  assert.equal(input.source, 'ZOHO_DESK');
  assert.equal(input.departmentId, 'dept-it');
  assert.equal(input.assignedTo, 'agent@example.com');
  assert.equal(input.integration?.externalTicketId, '80001');
});

test('Zoho mapper uses configured department and assignee fallbacks', () => {
  const input = mapZohoTicketToTmsInput({ id: '80002', subject: 'Network issue', description: 'Network is unavailable.' }, settings, departments, users);
  assert.equal(input.departmentId, 'dept-default');
  assert.equal(input.assignedTo, 'fallback@example.com');
});

test('Zoho mapper prioritizes portal-based assignee routing', () => {
  const input = mapZohoTicketToTmsInput({ id: '80003', subject: 'Portal route', portal: 'bhoodhan', assigneeEmail: 'fallback@example.com' }, settings, departments, users);
  assert.equal(input.assignedTo, 'agent@example.com');
});

test('Zoho webhook uses a secure callback token and the canonical ticket service', () => {
  assert.match(serverSource, /post\(\['\/api\/integrations\/zoho-desk\/webhook', '\/api\/integrations\/zoho-desk\/webhook\/:token'\]/);
  assert.match(serverSource, /ZOHO_DESK_WEBHOOK_SECRET/);
  assert.match(serverSource, /timingSafeEqual/);
  assert.match(zohoServiceSource, /source: 'ZOHO_DESK'/);
  assert.match(serverSource, /findZohoDeskTicketByExternalId/);
  assert.match(serverSource, /TICKET_STATUS_UPDATE/);
  assert.match(serverSource, /Zoho Desk status updated to/);
});
