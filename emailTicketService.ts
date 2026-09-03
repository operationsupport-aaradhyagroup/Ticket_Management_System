import type { IEmailTicketSettings, IInboundEmailEvent, ITicket, IUser } from './serverDB';
import type { CreateTicketInput } from './ticketService';

export interface InboundEmailAttachment {
  filename: string;
  contentType?: string;
  size?: number;
  providerId?: string;
}

export interface InboundEmail {
  messageId: string;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails?: string[];
  originalToEmails?: string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt: string;
  attachments?: InboundEmailAttachment[];
}

export interface EmailTicketDependencies {
  getSettings(): Promise<IEmailTicketSettings>;
  findUserByEmail(email: string): Promise<IUser | null>;
  reserveEvent(event: IInboundEmailEvent): Promise<IInboundEmailEvent>;
  updateEvent(messageId: string, updates: Partial<IInboundEmailEvent>): Promise<IInboundEmailEvent | null>;
  createTicket(input: CreateTicketInput): Promise<ITicket>;
  warn?(code: string, context: Record<string, unknown>): void;
}

export interface EmailTicketResult {
  status: IInboundEmailEvent['status'] | 'DISABLED' | 'DUPLICATE';
  ticket?: ITicket;
  event?: IInboundEmailEvent | null;
}

export const DEFAULT_EMAIL_TICKET_SETTINGS: IEmailTicketSettings = {
  id: 'email-ticket',
  enabled: false,
  subjectPrefix: 'Resolve this Ticket --',
  defaultAssigneeEmail: 'operation_support@kisansuvidha.com',
  updatedAt: '',
  updatedBy: 'system'
};

export const normalizeEmailAddress = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  const angleMatch = raw.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  return (angleMatch?.[1] || raw).trim();
};

const decodeEntities = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));

export const htmlToSafeText = (html: string) => decodeEntities(String(html || '')
  .replace(/<\s*(script|style|iframe|object)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[\t\r ]+/g, ' ')
  .replace(/\n\s+/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const safeText = (value: unknown, max: number) => String(value || '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

const isDuplicateError = (error: unknown) => error instanceof Error &&
  (error.message === 'INBOUND_EMAIL_DUPLICATE' || (error as any).code === 11000);

export async function processInboundEmail(email: InboundEmail, deps: EmailTicketDependencies): Promise<EmailTicketResult> {
  const settings = await deps.getSettings();
  if (!settings.enabled) return { status: 'DISABLED' };

  const messageId = safeText(email.messageId, 500).toLowerCase();
  if (!messageId) throw new Error('MESSAGE_ID_REQUIRED');

  const fromEmail = normalizeEmailAddress(email.fromEmail);
  const toEmails = (email.toEmails || []).map(normalizeEmailAddress).filter(Boolean);
  const ccEmails = (email.ccEmails || []).map(normalizeEmailAddress).filter(Boolean);
  const originalToEmails = (email.originalToEmails || []).map(normalizeEmailAddress).filter(Boolean);
  const subject = safeText(email.subject, 500);
  const receivedAtDate = new Date(email.receivedAt);
  const receivedAt = Number.isNaN(receivedAtDate.getTime()) ? new Date().toISOString() : receivedAtDate.toISOString();
  const now = new Date().toISOString();
  const initialEvent: IInboundEmailEvent = {
    messageId,
    fromEmail,
    toEmails,
    originalToEmails,
    subject,
    status: 'PROCESSING',
    ticketId: '',
    assignedAgentEmail: '',
    errorCode: '',
    errorMessage: '',
    receivedAt,
    processedAt: '',
    createdAt: now
  };

  try {
    await deps.reserveEvent(initialEvent);
  } catch (error) {
    if (isDuplicateError(error)) return { status: 'DUPLICATE' };
    throw error;
  }

  const prefix = settings.subjectPrefix.trim() || DEFAULT_EMAIL_TICKET_SETTINGS.subjectPrefix;
  if (!subject.toLowerCase().startsWith(prefix.toLowerCase())) {
    const event = await deps.updateEvent(messageId, { status: 'IGNORED_SUBJECT', processedAt: new Date().toISOString() });
    return { status: 'IGNORED_SUBJECT', event };
  }

  try {
    const title = safeText(subject.slice(prefix.length), 200) || 'Email Support Request';
    const candidates = ccEmails.length > 0 ? ccEmails : (originalToEmails.length > 0 ? originalToEmails : toEmails);
    let assignedUser: IUser | null = null;
    for (const recipient of candidates) {
      assignedUser = await deps.findUserByEmail(recipient);
      if (assignedUser) break;
    }

    let usedDefaultAssignee = false;
    let warningCode = '';
    if (!assignedUser) {
      const defaultEmail = normalizeEmailAddress(settings.defaultAssigneeEmail || DEFAULT_EMAIL_TICKET_SETTINGS.defaultAssigneeEmail);
      assignedUser = await deps.findUserByEmail(defaultEmail);
      usedDefaultAssignee = !!assignedUser;
      if (!assignedUser) {
        warningCode = 'DEFAULT_ASSIGNEE_NOT_FOUND';
        deps.warn?.(warningCode, { messageId, defaultAssigneeEmail: defaultEmail });
      }
    }

    const description = safeText(email.textBody, 10_000) || htmlToSafeText(email.htmlBody || '').slice(0, 10_000) || 'No message body provided.';
    const requesterName = safeText(email.fromName, 120) || fromEmail.split('@')[0] || 'External Email Sender';
    const resolvedTo = assignedUser?.email || candidates[0] || '';
    const ticket = await deps.createTicket({
      subject: title,
      description,
      requester: { name: requesterName, email: fromEmail },
      source: 'EMAIL',
      departmentId: assignedUser?.departmentId || undefined,
      assignedTo: assignedUser?.email || undefined,
      metadata: {
        messageId,
        originalSubject: subject,
        from: fromEmail,
        resolvedTo,
        receivedAt,
        attachmentCount: email.attachments?.length || 0
      },
      createdBy: fromEmail
    });

    const status: IInboundEmailEvent['status'] = usedDefaultAssignee ? 'DEFAULT_ASSIGNEE_USED' : 'CREATED';
    const event = await deps.updateEvent(messageId, {
      status,
      ticketId: ticket.id,
      assignedAgentEmail: ticket.assignedAgentEmail || '',
      errorCode: warningCode,
      errorMessage: warningCode ? 'Configured default assignee was not found; ticket was created unassigned.' : '',
      processedAt: new Date().toISOString()
    });
    return { status, ticket, event };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'EMAIL_TICKET_PROCESSING_FAILED';
    const event = await deps.updateEvent(messageId, {
      status: 'FAILED',
      errorCode,
      errorMessage: 'Inbound email could not be converted into a ticket.',
      processedAt: new Date().toISOString()
    });
    return { status: 'FAILED', event };
  }
}
