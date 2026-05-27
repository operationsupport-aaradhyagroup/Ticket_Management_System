# Technical Implementation Details

## Architecture Overview

### New Data Model

```
Department (1) ──────→ (Many) User
      │
      └─→ (Many) ComplaintCategory


Department (1) ──────→ (Many) Ticket
      │                    │
      │                    ├─→ category (from ComplaintCategory)
      │                    ├─→ assignedAgent (User.name) NEW
      │                    └─→ assignedAgentEmail (User.email) NEW
      └─→ (Many) User (Agents)
```

## File Changes Summary

### 1. Type Definitions

**File**: `src/types.ts`

```typescript
// BEFORE
export interface UserSession {
  email: string;
  name: string;
  role: 'User' | 'Admin';
}

// AFTER
export interface UserSession {
  email: string;
  name: string;
  role: 'User' | 'Admin';
  departmentId?: string;  // ← NEW
}

// BEFORE
export interface Ticket {
  id: string;
  // ... other fields ...
  assignedAgent: string;
  // ... other fields ...
}

// AFTER
export interface Ticket {
  id: string;
  // ... other fields ...
  assignedAgent: string;
  assignedAgentEmail?: string;  // ← NEW
  // ... other fields ...
}
```

### 2. Server Database Layer

**File**: `serverDB.ts`

#### Interface Changes
```typescript
// Updated IUser interface
export interface IUser {
  email: string;
  name: string;
  passwordHash: string;
  role: 'User' | 'Admin';
  departmentId?: string;  // ← NEW
}

// Updated ITicket interface
export interface ITicket {
  // ... existing fields ...
  assignedAgent: string;
  assignedAgentEmail?: string;  // ← NEW
  // ... other fields ...
}
```

#### MongoDB Schema Updates
```typescript
// UserSchema
const UserSchema = new Schema({
  email: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['User', 'Admin'], default: 'User' },
  departmentId: { type: String, default: '' }  // ← NEW
});

// TicketSchema - Added field
TicketSchema.add({
  assignedAgentEmail: { type: String, default: '' }  // ← NEW
});
```

#### Initial Data Setup
```typescript
// INITIAL_USERS now includes departmentId
const INITIAL_USERS: IUser[] = [
  { 
    email: 'rahulpatel789856@gmail.com', 
    name: 'Rahul Patel', 
    passwordHash: defaultAdminHash, 
    role: 'Admin',
    departmentId: 'dept-it'  // ← NEW
  },
  { 
    email: 'rajesh@company.com', 
    name: 'Rajesh Kumar', 
    passwordHash: defaultUserHash, 
    role: 'User',
    departmentId: 'dept-it'  // ← NEW
  },
  // ... more users with department assignments
];
```

### 3. API Endpoints

**File**: `server.ts`

#### POST /api/tickets (Updated)
```typescript
app.post('/api/tickets', authenticateToken, async (req, res) => {
  const {
    // ... existing fields ...
    assignedAgentEmail,    // ← NEW
    assignedAgent          // ← NEW
  } = req.body;

  const newTicket: ITicket = {
    // ... existing fields ...
    assignedAgent: assignedAgent || 'Unassigned',      // ← UPDATED
    assignedAgentEmail: assignedAgentEmail || '',       // ← NEW
    // ... other fields ...
  };
  
  // History now includes agent assignment
  history: [{
    action: `Ticket created...${assignedAgentEmail ? ` and assigned to ${assignedAgent}` : ''}`
  }]
});
```

#### GET /api/users (No changes - returns updated user objects)
```typescript
app.get('/api/users', authenticateToken, async (req, res) => {
  const users = await dbActions.getUsers();
  // Returns IUser[] with departmentId field included
  res.json({ users });
});
```

### 4. Frontend Components

**File**: `src/components/CreateTicketModal.tsx`

#### New State
```typescript
const [selectedAgentEmail, setSelectedAgentEmail] = useState('');
const [selectedAgentName, setSelectedAgentName] = useState('');
```

#### New Memoized Selector
```typescript
const departmentAgents = useMemo(() => {
  if (!selectedDeptId) return [];
  return companyUsers.filter(u => u.departmentId === selectedDeptId);
}, [companyUsers, selectedDeptId]);
```

#### Updated useEffect for Auto-selection
```typescript
useEffect(() => {
  // ... existing code ...
  
  // Auto-select first agent from department
  if (departmentAgents.length > 0) {
    setSelectedAgentEmail(departmentAgents[0].email);
    setSelectedAgentName(departmentAgents[0].name);
  } else {
    setSelectedAgentEmail('');
    setSelectedAgentName('');
  }
}, [filteredCategories, departmentAgents]);
```

