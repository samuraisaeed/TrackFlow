# AI-Assisted Development Notes

TrackFlow was developed through an AI-assisted workflow for ENTI 333/633. The project used AI support for ideation, requirements refinement, interface iteration, implementation, documentation, and presentation asset planning.

## Development Approach

The project followed this workflow:

1. Identify a business problem around project accountability, task ownership, and manager review.
2. Pivot the product direction from a student/team project organizer into a corporate project accountability tool.
3. Define role-specific requirements for Project Managers, Managers, and Employees.
4. Build the app locally using React, TypeScript, Vite, and a local Node API.
5. Iterate on UI feedback, including layout, role switching, org chart design, modal workflows, permission toggles, task submissions, and review behavior.
6. Add local storage, backup/import, report generation, and role-gated navigation.
7. Create documentation and presentation assets for explaining the product.

## Where AI Helped

AI assistance was used for:

- Product ideation and scope control.
- Requirements translation from course/project goals into app features.
- UI design alternatives and interaction design.
- React component implementation.
- Permission and hierarchy logic.
- Local API and JSON storage logic.
- Debugging role access and page-state issues.
- Generating handbook and GitHub documentation drafts.
- Creating screenshot/deck plans for the presentation workflow.

## Human Review

The project was reviewed and revised throughout development. The goal was not to blindly copy generated output, but to use AI as a development partner and keep ownership over the final product direction, feature choices, and presentation.

## Main AI-Assisted Lessons

- AI is strongest when the requirements are concrete and testable.
- UI details matter because small layout issues can undermine trust in a business app.
- Role permissions need to be explicit; ambiguous toggles confuse users.
- Local-first storage is useful for classroom demos, but deployment would be the next improvement for wider access.
- Generated code still needs human testing, especially around workflows like user switching, review state, task ownership, and data persistence.
