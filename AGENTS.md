# AGENTS.md

## Purpose

This file is the working guide for contributors and coding agents operating in this repository during the upcoming refactor of the URI Sustainable Eating Assessment Tool.

Use it to stay aligned on:

- what the application does today
- where the current system boundaries are
- what must be preserved during refactoring
- how to make safe, incremental changes

This document is intentionally a scaffold. Expand and tighten it as the refactor plan becomes more concrete.

## Product Summary

This project is a website for a university dining hall sustainability assessment workflow.

Current user-facing capabilities:

- public visitors can search food entries
- visitors can browse item-level sustainability and nutrition-related scores
- admins can sign in with Google
- admins can create, edit, and delete food entries
- food entries can include tagged recipes

## Current Architecture

The current application is a small monolithic web app with minimal tooling.

- Backend: plain Node.js HTTP server in `server.js`
- Frontend: static HTML, CSS, and vanilla JavaScript in `public/`
- Database: SQLite in `data.sqlite`
- Auth: Google Identity Services on the frontend, Google token verification on the server
- Sessions: cookie-based sessions persisted in SQLite

Current major files:

- `server.js`: API routes, auth, sessions, DB initialization, static file serving
- `public/index.html`: page structure and admin form
- `public/app.js`: client-side state, rendering, API calls, admin interactions
- `public/styles.css`: all site styling
- `start.sh`: local startup script and environment variable setup

## Important Current Constraints

- There is no framework abstraction layer yet.
- There is no test suite yet.
- There is no migration system yet.
- Database access currently shells out to the `sqlite3` CLI from Node.
- The app is currently tightly coupled across UI, API, auth, and persistence concerns.
- The local repo may contain real-looking auth configuration values. Treat secrets carefully and avoid propagating them into new files or docs.

## Refactor Priorities

Unless explicitly directed otherwise, optimize for these goals:

1. Preserve existing behavior for public search, admin auth, and catalog CRUD.
2. Make system boundaries clearer before changing behavior.
3. Prefer incremental extraction over full rewrites in a single pass.
4. Introduce tests around current behavior before high-risk rewrites when feasible.
5. Reduce coupling between data access, auth, routing, and presentation.
6. Keep the app deployable throughout the refactor.

## Non-Negotiable Behaviors To Preserve

- Public users must be able to search without logging in.
- Admin-only operations must remain protected.
- Google-authenticated sessions must continue to work until intentionally replaced.
- Existing SQLite data should remain readable through transition steps.
- Food entry fields and score semantics should not silently change.

## Suggested Workstreams

Use these as a starting point for planning parallel or staged work:

- establish target architecture and module boundaries
- extract database access into a dedicated layer
- extract auth/session logic into isolated modules
- separate API routing from business logic
- define validation strategy for food entry payloads
- introduce test coverage for current API behavior
- decide whether frontend stays vanilla or moves to a framework
- design a migration path for schema changes, if any

## Working Rules For Agents

- Read the current code before proposing structural changes.
- Prefer small, reviewable commits or patches.
- Do not rewrite unrelated areas opportunistically.
- Document new architectural decisions in this file or a dedicated ADR-style doc.
- If a change affects auth, data shape, or deployment assumptions, call that out explicitly.
- If behavior changes intentionally, update this document to reflect the new baseline.

## When Making Changes

For any meaningful refactor task, capture:

- objective
- files or modules in scope
- invariants that must hold
- migration or rollback considerations
- verification performed

Recommended template:

```md
### Task
- Objective:
- Scope:
- Risks:
- Invariants:
- Verification:
```

## Open Questions

These should be answered before or during early refactor planning:

- What target architecture do we want: modular Node app, full-stack framework, or split frontend/backend?
- Do we want to keep SQLite for the next phase?
- Do we want to retain Google sign-in as-is, or replace the auth/session implementation?
- Is the current UI being preserved, redesigned, or replaced?
- What deployment environment should the refactor target?
- What level of backward compatibility is required for existing data and admin workflows?

## Definition Of Done For The Refactor

The refactor should eventually leave the project in a state where:

- responsibilities are clearly separated
- critical behavior is covered by tests
- configuration handling is safer and clearer
- local setup is documented
- future contributors can navigate the codebase without reading the entire app end-to-end

## Maintenance Notes

Keep this file current as the codebase evolves. It should describe the present state of the system and the active refactor expectations, not an outdated plan.