#### New UI Component
```tsx
<div>
  <label>Assign to Agent</label>
  <select
    value={selectedAgentEmail}
    onChange={(e) => {
      const targetEmail = e.target.value;
      setSelectedAgentEmail(targetEmail);
      const targetAgent = departmentAgents.find(u => u.email === targetEmail);
      if (targetAgent) {
        setSelectedAgentName(targetAgent.name);
      }
    }}
    disabled={departmentAgents.length === 0}
  >
    {departmentAgents.length === 0 ? (
      <option value="">No agents available</option>
    ) : (
      <>
        <option value="">-- Select an agent --</option>
        {departmentAgents.map(agent => (
          <option key={agent.email} value={agent.email}>
            {agent.name} ({agent.email})
          </option>
        ))}
      </>
    )}
  </select>
</div>
```

#### Updated Ticket Creation
```typescript
const newTicket: Ticket = {
  // ... existing fields ...
  assignedAgent: selectedAgentName || 'Unassigned',
  assignedAgentEmail: selectedAgentEmail,  // ← NEW
  // ... other fields ...
  history: [{
    action: `...${selectedAgentEmail ? ` and assigned to ${selectedAgentName}` : ''}`
  }]
};
```

### 5. Sample Data

**File**: `src/initialData.ts`

All INITIAL_TICKETS updated with:
```typescript
{
  id: 'tkt-101',
  // ... existing fields ...
  assignedAgent: 'Rajesh Kumar',           // ← UPDATED with real user
  assignedAgentEmail: 'rajesh@company.com', // ← NEW
  // ... other fields ...
}
```

## Data Flow Diagrams

### 1. User Assignment Flow
```
┌──────────────────────┐
│  Fetch /api/users    │
└──────────┬───────────┘
           ↓
┌──────────────────────────────────┐
│  IUser[] with departmentId       │
│  [                               │
│    { email, name, role,          │
│      departmentId: 'dept-it' }   │
│  ]                               │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│  Frontend: companyUsers state    │
│  Contains all users with dept    │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│  Modal: Filter by dept           │
│  departmentAgents = companyUsers │
│    .filter(u =>                  │
│      u.departmentId ===          │
│      selectedDeptId)             │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│  Display dropdown with agents    │
│  • Agent1 (email)                │
│  • Agent2 (email)                │
└──────────────────────────────────┘
```

### 2. Ticket Creation Flow
```
┌──────────────────────────┐
│  Modal Submit            │
└──────────┬───────────────┘
           ↓
┌────────────────────────────────────┐
│  Create Ticket Object              │
│  assignedAgent: selectedAgentName   │
│  assignedAgentEmail: selectedEmail  │
└──────────┬─────────────────────────┘
           ↓
┌────────────────────────────────────┐
│  POST /api/tickets                 │
│  {                                 │
│    title, description,             │
│    departmentId, categoryId,        │
│    assignedAgent,                  │
│    assignedAgentEmail, ← NEW       │
│    ...other fields                 │
│  }                                 │
└──────────┬─────────────────────────┘
           ↓
┌────────────────────────────────────┐
│  Server: Create ITicket            │
│  assignedAgent = assignedAgent      │
│  assignedAgentEmail = assignedEmail │
│  Add to history:                   │
│  "...assigned to {name}"           │
└──────────┬─────────────────────────┘
           ↓
┌────────────────────────────────────┐
│  Save to Database                  │
│  MongoDB / Disk Storage            │
└────────────────────────────────────┘
```

## Database Queries

### Get Agents for Department (Frontend)
```typescript
// In CreateTicketModal.tsx
const departmentAgents = companyUsers.filter(
  u => u.departmentId === selectedDeptId
);
```

### Get All Users (API)
```typescript
// server.ts - GET /api/users
const users = await dbActions.getUsers();
// Returns: IUser[] (includes departmentId)
```

### Get Tickets by Agent (Not yet implemented - future)
```typescript
// Potential future query
const tickets = tickets.filter(
  t => t.assignedAgentEmail === agentEmail
);
```

## Error Handling

### Scenario 1: No Agents Available
```typescript
if (departmentAgents.length === 0) {
  // Show disabled dropdown with "No agents available"
  // User cannot proceed until agents are added
}
```

