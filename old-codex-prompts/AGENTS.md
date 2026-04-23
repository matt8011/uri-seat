# AGENTS.md

## Purpose

This file is the working guide for contributors and coding agents operating in this repository during the current refactor of the URI Sustainable Eating Assessment Tool.

## Current Product Shape

The application now has two intentionally separate user surfaces:

- Public site at `/`
- Admin workspace at `/admin`

Public users can:

- search food entries by name, tagged recipes, or food classification
- view only the public-facing fields for each food entry

Admins can:

- authenticate with Google
- create, update, and delete food entries
- bulk import food entries from CSV

## Current Architecture

The project remains intentionally lightweight.

- Backend: plain Node.js HTTP server in `server.js`
- Frontend: static HTML, CSS, and vanilla JavaScript in `public/`
- Database: SQLite in `data.sqlite`
- Auth: Google Identity Services plus server-side Google token verification
- Sessions: signed cookie sessions persisted in SQLite

Current major files:

- `server.js`: API routes, auth, sessions, DB initialization, CSV import, static file serving
- `public/index.html`: public landing/search page
- `public/admin.html`: admin-only workspace
- `public/app.js`: public catalog behavior
- `public/admin.js`: admin auth, CRUD, and CSV import behavior
- `public/shared.js`: shared frontend helpers
- `public/styles.css`: styling for both public and admin surfaces
- `start.sh`: primary local startup script
- `api.md`: current API documentation

## Current Food Schema

The `food_entries` table now reflects three categories of data:

### General Food Details

- `name`
- `sustainability_index`
- `tagged_recipes`
- `created_at`
- `updated_at`

### Nutrition Details

- `protein`
- `fiber`
- `vitamin_a`
- `vitamin_c`
- `vitamin_e`
- `calcium`
- `iron`
- `magnesium`
- `potassium`
- `saturated_fat`
- `added_sugar`
- `sodium`
- `nutrient_rich_food_index`
- `nutrition_composite_score`

### Environmental Details

- `food_classification`
- `environmental_composite_score`

At the moment, these fields are intentionally not user-editable:

- `sustainability_index`
- `environmental_composite_score`

These nutrition-derived fields are now computed automatically by the server:

- `nutrient_rich_food_index`
- `nutrition_composite_score`

The current NRFI formula multiplies the full nutrient-balance expression by `100` before assigning the composite score threshold.

## Refactor Invariants

Unless the user explicitly changes direction, preserve these behaviors:

- the public landing page remains the only public-facing page
- the admin page remains separate from the public experience
- Google sign-in remains the admin auth strategy
- `start.sh` remains the primary local startup path
- SQLite remains the active persistence layer
- the app should stay lightweight and Railway-friendly

## Working Rules

- Prefer incremental changes over broad rewrites.
- Keep public and admin concerns separate.
- If you change the food schema, update `api.md`, `README.md`, and this file.
- If you change auth behavior, call it out explicitly before or during implementation.
- Avoid adding heavy dependencies unless there is a clear payoff.
- Do not assume existing database contents need to be preserved unless the user says so.

## Current Open Directions

Likely future work based on the active refactor brief:

- compute the placeholder composite fields automatically
- improve CSV import and data normalization workflows
- make deployment on Railway straightforward
- continue cleaning up system boundaries while staying on the current lightweight stack
