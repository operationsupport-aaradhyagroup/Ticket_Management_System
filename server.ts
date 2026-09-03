import express from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { initializeDb, dbActions, IUser, IDepartment, IComplaintCategory, ITicket, ISentEmail, IEscalationRule, IApiClient, IGmailIntegrationCredential } from './serverDB';
import { createTicket, TicketValidationError, toPublicTicket, TicketSource } from './ticketService';
import { API_PERMISSIONS, ApiPermission, extractKeyPrefix, generateApiKey, hashApiKey, safelyMatchesApiKey, SlidingWindowRateLimiter } from './integrationSecurity';
import { InboundEmail, processInboundEmail } from './emailTicketService';

// Load environmental properties
dotenv.config();

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'complaint_sla_jwt_super_secret';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_REAL_SEND = process.env.BREVO_REAL_SEND === 'true';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Aaradhya Group Tickets';
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || '';
const APP_URL = process.env.APP_URL || '';
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_PUSH_ENABLED = process.env.ONESIGNAL_PUSH_ENABLED === 'true';
const ONESIGNAL_REMINDER_INTERVAL_MINUTES = Math.max(15, Number(process.env.ONESIGNAL_REMINDER_INTERVAL_MINUTES || 120));
const TICKET_SEQUENCE_PATH = path.join(process.cwd(), 'ticket-sequence.json');
const API_KEY_PREFIX = process.env.API_KEY_PREFIX || 'tms_live_';
const API_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000));
const API_RATE_LIMIT_MAX = Math.max(1, Number(process.env.API_RATE_LIMIT_MAX || 100));
const PUBLIC_TICKET_RATE_LIMIT_MAX = Math.max(1, Number(process.env.PUBLIC_TICKET_RATE_LIMIT_MAX || 20));
const PUBLIC_TICKET_CAPTCHA_ENABLED = process.env.PUBLIC_TICKET_CAPTCHA_ENABLED === 'true';
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || `${APP_URL.replace(/\/$/, '')}/api/integrations/gmail/callback`;
const GMAIL_INBOX_EMAIL = (process.env.GMAIL_INBOX_EMAIL || 'operation_support@kisansuvidha.com').toLowerCase();
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const integrationRateLimiter = new SlidingWindowRateLimiter(API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX);
const publicRateLimiter = new SlidingWindowRateLimiter(API_RATE_LIMIT_WINDOW_MS, PUBLIC_TICKET_RATE_LIMIT_MAX);

const gmailTokenKey = crypto.createHash('sha256').update(`${JWT_SECRET}:gmail-refresh-token`).digest();
const encryptGmailToken = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', gmailTokenKey, iv);
  return `${iv.toString('base64url')}.${Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
};
const decryptGmailToken = (value: string) => {
  const [ivValue, encryptedValue, authTag] = value.split('.');
  if (!ivValue || !encryptedValue || !authTag) throw new Error('GMAIL_TOKEN_INVALID');
  const decipher = crypto.createDecipheriv('aes-256-gcm', gmailTokenKey, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
};

const sanitizeUser = (user: IUser) => ({
  email: user.email,
  name: user.name,
  role: user.role,
  departmentId: user.departmentId,
  employeeId: user.employeeId,
  firstName: user.firstName,
  lastName: user.lastName,
  company: user.company,
  departmentName: user.departmentName,
  designation: user.designation,
  reportingManager: user.reportingManager,
  reportingManagerEmail: user.reportingManagerEmail
});

type NotificationType = 'Assignment' | 'Escalation' | 'Closure';
type PushNotificationType = NotificationType | 'Reminder';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not available';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? 'Not available' : dt.toLocaleString();
};

const getTicketUrl = (ticketId: string) => {
  if (!APP_URL) return '';
  return `${APP_URL.replace(/\/$/, '')}?ticket=${encodeURIComponent(ticketId)}`;
};

const readTicketSequence = () => {
  try {
    if (!fs.existsSync(TICKET_SEQUENCE_PATH)) {
      return 0;
    }

    const raw = fs.readFileSync(TICKET_SEQUENCE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const current = Number(parsed?.lastIssuedTicketNumber ?? 0);
    return Number.isNaN(current) || current < 0 ? 0 : current;
  } catch (error) {
    console.warn('Failed to read ticket sequence file. Restarting sequence from 0.', error);
    return 0;
  }
};

const writeTicketSequence = (value: number) => {
  fs.writeFileSync(
    TICKET_SEQUENCE_PATH,
    JSON.stringify({ lastIssuedTicketNumber: value }, null, 2),
    'utf-8'
  );
};

let ticketSequenceQueue = Promise.resolve();
const getNextTicketId = async () => {
  let ticketId = '';
  ticketSequenceQueue = ticketSequenceQueue.then(() => {
  const nextTicketNumber = readTicketSequence() + 1;
  writeTicketSequence(nextTicketNumber);
    ticketId = `TKT-${new Date().getFullYear()}-${String(nextTicketNumber).padStart(6, '0')}`;
  });
  await ticketSequenceQueue;
  return ticketId;
};

const resetTicketSequence = () => {
  writeTicketSequence(0);
};

const deriveLegacySlaDuration = (createdAt: string, dueDate: string) => {
  const createdAtMs = new Date(createdAt).getTime();
  const dueDateMs = new Date(dueDate).getTime();
  const diffMinutes = Math.max(1, Math.ceil((dueDateMs - createdAtMs) / (1000 * 60)));

  if (diffMinutes >= 1440) {
    return { value: Math.ceil(diffMinutes / 1440), unit: 'days' as const };
  }

  if (diffMinutes >= 60) {
    return { value: Math.ceil(diffMinutes / 60), unit: 'hours' as const };
  }

  return { value: diffMinutes, unit: 'minutes' as const };
};

const normalizeRoleLabel = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDepartmentHeadLevel = (designation: string) => {
  const normalized = normalizeRoleLabel(designation);
  return normalized === 'dept head' || normalized === 'department head' || normalized === 'head';
};

const isSameUserTarget = (
  currentName?: string,
  currentEmail?: string,
  nextName?: string,
  nextEmail?: string
) => {
  const currentEmailKey = String(currentEmail || '').trim().toLowerCase();
  const nextEmailKey = String(nextEmail || '').trim().toLowerCase();
  if (currentEmailKey && nextEmailKey) {
    return currentEmailKey === nextEmailKey;
  }

  const currentNameKey = String(currentName || '').trim().toLowerCase();
  const nextNameKey = String(nextName || '').trim().toLowerCase();
  return !!currentNameKey && !!nextNameKey && currentNameKey === nextNameKey;
};

const extractEmailContext = (email: ISentEmail) => {
  const body = email.body || '';
  return {
    recipientName: escapeHtml(email.toName || 'Team Member'),
    ticketId: escapeHtml(email.ticketId),
    ticketTitle: escapeHtml(email.ticketTitle),
    ticketUrl: getTicketUrl(email.ticketId),
    departmentName: escapeHtml(body.match(/Department:\s*(.+)/)?.[1]?.trim() || 'Not available'),
    categoryName: escapeHtml(body.match(/Category:\s*(.+)/)?.[1]?.trim() || 'Not available'),
    priority: escapeHtml(body.match(/Priority:\s*(.+)/)?.[1]?.trim() || body.match(/Ticket ID:\s*.+\((.+?) priority\)/)?.[1]?.trim() || 'Not available'),
    raisedBy: escapeHtml(body.match(/Raised By:\s*(.+)/)?.[1]?.trim() || 'Not available'),
    assignedTo: escapeHtml(body.match(/Assigned To:\s*(.+)/)?.[1]?.trim() || 'Not available'),
    finalStatus: escapeHtml(body.match(/Final Status:\s*(.+)/)?.[1]?.trim() || 'Not available'),
    closedAt: escapeHtml(body.match(/Closed At:\s*(.+)/)?.[1]?.trim() || formatDateTime(email.sentAt)),
    description: escapeHtml(body.match(/Description:\s*([\s\S]*?)\n(?:Department|Category|Priority|SLA Due|Raised By|Registered Server timestamp)/)?.[1]?.trim() || 'Not available'),
    slaDue: escapeHtml(body.match(/SLA Due:\s*(.+)/)?.[1]?.trim() || formatDateTime(email.sentAt))
  };
};

const renderTicketEmailLayout = ({
  badge,
  title,
  subtitle,
  intro,
  summaryRows,
  alertTone = 'blue',
  alertText,
  ticketUrl,
  ctaLabel
}: {
  badge: string;
  title: string;
  subtitle: string;
  intro: string;
  summaryRows: Array<{ label: string; value: string; emphasis?: boolean; tone?: 'default' | 'danger' | 'success' | 'info' }>;
  alertTone?: 'blue' | 'red' | 'green';
  alertText: string;
  ticketUrl?: string;
  ctaLabel?: string;
}) => {
  const toneMap = {
    blue: {
      bg: '#eff6ff',
      border: '#bfdbfe',
      text: '#1d4ed8'
    },
    red: {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#b91c1c'
    },
    green: {
      bg: '#ecfdf5',
      border: '#a7f3d0',
      text: '#047857'
    }
  } as const;

  const toneColor = (tone?: 'default' | 'danger' | 'success' | 'info') => {
    switch (tone) {
      case 'danger':
        return '#b91c1c';
      case 'success':
        return '#047857';
      case 'info':
        return '#1d4ed8';
      default:
        return '#111827';
    }
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:28px 32px;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.8;font-weight:bold;">
                ${escapeHtml(badge)}
              </div>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">
                ${escapeHtml(title)}
              </h1>
              <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#dbeafe;">
                ${escapeHtml(subtitle)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <div style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#374151;">
                ${intro}
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                ${summaryRows.map((row, index) => `
                <tr>
                  <td style="padding:14px 16px;${index < summaryRows.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''}font-size:13px;color:#6b7280;width:180px;">${escapeHtml(row.label)}</td>
                  <td style="padding:14px 16px;${index < summaryRows.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''}font-size:14px;${row.emphasis ? 'font-weight:700;' : row.label === 'Title' || row.label === 'Ticket ID' ? 'font-weight:600;' : ''}color:${toneColor(row.tone)};">${row.value}</td>
                </tr>`).join('')}
              </table>
              <div style="margin-top:22px;padding:16px 18px;background:${toneMap[alertTone].bg};border:1px solid ${toneMap[alertTone].border};border-radius:14px;">
                <p style="margin:0;font-size:13px;line-height:1.7;color:#991b1b;">
                  <strong style="color:${toneMap[alertTone].text};">Action Required:</strong>
                  <span style="color:${toneMap[alertTone].text};">${alertText}</span>
                </p>
              </div>
              ${ticketUrl ? `<div style="margin-top:24px;"><a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:bold;">${escapeHtml(ctaLabel || 'Open Ticket')}</a></div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.7;color:#6b7280;">
                Developed &amp; Managed by <strong>Nexora Automations</strong><br />
                Aaradhya Group Ticket Management System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildAssignmentEmailHtml = (email: ISentEmail) => {
  const context = extractEmailContext(email);
  return renderTicketEmailLayout({
    badge: 'Aaradhya Group Ticket Management',
    title: 'New Ticket Assigned',
    subtitle: 'A complaint ticket has been routed to your operational queue.',
    intro: `Hello <strong>${context.recipientName}</strong>,<br /><br />A complaint ticket has been assigned to you for action. Please review the details below and begin work as soon as possible.`,
    summaryRows: [
      { label: 'Ticket ID', value: context.ticketId },
      { label: 'Title', value: context.ticketTitle },
      { label: 'Description', value: context.description },
      { label: 'Department', value: context.departmentName },
      { label: 'Category', value: context.categoryName },
      { label: 'Priority', value: context.priority, emphasis: true, tone: 'info' },
      { label: 'SLA Due', value: context.slaDue },
      { label: 'Raised By', value: context.raisedBy }
    ],
    alertTone: 'blue',
    alertText: 'Please acknowledge the assignment, review the issue context, and update the ticket status as you begin work.',
    ticketUrl: context.ticketUrl,
    ctaLabel: 'Open Assigned Ticket'
  });
};

