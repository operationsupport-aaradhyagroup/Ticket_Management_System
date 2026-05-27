# Department-wise Agent Assignment - User Guide

## Quick Start

### Filing a Complaint with Department-wise Agent Assignment

#### Step 1: Open the Modal
Click the "File a Department Complaint" button on the dashboard.

#### Step 2: Fill in Complaint Raiser
- The current logged-in user is pre-selected
- All company employees can act as both ticket raisers and agents
- You can change the raiser if needed

#### Step 3: Select Target Department ⭐ (REQUIRED FIRST)
```
┌─────────────────────────────────┐
│ TARGET DEPARTMENT               │
│ ┌──────────────────────────────┐│
│ │ IT Department            ▼   ││
│ └──────────────────────────────┘│
│                                 │
│ This filters:                   │
│ ✓ Complaint Categories          │
│ ✓ Available Agents              │
└─────────────────────────────────┘
```

#### Step 4: Select Complaint Category (Auto-populated)
Once you select a department, the complaint categories automatically filter to show only categories for that department.

```
┌─────────────────────────────────┐
│ COMPLAINT CATEGORY              │
│ ┌──────────────────────────────┐│
│ │ Data not coming properly  ▼   ││  ← Auto-populated from IT categories
│ └──────────────────────────────┘│
│                                 │
│ Displays only categories for    │
│ the selected department         │
└─────────────────────────────────┘
```

#### Step 5: Enter Complaint Details
- **Complaint Title**: e.g., "Unable to pull billing reports"
- **Detail Description**: Provide context, errors or replication logs

#### Step 6: Assign to Agent (NEW FEATURE) ⭐
This is the key new feature. All agents from the selected department appear here.

```
┌────────────────────────────────────────┐
│ ASSIGN TO AGENT                        │
│ ┌──────────────────────────────────────┐
│ │ -- Select an agent --            ▼   │  ← First agent auto-selected
│ └──────────────────────────────────────┘
│                                        │
│ Available agents for IT Department:   │
│ • Rajesh Kumar (rajesh@company.com)    │
│ • Vikram Malhotra (vikram@company.com) │
│ • Arjun Mehta (arjun@company.com)      │
│ • Neha Chopra (neha@company.com)       │
│                                        │
│ Select an agent from the list or keep │
│ the auto-selected first agent         │
└────────────────────────────────────────┘
```

#### Step 7: Select Priority Level
Priority levels are auto-fetched based on the complaint category's default priority.
- Uncheck "Customize SLA & Priority" to use defaults
- Or check it to manually override

```
┌──────────────────────────────────────┐
│ PRIORITY LEVEL                       │
│ ● SLA Auto-Fetched                   │
│                                      │
│ [ Low ] [ Medium ] [ High ] [Critical]│
│            (Selected)                 │
│                                      │
│ Auto-fetched from category defaults  │
└──────────────────────────────────────┘
```

#### Step 8: Review SLA (Service Level Agreement)
The system automatically calculates the due date based on:
- Category's default SLA duration (e.g., 2 hours, 3 days)
- Current creation time

```
┌──────────────────────────────────────┐
│ SERVICE LEVEL AGREEMENT (SLA)        │
│                                      │
│ Selected category auto-applies:      │
│ • Default SLA: 2 hours               │
│ • Priority: Medium                   │
│ • Due Date: Auto-calculated          │
│                                      │
│ Optionally override with custom SLA  │
└──────────────────────────────────────┘
```

#### Step 9: File Complaint
Click "File Complaint" button to create the ticket.

---

## Department Structure

### IT Department
Members:
- Rahul Patel (Admin)
- Rajesh Kumar
- Vikram Malhotra (Admin)
- Arjun Mehta
- Neha Chopra

When you select IT Department, these 5 agents appear in the assignment dropdown.

### HR Department
Members:
- Jane Smith
- Priya Sharma
- Divya Nair
- Meera Joshi (Admin)

When you select HR Department, these 4 agents appear in the assignment dropdown.

### Accounts Department
Members:
- Amit Patel
- Kabir Singh

### Support Department
Members:
- Sneha Reddy
- Rohan Gupta

### Sales Department
Members:
- Anjali Gupta

### Admin Department
Members:
- System Admin (Admin)
- Rajiv Kapoor

---

## Key Features

### 1. Department-based Filtering
```
Department Selection
    ↓
Categories filtered automatically
    ↓
Agents filtered automatically (NEW)
```

### 2. Auto-Selection
- First category from department: Auto-selected
- First agent from department: Auto-selected (NEW)
- Priority: Auto-fetched from category
- SLA: Auto-calculated based on category

