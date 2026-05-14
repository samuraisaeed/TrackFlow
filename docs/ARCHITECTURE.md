# Technical Architecture

TrackFlow is a local-first React application with a lightweight Node.js API. It is designed to run locally for classroom demos and project presentations while keeping the codebase simple enough to inspect.

## Frontend

The frontend is built with:

- React 19.
- TypeScript.
- Vite.
- Plain CSS with custom properties.

Main files:

- `src/App.tsx`: main application state, role logic, screens, modals, and workflows.
- `src/App.css`: visual system, layout, cards, modals, org chart, responsive behavior.
- `src/api.ts`: API client functions for loading, saving, importing, backing up, and reporting.
- `src/types.ts`: shared TypeScript types.
- `src/seed.ts`: blank workspace defaults and default permission settings.
- `src/report.ts`: generated report text.

## Local API

The local API is implemented in `server/index.cjs` using Node's built-in HTTP module.

API routes:

- `GET /api/health`: confirms the local server and storage paths are available.
- `GET /api/workspace`: loads the active workspace JSON.
- `PUT /api/workspace`: saves the active workspace JSON.
- `POST /api/backup`: saves the workspace and writes a timestamped JSON backup.
- `POST /api/import`: imports and saves a workspace JSON file.
- `POST /api/report`: saves generated report text as a Markdown file.

The same server can also serve the built frontend from `dist/` after `npm run build`.

## Local Storage Model

When the API is running, TrackFlow stores data in:

- `data/workspace.json`: active workspace.
- `data/backups/`: exported/imported workspace snapshots.
- `data/reports/`: generated Markdown reports.

Browser `localStorage` is used as a fallback if the API is unavailable.

The GitHub repository intentionally excludes active workspace data and backups because those are local/demo artifacts rather than source code.

## Application Data Model

Important entities:

- `Project`: project name, business unit, description, team name, and deadline.
- `TeamMember`: user identity, role, job title, reporting line, strengths, availability, color, and permissions.
- `Deliverable`: major project output assigned to a manager.
- `Task`: unit of work tied to one deliverable and one owner.
- `TaskSubmission`: completion record tied to one task.
- `WorkLog`: permanent historical hours ledger created by submissions.
- `Settings`: global role behavior and permission defaults.
- `RiskFlag`: generated risk signal based on current project data.

## Role-Gated Rendering

The app computes visible content from the signed-in user:

- Project Managers can access all pages and all data.
- Managers can access scoped deliverables, direct/team tasks, reviews, and hours when permitted.
- Employees see a simplified interface focused on tasks, project context, team visibility, and task submissions.

On user switch, the app resets the active view to the Dashboard so restricted users cannot remain on a page opened by a previous user.

## Build and Runtime

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

The build output is generated in `dist/` and is not committed to Git.
