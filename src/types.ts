export type SLAUnit = 'minutes' | 'hours' | 'days';

export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type SLAStatus = 'Within SLA' | 'Near SLA Breach' | 'SLA Breached';

export interface Department {
  id: string;
  name: string;
  isCustom: boolean;
  headName?: string;
  headEmail?: string;
  createdAt: string;
}

export interface SentEmail {
  id: string;
  ticketId: string;
  ticketTitle: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  notificationType: 'Assignment' | 'Escalation' | 'Closure';
  escalationType?: 'Manual' | 'Auto-SLA-Breach';
}

export interface ComplaintCategory {
  id: string;
  departmentId: string;
  name: string;
  defaultSlaValue: number;
  defaultSlaUnit: SLAUnit;
  defaultPriority?: TicketPriority;
  createdAt: string;
}

export interface TicketHistoryItem {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
}

export interface TicketRemarkItem {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  message: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  departmentId: string;
  departmentName: string;
  categoryId: string;
  categoryName: string;
  status: TicketStatus;
  priority: TicketPriority;
  creatorEmail: string;
  creatorName: string;
  assignedAgent: string;
  assignedAgentEmail?: string; // Email of assigned agent for easier filtering
  slaType: 'Default' | 'Custom';
  slaDurationValue: number;
  slaDurationUnit: SLAUnit;
  slaDueDate: string; // ISO String
  slaStatus: SLAStatus;
  slaBreachedAt: string | null; // ISO String
  createdAt: string; // ISO String
  resolvedAt: string | null; // ISO String
  history: TicketHistoryItem[];
  remarks?: TicketRemarkItem[];
  isEscalated?: boolean;
  lastReminderSentAt?: string | null;
  reminderCount?: number;
}

export interface UserSession {
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
}