const buildEscalationEmailHtml = (email: ISentEmail) => {
  const context = extractEmailContext(email);
  const escalationReason = escapeHtml(
    email.escalationType === 'Auto-SLA-Breach' ? 'Automatic SLA breach trigger' : 'Manual operator escalation'
  );

  return renderTicketEmailLayout({
    badge: 'Aaradhya Group Ticket Management',
    title: 'Urgent Ticket Escalation',
    subtitle: 'A complaint ticket requires immediate attention due to escalation.',
    intro: `Hello <strong>${context.recipientName}</strong>,<br /><br />Ticket <strong>${context.ticketId}</strong> has been escalated to you because of <strong>${escalationReason}</strong>.`,
    summaryRows: [
      { label: 'Ticket ID', value: context.ticketId },
      { label: 'Title', value: context.ticketTitle },
      { label: 'Description', value: context.description },
      { label: 'Department', value: context.departmentName },
      { label: 'Category', value: context.categoryName },
      { label: 'Priority', value: context.priority, emphasis: true, tone: 'danger' },
      { label: 'SLA Due', value: context.slaDue },
      { label: 'Raised By', value: context.raisedBy }
    ],
    alertTone: 'red',
    alertText: 'Please review this escalated complaint immediately and take the necessary next step to avoid further SLA impact.',
    ticketUrl: context.ticketUrl,
    ctaLabel: 'Open Escalated Ticket'
  });
};

const buildClosureEmailHtml = (email: ISentEmail) => {
  const context = extractEmailContext(email);
  return renderTicketEmailLayout({
    badge: 'Aaradhya Group Ticket Management',
    title: 'Complaint Ticket Closed',
    subtitle: 'Your complaint has been completed and marked as closed.',
    intro: `Hello <strong>${context.recipientName}</strong>,<br /><br />Your complaint ticket has been successfully marked as closed. Here is the final summary of the request.`,
    summaryRows: [
      { label: 'Ticket ID', value: context.ticketId },
      { label: 'Title', value: context.ticketTitle },
      { label: 'Description', value: context.description },
      { label: 'Department', value: context.departmentName },
      { label: 'Category', value: context.categoryName },
      { label: 'Final Status', value: context.finalStatus, emphasis: true, tone: 'success' },
      { label: 'Closed At', value: context.closedAt },
      { label: 'Assigned To', value: context.assignedTo }
    ],
    alertTone: 'green',
    alertText: 'If you still face the issue, please raise a new complaint or contact the support team for additional assistance.',
    ticketUrl: context.ticketUrl,
    ctaLabel: 'View Closed Ticket'
  });
};

const buildNotificationEmail = ({
  notificationType,
  ticket,
  recipientName,
  recipientEmail,
  escalationType
}: {
  notificationType: NotificationType;
  ticket: ITicket;
  recipientName: string;
  recipientEmail: string;
  escalationType?: 'Manual' | 'Auto-SLA-Breach';
}): ISentEmail => {
  const sentAt = new Date().toISOString();

  if (notificationType === 'Assignment') {
    return {
      id: 'email-' + Date.now(),
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      toName: recipientName,
      toEmail: recipientEmail,
      subject: `[TICKET ASSIGNED] ${ticket.id} - ${ticket.title}`,
      body: `Hello ${recipientName},\n\nA complaint ticket has been assigned to you for action.\n\nTicket ID: ${ticket.id}\nTitle: ${ticket.title}\nDescription: ${ticket.description}\nDepartment: ${ticket.departmentName}\nCategory: ${ticket.categoryName}\nPriority: ${ticket.priority}\nSLA Due: ${new Date(ticket.slaDueDate).toLocaleString()}\nRaised By: ${ticket.creatorName} (${ticket.creatorEmail})\n\nPlease review and begin work on this ticket.\nRegistered Server timestamp: ${sentAt}`,
      sentAt,
      notificationType
    };
  }

  if (notificationType === 'Closure') {
    return {
      id: 'email-' + Date.now(),
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      toName: recipientName,
      toEmail: recipientEmail,
      subject: `[TICKET CLOSED] ${ticket.id} - ${ticket.title}`,
      body: `Hello ${recipientName},\n\nYour complaint ticket has been marked as closed.\n\nTicket ID: ${ticket.id}\nTitle: ${ticket.title}\nDescription: ${ticket.description}\nDepartment: ${ticket.departmentName}\nCategory: ${ticket.categoryName}\nFinal Status: ${ticket.status}\nClosed At: ${ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString() : new Date(sentAt).toLocaleString()}\nAssigned To: ${ticket.assignedAgent || 'Unassigned'}${ticket.assignedAgentEmail ? ` (${ticket.assignedAgentEmail})` : ''}\n\nIf you still face the issue, please raise a new complaint or contact the support team.\nRegistered Server timestamp: ${sentAt}`,
      sentAt,
      notificationType
    };
  }

  return {
    id: 'email-' + Date.now(),
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    toName: recipientName,
    toEmail: recipientEmail,
    subject: `[URGENT ESCALATION] ${ticket.id} SLA Limit Triggered - ${ticket.title}`,
    body: `Attention: ${recipientName} (${recipientEmail})\n\nTicket ID: ${ticket.id} (${ticket.priority} priority) has been escalated to you due to: ${escalationType === 'Manual' ? 'manual operator escalation' : 'automatic SLA breach limits'}.\n\nTitle: ${ticket.title}\nDescription: ${ticket.description}\nDepartment: ${ticket.departmentName}\nCategory: ${ticket.categoryName}\nSLA Due: ${new Date(ticket.slaDueDate).toLocaleString()}\nRaised By: ${ticket.creatorName} (${ticket.creatorEmail})\n\nThis complaint now needs immediate intervention from the escalation owner.\nRegistered Server timestamp: ${sentAt}`,
    sentAt,
    notificationType,
    escalationType: escalationType || 'Manual'
  };
};

const createNotificationEmail = async (params: {
  notificationType: NotificationType;
  ticket: ITicket;
  recipientName: string;
  recipientEmail: string;
  escalationType?: 'Manual' | 'Auto-SLA-Breach';
}) => {
  const email = buildNotificationEmail(params);
  await dbActions.createEmail(email);
  await sendRealEmailViaBrevo(email);
  return email;
};