### 3. Dropdown Display Format
Agents are shown as: **Name (email)**
Example:
- Rajesh Kumar (rajesh@company.com)
- Vikram Malhotra (vikram@company.com)

### 4. Ticket Creation with Assignment
When you file a complaint:
- Agent name is stored in `assignedAgent` field
- Agent email is stored in `assignedAgentEmail` field (NEW)
- Ticket history records the assignment
- Ticket status shows assigned agent

---

## What Happens After Filing

1. **Ticket Created**: System generates ticket ID (e.g., TKT-1234)

2. **Agent Assigned**: The selected agent receives assignment
   - They can see it in their assigned tickets view
   - They can access the ticket details immediately

3. **SLA Active**: Due date calculated based on:
   - Creation time + SLA duration
   - Shows in ticket details

4. **Ticket Appears**: Visible in:
   - "All Tickets" view (for Admins)
   - "Raised by me" view (for raiser)
   - "Assigned to me" view (for assigned agent)
   - Dashboard analytics

---

## Reassigning Agents

If you need to reassign a ticket to a different agent:

1. Open the ticket details
2. Find "Assigned Agent" field
3. Click dropdown
4. Select a different agent
5. Click "Save Desk Transitions"

**Note**: You can reassign to ANY agent in the system, not just the department agents (for flexibility in edge cases).

---

## Status Tracking

### Ticket Lifecycle
```
Open (Newly created)
    ↓
In Progress (Agent working on it)
    ↓
Resolved (Issue fixed)
    ↓
Closed (Ticket archived)
```

### SLA Status
- **Within SLA**: ✓ Resolving within time limit
- **Near SLA Breach**: ⚠ Less than 10% time remaining
- **SLA Breached**: ✗ Exceeded resolution time

The system automatically escalates breached tickets to department heads.

---

## Tips & Tricks

### Bulk Complaint Filing
You can open multiple complaint modals by keeping the first one open while navigating back to file another.

### Priority Override
The default priority comes from the category, but you can customize it by checking "Customize SLA & Priority".

### Custom SLA
If you need extended time or faster resolution:
1. Check "Customize SLA & Priority"
2. Enter custom duration (1-120 units)
3. Select unit (Minutes, Hours, Days)
4. System recalculates due date

### Agent Availability
If no agents show up, it means:
- The department has no agents assigned yet
- Contact Admin to add agents to the department

---

## Troubleshooting

### "No agents available for this department"
**Solution**: Admin needs to assign users to this department via user management.

### "Assigned agent not showing correctly"
**Solution**: Refresh the page. Agent list is cached and reloads on page refresh.

### "Wrong category appears"
**Cause**: Categories are tied to departments. Ensure you selected the correct department first.
**Solution**: Change department selection. Categories will auto-update.

### "SLA not calculating"
**Cause**: Category might not have default SLA set.
**Solution**: Contact Admin to configure category SLA defaults.

---

## For Administrators

### Adding Agents to Departments
Users must have a `departmentId` field set in their profile. This is done during:
1. User creation/registration
2. User profile edit

### Modifying Department Assignments
1. Go to Admin Config Panel
2. Edit user department assignment
3. Save changes
4. Agents will appear in dropdowns after refresh

### Creating Complaint Categories
Categories must be linked to a specific department via `departmentId`. Categories will then appear in the modal only when that department is selected.

---

## Data Flow Diagram

```
┌─────────────────────┐
│  User opens modal   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Select Department  │
└──────────┬──────────┘
           ↓
┌──────────────────────────────┐
│  API fetches data:           │
│  - Categories for dept       │
│  - Agents for dept (NEW)     │
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│  Display dropdowns:          │
│  - Category (auto-select)    │
│  - Agent (auto-select) NEW   │
│  - Priority (auto-fetch)     │
│  - SLA (auto-calculate)      │
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│  User fills details:         │
│  - Title                     │
│  - Description               │
│  - (Optionally overrides)    │
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│  User clicks "File Complaint"│
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│  API creates ticket with:    │
│  - assignedAgent: name       │
│  - assignedAgentEmail: email │  (NEW)
│  - slaDueDate: calculated    │
│  - Other fields              │
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│  Ticket appears in:          │
│  - Dashboard                 │
│  - Assigned to agent view    │
│  - SLA tracking              │
└──────────────────────────────┘
```

---

**Last Updated**: May 26, 2026
**Feature**: Department-wise Agent Assignment
**Status**: ✅ Live and Ready to Use
