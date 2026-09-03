# Ticket Management Integration API

## Architecture

All ticket sources use the shared `createTicket()` service in `ticketService.ts`. The current React portal remains on `POST /api/tickets`; integration clients use `/api/v1`, and managed public forms use `/api/v1/public/tickets`. The service owns normalization, validation, numbering, defaults, requester/source/audit fields, department and assignment validation, persistence, and notification hooks.

Existing ticket fields remain unchanged. New ticket fields (`source`, requester phone, metadata, custom fields, integration client, and update timestamp) are optional for backward compatibility.

## Authentication

Private integration routes require:

```http
X-API-Key: tms_live_xxxxxxxxx
```

Administrators create keys under **Settings → Developer / API Access**. A complete key is returned only at creation or regeneration. MongoDB stores only its SHA-256 hash and a safe lookup prefix. Keys can be enabled, disabled, revoked, or regenerated.

Permissions:

- `tickets:create`
- `tickets:read`
- `tickets:update`
- `tickets:reply`
- `tickets:assign`

Missing/invalid credentials return `401`, insufficient permissions return `403`, and throttled requests return `429`.

## Create a ticket

`POST /api/v1/tickets` requires a unique `Idempotency-Key` per external operation. Repeating the same key for the same API client returns the original ticket without creating a duplicate. Different clients have independent idempotency namespaces. The server always sets `source` to `API`; caller-supplied source values are ignored.

```bash
curl -X POST https://your-domain.com/api/v1/tickets \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Idempotency-Key: external-request-123" \
  -d '{
    "subject": "Website is not opening",
    "description": "Our website is down.",
    "requester": { "name": "Rahul", "email": "rahul@example.com", "phone": "9876543210" },
    "priority": "high",
    "departmentId": "dept-it",
    "customFields": { "domain": "example.com" }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "TKT-2026-000123",
    "ticketNumber": "TKT-2026-000123",
    "subject": "Website is not opening",
    "status": "open",
    "priority": "high",
    "source": "api",
    "createdAt": "2026-09-01T10:00:00.000Z"
  }
}
```

## Endpoints

| Method | Route | Permission |
|---|---|---|
| POST | `/api/v1/tickets` | `tickets:create` |
| GET | `/api/v1/tickets` | `tickets:read` |
| GET | `/api/v1/tickets/:id` | `tickets:read` |
| PATCH | `/api/v1/tickets/:id` | `tickets:update` |
| POST | `/api/v1/tickets/:id/replies` | `tickets:reply` |
| GET | `/api/v1/tickets/:id/replies` | `tickets:read` |
| PATCH | `/api/v1/tickets/:id/status` | `tickets:update` |
| PATCH | `/api/v1/tickets/:id/assign` | `tickets:assign` |
| POST | `/api/v1/public/tickets` | Public protections |

Listing supports `page`, `limit` (maximum 100), `status`, `priority`, `departmentId`, `source`, and `search`. Query values are allowlisted and are never passed to MongoDB as operators.

## Public forms

`POST /api/v1/public/tickets` uses a separate IP rate limit and the same central service. Set `PUBLIC_TICKET_CAPTCHA_ENABLED=true` and configure `TURNSTILE_SECRET_KEY` to require Cloudflare Turnstile. Send its token as `X-Turnstile-Token` or `captchaToken`. Public routes expose no administrative operations.

## Email-to-ticket preparation

An inbound provider should parse mail and call the canonical service with `source: "EMAIL"` and provider metadata such as `messageId`, `from`, `to`, `cc`, provider, and thread/reference IDs. It must not write directly to MongoDB. Provider-specific webhook signature verification and message-ID idempotency should be added when a provider is selected.

## Errors and rate limits

Versioned routes return `{ "success": false, "error": { "code": "...", "message": "..." } }`. Internal stack traces, database details, hashes, secrets, environment values, and filesystem paths are never returned. Rate settings come from `.env`; the current limiter is per process and per API client (public submissions use IP).

## Current limitations

- Attachments are not exposed because the existing application has no attachment storage subsystem.
- The rate limiter is process-local; use Redis or an API gateway for horizontally scaled deployments.
- Email provider webhooks are intentionally not implemented until a provider and signature scheme are chosen.