const buildPushPayload = ({
  externalIds,
  heading,
  content,
  url,
  data
}: {
  externalIds: string[];
  heading: string;
  content: string;
  url?: string;
  data?: Record<string, any>;
}) => ({
  app_id: ONESIGNAL_APP_ID,
  target_channel: 'push',
  include_aliases: {
    external_id: externalIds
  },
  headings: {
    en: heading
  },
  contents: {
    en: content
  },
  url: url || undefined,
  data: data || undefined
});

const sendPushViaOneSignal = async ({
  recipientExternalIds,
  heading,
  content,
  url,
  data
}: {
  recipientExternalIds: string[];
  heading: string;
  content: string;
  url?: string;
  data?: Record<string, any>;
}) => {
  if (!ONESIGNAL_PUSH_ENABLED) return null;
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || recipientExternalIds.length === 0) return null;

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(buildPushPayload({
        externalIds: recipientExternalIds,
        heading,
        content,
        url,
        data
      }))
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.warn(`OneSignal push failed: ${response.status} ${responseText}`);
      return null;
    }

    console.log(`OneSignal push accepted for ${recipientExternalIds.join(', ')}: ${responseText}`);
    return responseText;
  } catch (error: any) {
    console.warn(`OneSignal push exception: ${error?.message || 'Unknown error'}`);
    return null;
  }
};

const sendPushForTicketEvent = async ({
  type,
  ticket,
  recipientEmail,
  recipientName,
  extraContent
}: {
  type: PushNotificationType;
  ticket: ITicket;
  recipientEmail: string;
  recipientName: string;
  extraContent?: string;
}) => {
  if (!recipientEmail) return;

  const headingMap: Record<PushNotificationType, string> = {
    Assignment: 'New Ticket Assigned',
    Escalation: 'Ticket Escalated',
    Closure: 'Ticket Closed',
    Reminder: 'Pending Ticket Reminder'
  };

  const baseContentMap: Record<PushNotificationType, string> = {
    Assignment: `${ticket.id} has been assigned to ${recipientName}.`,
    Escalation: `${ticket.id} needs immediate escalation attention.`,
    Closure: `${ticket.id} has been closed.`,
    Reminder: `${ticket.id} is still pending action.`
  };

  await sendPushViaOneSignal({
    recipientExternalIds: [recipientEmail.toLowerCase().trim()],
    heading: headingMap[type],
    content: `${baseContentMap[type]} ${extraContent || ticket.title}`,
    url: APP_URL || undefined,
    data: {
      ticketId: ticket.id,
      notificationType: type,
      ticketStatus: ticket.status
    }
  });
};

const sendRealEmailViaBrevo = async (email: ISentEmail) => {
  if (!BREVO_REAL_SEND) return;

  if (!BREVO_API_KEY || !MAIL_FROM_EMAIL) {
    console.warn(`Brevo email skipped for ${email.ticketId}: missing BREVO_API_KEY or MAIL_FROM_EMAIL.`);
    return;
  }

  try {
    const htmlContent = email.notificationType === 'Assignment'
      ? buildAssignmentEmailHtml(email)
      : email.notificationType === 'Escalation'
        ? buildEscalationEmailHtml(email)
        : email.notificationType === 'Closure'
          ? buildClosureEmailHtml(email)
          : undefined;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: MAIL_FROM_NAME,
          email: MAIL_FROM_EMAIL
        },
        to: [
          {
            email: email.toEmail,
            name: email.toName
          }
        ],
        subject: email.subject,
        textContent: email.body,
        htmlContent
      })
    });

    if (!response.ok) {
      const failureText = await response.text();
      console.warn(`Brevo send failed for ${email.ticketId}: ${response.status} ${failureText}`);
      return;
    }

    const result = await response.json().catch(() => null);
    console.log(`Brevo email sent for ${email.ticketId} to ${email.toEmail}${result?.messageId ? ` (${result.messageId})` : ''}`);
  } catch (error: any) {
    console.warn(`Brevo send exception for ${email.ticketId}: ${error?.message || 'Unknown error'}`);
  }
};

// Helper custom middleware to verify high-fidelity JWT permissions
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Access denied. Authenticating token missing from headers.' });
      return;
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        res.status(403).json({ error: 'Session token invalidated or expired.' });
        return;
      }
      req.user = decoded; // holds email, name, role
      next();
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server token verification failure.' });
  }
};

const authenticateApiKey = (permission: ApiPermission) => async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const rawKey = String(req.header('X-API-Key') || '').trim();
    if (!rawKey) return void res.status(401).json({ success: false, error: { code: 'INVALID_API_CREDENTIALS', message: 'Invalid API credentials.' } });
    const keyPrefix = extractKeyPrefix(rawKey, API_KEY_PREFIX);
    const client = keyPrefix ? await dbActions.findApiClientByPrefix(keyPrefix) : null;
    if (!client || !safelyMatchesApiKey(rawKey, client.keyHash)) {
      return void res.status(401).json({ success: false, error: { code: 'INVALID_API_CREDENTIALS', message: 'Invalid API credentials.' } });
    }
    if (!client.active || client.revokedAt || (client.expiresAt && new Date(client.expiresAt) <= new Date())) {
      return void res.status(401).json({ success: false, error: { code: 'INVALID_API_CREDENTIALS', message: 'Invalid API credentials.' } });
    }
    if (!client.permissions.includes(permission)) {
      return void res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Permission denied.' } });
    }
    const rate = integrationRateLimiter.consume(client.id);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
      return void res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.' } });
    }
    req.integrationClient = client;
    void dbActions.updateApiClient(client.id, { lastUsedAt: new Date().toISOString() });
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_API_CREDENTIALS', message: 'Invalid API credentials.' } });
  }
};

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== 'Admin') return void res.status(403).json({ error: 'Administration rights are required.' });
  next();
};

const safeApiClient = (client: IApiClient) => ({
  id: client.id,
  name: client.name,
  keyPrefix: client.keyPrefix,
  active: client.active,
  permissions: client.permissions,
  createdBy: client.createdBy,
  createdAt: client.createdAt,
  lastUsedAt: client.lastUsedAt || null,
  expiresAt: client.expiresAt || null,
  revokedAt: client.revokedAt || null
});

// Express extend interface internally
declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        name: string;
        role: 'User' | 'Admin';
        departmentId?: string;
        employeeId?: string;
        firstName?: string;
        lastName?: string;
        company?: string;
        departmentName?: string;
        designation?: string;
        reportingManager?: string;
        reportingManagerEmail?: string;
      };
      integrationClient?: IApiClient;
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON payload sent to the server.' });
      return;
    }
    next(error);
  });

  // 1. Core Database Initialization
  await initializeDb();

  const ticketServiceDependencies = {
    getDepartments: dbActions.getDepartments,
    getCategories: dbActions.getCategories,
    getUsers: dbActions.getUsers,
    generateTicketNumber: getNextTicketId,
    persistTicket: dbActions.createTicket,
    onCreated: async (ticket: ITicket) => {
      if (!ticket.assignedAgentEmail) return;
      await createNotificationEmail({
        notificationType: 'Assignment',
        ticket,
        recipientName: ticket.assignedAgent || 'Assigned Employee',
        recipientEmail: ticket.assignedAgentEmail
      });
      await sendPushForTicketEvent({
        type: 'Assignment', ticket,
        recipientEmail: ticket.assignedAgentEmail,
        recipientName: ticket.assignedAgent || 'Assigned Employee'
      });
    }
  };

  const emailTicketDependencies = {
    getSettings: dbActions.getEmailTicketSettings,
    findUserByEmail: dbActions.findUserByEmail,
    reserveEvent: dbActions.reserveInboundEmailEvent,
    updateEvent: dbActions.updateInboundEmailEvent,
    createTicket: (input: Parameters<typeof createTicket>[0]) => createTicket(input, ticketServiceDependencies),
    warn: (code: string, context: Record<string, unknown>) => {
      console.warn(`[Email Ticket] ${code}`, context);
    }
  };

  const runReminderSweep = async () => {
    if (!ONESIGNAL_PUSH_ENABLED || !ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) return;

    try {
      const tickets = await dbActions.getTickets();
      const now = Date.now();
      const reminderIntervalMs = ONESIGNAL_REMINDER_INTERVAL_MINUTES * 60 * 1000;

      for (const ticket of tickets) {
        if (!ticket.assignedAgentEmail) continue;
        if (ticket.status === 'Resolved' || ticket.status === 'Closed') continue;

        const lastReminderAt = ticket.lastReminderSentAt ? new Date(ticket.lastReminderSentAt).getTime() : 0;
        if (lastReminderAt && now - lastReminderAt < reminderIntervalMs) continue;

        await sendPushForTicketEvent({
          type: 'Reminder',
          ticket,
          recipientEmail: ticket.assignedAgentEmail,
          recipientName: ticket.assignedAgent || 'Assigned Employee',
          extraContent: `Pending ticket: ${ticket.title}`
        });

        await dbActions.updateTicket(ticket.id, {
          lastReminderSentAt: new Date(now).toISOString(),
          reminderCount: (ticket.reminderCount || 0) + 1
        });
      }
    } catch (error: any) {
      console.warn(`OneSignal reminder sweep failed: ${error?.message || 'Unknown error'}`);
    }
  };

  setInterval(() => {
    runReminderSweep();
  }, 15 * 60 * 1000);



