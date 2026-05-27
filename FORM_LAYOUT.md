# Create Ticket Modal - New Form Layout

## Updated Form Visual Guide

### Modal Header
```
┌─────────────────────────────────────────────────────────────┐
│ File a Department Complaint                            [✕]  │
│ Submit a task and configure default or overrides of SLAs.   │
└─────────────────────────────────────────────────────────────┘
```

### Form Fields (NEW ORDER)

#### 1. COMPLAINT RAISER / SUBMITTER (At Top)
```
┌─────────────────────────────────────────────────────────────┐
│ COMPLAINT RAISER / SUBMITTER (CORPORATE USER)               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Jane Smith (jane.smith@company.com)                  ▼ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ All company employees can act both as ticket raisers and   │
│ agents.                                                     │
└─────────────────────────────────────────────────────────────┘
```

#### 2. TARGET DEPARTMENT (MOVED TO TOP) ⭐
```
┌─────────────────────────────────────────────────────────────┐
│ TARGET DEPARTMENT                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ IT Department                                       ▼   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 3. COMPLAINT CATEGORY (Auto-populated from Department)
```
┌─────────────────────────────────────────────────────────────┐
│ COMPLAINT CATEGORY                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Data not coming properly                            ▼   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Note: Only shows categories for selected department        │
└─────────────────────────────────────────────────────────────┘
```

#### 4. DETAIL DESCRIPTION (NOW REQUIRED - Title Removed) ⭐
```
┌─────────────────────────────────────────────────────────────┐
│ DETAIL DESCRIPTION                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Database queries are timing out on the main API       │ │
│ │ server. This is causing the dashboard to slow down   │ │
│ │ and affecting user experience.                        │ │
│ │                                                       │ │
│ │ ← First 50 chars used as auto-generated title         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Provide context, errors or replication logs...             │
└─────────────────────────────────────────────────────────────┘
```

#### 5. PRIORITY LEVEL (Auto-fetched + Optional Override)
```
┌─────────────────────────────────────────────────────────────┐
│ PRIORITY LEVEL                                              │
│ ● SLA Auto-Fetched                                          │
│                                                             │
│ [ Low ]  [ Medium ]  [ High ]  [ Critical ]                 │
│            (Selected)                                        │
│                                                             │
│ Priorities are preset according to corporate SLA           │
│ guidelines. Use Customize SLA & Priority if you have       │
│ special permissions to request an override.                │
└─────────────────────────────────────────────────────────────┘
```

#### 6. ASSIGN TO AGENT (Department-wise) ⭐
```
┌─────────────────────────────────────────────────────────────┐
│ ASSIGN TO AGENT                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Rajesh Kumar (rajesh@company.com)                  ▼   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Available agents for IT Department:                         │
│ • Rajesh Kumar (rajesh@company.com)                         │
│ • Vikram Malhotra (vikram@company.com)                      │
│ • Arjun Mehta (arjun@company.com)                           │
│ • Neha Chopra (neha@company.com)                            │
│                                                             │
│ Select an agent from the target department to assign this  │
│ ticket.                                                     │
└─────────────────────────────────────────────────────────────┘
```

#### 7. SERVICE LEVEL AGREEMENT (SLA) - Collapsible Section
```
┌─────────────────────────────────────────────────────────────┐
│ ⏱️  SERVICE LEVEL AGREEMENT (SLA)                            │
│                                                             │
│ ☐ Customize SLA & Priority                                 │
│                                                             │
│ ✓ Selected category auto-applies a default SLA of          │
│   2 hours and preconfigured priority of Medium.            │
│   This will calculate resolution due limits immediately.   │
└─────────────────────────────────────────────────────────────┘
```

#### If "Customize SLA & Priority" is Checked:
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Overriding the standard default SLA values.             │
│                                                             │
│ Duration Value              Duration Unit                   │
│ ┌──────────────┐           ┌──────────────┐               │
│ │ 1            │           │ Hours    ▼   │               │
│ └──────────────┘           └──────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### Footer Buttons
```
┌─────────────────────────────────────────────────────────────┐
│ [ Cancel ]                            [ File Complaint ]    │
└─────────────────────────────────────────────────────────────┘
```

## Form Workflow Example

### Scenario: User files IT issue

**Step 1**: Modal opens
```
Raiser: Jane Smith (pre-filled)
```

**Step 2**: Select Department
```
Department: IT Department
→ System filters categories to: Data not coming properly, Hardware Issue, etc.
→ System filters agents to: Rajesh, Vikram, Arjun, Neha
```

**Step 3**: Category auto-selected
```
Category: Data not coming properly (1st one)
→ Priority auto-fetched: Medium
→ SLA auto-fetched: 2 hours
```

**Step 4**: First agent auto-selected
```
Assign to Agent: Rajesh Kumar (1st one)
```

**Step 5**: User enters description
```
Description: "Database queries timing out..."
→ Auto-generates title: "Database queries timing out..."
```

**Step 6**: User clicks "File Complaint"
```
Ticket created:
- Title: "Database queries timing out..."
- Description: Full text
- Department: IT Department
- Category: Data not coming properly
- Priority: Medium (auto)
- SLA: 2 hours (auto)
- Assigned to: Rajesh Kumar
- Due Date: Now + 2 hours (auto)
```

## Key Differences from Old Form

| Aspect | Before | After |
|--------|--------|-------|
| **Title Field** | Separate input field | Auto-generated from description |
| **Department Position** | Below description | TOP of form (after raiser) |
| **Category Position** | Side by side with dept | Right after department |
| **Description Position** | 2nd field | 3rd field (after category) |
| **Agent Selector** | After dept/cat grid | After priority (clearer flow) |
| **Priority Position** | Near bottom | After description |
| **Form Fields** | 7+ fields | 6 fields (title removed) |
| **Required Fields** | Department, Category, Title, Description | Department, Category, Description |
| **Form Length** | Longer | More compact |

## Mobile Responsive Layout

The form adapts to mobile screens:

```
Mobile (Single Column):
1. Raiser (full width)
2. Department (full width)
3. Category (full width)
4. Description (full width)
5. Priority (4 buttons stacked) ← May wrap
6. Agent (full width)
7. SLA (full width)
8. Buttons (stacked)

