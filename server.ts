import express from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initializeDb, dbActions, IUser, IDepartment, IComplaintCategory, ITicket, ISentEmail } from './serverDB';

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

const getNextTicketId = async () => {
  const nextTicketNumber = readTicketSequence() + 1;
  writeTicketSequence(nextTicketNumber);
  return `TKT-${nextTicketNumber}`;
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
      body: `Hello ${recipientName},\n\nYour complaint ticket has been marked as closed.\n\nTicket ID: ${ticket.id}\nTitle: ${ticket.title}\nDepartment: ${ticket.departmentName}\nCategory: ${ticket.categoryName}\nFinal Status: ${ticket.status}\nClosed At: ${ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString() : new Date(sentAt).toLocaleString()}\nAssigned To: ${ticket.assignedAgent || 'Unassigned'}${ticket.assignedAgentEmail ? ` (${ticket.assignedAgentEmail})` : ''}\n\nIf you still face the issue, please raise a new complaint or contact the support team.\nRegistered Server timestamp: ${sentAt}`,
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
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Core Database Initialization
  await initializeDb();

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

  // Users: GET (all company users)
  app.get('/api/users', authenticateToken, async (req, res) => {
    try {
      const users = await dbActions.getUsers();
      res.json({ users: users.map(sanitizeUser) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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

  // Tickets: GET (Returns all tickets)
  app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
      const tkts = await dbActions.getTickets();
      res.json({ tickets: tkts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tickets: POST
  app.post('/api/tickets', authenticateToken, async (req, res) => {
    try {
      const {
        title,
        description,
        departmentId,
        departmentName,
        categoryId,
        categoryName,
        priority,
        slaType,
        slaDurationValue,
        slaDurationUnit,
        slaDueDate,
        assignedAgentEmail,
        assignedAgent
      } = req.body;

      if (!title || !description || !departmentId || !categoryId || !slaDurationValue || !slaDurationUnit || !slaDueDate) {
        res.status(400).json({ error: 'Incomplete complaint ticket parameters.' });
        return;
      }

      const ticketId = await getNextTicketId();
      const createdAt = new Date().toISOString();

      const newTicket: ITicket = {
        id: ticketId,
        title: title.trim(),
        description: description.trim(),
        departmentId,
        departmentName,
        categoryId,
        categoryName,
        status: 'Open',
        priority: priority || 'Medium',
        creatorEmail: req.user!.email,
        creatorName: req.user!.name,
        assignedAgent: assignedAgent || 'Unassigned',
        assignedAgentEmail: assignedAgentEmail || '',
        slaType: slaType || 'Default',
        slaDurationValue: parseInt(slaDurationValue),
        slaDurationUnit,
        slaDueDate,
        slaStatus: 'Within SLA',
        slaBreachedAt: null,
        createdAt,
        resolvedAt: null,
        remarks: [],
        history: [
          {
            id: 'hist-' + Date.now(),
            timestamp: createdAt,
            userEmail: req.user!.email,
            action: `Ticket successfully created by user. SLA target set to ${slaDurationValue} ${slaDurationUnit} (${slaType} type)${assignedAgentEmail ? ` and assigned to ${assignedAgent}` : ''}`
          }
        ]
      };

      const created = await dbActions.createTicket(newTicket);
      let assignmentEmail: ISentEmail | null = null;

      if (created.assignedAgentEmail) {
        assignmentEmail = await createNotificationEmail({
          notificationType: 'Assignment',
          ticket: created,
          recipientName: created.assignedAgent || 'Assigned Employee',
          recipientEmail: created.assignedAgentEmail
        });
        await sendPushForTicketEvent({
          type: 'Assignment',
          ticket: created,
          recipientEmail: created.assignedAgentEmail,
          recipientName: created.assignedAgent || 'Assigned Employee'
        });
      }

      res.status(201).json({ ticket: created, email: assignmentEmail });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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

      // Prepare incremental updates
      const updates: Partial<ITicket> = {};
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (assignedAgent !== undefined) updates.assignedAgent = assignedAgent;
      if (assignedAgentEmail !== undefined) updates.assignedAgentEmail = assignedAgentEmail;
      if (slaType !== undefined) updates.slaType = slaType;
      if (slaDurationValue !== undefined) updates.slaDurationValue = parseInt(slaDurationValue);
      if (slaDurationUnit !== undefined) updates.slaDurationUnit = slaDurationUnit;
      if (slaDueDate !== undefined) updates.slaDueDate = slaDueDate;
      if (resolvedAt !== undefined) updates.resolvedAt = resolvedAt;
      if (history !== undefined) updates.history = history;
      if (remarks !== undefined) updates.remarks = remarks;
      if (isEscalated !== undefined) updates.isEscalated = isEscalated;

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
      const assignedUsersManager = assignedUser?.reportingManagerEmail
        ? users.find(user => user.email.toLowerCase() === assignedUser.reportingManagerEmail?.toLowerCase())
        : null;
      const creatorUsersManager = creatorUser?.reportingManagerEmail
        ? users.find(user => user.email.toLowerCase() === creatorUser.reportingManagerEmail?.toLowerCase())
        : null;

      // Final fallback remains the mapped department head.
      const departments = await dbActions.getDepartments();
      const dept = departments.find(d => d.id === ticket.departmentId);
      const headName = dept && dept.headName ? dept.headName : 'Unassigned Head';
      const headEmail = dept && dept.headEmail ? dept.headEmail : 'unassigned@company.com';

      const escalationRecipient =
        assignedUsersManager
          ? {
              name: assignedUsersManager.name,
              email: assignedUsersManager.email,
              label: 'Reporting Manager'
            }
          : creatorUsersManager
            ? {
                name: creatorUsersManager.name,
                email: creatorUsersManager.email,
                label: 'Creator Reporting Manager'
              }
            : {
                name: headName,
                email: headEmail,
                label: 'Department Head'
              };

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
