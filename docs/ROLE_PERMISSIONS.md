# Role Permissions

TrackFlow is built around role-aware access. The goal is to make work visible enough for accountability while preventing users from submitting, approving, or editing work outside their responsibility.

## Project Manager

Project Managers can:

- Create and edit project setup.
- Add and remove team members.
- Assign managers to deliverables.
- Create, edit, and delete tasks across the workspace.
- View all submissions and hours.
- Approve, return, or remove any submission.
- View risk flags.
- Generate, edit, copy, and save the final report.
- Change global settings.
- Export/import backups and reset the workspace.

Project Managers do not report to another person inside the project hierarchy.

## Manager

Managers can:

- View the project Dashboard.
- View deliverables.
- Edit assigned deliverables only if enabled by Project Manager settings.
- Create, edit, and delete tasks only if task editing is enabled.
- Assign tasks to themselves or direct reports within their scoped deliverables.
- View and edit their own profile.
- View and edit direct-report profile details when allowed.
- Add employees to their team only if enabled by Project Manager settings.
- Review submissions from direct reports or assigned deliverables when submission-record access is enabled.
- View managed-team hours when hour visibility is enabled.
- View risk flags and final report.

Managers cannot:

- Change global settings.
- Change manager reporting structure.
- Assign deliverables to other managers.
- Submit work as another user.

## Employee

Employees can:

- View the Dashboard.
- View deliverables when project context is enabled.
- View the Task Board and use filters.
- View the Teams org chart and selected-person details.
- Submit completed work against their own assigned open tasks.
- View own or team submission history if allowed by settings or individual override.
- View own or team hours if allowed by settings or individual override.

Employees cannot:

- Approve, return, or remove submissions.
- Submit work for another user.
- Edit team structure.
- Access global Settings.
- Access Risk Flags or Final Report in the default role model.

## Permission Toggles

Each member has a permission set:

- `canViewEvidence`: controls access to submission records.
- `canViewHours`: controls hour visibility.
- `canEditTasks`: controls task editing.
- `canViewProjectContext`: controls project context visibility.

Global settings define defaults. Individual toggles can override access for specific people when the team needs a special case.

## Submission and Hours Rules

Task submissions must always be tied to one of the signed-in user's own tasks.

Submitting work creates:

- A task submission record.
- A work log entry.

The work log is preserved even if the submission is returned or removed. This prevents review decisions from erasing previously logged effort.
