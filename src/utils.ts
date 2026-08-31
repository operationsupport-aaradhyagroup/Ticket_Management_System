import { Ticket, SLAUnit, SLAStatus, UserSession } from './types';

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Not available';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Calculates the SLA due date based on starting date and duration
 */
export function calculateDueDate(createdAtStr: string, value: number, unit: SLAUnit): string {
  const date = new Date(createdAtStr);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  
  switch (unit) {
    case 'minutes':
      date.setMinutes(date.getMinutes() + value);
      break;
    case 'hours':
      date.setHours(date.getHours() + value);
      break;
    case 'days':
      date.setDate(date.getDate() + value);
      break;
  }
  return date.toISOString();
}

/**
 * Helper to convert duration to minutes for percentage thresholds
 */
export function durationInMinutes(value: number, unit: SLAUnit): number {
  switch (unit) {
    case 'minutes':
      return value;
    case 'hours':
      return value * 60;
    case 'days':
      return value * 24 * 60;
  }
}

/**
 * Dynamically computes status of a ticket relative to raw reference time
 */
export function computeSLAStatus(ticket: Ticket, referenceTime: Date): SLAStatus {
  // If ticket is resolved or closed, status is frozen
  if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
    // If ticket was resolved BEFORE due date, it is 'Within SLA'.
    // If it was resolved AFTER due date, it is 'SLA Breached'.
    const stopTimeStr = ticket.resolvedAt || referenceTime.toISOString();
    const stopTime = new Date(stopTimeStr);
    const dueDate = new Date(ticket.slaDueDate);
    return stopTime > dueDate ? 'SLA Breached' : 'Within SLA';
  }

  const dueDate = new Date(ticket.slaDueDate);
  const now = referenceTime;

  if (now >= dueDate) {
    return 'SLA Breached';
  }

  // Calculate remaining minutes
  const remainingMins = (dueDate.getTime() - now.getTime()) / (1000 * 60);
  const totalMins = durationInMinutes(ticket.slaDurationValue, ticket.slaDurationUnit);

  // Near breach thresholds:
  // - If it has less than 20% of SLA time remaining
  // - Or if remaining minutes are lower than specific standard cutoffs (e.g., 10 mins for mins, 1 hour for hours, 6 hours for days)
  const percentRemaining = (remainingMins / totalMins) * 100;

  let isNearBreach = false;
  if (percentRemaining <= 25) {
    isNearBreach = true;
  } else {
    // Hard cutoff cases
    if (ticket.slaDurationUnit === 'minutes' && remainingMins <= 5) {
      isNearBreach = true;
    } else if (ticket.slaDurationUnit === 'hours' && remainingMins <= 60) {
      isNearBreach = true;
    } else if (ticket.slaDurationUnit === 'days' && remainingMins <= 360) { // 6 hours
      isNearBreach = true;
    }
  }

  return isNearBreach ? 'Near SLA Breach' : 'Within SLA';
}

export function isTicketAssignedToUser(ticket: Ticket, user: { email: string; name: string } | null): boolean {
  if (!user || !ticket.assignedAgent || ticket.assignedAgent === 'Unassigned') return false;

  if (ticket.assignedAgentEmail) {
    if (ticket.assignedAgentEmail.toLowerCase() === user.email.toLowerCase()) {
      return true;
    }
  }
  
  const agentNameLower = ticket.assignedAgent.toLowerCase();
  const userNameLower = user.name.toLowerCase();

  if (agentNameLower.includes(userNameLower) || userNameLower.includes(agentNameLower)) {
    return true;
  }

  return wasTicketHistoricallyAssignedToUser(ticket, user);
}

function doesAssignedNameMatchUser(assignedName: string, user: { email: string; name: string } | null): boolean {
  if (!user || !assignedName.trim()) return false;

  const assignedNameLower = assignedName.trim().toLowerCase();
  const userNameLower = user.name.trim().toLowerCase();

  return (
    assignedNameLower === userNameLower ||
    assignedNameLower.includes(userNameLower) ||
    userNameLower.includes(assignedNameLower)
  );
}

