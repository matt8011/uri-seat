# URI Sustainable Eating Assessment Tool

A lightweight Node + SQLite web app for searching and administering URI dining hall food entries.

## Current Shape

- Public landing page at `/`
- Separate admin workspace at `/admin`
- Google-authenticated admin access
- SQLite-backed food catalog
- CSV import endpoint for bulk population

## Run

1. Make sure the admin user Gmail addresses are set in `start.sh` as a comma-separated string
2. Set a valid Google client ID in `start.sh`
3. Set a strong `SESSION_SECRET` in `start.sh`
4. Execute the server with `./start.sh`
5. Open `http://localhost:3000` for the public site
6. Open `http://localhost:3000/admin` for the admin workspace

## Environment Variables

- `GOOGLE_CLIENT_ID`: OAuth client ID used by Google Identity Services on the frontend and verified by the server
- `SESSION_SECRET`: Secret used to sign the session cookie
- `ADMIN_EMAILS`: Comma-separated list of Google account emails allowed to create, update, delete, and import entries
- `PORT`: Optional HTTP port. Defaults to `3000`

## Notes

- Visitors can search by food item name, food classification, or tagged recipe without logging in
- Admin-only actions now live on the separate `/admin` page
- The current food schema is centered on general details, nutrition fields, and environmental classification
- `nutrient_rich_food_index` and `nutrition_composite_score` are now calculated automatically from the nutrition fields, with the full NRFI formula multiplied by `100`
- The server verifies Google sign-in credentials against Google's `tokeninfo` endpoint, so outbound network access is required for login
- The app still depends on the `sqlite3` CLI being available on the host machine

## API Docs

See `api.md` for the current endpoints and CSV import format.