Desktop (Optimized Width):
Same order but with max-width constraint
and better spacing
```

## Validation Rules

### Before Submission:
- ✅ **Description**: Required (not empty)
- ✅ **Department**: Required (must select one)
- ✅ **Category**: Required (auto-selected from dept)
- ✅ **Agent**: Optional (defaults to "Unassigned" if not selected)
- ✅ **Priority**: Auto-selected (can be customized)
- ✅ **Title**: Auto-generated (no input needed)

### Error Messages:
```
"Please fill out all mandatory fields."
↓ Appears when:
- Description is empty
- Department is not selected
- Category is not selected
```

## Auto-Generation Logic

### Title Auto-Generation
```javascript
// Takes first 50 characters of description
title = description.slice(0, 50).trim() || 'Complaint'

// Examples:
"Database queries are slow" → "Database queries are slow"
"Very long description that goes beyond fifty characters and would..." → 
  "Very long description that goes beyond fifty"
```

### Priority Auto-Generation
```javascript
// Based on category selected
category.defaultPriority → priority
// IT category "Data not coming" → Medium
// Support category "Customer Escalation" → Auto-fetched value
```

### SLA Auto-Generation
```javascript
// Based on category selected
category.defaultSlaValue = 2
category.defaultSlaUnit = 'hours'
// Current time + 2 hours = Due Date
```

### Agent Auto-Selection
```javascript
// Based on department selected
departmentAgents = users.filter(u => u.departmentId === selectedDept)
selectedAgent = departmentAgents[0]  // First one auto-selected
```

## Benefits of New Layout

1. **Faster Completion**: Fewer fields to fill
2. **Better Logic**: Department first, then filtered options
3. **Clearer Focus**: Description is the main input now
4. **Auto-Generated Values**: Less manual entry needed
5. **Mobile Friendly**: Simplified layout for all screens
6. **Reduced Errors**: Fewer required fields to validate
7. **Better UX**: Logical flow from broad (department) to specific (description)

---

**Form Redesign Date**: May 26, 2026
**Status**: ✅ Live and Active
**User Impact**: Faster, simpler complaint filing process