// Cron route for cron-job.org
app.get('/cron', async (req, res) => {
  try {
    console.log('Cron ping received:', new Date().toISOString());

    // optional: run reminder sweep
    await runReminderSweep();

    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Cron failed:', error.message);
    res.status(500).send('Error');
  }
});


  

  // 2. BACKEND API ENDPOINTS
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      database: dbActions.isUsingMongo() ? 'MongoDB' : 'Disk Cache Fallback',
      time: new Date().toISOString()
    });
  });

  app.get('/api/push/config', authenticateToken, (req, res) => {
    res.json({
      enabled: ONESIGNAL_PUSH_ENABLED,
      appId: ONESIGNAL_APP_ID,
      appUrl: APP_URL
    });
  });

  // Auth: Submit registration
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, name, password } = req.body;

      if (!email || !name || !password) {
        res.status(400).json({ error: 'Missing mandatory registration fields.' });
        return;
      }

      const existingUser = await dbActions.findUserByEmail(email);
      if (existingUser) {
        res.status(400).json({ error: 'An account with this email is already registered.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const newUser: IUser = {
        email: email.toLowerCase().trim(),
        name,
        passwordHash,
        role: 'User'
      };

      await dbActions.createUser(newUser);

      const safeUser = sanitizeUser(newUser);

      const token = jwt.sign(
        safeUser,
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        token,
        user: safeUser
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Unknown registration failure' });
    }
  });

  // Auth: Log in
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password inputs are required.' });
        return;
      }

      const user = await dbActions.findUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid login details. Account not detected.' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Incorrect password. Access denied.' });
        return;
      }

      const token = jwt.sign(
        sanitizeUser(user),
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: sanitizeUser(user)
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Login routine failed.' });
    }
  });

  // Auth: Retrieve current user
  app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({ error: 'Current password, new password, and confirmation are required.' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters long.' });
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({ error: 'New password and confirmation do not match.' });
        return;
      }

      if (currentPassword === newPassword) {
        res.status(400).json({ error: 'New password must be different from your current password.' });
        return;
      }

      const user = await dbActions.findUserByEmail(req.user!.email);
      if (!user) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);
      await dbActions.updateUserPassword(user.email, passwordHash);

      res.json({ message: 'Password updated successfully.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Password update failed.' });
    }
  });

  app.post('/api/admin/reset-user-password', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Only admins can reset employee passwords.' });
        return;
      }

      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: 'Employee email is required.' });
        return;
      }

      const user = await dbActions.findUserByEmail(email);
      if (!user) {
        res.status(404).json({ error: 'Employee account not found.' });
        return;
      }

      if (!user.employeeId) {
        res.status(400).json({ error: 'This account does not have an Employee ID default password to reset to.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(user.employeeId, salt);
      await dbActions.updateUserPassword(user.email, passwordHash);

      res.json({
        message: `Password reset successfully. ${user.name} can now sign in using Employee ID ${user.employeeId}.`
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Employee password reset failed.' });
    }
  });

  app.delete('/api/admin/users/:email', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Only admins can delete employee accounts.' });
        return;
      }

      const email = decodeURIComponent(req.params.email || '').toLowerCase().trim();
      if (!email) {
        res.status(400).json({ error: 'Employee email is required.' });
        return;
      }

      if (req.user.email.toLowerCase().trim() === email) {
        res.status(400).json({ error: 'You cannot delete your own active admin account.' });
        return;
      }

      const user = await dbActions.findUserByEmail(email);
      if (!user) {
        res.status(404).json({ error: 'Employee account not found.' });
        return;
      }

      if (user.role === 'Admin') {
        res.status(400).json({ error: 'Admin accounts cannot be deleted from this employee panel.' });
        return;
      }

      const deleted = await dbActions.deleteUser(email);
      if (!deleted) {
        res.status(500).json({ error: 'Employee account could not be deleted.' });
        return;
      }

      res.json({ message: `${user.name} was deleted successfully.` });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Employee delete failed.' });
    }
  });

  app.post('/api/admin/users', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Only admins can create employee accounts.' });
        return;
      }

      const {
        firstName,
        lastName,
        email,
        employeeId,
        departmentId,
        designation,
        reportingManager,
        reportingManagerEmail,
        company,
        role,
        password
      } = req.body;

      if (!firstName || !lastName || !email || !employeeId || !departmentId || !designation) {
        res.status(400).json({ error: 'First name, last name, email, employee ID, department, and designation are required.' });
        return;
      }

      const existingUser = await dbActions.findUserByEmail(email);
      if (existingUser) {
        res.status(400).json({ error: 'An account with this email already exists.' });
        return;
      }

      const departments = await dbActions.getDepartments();
      const selectedDepartment = departments.find((department) => department.id === departmentId);
      if (!selectedDepartment) {
        res.status(400).json({ error: 'Selected department was not found.' });
        return;
      }

      const fullName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
      const defaultPassword = String(password || employeeId).trim();
      if (!defaultPassword) {
        res.status(400).json({ error: 'A default password could not be generated for this user.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(defaultPassword, salt);

      const newUser: IUser = {
        email: String(email).toLowerCase().trim(),
        name: fullName,
        passwordHash,
        role: role === 'Admin' ? 'Admin' : 'User',
        departmentId: selectedDepartment.id,
        employeeId: String(employeeId).trim(),
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        company: String(company || 'Aaradhya Group').trim(),
        departmentName: selectedDepartment.name,
        designation: String(designation).trim(),
        reportingManager: String(reportingManager || '').trim(),
        reportingManagerEmail: String(reportingManagerEmail || '').trim()
      };

      const created = await dbActions.createUser(newUser);
      res.status(201).json({
        message: 'Employee account created successfully.',
        user: sanitizeUser(created)
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Employee account creation failed.' });
    }
  });

  app.post('/api/admin/reset-tickets', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Only admins can reset all tickets.' });
        return;
      }

      const result = await dbActions.resetTickets();
      resetTicketSequence();

      res.json({
        message: `Deleted ${result.deletedTickets} tickets and ${result.deletedEmails} ticket emails. Ticket numbering will restart from TKT-1.`,
        deletedTickets: result.deletedTickets,
        deletedEmails: result.deletedEmails,
        nextTicketId: 'TKT-1'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Ticket reset failed.' });
    }
  });

  // Users: GET (all company users)
  app.get('/api/users', authenticateToken, async (req, res) => {
    try {
      const [users, employeeOptions] = await Promise.all([
        dbActions.getUsers(),
        dbActions.getEmployeeOptions()
      ]);
      res.json({ users: users.map(sanitizeUser), employeeOptions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/escalation-rules', authenticateToken, async (_req, res) => {
    try {
      const rules = await dbActions.getEscalationRules();
      res.json({ rules });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load escalation rules.' });
    }
  });

  app.post('/api/escalation-rules', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Only admins can manage escalation ladders.' });
        return;
      }

      const { departmentId, designationLevels } = req.body as {
        departmentId?: string;
        designationLevels?: string[];
      };

      if (!departmentId || !Array.isArray(designationLevels) || designationLevels.length === 0) {
        res.status(400).json({ error: 'Department and at least one designation tier are required.' });
        return;
      }

      const departments = await dbActions.getDepartments();
      const department = departments.find((item) => item.id === departmentId);
      if (!department) {
        res.status(404).json({ error: 'Department not found.' });
        return;
      }

      const cleanedLevels = designationLevels
        .map((level) => String(level || '').trim())
        .filter(Boolean);

      if (cleanedLevels.length === 0) {
        res.status(400).json({ error: 'Please provide valid designation tiers.' });
        return;
      }

      const existingRules = await dbActions.getEscalationRules();
      const existingRule = existingRules.find((rule) => rule.departmentId === departmentId);
      const now = new Date().toISOString();
      const rule: IEscalationRule = {
        id: existingRule?.id || `esc-rule-${departmentId}`,
        departmentId,
        departmentName: department.name,
        designationLevels: cleanedLevels,
        createdAt: existingRule?.createdAt || now,
        updatedAt: now
      };

      const savedRule = await dbActions.upsertEscalationRule(rule);
      res.json({ rule: savedRule });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to save escalation rule.' });
    }
  });

  // Departments: GET
  app.get('/api/departments', async (req, res) => {
    try {
      const depts = await dbActions.getDepartments();
      res.json({ departments: depts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Departments: POST (Admin only)
  app.post('/api/departments', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Unprivileged. Only admins can register custom departments.' });
        return;
      }

      const { name } = req.body;
      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Department name is required.' });
        return;
      }

      const depts = await dbActions.getDepartments();
      const duplicate = depts.some(d => d.name.toLowerCase() === name.trim().toLowerCase());
      if (duplicate) {
        res.status(400).json({ error: 'A department with this name already exists.' });
        return;
      }

      const newDept: IDepartment = {
        id: 'dept-' + Date.now(),
        name: name.trim(),
        isCustom: true,
        createdAt: new Date().toISOString()
      };

      const created = await dbActions.createDepartment(newDept);
      res.status(201).json({ department: created });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Departments: DELETE (Admin only)
  app.delete('/api/departments/:id', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Unprivileged access.' });
        return;
      }

      const id = req.params.id;
      await dbActions.deleteDepartment(id);
      res.json({ success: true, message: 'Custom department and related SLAs purged.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Categories: GET
  app.get('/api/categories', async (req, res) => {
    try {
      const cats = await dbActions.getCategories();
      res.json({ categories: cats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Categories: POST (Admin only)
  app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Admins privileges required.' });
        return;
      }

      const { departmentId, name, defaultSlaValue, defaultSlaUnit, defaultPriority } = req.body;
      if (!departmentId || !name || !defaultSlaValue || !defaultSlaUnit) {
        res.status(400).json({ error: 'Missing SLA mapping properties.' });
        return;
      }

      const newCat: IComplaintCategory = {
        id: 'cat-' + Date.now(),
        departmentId,
        name: name.trim(),
        defaultSlaValue: parseInt(defaultSlaValue) || 4,
        defaultSlaUnit,
        defaultPriority: defaultPriority || 'Medium',
        createdAt: new Date().toISOString()
      };

      const created = await dbActions.createCategory(newCat);
      res.status(201).json({ category: created });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Categories: DELETE (Admin only)
  app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Unprivileged validation parameters.' });
        return;
      }
      const id = req.params.id;
      await dbActions.deleteCategory(id);
      res.json({ success: true, message: 'Category rules removed.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Email-to-ticket administration. Provider adapters call processInboundEmail directly;
  // no mailbox provider endpoint is configured in this phase.
  app.get('/api/admin/email-ticket/settings', authenticateToken, requireAdmin, async (_req, res) => {
    try {
      res.json({ success: true, data: await dbActions.getEmailTicketSettings() });
    } catch {
      res.status(500).json({ error: 'Email ticket settings could not be loaded.' });
    }
  });

  app.put('/api/admin/email-ticket/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const enabled = Boolean(req.body.enabled);
      const subjectPrefix = String(req.body.subjectPrefix || '').trim().slice(0, 200);
      const defaultAssigneeEmail = String(req.body.defaultAssigneeEmail || '').trim().toLowerCase().slice(0, 254);
      if (!subjectPrefix) return void res.status(400).json({ error: 'Subject Prefix is required.' });
      if (defaultAssigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultAssigneeEmail)) {
        return void res.status(400).json({ error: 'Default Assignee Email must be a valid email address.' });
      }
      const settings = await dbActions.saveEmailTicketSettings({
        id: 'email-ticket', enabled, subjectPrefix, defaultAssigneeEmail,
        updatedAt: new Date().toISOString(), updatedBy: req.user!.email
      });
      res.json({ success: true, data: settings });
    } catch {
      res.status(500).json({ error: 'Email ticket settings could not be saved.' });
    }
  });

  app.get('/api/admin/email-ticket/logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit || 100);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
      res.json({ success: true, data: await dbActions.listInboundEmailEvents(limit) });
    } catch {
      res.status(500).json({ error: 'Email ticket logs could not be loaded.' });
    }
  });

  const gmailHeader = (payload: any, name: string) => String((payload?.headers || []).find((header: any) => String(header.name).toLowerCase() === name.toLowerCase())?.value || '');
  const gmailBody = (part: any, mimeType: string): string => {
    if (!part) return '';
    if (part.mimeType === mimeType && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
    for (const child of part.parts || []) {
      const value = gmailBody(child, mimeType);
      if (value) return value;
    }
    return '';
  };
  const gmailAddresses = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
  const gmailConfigReady = () => !!(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REDIRECT_URI);
  const refreshGmailAccessToken = async (credential: IGmailIntegrationCredential) => {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: decryptGmailToken(credential.encryptedRefreshToken), grant_type: 'refresh_token' }) });
    const tokenData = await tokenResponse.json() as any;
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || 'GMAIL_TOKEN_REFRESH_FAILED');
    return tokenData.access_token as string;
  };

  app.get('/api/admin/integrations/gmail/status', authenticateToken, requireAdmin, async (_req, res) => {
    const credentials = await dbActions.listGmailIntegrationCredentials();
    res.json({ success: true, data: { configured: gmailConfigReady(), redirectUri: GMAIL_REDIRECT_URI, mailboxes: credentials.map(({ encryptedRefreshToken: _token, ...mailbox }) => mailbox) } });
  });

  app.post('/api/admin/integrations/gmail/authorize', authenticateToken, requireAdmin, (req, res) => {
    if (!gmailConfigReady()) return void res.status(503).json({ error: 'Gmail OAuth configuration is missing.' });
    const userEmail = String(req.body.userEmail || '').trim().toLowerCase();
    if (!userEmail) return void res.status(400).json({ error: 'Select the TMS user whose mailbox you are connecting.' });
    const state = jwt.sign({ purpose: 'gmail-oauth', userEmail }, JWT_SECRET, { expiresIn: '10m' });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: GMAIL_CLIENT_ID, redirect_uri: GMAIL_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/gmail.readonly', state }).toString();
    res.json({ success: true, data: { authorizationUrl: url.toString() } });
  });

  app.get('/api/integrations/gmail/callback', async (req, res) => {
    try {
      const state = String(req.query.state || '');
      const code = String(req.query.code || '');
      const payload = jwt.verify(state, JWT_SECRET) as { purpose?: string; userEmail?: string };
      if (payload.purpose !== 'gmail-oauth' || !code) throw new Error('GMAIL_OAUTH_INVALID_CALLBACK');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, redirect_uri: GMAIL_REDIRECT_URI, grant_type: 'authorization_code' }) });
      const tokenData = await tokenResponse.json() as any;
      if (!tokenResponse.ok || !tokenData.refresh_token || !tokenData.access_token) throw new Error(tokenData.error_description || 'GMAIL_OAUTH_TOKEN_EXCHANGE_FAILED');
      const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const profile = await profileResponse.json() as any;
      const email = String(profile.emailAddress || '').toLowerCase();
      if (!profileResponse.ok || email !== payload.userEmail) throw new Error(`Authorize the selected TMS user mailbox: ${payload.userEmail}`);
      const now = new Date().toISOString();
      await dbActions.saveGmailIntegrationCredential({ id: `gmail-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`, email, userEmail: email, encryptedRefreshToken: encryptGmailToken(tokenData.refresh_token), connectedAt: now, updatedAt: now });
      res.send('<!doctype html><title>Gmail connected</title><p>Gmail inbox connected successfully. You can close this window and return to TMS.</p>');
    } catch (error) {
      res.status(400).send(`<!doctype html><title>Gmail connection failed</title><p>${escapeHtml(error instanceof Error ? error.message : 'Gmail connection failed.')}</p>`);
    }
  });

  app.post('/api/admin/integrations/gmail/sync', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const mailboxes = await dbActions.listGmailIntegrationCredentials();
      const requestedMailboxId = String(req.body.mailboxId || '');
      const selectedMailboxes = requestedMailboxId ? mailboxes.filter((mailbox) => mailbox.id === requestedMailboxId) : mailboxes;
      if (selectedMailboxes.length === 0) return void res.status(409).json({ error: 'Connect a Gmail inbox before syncing.' });
      const results = { created: 0, ignored: 0, duplicates: 0, failed: 0, mailboxes: selectedMailboxes.length };
      for (const credential of selectedMailboxes) {
      const accessToken = await refreshGmailAccessToken(credential);
      const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in%3Ainbox', { headers: { Authorization: `Bearer ${accessToken}` } });
      const listData = await listResponse.json() as any;
      if (!listResponse.ok) throw new Error(listData.error?.message || 'GMAIL_MESSAGE_LIST_FAILED');
      const messages = listData.messages || [];
      let nextMessageIndex = 0;
      const processNextMessage = async () => {
        while (nextMessageIndex < messages.length) {
          const item = messages[nextMessageIndex++];
          try {
            const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!messageResponse.ok) { results.failed += 1; continue; }
            const message = await messageResponse.json() as any;
            const result = await processInboundEmail({ messageId: gmailHeader(message.payload, 'Message-ID') || `gmail-${message.id}`, fromEmail: gmailHeader(message.payload, 'From'), fromName: '', toEmails: gmailAddresses(gmailHeader(message.payload, 'To')), ccEmails: gmailAddresses(gmailHeader(message.payload, 'Cc')), originalToEmails: gmailAddresses(gmailHeader(message.payload, 'X-Original-To') || gmailHeader(message.payload, 'Delivered-To')), subject: gmailHeader(message.payload, 'Subject'), textBody: gmailBody(message.payload, 'text/plain'), htmlBody: gmailBody(message.payload, 'text/html'), receivedAt: new Date(Number(message.internalDate || Date.now())).toISOString() }, emailTicketDependencies);
            if (result.status === 'CREATED' || result.status === 'DEFAULT_ASSIGNEE_USED') results.created += 1;
            else if (result.status === 'IGNORED_SUBJECT') results.ignored += 1;
            else if (result.status === 'DUPLICATE') results.duplicates += 1;
            else if (result.status === 'FAILED') results.failed += 1;
          } catch { results.failed += 1; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, messages.length) }, processNextMessage));
      }
      res.json({ success: true, data: results });
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Gmail sync failed.' }); }
  });

  // API client management (JWT admin only)
  app.get('/api/admin/api-clients', authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const clients = await dbActions.listApiClients();
      res.json({ success: true, data: clients.map(safeApiClient) });
    } catch (error) {
      console.error('API client listing failed:', error instanceof Error ? error.message : error);
      res.status(500).json({ error: 'API clients could not be loaded.' });
    }
  });

  app.post('/api/admin/api-clients', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim().slice(0, 120);
      const permissions: string[] = Array.isArray(req.body.permissions)
        ? Array.from(new Set<string>(req.body.permissions.filter((value: unknown): value is string => typeof value === 'string' && API_PERMISSIONS.includes(value as ApiPermission))))
        : [];
      if (name.length < 3 || permissions.length === 0) {
        return void res.status(400).json({ error: 'Name and at least one valid permission are required.' });
      }
      let expiresAt: string | null = null;
      if (req.body.expiresAt) {
        const expiry = new Date(req.body.expiresAt);
        if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) return void res.status(400).json({ error: 'Expiry must be a future date.' });
        expiresAt = expiry.toISOString();
      }
      const { rawKey, keyPrefix } = generateApiKey(API_KEY_PREFIX);
      const now = new Date().toISOString();
      const client: IApiClient = {
        id: `api-client-${crypto.randomUUID()}`,
        name,
        keyPrefix,
        keyHash: hashApiKey(rawKey),
        active: true,
        permissions,
        createdBy: req.user!.email,
        createdAt: now,
        lastUsedAt: null,
        expiresAt,
        revokedAt: null
      };
      await dbActions.createApiClient(client);
      await dbActions.createApiAuditEvent({
        id: `api-audit-${crypto.randomUUID()}`, eventType: 'API_CLIENT_CREATED',
        actor: req.user!.email, apiClientId: client.id, createdAt: now
      });
      res.status(201).json({ success: true, data: { client: safeApiClient(client), apiKey: rawKey } });
    } catch {
      res.status(500).json({ error: 'API client could not be created.' });
    }
  });

  app.patch('/api/admin/api-clients/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const action = String(req.body.action || '');
      const existing = (await dbActions.listApiClients()).find(client => client.id === req.params.id);
      if (!existing) return void res.status(404).json({ error: 'API client not found.' });
      if (existing.revokedAt && action !== 'regenerate') return void res.status(422).json({ error: 'A revoked API client must be regenerated.' });
      const now = new Date().toISOString();
      let updates: Partial<IApiClient> = {};
      let rawKey: string | undefined;
      let eventType = '';
      if (action === 'enable') { updates = { active: true }; eventType = 'API_CLIENT_ENABLED'; }
      else if (action === 'disable') { updates = { active: false }; eventType = 'API_CLIENT_DISABLED'; }
      else if (action === 'revoke') { updates = { active: false, revokedAt: now }; eventType = 'API_CLIENT_REVOKED'; }
      else if (action === 'regenerate') {
        const generated = generateApiKey(API_KEY_PREFIX);
        rawKey = generated.rawKey;
        updates = { keyPrefix: generated.keyPrefix, keyHash: hashApiKey(rawKey), active: true, revokedAt: null, lastUsedAt: null };
        eventType = 'API_KEY_REGENERATED';
      } else return void res.status(400).json({ error: 'Unsupported API client action.' });
      const updated = await dbActions.updateApiClient(existing.id, updates);
      await dbActions.createApiAuditEvent({
        id: `api-audit-${crypto.randomUUID()}`, eventType, actor: req.user!.email,
        apiClientId: existing.id, createdAt: now
      });
      res.json({ success: true, data: { client: safeApiClient(updated!), ...(rawKey ? { apiKey: rawKey } : {}) } });
    } catch {
      res.status(500).json({ error: 'API client could not be updated.' });
    }
  });

  const apiTicketById = async (ticketId: string, res: express.Response) => {
    const ticket = await dbActions.findTicketById(ticketId);
    if (!ticket) res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' } });
    return ticket;
  };

  app.post('/api/v1/tickets', authenticateApiKey('tickets:create'), async (req, res) => {
    const client = req.integrationClient!;
    try {
      const idempotencyKey = String(req.header('Idempotency-Key') || '').trim();
      if (!idempotencyKey || idempotencyKey.length > 200) {
        return void res.status(400).json({ success: false, error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' } });
      }
      const existingRecord = await dbActions.findIdempotency(client.id, idempotencyKey);
      if (existingRecord) {
        const original = await dbActions.findTicketById(existingRecord.relatedTicketId);
        return void res.status(200).json({ success: true, data: original ? toPublicTicket(original) : null, idempotentReplay: true });
      }
      const created = await createTicket({
        subject: req.body.subject,
        description: req.body.description,
        requester: req.body.requester || {},
        source: 'API',
        priority: req.body.priority,
        departmentId: req.body.departmentId,
        categoryId: req.body.categoryId,
        assignedTo: req.body.assignedTo,
        customFields: req.body.customFields,
        metadata: req.body.metadata,
        createdBy: client.name,
        integrationClientId: client.id
      }, ticketServiceDependencies);
      try {
        await dbActions.createIdempotency({
          integrationClientId: client.id, idempotencyKey, relatedTicketId: created.id, createdAt: new Date().toISOString()
        });
      } catch {
        const replay = await dbActions.findIdempotency(client.id, idempotencyKey);
        const original = replay ? await dbActions.findTicketById(replay.relatedTicketId) : created;
        return void res.status(200).json({ success: true, data: toPublicTicket(original || created), idempotentReplay: true });
      }
      await dbActions.createApiAuditEvent({
        id: `api-audit-${crypto.randomUUID()}`, eventType: 'TICKET_CREATED_VIA_API',
        actor: client.name, apiClientId: client.id, ticketId: created.id, createdAt: new Date().toISOString()
      });
      res.status(201).json({ success: true, data: toPublicTicket(created) });
    } catch (error: any) {
      if (error instanceof TicketValidationError) {
        return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: error.message, details: error.details } });
      }
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Ticket creation failed.' } });
    }
  });

  app.get('/api/v1/tickets', authenticateApiKey('tickets:read'), async (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
    const status = String(req.query.status || '').toLowerCase();
    const priority = String(req.query.priority || '').toLowerCase();
    const source = String(req.query.source || '').toLowerCase();
    const departmentId = String(req.query.departmentId || '');
    const search = String(req.query.search || '').trim().toLowerCase().slice(0, 200);
    let tickets = await dbActions.getTickets();
    tickets = tickets.filter(ticket =>
      (!status || ticket.status.toLowerCase().replace(/\s+/g, '_') === status) &&
      (!priority || ticket.priority.toLowerCase() === priority) &&
      (!source || (ticket.source || 'PORTAL').toLowerCase() === source) &&
      (!departmentId || ticket.departmentId === departmentId) &&
      (!search || ticket.id.toLowerCase().includes(search) || ticket.title.toLowerCase().includes(search) || ticket.description.toLowerCase().includes(search))
    );
    const total = tickets.length;
    const data = tickets.slice((page - 1) * limit, page * limit).map(toPublicTicket);
    res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  app.get('/api/v1/tickets/:id', authenticateApiKey('tickets:read'), async (req, res) => {
    const ticket = await apiTicketById(req.params.id, res);
    if (ticket) res.json({ success: true, data: toPublicTicket(ticket) });
  });

  app.patch('/api/v1/tickets/:id', authenticateApiKey('tickets:update'), async (req, res) => {
    const existing = await apiTicketById(req.params.id, res);
    if (!existing) return;
    const updates: Partial<ITicket> = { updatedAt: new Date().toISOString() };
    if (req.body.description !== undefined) updates.description = String(req.body.description).trim().slice(0, 10_000);
    if (req.body.priority !== undefined) {
      const priorityMap: Record<string, ITicket['priority']> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
      const priority = priorityMap[String(req.body.priority).toLowerCase()];
      if (!priority) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid priority.' } });
      updates.priority = priority;
    }
    const updated = await dbActions.updateTicket(existing.id, updates);
    await dbActions.createApiAuditEvent({
      id: `api-audit-${crypto.randomUUID()}`, eventType: 'TICKET_UPDATED_VIA_API',
      actor: req.integrationClient!.name, apiClientId: req.integrationClient!.id, ticketId: existing.id, createdAt: new Date().toISOString()
    });
    res.json({ success: true, data: toPublicTicket(updated!) });
  });

  app.post('/api/v1/tickets/:id/replies', authenticateApiKey('tickets:reply'), async (req, res) => {
    const existing = await apiTicketById(req.params.id, res);
    if (!existing) return;
    const message = String(req.body.message || '').trim().slice(0, 5000);
    if (!message) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: 'Reply message is required.' } });
    const now = new Date().toISOString();
    const reply = {
      id: `remark-${crypto.randomUUID()}`, timestamp: now,
      userEmail: `integration:${req.integrationClient!.id}`, userName: req.integrationClient!.name, message
    };
    const updated = await dbActions.updateTicket(existing.id, {
      remarks: [...(existing.remarks || []), reply],
      history: [...(existing.history || []), {
        id: `hist-${crypto.randomUUID()}`, timestamp: now,
        userEmail: reply.userEmail, action: 'Reply added via API'
      }],
      updatedAt: now
    });
    await dbActions.createApiAuditEvent({
      id: `api-audit-${crypto.randomUUID()}`, eventType: 'TICKET_REPLY_ADDED_VIA_API',
      actor: req.integrationClient!.name, apiClientId: req.integrationClient!.id, ticketId: existing.id, createdAt: now
    });
    res.status(201).json({ success: true, data: reply, ticket: toPublicTicket(updated!) });
  });

  app.get('/api/v1/tickets/:id/replies', authenticateApiKey('tickets:read'), async (req, res) => {
    const ticket = await apiTicketById(req.params.id, res);
    if (ticket) res.json({ success: true, data: ticket.remarks || [] });
  });

  app.patch('/api/v1/tickets/:id/status', authenticateApiKey('tickets:update'), async (req, res) => {
    const ticket = await apiTicketById(req.params.id, res);
    if (!ticket) return;
    const statusMap: Record<string, ITicket['status']> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
    const status = statusMap[String(req.body.status || '').toLowerCase()];
    if (!status) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid status.' } });
    const now = new Date().toISOString();
    const updated = await dbActions.updateTicket(ticket.id, {
      status, resolvedAt: status === 'Resolved' || status === 'Closed' ? now : null, updatedAt: now,
      history: [...ticket.history, { id: `hist-${crypto.randomUUID()}`, timestamp: now, userEmail: `integration:${req.integrationClient!.id}`, action: `Status changed to ${status} via API` }]
    });
    await dbActions.createApiAuditEvent({
      id: `api-audit-${crypto.randomUUID()}`, eventType: 'TICKET_STATUS_CHANGED_VIA_API',
      actor: req.integrationClient!.name, apiClientId: req.integrationClient!.id, ticketId: ticket.id, createdAt: now
    });
    if (status === 'Closed' && ticket.status !== 'Closed' && updated?.creatorEmail) {
      await createNotificationEmail({
        notificationType: 'Closure', ticket: updated,
        recipientName: updated.creatorName, recipientEmail: updated.creatorEmail
      });
      await sendPushForTicketEvent({
        type: 'Closure', ticket: updated,
        recipientName: updated.creatorName, recipientEmail: updated.creatorEmail
      });
    }
    res.json({ success: true, data: toPublicTicket(updated!) });
  });

  app.patch('/api/v1/tickets/:id/assign', authenticateApiKey('tickets:assign'), async (req, res) => {
    const ticket = await apiTicketById(req.params.id, res);
    if (!ticket) return;
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = (await dbActions.getUsers()).find(item => item.email.toLowerCase() === email);
    if (!user) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: 'Assigned employee was not found.' } });
    const now = new Date().toISOString();
    const updated = await dbActions.updateTicket(ticket.id, {
      assignedAgent: user.name, assignedAgentEmail: user.email, updatedAt: now,
      history: [...(ticket.history || []), {
        id: `hist-${crypto.randomUUID()}`, timestamp: now,
        userEmail: `integration:${req.integrationClient!.id}`, action: `Assigned to ${user.name} via API`
      }]
    });
    await dbActions.createApiAuditEvent({
      id: `api-audit-${crypto.randomUUID()}`, eventType: 'TICKET_ASSIGNED_VIA_API',
      actor: req.integrationClient!.name, apiClientId: req.integrationClient!.id, ticketId: ticket.id, createdAt: now
    });
    if (updated && user.email.toLowerCase() !== (ticket.assignedAgentEmail || '').toLowerCase()) {
      await createNotificationEmail({ notificationType: 'Assignment', ticket: updated, recipientName: user.name, recipientEmail: user.email });
      await sendPushForTicketEvent({ type: 'Assignment', ticket: updated, recipientName: user.name, recipientEmail: user.email });
    }
    res.json({ success: true, data: toPublicTicket(updated!) });
  });

  app.post('/api/v1/public/tickets', async (req, res) => {
    const rate = publicRateLimiter.consume(req.ip || 'unknown');
    if (!rate.allowed) return void res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.' } });
    try {
      if (PUBLIC_TICKET_CAPTCHA_ENABLED) {
        const token = String(req.header('X-Turnstile-Token') || req.body.captchaToken || '');
        if (!token || !TURNSTILE_SECRET_KEY) return void res.status(403).json({ success: false, error: { code: 'CAPTCHA_REQUIRED', message: 'CAPTCHA verification is required.' } });
        const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token, remoteip: req.ip || '' })
        });
        const captcha = await captchaResponse.json() as { success?: boolean };
        if (!captcha.success) return void res.status(403).json({ success: false, error: { code: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed.' } });
      }
      const created = await createTicket({
        subject: req.body.subject, description: req.body.description, requester: req.body.requester || {},
        source: 'PUBLIC_FORM', priority: req.body.priority, departmentId: req.body.departmentId,
        categoryId: req.body.categoryId, customFields: req.body.customFields,
        metadata: { ...(req.body.metadata || {}), publicSubmission: true }
      }, ticketServiceDependencies);
      res.status(201).json({ success: true, data: { ticketNumber: created.id, status: 'open', createdAt: created.createdAt } });
    } catch (error: any) {
      if (error instanceof TicketValidationError) return void res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: error.message, details: error.details } });
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Ticket creation failed.' } });
    }
  });

