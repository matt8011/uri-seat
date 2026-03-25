# URI Sustainable Eating Assessment Tool

A tool to calculate sustainability of URI dining hall food items.

## Run

1. Make sure the admin user Gmails are set in `start.sh` as a comma-separated string
2. Create and add Google Client ID variable to `start.sh`
3. Assign a session secret that cannot be guessed (recommendation: `openssl rand -base64 32`)
4. Execute the server with `./start.sh`
5. Open `http://localhost:3000` in your web browser

## Environment variables

- `GOOGLE_CLIENT_ID`: OAuth client ID used by Google Identity Services on the frontend and verified by the server.
- `SESSION_SECRET`: Secret used to sign the session cookie. Replace the default in any real deployment.
- `ADMIN_EMAILS`: Comma-separated list of Google account emails allowed to create, update, and delete entries.
- `PORT`: Optional HTTP port. Defaults to `3000`.

## Notes

- Visitors can search by food item name, food code, or tagged recipe without logging in.
- Only authenticated users whose email is listed in `ADMIN_EMAILS` can create, update, or delete food entries.
- The server verifies Google sign-in credentials against Google's `tokeninfo` endpoint, so outbound network access is required for login.
