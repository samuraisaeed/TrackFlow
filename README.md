# TrackFlow

TrackFlow is a local-first corporate project accountability app for cross-functional teams. It helps project managers define scope, assign deliverables to managers, break work into employee-owned tasks, review task submissions, track work hours, surface risk signals, and export stakeholder-ready summaries.

The app was built for the ENTI 333/633 final group project as a practical demonstration of AI-assisted software development applied to a real business workflow problem: keeping project ownership, review accountability, and work evidence clear across multiple roles.

## Business Problem

Many project teams track work across disconnected tools, messages, and informal updates. That makes it hard to answer basic questions:

- Who owns each deliverable?
- Which manager is accountable for each team member?
- Which tasks are pending, urgent, blocked, in review, or done?
- Who submitted work, when, and how many hours were logged?
- Which work needs manager approval before it should count as complete?

TrackFlow solves this by connecting project scope, team hierarchy, task ownership, submission review, and reporting in one role-aware control room.

## Core Features

- Role-based login for Project Manager, Manager, and Employee views.
- Corporate project setup modal with project details, templates, deliverables, and starting team.
- Deliverable management with manager assignment, due date and time, status, and expandable descriptions.
- Task board grouped into Urgent Pending, Regular Pending, and Done panels.
- Task creation and editing with owner, deliverable, due date/time, priority, status, and description.
- Vertical org chart with selectable member detail panels.
- Per-person permissions for submission records, hours, task editing, and project context.
- Task submissions tied to the signed-in user's own assigned tasks.
- Fractional hour logging, including entries such as `1.5` hours.
- Manager review workflow for approving, returning, or removing submissions.
- Permanent work-log ledger so returned or removed submissions do not erase previously logged hours.
- Risk flags for overdue work, due-soon work, blocked tasks, missing owners, pending reviews, unassigned deliverables, deliverables without tasks, and no-recent-submission signals.
- Generated final report for stakeholder updates.
- Local API storage with JSON backup and import support.

## Tech Stack

- React 19
- TypeScript
- Vite
- Local Node.js HTTP API
- JSON file storage for the local workspace
- CSS custom properties and responsive layout styling

## Getting Started

Install dependencies:

```bash
npm install
```

Run the local app:

```bash
npm run dev
```

Open the Vite URL printed in the terminal. On this machine, it is commonly:

```text
http://127.0.0.1:5174/
```

The development command starts two local services:

- React/Vite frontend.
- TrackFlow local API at `http://127.0.0.1:5287`.

## Build

Create a production build:

```bash
npm run build
```

Preview the built app through the local API server:

```bash
npm run build
npm start
```

Then open:

```text
http://127.0.0.1:5287/
```

## Local Data

TrackFlow stores local project data in `data/workspace.json` when the API server is running. This file is intentionally ignored by Git because it contains local demo/team data rather than source code.

The repository includes `data/README.md` to document the storage folder, but excludes:

- Active workspace JSON files.
- Backups.
- Generated reports.
- Presentation decks and videos.
- Local DOCX/PDF handbook exports.
- Build output and dependencies.

## Documentation

Additional project documentation is in the `docs/` folder:

- [Features and workflows](docs/FEATURES.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Role permissions](docs/ROLE_PERMISSIONS.md)
- [AI-assisted development notes](docs/AI_ASSISTED_DEVELOPMENT.md)

For teammate setup and commit expectations, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository Scope

This GitHub repository is intended to contain the app source code and clean technical documentation. Presentation slides, Runway/video assets, blog drafts, local workspace data, and large generated exports should be submitted or linked separately where required by the course instructions.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
