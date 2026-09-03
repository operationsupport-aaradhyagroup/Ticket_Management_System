import test from 'node:test';
import assert from 'node:assert/strict';
import { processInboundEmail } from '../emailTicketService';
import type { IEmailTicketSettings, IInboundEmailEvent, ITicket, IUser } from '../serverDB';

const settings: IEmailTicketSettings = { id: 'email-ticket', enabled: true, subjectPrefix: 'Resolve this Ticket --', defaultAssigneeEmail: 'default@example.com', updatedAt: '', updatedBy: 'test' };
const users: IUser[] = [
  { email: 'agent@example.com', name: 'Agent', passwordHash: 'x', role: 'User', departmentId: 'dept-it' },
  { email: 'default@example.com', name: 'Default', passwordHash: 'x', role: 'User', departmentId: 'dept-it' },
  { email: 'deleted@example.com', name: 'Deleted', passwordHash: 'x', role: 'User', isDeleted: true }
];

function harness(overrides: Partial<IEmailTicketSettings> = {}) {
  const events = new Map<string, IInboundEmailEvent>();
  const tickets: any[] = [];
  return {
    events, tickets,
    deps: {
      getSettings: async () => ({ ...settings, ...overrides }),
      findUserByEmail: async (email: string) => users.find(user => user.email.toLowerCase() === email.toLowerCase() && !user.isDeleted) || null,
      reserveEvent: async (event: IInboundEmailEvent) => { if (events.has(event.messageId)) throw new Error('INBOUND_EMAIL_DUPLICATE'); events.set(event.messageId, event); return event; },
      updateEvent: async (messageId: string, updates: Partial<IInboundEmailEvent>) => { const event = { ...events.get(messageId)!, ...updates }; events.set(messageId, event); return event; },
      createTicket: async (input: any) => { const ticket = { ...input, id: `TKT-${tickets.length + 1}`, assignedAgentEmail: input.assignedTo || '', assignedAgent: input.assignedTo ? 'Agent' : 'Unassigned' } as ITicket; tickets.push(ticket); return ticket; }
    }
  };
}

const email = (overrides: Record<string, unknown> = {}) => ({ messageId: '<one@example.com>', fromEmail: 'External Sender <external@example.net>', fromName: 'External Sender', toEmails: ['AGENT@EXAMPLE.COM'], subject: 'Resolve This Ticket -- VPN broken', textBody: 'Cannot connect to VPN.', receivedAt: '2026-09-03T10:00:00.000Z', ...overrides });

test('creates from external sender and assigns the first matching recipient case-insensitively', async () => { const state = harness(); await processInboundEmail(email(), state.deps); assert.equal(state.tickets[0].requester.email, 'external@example.net'); assert.equal(state.tickets[0].assignedTo, 'agent@example.com'); });
test('uses configured default assignee when no recipient matches', async () => { const state = harness(); const result = await processInboundEmail(email({ toEmails: ['unknown@example.com'] }), state.deps); assert.equal(result.status, 'DEFAULT_ASSIGNEE_USED'); assert.equal(state.tickets[0].assignedTo, 'default@example.com'); });
test('creates unassigned when the default assignee is missing', async () => { const state = harness({ defaultAssigneeEmail: 'missing@example.com' }); await processInboundEmail(email({ toEmails: ['unknown@example.com'] }), state.deps); assert.equal(state.tickets[0].assignedTo, undefined); });
test('ignores a non-matching subject without creating a ticket', async () => { const state = harness(); const result = await processInboundEmail(email({ subject: 'A different request' }), state.deps); assert.equal(result.status, 'IGNORED_SUBJECT'); assert.equal(state.tickets.length, 0); });
test('prefers original recipients, skips deleted users, and chooses the first valid user', async () => { const state = harness(); await processInboundEmail(email({ originalToEmails: ['deleted@example.com', 'agent@example.com'], toEmails: ['unknown@example.com'] }), state.deps); assert.equal(state.tickets[0].assignedTo, 'agent@example.com'); });
test('assigns to the first valid Cc recipient before the fixed central inbox', async () => { const state = harness(); await processInboundEmail(email({ toEmails: ['central@example.com'], ccEmails: ['AGENT@EXAMPLE.COM'] }), state.deps); assert.equal(state.tickets[0].assignedTo, 'agent@example.com'); });
test('uses title fallback and safe HTML text when plain text is absent', async () => { const state = harness(); await processInboundEmail(email({ subject: 'Resolve this Ticket -- ', textBody: '', htmlBody: '<script>alert(1)</script><p>Hello &amp; welcome</p>' }), state.deps); assert.equal(state.tickets[0].subject, 'Email Support Request'); assert.equal(state.tickets[0].description, 'Hello & welcome'); });
test('reserves message IDs before creation so duplicates produce one ticket', async () => { const state = harness(); await Promise.all([processInboundEmail(email(), state.deps), processInboundEmail(email(), state.deps)]); assert.equal(state.tickets.length, 1); });
test('does nothing when integration is disabled', async () => { const state = harness({ enabled: false }); const result = await processInboundEmail(email(), state.deps); assert.equal(result.status, 'DISABLED'); assert.equal(state.tickets.length, 0); });
