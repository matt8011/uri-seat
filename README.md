# URI Sustainable Eating Assessment Tool

A lightweight Node + SQLite web app for searching and administering URI dining hall food entries.

## Current Shape

- Public landing page at `/`
- Separate admin workspace at `/admin`
- Google-authenticated admin access
- SQLite-backed food catalog
- CSV import endpoint for bulk population

## Run

1. Copy `.env.example` to `.env` if you do not already have one
2. Set `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, and `ADMIN_EMAILS` in `.env` or your shell environment
3. Execute the server with `./start.sh`
4. Open `http://localhost:3000` for the public site
5. Open `http://localhost:3000/admin` for the admin workspace

## Environment Variables

- `GOOGLE_CLIENT_ID`: OAuth client ID used by Google Identity Services on the frontend and verified by the server
- `SESSION_SECRET`: Secret used to sign the session cookie
- `ADMIN_EMAILS`: Comma-separated list of Google account emails allowed to create, update, delete, and import entries
- `NODE_ENV`: Set to `production` in deployment so cookies are marked `Secure`
- `PORT`: Optional HTTP port. Defaults to `3000`
- `DB_PATH`: Optional path to the SQLite database file. Useful for persistent volumes in production.

## Deployment Notes

- Do not commit live credentials in `start.sh`; the server now loads them from environment variables or a local `.env`
- `.env` is gitignored; use `.env.example` as the template for new environments
- Set `NODE_ENV=production` on the host so session cookies include the `Secure` flag
- Keep `SESSION_SECRET` only in your host's secret manager or environment settings, not in source control
- Rotate the current session secret before or immediately after launch if it has ever been shared outside your machine
- Add your production domain to the Google OAuth client configuration before going live

## Railway Deployment

1. Push this repo to GitHub
2. Create a new Railway project from that GitHub repo
3. Add a Railway volume and mount it at `/data`
4. In Railway service variables, set:
   - `GOOGLE_CLIENT_ID`
   - `SESSION_SECRET`
   - `ADMIN_EMAILS`
   - `NODE_ENV=production`
   - `DB_PATH=/data/data.sqlite`
5. Deploy the service
6. Add the Railway domain to your Google OAuth authorized JavaScript origins
7. Test `/` and `/admin` on the Railway URL before attaching a custom domain

The app now supports first-run seeding for Railway volumes: if `DB_PATH` points at a new empty mounted volume, it will copy the bundled `data.sqlite` into that location on startup so your current local app state can be published without manual database bootstrapping.

## Notes

- Visitors can search by food item name or tagged recipe without logging in
- Admin-only actions now live on the separate `/admin` page
- The current food schema is centered on general details, nutrition fields, and raw environmental input metrics
- `nutrient_rich_food_index` and `nutrition_composite_score` are now calculated automatically from the nutrition fields, with the full NRFI formula multiplied by `100`
- `environmental_composite_score` is now calculated automatically by scoring each environmental input on a 1-5 scale, summing those six scores, and dividing by 6
- `water_use_score`, `nitrogen_use_score`, `carbon_use_score`, and `land_use_score` are now calculated automatically from the scored environmental indicators
- `sustainability_index` is now calculated automatically as `nutrition_composite_score + environmental_composite_score`
- The server verifies Google sign-in credentials against Google's `tokeninfo` endpoint, so outbound network access is required for login
- The app still depends on the `sqlite3` CLI being available on the host machine

## API Docs

See `docs/api.md` for the current endpoints and CSV import format.