+  // Tickets: GET (Returns all tickets)
  app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
      const tkts = await dbActions.getTickets();
      res.json({ tickets: tkts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Existing frontend ticket creation now delegates to the canonical service.
  app.post('/api/tickets', authenticateToken, async (req, res) => {
    try {
      const created = await createTicket({
        subject: req.body.title,
        description: req.body.description,
        requester: { name: req.user!.name, email: req.user!.email },
        source: req.user?.role === 'Admin' ? 'ADMIN' : 'PORTAL',
        priority: req.body.priority,
        departmentId: req.body.departmentId || req.user?.departmentId,
        categoryId: req.body.categoryId,
        assignedTo: req.body.assignedAgentEmail,
        dueDate: req.body.dueDate,
        createdBy: req.user!.email
      }, ticketServiceDependencies);
      const emails = await dbActions.getEmails();
      const assignmentEmail = emails.find(email => email.ticketId === created.id && email.notificationType === 'Assignment') || null;
      res.status(201).json({ ticket: created, email: assignmentEmail });
    } catch (error: any) {
      if (error instanceof TicketValidationError) {
        return void res.status(400).json({ error: error.message, details: error.details });
      }
      res.status(500).json({ error: 'Ticket creation failed.' });
    }
  });


  // Tickets: PUT (Update status, agent, priority, override SLA)
  app.put('/api/tickets/:id', authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { status, priority, assignedAgent, assignedAgentEmail, slaType, slaDurationValue, slaDurationUnit, slaDueDate, resolvedAt, history, remarks, isEscalated } = req.body;
      const existingTicket = (await dbActions.getTickets()).find(ticket => ticket.id === id);

      if (!existingTicket) {
        res.status(404).json({ error: 'Complaint ticket not found.' });
        return;
      }

      const isAdminUser = req.user?.role === 'Admin';
      const actorEmail = req.user?.email?.toLowerCase() || '';
      const actorName = req.user?.name?.trim().toLowerCase() || '';
      const assignedAgentNameNormalized = (existingTicket.assignedAgent || '').trim().toLowerCase();
      const assignedAgentEmailNormalized = (existingTicket.assignedAgentEmail || '').trim().toLowerCase();
      const isAssignedUser =
        (!!assignedAgentEmailNormalized && assignedAgentEmailNormalized === actorEmail) ||
        (!!assignedAgentNameNormalized && assignedAgentNameNormalized === actorName) ||
        (!!assignedAgentNameNormalized && assignedAgentNameNormalized.includes(actorName));

      if (!isAdminUser) {
        const dueDateChanged = slaDueDate !== undefined && slaDueDate !== existingTicket.slaDueDate;
        const forbiddenChanges: string[] = [];

        if (assignedAgent !== undefined && assignedAgent !== existingTicket.assignedAgent) {
          forbiddenChanges.push('assignment');
        }
        if (assignedAgentEmail !== undefined && assignedAgentEmail !== existingTicket.assignedAgentEmail) {
          forbiddenChanges.push('assigned agent email');
        }
        if (slaType !== undefined && slaType !== existingTicket.slaType) {
          forbiddenChanges.push('SLA type');
        }
        if (slaDurationValue !== undefined && parseInt(slaDurationValue) !== existingTicket.slaDurationValue) {
          forbiddenChanges.push('SLA duration');
        }
        if (slaDurationUnit !== undefined && slaDurationUnit !== existingTicket.slaDurationUnit) {
          forbiddenChanges.push('SLA unit');
        }
        if (dueDateChanged && !isAssignedUser) {
          forbiddenChanges.push('due date');
        }
        if (isEscalated !== undefined && isEscalated !== existingTicket.isEscalated) {
          forbiddenChanges.push('escalation');
        }

        if (forbiddenChanges.length > 0) {
          res.status(403).json({
            error: `You are not allowed to change: ${forbiddenChanges.join(', ')}. Only the assigned user can update due date, and only admins can change assignment, escalation, or SLA configuration.`
          });
          return;
        }
      }

      const validateAppendedItems = <T extends { userEmail: string }>(
        existingItems: T[] = [],
        nextItems: T[] = []
      ) => {
        if (!Array.isArray(nextItems)) return false;
        if (nextItems.length < existingItems.length) return false;

        for (let index = 0; index < existingItems.length; index++) {
          if (JSON.stringify(existingItems[index]) !== JSON.stringify(nextItems[index])) {
            return false;
          }
        }

        for (let index = existingItems.length; index < nextItems.length; index++) {
          if ((nextItems[index]?.userEmail || '').toLowerCase() !== actorEmail) {
            return false;
          }
        }

        return true;
      };

      // Prepare incremental updates
      const updates: Partial<ITicket> = {};
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (isAdminUser && assignedAgent !== undefined) updates.assignedAgent = assignedAgent;
      if (isAdminUser && assignedAgentEmail !== undefined) updates.assignedAgentEmail = assignedAgentEmail;
      if (isAdminUser && slaType !== undefined) updates.slaType = slaType;
      if (isAdminUser && slaDurationValue !== undefined) updates.slaDurationValue = parseInt(slaDurationValue);
      if (isAdminUser && slaDurationUnit !== undefined) updates.slaDurationUnit = slaDurationUnit;
      if ((isAdminUser || isAssignedUser) && slaDueDate !== undefined) updates.slaDueDate = slaDueDate;
      if (resolvedAt !== undefined) updates.resolvedAt = resolvedAt;
      if (isAdminUser && isEscalated !== undefined) updates.isEscalated = isEscalated;

      if (history !== undefined) {
        if (!isAdminUser && !validateAppendedItems(existingTicket.history || [], history || [])) {
          res.status(403).json({ error: 'Invalid history update payload for this user.' });
          return;
        }
        updates.history = history;
      }

      if (remarks !== undefined) {
        if (!isAdminUser && !validateAppendedItems(existingTicket.remarks || [], remarks || [])) {
          res.status(403).json({ error: 'Invalid remarks update payload for this user.' });
          return;
        }
        updates.remarks = remarks;
      }

      const updated = await dbActions.updateTicket(id, updates);
      if (!updated) {
        res.status(404).json({ error: 'Complaint ticket not found.' });
        return;
      }

      let closureEmail: ISentEmail | null = null;
      const isClosingNow = existingTicket.status !== 'Closed' && updated.status === 'Closed';
      const assignmentChanged = !!updated.assignedAgentEmail && updated.assignedAgentEmail !== existingTicket.assignedAgentEmail;

      if (isClosingNow) {
        closureEmail = await createNotificationEmail({
          notificationType: 'Closure',
          ticket: updated,
          recipientName: updated.creatorName,
          recipientEmail: updated.creatorEmail
        });
        await sendPushForTicketEvent({
          type: 'Closure',
          ticket: updated,
          recipientEmail: updated.creatorEmail,
          recipientName: updated.creatorName
        });
      }

      if (assignmentChanged) {
        await createNotificationEmail({
          notificationType: 'Assignment',
          ticket: updated,
          recipientName: updated.assignedAgent || 'Assigned Employee',
          recipientEmail: updated.assignedAgentEmail || ''
        });
        await sendPushForTicketEvent({
          type: 'Assignment',
          ticket: updated,
          recipientEmail: updated.assignedAgentEmail || '',
          recipientName: updated.assignedAgent || 'Assigned Employee'
        });
      }

      res.json({ ticket: updated, email: closureEmail });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tickets: Escalation & Notification Mail Routing to Department Head
  app.post('/api/tickets/:id/escalate', authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { escalationType } = req.body; // 'Manual' | 'Auto-SLA-Breach'

      const tkts = await dbActions.getTickets();
      const ticket = tkts.find(t => t.id === id);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not detected for escalation.' });
        return;
      }

      const users = await dbActions.getUsers();

      const assignedUser = ticket.assignedAgentEmail
        ? users.find(user => user.email.toLowerCase() === ticket.assignedAgentEmail?.toLowerCase())
        : users.find(user => user.name === ticket.assignedAgent);

      const creatorUser = users.find(user => user.email.toLowerCase() === ticket.creatorEmail.toLowerCase());
      const currentEscalationUser = assignedUser || creatorUser || null;

      const departments = await dbActions.getDepartments();
      const dept = departments.find(d => d.id === ticket.departmentId);
      const headName = dept && dept.headName ? dept.headName : 'Unassigned Head';
      const headEmail = dept && dept.headEmail ? dept.headEmail : 'unassigned@company.com';
      const escalationRules = await dbActions.getEscalationRules();
      const departmentRule = escalationRules.find((rule) => rule.departmentId === ticket.departmentId);

      const normalizedCurrentDesignation = normalizeRoleLabel(currentEscalationUser?.designation || '');
      const ladder = departmentRule?.designationLevels || [];
      const normalizedLadder = ladder.map(normalizeRoleLabel);
      const currentIndex = normalizedCurrentDesignation ? normalizedLadder.findIndex((level) => level === normalizedCurrentDesignation) : -1;
      const nextLevel =
        currentIndex >= 0 && currentIndex < ladder.length - 1
          ? ladder[currentIndex + 1]
          : null;

      let ladderRecipient: { name: string; email: string; label: string } | null = null;
      if (nextLevel && !isDepartmentHeadLevel(nextLevel)) {
        const normalizedNextLevel = normalizeRoleLabel(nextLevel);
        const activeTickets = tkts.filter((item) => item.status !== 'Resolved' && item.status !== 'Closed');
        const sameDepartmentCandidates = users
          .filter((user) => user.departmentId === ticket.departmentId)
          .filter((user) => normalizeRoleLabel(user.designation || '') === normalizedNextLevel)
          .filter((user) => user.email.toLowerCase() !== (currentEscalationUser?.email || '').toLowerCase())
          .map((user) => ({
            user,
            activeLoad: activeTickets.filter((item) => {
              const assignedEmail = (item.assignedAgentEmail || '').toLowerCase();
              const assignedName = (item.assignedAgent || '').trim().toLowerCase();
              return assignedEmail === user.email.toLowerCase() || assignedName === user.name.trim().toLowerCase();
            }).length
          }))
          .sort((a, b) => {
            if (a.activeLoad !== b.activeLoad) return a.activeLoad - b.activeLoad;
            return a.user.name.localeCompare(b.user.name);
          });

        if (sameDepartmentCandidates.length > 0) {
          ladderRecipient = {
            name: sameDepartmentCandidates[0].user.name,
            email: sameDepartmentCandidates[0].user.email,
            label: `Designation Ladder: ${nextLevel} (Least Loaded)`
          };
        }
      }

      const escalationRecipient =
        ladderRecipient
          ? ladderRecipient
          : {
              name: headName,
              email: headEmail,
              label: departmentRule
                ? 'Department Head Fallback'
                : 'Department Head'
            };

      if (
        isSameUserTarget(
          ticket.assignedAgent,
          ticket.assignedAgentEmail,
          escalationRecipient.name,
          escalationRecipient.email
        ) ||
        isSameUserTarget(
          currentEscalationUser?.name,
          currentEscalationUser?.email,
          escalationRecipient.name,
          escalationRecipient.email
        )
      ) {
        res.status(400).json({
          error: 'No higher escalation target is available. Ticket cannot be escalated back to the same user.'
        });
        return;
      }

      const sentEmail = await createNotificationEmail({
        notificationType: 'Escalation',
        ticket,
        recipientName: escalationRecipient.name,
        recipientEmail: escalationRecipient.email,
        escalationType: escalationType || 'Manual'
      });

      // Save History Audit Logs
      const timestamp = new Date().toISOString();
      const historyEntries = [...(ticket.history || [])];
      historyEntries.push({
        id: 'hist-' + Date.now(),
        timestamp,
        userEmail: req.user?.email || 'system',
        action: `Ticket escalated and reassigned to ${escalationRecipient.label} (${escalationRecipient.name} <${escalationRecipient.email}>) via ${escalationType === 'Manual' ? 'manual intervention' : 'automatic SLA breach trigger'}`
      });

      const updates = {
        isEscalated: true,
        assignedAgent: escalationRecipient.name,
        assignedAgentEmail: escalationRecipient.email,
        slaStatus: 'SLA Breached' as const, // Auto-flag as SLA Breached when escalated
        history: historyEntries
      };

      const updatedTicket = await dbActions.updateTicket(ticket.id, updates);
      await sendPushForTicketEvent({
        type: 'Escalation',
        ticket: {
          ...ticket,
          ...updates
        },
        recipientEmail: escalationRecipient.email,
        recipientName: escalationRecipient.name
      });
      res.json({ ticket: updatedTicket, email: sentEmail });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Emails: GET (Simulated email notifications outbox registry)
  app.get('/api/emails', authenticateToken, async (req, res) => {
    try {
      const emails = await dbActions.getEmails();
      res.json({ emails });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin Database Migration Trigger
  app.post('/api/admin/migrate-database', authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        res.status(403).json({ error: 'Access denied: Administration rights are required.' });
        return;
      }

      // Execute migration
      const result = await dbActions.migrateDiskToMongo();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. INTEGRATE VITE AS MIDDLEWARE IN DEVELOPMENT & SERVE BUILT CLIENT IN PRODUCTION
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 4. BIND INCOMING REQUESTS TO HOST 0.0.0.0 & PORT 3000 FOR REVERSE PROXY
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express Full-stack server running successfully on http://localhost:${PORT}`);
  });
}

startServer();