### Scenario 2: Agent Removed from Department
```typescript
// If selectedAgentEmail doesn't exist in departmentAgents
// Clear selection and reset to first agent or empty
if (!departmentAgents.find(u => u.email === selectedAgentEmail)) {
  setSelectedAgentEmail('');
  setSelectedAgentName('');
}
```

### Scenario 3: Department Has No Categories
```typescript
if (filteredCategories.length === 0) {
  // Category dropdown disabled
  // Agent dropdown still shows agents (they can handle any category)
}
```

## Performance Considerations

### Memoization
```typescript
// Prevents unnecessary recalculation
const departmentAgents = useMemo(() => {
  return companyUsers.filter(u => u.departmentId === selectedDeptId);
}, [companyUsers, selectedDeptId]);
```

### API Caching
- Users list fetched once on app load
- Cached in App state: `companyUsers`
- Passed to Modal via props
- Modal uses memoized filter

### Database Indexing (Recommended)
```typescript
// Add index to IUser for faster queries
UserSchema.index({ departmentId: 1 });

// Add index to ITicket for faster filtering
TicketSchema.index({ assignedAgentEmail: 1 });
```

## Testing Checklist

### Unit Tests
- [ ] Filter agents by department correctly
- [ ] Auto-select first agent
- [ ] Handle empty agent list
- [ ] Ticket creation with agent assignment
- [ ] Agent name and email both stored

### Integration Tests
- [ ] Create ticket with agent → agent appears assigned
- [ ] Change department → agents update
- [ ] Reassign agent in detail view
- [ ] Agent can view assigned tickets

### E2E Tests
- [ ] Full flow: Select dept → Select agent → Create ticket
- [ ] Verify ticket created with correct agent
- [ ] Verify agent email stored correctly
- [ ] Verify history entry recorded

## Migration Steps (For Existing Systems)

### Step 1: Add New Fields to Database
```sql
-- Users table
ALTER TABLE users ADD COLUMN departmentId VARCHAR(50);
CREATE INDEX idx_department ON users(departmentId);

-- Tickets table
ALTER TABLE tickets ADD COLUMN assignedAgentEmail VARCHAR(255);
CREATE INDEX idx_assigned_agent_email ON tickets(assignedAgentEmail);
```

### Step 2: Populate Existing Users
```typescript
// Assign current users to departments
// Based on their role or previous assignment
const users = await User.find({});
for (let user of users) {
  // Infer or manually set department
  user.departmentId = inferDepartment(user);
  await user.save();
}
```

### Step 3: Populate Existing Tickets
```typescript
// Update existing tickets with agent email
const tickets = await Ticket.find({});
for (let ticket of tickets) {
  const agent = await User.findOne({ name: ticket.assignedAgent });
  if (agent) {
    ticket.assignedAgentEmail = agent.email;
    await ticket.save();
  }
}
```

### Step 4: Test Thoroughly
- Verify agents appear in dropdowns
- Verify old tickets load correctly
- Verify new tickets assign agents properly

## Future Enhancements

### 1. Agent Skills/Certifications
```typescript
interface User extends IUser {
  skills: string[];  // ['billing', 'hardware', 'network']
}

// Smart assignment based on skills
const skillMatches = departmentAgents.filter(
  a => a.skills?.includes(ticketCategory.requiredSkill)
);
```

### 2. Workload Balancing
```typescript
// Auto-assign to agent with least active tickets
const agentWorkload = departmentAgents.map(agent => ({
  agent,
  activeTickets: tickets.filter(
    t => t.assignedAgentEmail === agent.email && 
    t.status === 'Open' || t.status === 'In Progress'
  ).length
}));

// Sort by workload and select least busy
const leastBusy = agentWorkload.sort(
  (a, b) => a.activeTickets - b.activeTickets
)[0].agent;
```

### 3. Agent Availability Status
```typescript
interface User extends IUser {
  status: 'online' | 'offline' | 'busy' | 'on-break';
  lastActive: Date;
}

// Only show available agents
const availableAgents = departmentAgents.filter(
  a => a.status === 'online' || a.status === 'offline'
);
```

### 4. Round-Robin Assignment
```typescript
// Track last assigned agent per department
interface DepartmentMeta {
  lastAssignedAgentIndex: number;
}

// Next ticket goes to next agent in line
const nextIndex = (departmentMeta.lastAssignedAgentIndex + 1) % 
  departmentAgents.length;
const assignedAgent = departmentAgents[nextIndex];
departmentMeta.lastAssignedAgentIndex = nextIndex;
```

---

**Technical Documentation**
**Implementation Date**: May 26, 2026
**Status**: ✅ Complete
