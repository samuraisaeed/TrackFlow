# Contributing to TrackFlow

TrackFlow is a local-first classroom project. Keep the repository focused on source code and project documentation so it stays easy to review.

## Local Setup

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Build and verify before sharing changes:

```bash
npm run lint
npm run build
```

## What Belongs in Git

Commit:

- Source files in `src/`, `server/`, `scripts/`, and `public/`.
- Project configuration files.
- README, license, and docs in `docs/`.
- Small reference files that help explain the project.

Do not commit:

- `node_modules/`.
- `dist/` build output.
- Local workspace data in `data/workspace.json`.
- Backup files in `data/backups/`.
- Generated presentation exports, slide videos, screenshots, or DOCX/PDF handbooks.

## Team Workflow

For group work, keep commits focused and easy to review. A good commit changes one feature, fix, or documentation update at a time.

Recommended commit message pattern:

```text
Add manager review workflow docs
Fix task board filtering
Update README setup steps
```