function findUserByAssignedName(users: UserSession[], assignedName: string): UserSession | null {
  if (!assignedName.trim()) return null;

  return (
    users.find((user) => doesAssignedNameMatchUser(assignedName, user)) ||
    null
  );
}

export function resolveAccountableAssignedUser(ticket: Ticket, users: UserSession[]): UserSession | null {
  if (ticket.assignedAgentEmail) {
    const directEmailMatch = users.find(
      (user) => user.email.toLowerCase() === ticket.assignedAgentEmail?.toLowerCase()
    );
    if (directEmailMatch) {
      return directEmailMatch;
    }
  }

  if (ticket.assignedAgent && ticket.assignedAgent !== 'Unassigned') {
    const directNameMatch = findUserByAssignedName(users, ticket.assignedAgent);
    if (directNameMatch) {
      return directNameMatch;
    }
  }

  const historyEntries = [...(ticket.history || [])].reverse();
  for (const entry of historyEntries) {
    const action = entry.action || '';
    if (/Ticket escalated and reassigned to/i.test(action)) continue;

    const explicitAssignmentMatch =
      action.match(/Assigned agent updated to '([^']+)'/i) ||
      action.match(/Assigned to\s+(.+?)\s*&\s*marked/i) ||
      action.match(/and assigned to\s+(.+)$/i);

    const assignedName = explicitAssignmentMatch?.[1]?.trim();
    if (!assignedName || assignedName.toLowerCase() === 'unassigned') continue;

    const historicalMatch = findUserByAssignedName(users, assignedName);
    if (historicalMatch) {
      return historicalMatch;
    }
  }

  return null;
}

export function wasTicketHistoricallyAssignedToUser(ticket: Ticket, user: { email: string; name: string } | null): boolean {
  if (!user || !ticket.isEscalated) {
    return false;
  }

  const userNameLower = user.name.toLowerCase();
  const historyEntries = [...(ticket.history || [])].reverse();
  for (const entry of historyEntries) {
    const action = entry.action || '';
    if (/Ticket escalated and reassigned to/i.test(action)) continue;

    const explicitAssignmentMatch =
      action.match(/Assigned agent updated to '([^']+)'/i) ||
      action.match(/Assigned to\s+(.+?)\s*&\s*marked/i) ||
      action.match(/and assigned to\s+(.+)$/i);

    const assignedName = explicitAssignmentMatch?.[1]?.trim();
    if (!assignedName || assignedName.toLowerCase() === 'unassigned') continue;

    return doesAssignedNameMatchUser(assignedName, user);
  }

  return false;
}

export function isTicketRaisedByUser(ticket: Ticket, user: { email: string; name: string } | null): boolean {
  if (!user || !ticket.creatorEmail) return false;
  return ticket.creatorEmail.toLowerCase() === user.email.toLowerCase();
}

/**
 * Format remaining countdown string
 */
export function formatSLACountdown(dueDateStr: string, referenceTime: Date, status: string): { text: string; isOverdue: boolean; percent: number; seconds: number } {
  const dueDate = new Date(dueDateStr);
  const now = referenceTime;
  const diffMs = dueDate.getTime() - now.getTime();
  
  if (status === 'Resolved' || status === 'Closed') {
    return { text: 'Ticket Resolved', isOverdue: false, percent: 100, seconds: 0 };
  }

  if (diffMs <= 0) {
    const overdueMs = Math.abs(diffMs);
    const days = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((overdueMs % (1000 * 60)) / 1000);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    parts.push(`${secs}s`);

    return { 
      text: `${parts.join(' ')} overdue`, 
      isOverdue: true, 
      percent: 0,
      seconds: -Math.floor(overdueMs / 1000)
    };
  } else {
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    parts.push(`${secs}s`);

    const seconds = Math.floor(diffMs / 1000);

    return { 
      text: parts.join(' '), 
      isOverdue: false, 
      percent: 100, // will compute based on ticket context elsewhere
      seconds
    };
  }
}
