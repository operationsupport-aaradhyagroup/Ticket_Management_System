import crypto from 'crypto';

export const API_PERMISSIONS = [
  'tickets:create',
  'tickets:read',
  'tickets:update',
  'tickets:reply',
  'tickets:assign'
] as const;

export type ApiPermission = typeof API_PERMISSIONS[number];

export function generateApiKey(prefix = 'tms_live_') {
  const identifier = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const rawKey = `${prefix}${identifier}_${secret}`;
  return { rawKey, keyPrefix: `${prefix}${identifier}` };
}

export function hashApiKey(rawKey: string) {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

export function safelyMatchesApiKey(rawKey: string, expectedHash: string) {
  const actual = Buffer.from(hashApiKey(rawKey), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function extractKeyPrefix(rawKey: string, configuredPrefix = 'tms_live_') {
  if (!rawKey.startsWith(configuredPrefix)) return '';
  const separatorIndex = rawKey.indexOf('_', configuredPrefix.length);
  return separatorIndex > configuredPrefix.length
    ? rawKey.slice(0, separatorIndex)
    : '';
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();

  constructor(private windowMs: number, private max: number) {}

  consume(key: string, now = Date.now()) {
    const threshold = now - this.windowMs;
    const recent = (this.buckets.get(key) || []).filter(timestamp => timestamp > threshold);
    if (recent.length >= this.max) {
      this.buckets.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, recent[0] + this.windowMs - now) };
    }
    recent.push(now);
    this.buckets.set(key, recent);
    return { allowed: true, remaining: Math.max(0, this.max - recent.length), retryAfterMs: 0 };
  }
}
