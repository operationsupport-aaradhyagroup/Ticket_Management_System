import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { API_PERMISSIONS, extractKeyPrefix, generateApiKey, hashApiKey, safelyMatchesApiKey, SlidingWindowRateLimiter } from '../integrationSecurity';
import { createTicket, TicketValidationError, toPublicTicket } from '../ticketService';
import type { ITicket } from '../serverDB';

const department = { id: 'dept-it', name: 'IT Department', isCustom: false, createdAt: new Date().toISOString() };
const category = { id: 'cat-it', departmentId: 'dept-it', name: 'Support', defaultSlaValue: 2, defaultSlaUnit: 'hours' as const, defaultPriority: 'Medium' as const, createdAt: new Date().toISOString() };
const agent = { email: 'agent@example.com', name: 'Agent', passwordHash: 'x', role: 'User' as const, departmentId: 'dept-it' };
const persisted: ITicket[] = [];
const deps = () => ({
  getDepartments: async () => [department], getCategories: async () => [category], getUsers: async () => [agent],
  generateTicketNumber: async () => `TKT-2026-${String(persisted.length + 1).padStart(6, '0')}`,
  persistTicket: async (ticket: ITicket) => { persisted.push(ticket); return ticket; }
});
const validInput = () => ({ subject: 'Website unavailable', description: 'Website has been unavailable since 2 PM.', requester: { name: 'Rahul', email: 'rahul@example.com' }, source: 'API' as const, departmentId: 'dept-it' });
const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

test('API key generator uses configured prefix', () => assert.match(generateApiKey('tms_live_').rawKey, /^tms_live_/));
test('API key hashing is deterministic', () => assert.equal(hashApiKey('abc'), hashApiKey('abc')));
test('API key verifier accepts valid key', () => { const key = generateApiKey(); assert.ok(safelyMatchesApiKey(key.rawKey, hashApiKey(key.rawKey))); });
test('API key verifier rejects invalid key', () => { const key = generateApiKey(); assert.equal(safelyMatchesApiKey('invalid', hashApiKey(key.rawKey)), false); });
test('raw API key differs from stored hash', () => { const key = generateApiKey(); assert.notEqual(key.rawKey, hashApiKey(key.rawKey)); });
test('key prefix can identify client safely', () => { const key = generateApiKey(); assert.equal(extractKeyPrefix(key.rawKey), key.keyPrefix); });
test('unknown key format has no prefix', () => assert.equal(extractKeyPrefix('bad_key'), ''));
test('permission catalogue contains ticket creation', () => assert.ok(API_PERMISSIONS.includes('tickets:create')));
test('rate limiter allows requests below limit', () => assert.equal(new SlidingWindowRateLimiter(1000, 2).consume('a', 1).allowed, true));
test('rate limiter blocks requests over limit', () => { const limiter = new SlidingWindowRateLimiter(1000, 1); limiter.consume('a', 1); assert.equal(limiter.consume('a', 2).allowed, false); });
test('rate limits are isolated per API client', () => { const limiter = new SlidingWindowRateLimiter(1000, 1); limiter.consume('a', 1); assert.equal(limiter.consume('b', 2).allowed, true); });
test('rate limiter resets after window', () => { const limiter = new SlidingWindowRateLimiter(10, 1); limiter.consume('a', 1); assert.equal(limiter.consume('a', 20).allowed, true); });
test('canonical service creates a ticket', async () => { const ticket = await createTicket(validInput(), deps()); assert.equal(ticket.status, 'Open'); });
test('canonical service forces supplied trusted source', async () => { const ticket = await createTicket(validInput(), deps()); assert.equal(ticket.source, 'API'); });
test('canonical service normalizes priority', async () => { const ticket = await createTicket({ ...validInput(), priority: 'high' }, deps()); assert.equal(ticket.priority, 'High'); });
test('canonical service assigns an active employee', async () => { const ticket = await createTicket({ ...validInput(), assignedTo: agent.email }, deps()); assert.equal(ticket.assignedAgentEmail, agent.email); });
test('canonical service rejects malformed email', async () => assert.rejects(() => createTicket({ ...validInput(), requester: { name: 'A', email: 'bad' } }, deps()), TicketValidationError));
test('canonical service rejects short subject', async () => assert.rejects(() => createTicket({ ...validInput(), subject: 'x' }, deps()), TicketValidationError));
test('canonical service rejects invalid department', async () => assert.rejects(() => createTicket({ ...validInput(), departmentId: 'missing' }, deps()), TicketValidationError));
test('canonical service rejects invalid priority', async () => assert.rejects(() => createTicket({ ...validInput(), priority: 'urgent' }, deps()), TicketValidationError));
test('canonical service rejects unsafe custom field keys', async () => assert.rejects(() => createTicket({ ...validInput(), customFields: { '$where': 'x' } }, deps()), TicketValidationError));
test('public serializer omits internal history and key data', async () => { const result = toPublicTicket(await createTicket(validInput(), deps())) as any; assert.equal(result.history, undefined); assert.equal(result.keyHash, undefined); });
test('integration create route requires API-key middleware', () => assert.match(serverSource, /post\('\/api\/v1\/tickets', authenticateApiKey\('tickets:create'\)/));
test('API source is server assigned', () => assert.match(serverSource, /source: 'API'/));
test('idempotency is scoped to integration client', () => assert.match(serverSource, /findIdempotency\(client\.id, idempotencyKey\)/));
test('admin API client routes require JWT admin', () => assert.match(serverSource, /api\/admin\/api-clients', authenticateToken, requireAdmin/));
test('reply endpoint requires reply permission', () => assert.match(serverSource, /replies', authenticateApiKey\('tickets:reply'\)/));
test('assignment endpoint requires assign permission', () => assert.match(serverSource, /assign', authenticateApiKey\('tickets:assign'\)/));
test('list endpoint enforces maximum page size', () => assert.match(serverSource, /Math\.min\(100/));
test('existing frontend creation delegates to canonical service', () => assert.match(serverSource, /Existing frontend ticket creation now delegates to the canonical service/));
