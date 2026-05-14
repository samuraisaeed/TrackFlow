# Features and Workflows

TrackFlow is organized around three user types: Project Manager, Manager, and Employee. Each role sees the same project through a different permission boundary.

## Project Setup

Project Managers can create or edit the workspace through a guided setup modal:

- Project basics: name, business unit, team name, final deadline with time, and description.
- Template selection: blank workspace or a prefilled corporate project pattern.
- Deliverables: major project outputs with assigned managers, due date/time, and descriptions.
- Team: Project Managers, Managers, Employees, and reporting lines.

The setup flow keeps project creation out of the main Dashboard so the Dashboard stays focused on live project status.

## Dashboard

The Dashboard gives each role a quick project health view:

- Visible task completion.
- Number of visible tasks.
- Urgent pending tasks.
- Pending reviews.
- Visible hours, if permitted.
- Upcoming deadlines.
- Recent task submissions.

Project Managers can open project setup from the Dashboard. Users with task-edit permission can also create tasks from the Dashboard.

## Deliverables

Deliverables represent major project outcomes. A deliverable includes:

- Title.
- Description.
- Due date and time.
- Status.
- Assigned manager.
- Linked task count.
- Completion percentage.

Project Managers can create, edit, delete, and assign deliverables. Managers can edit only their assigned deliverables when the Project Manager enables that permission.

## Task Board

Tasks are grouped into three vertical panels:

- Urgent Pending: blocked, urgent, high priority, overdue, or due-soon tasks.
- Regular Pending: open tasks that are not urgent.
- Done: completed tasks.

Each panel can be sorted independently by due date, priority, owner, or recent update. The board can also be filtered by search text, owner, manager team, deliverable, and priority.

Task cards show:

- Task title and description.
- Owner.
- Manager.
- Deliverable.
- Due date and time.
- Priority.
- Status.
- Logged hours, if visible.

## Team Org Chart

The Teams page shows a vertical org chart:

- Project Manager at the top.
- Managers below the Project Manager.
- Employees under their assigned managers.

Selecting a person opens a side detail panel without covering the chart. The detail panel shows:

- Profile information.
- Role and job title.
- Reporting line.
- Strengths and availability.
- Permission toggles.
- Owned tasks, team tasks, deliverables, and direct reports.
- Quick buttons to filter the Task Board by person or manager team.

## Task Submissions

Task Submissions are the core completion workflow. A submission must include:

- One task owned by the signed-in user.
- Automatically linked deliverable.
- Date and time.
- Hours worked.
- Required description.

The hours input supports fractional entries such as `1.5`.

When manager approval is required, a submitted task moves to `In Review`. When approval is not required, it moves directly to `Done`.

## Submission Records

Submission Records are used by Project Managers and permitted Managers to review completed work.

Review actions:

- Approve: closes the review and marks the task as Done.
- Return to Employee: reopens the task as Pending and keeps the logged hours.
- Remove from Active Records: marks the submission as Removed, reopens the task, and keeps the logged hours.

Logged hours are stored separately from submission status, so review decisions do not erase the historical work ledger.

## Risk Flags

Risk Flags are generated from live workspace data. They are intentionally neutral and are meant to encourage support, not blame.

Risk types include:

- Overdue work.
- Due-soon work.
- Blocked tasks.
- Missing task owners.
- Submitted work waiting for review.
- Deliverables without assigned managers.
- Deliverables without tasks.
- Employees with assigned work but no recent submission.

## Final Report

The Final Report page generates a stakeholder-ready project summary from live data:

- Project overview.
- Team structure.
- Deliverables.
- Task status summary.
- Submission summary.
- Task ownership snapshot.
- Remaining risks.

The report can be edited, copied, or saved locally as a Markdown file.
