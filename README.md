# Harvest Index

Public food catalog with protected admin CRUD backed by SQLite.

## Run

```bash
PORT=3000 \
GOOGLE_CLIENT_ID=your-google-oauth-client-id \
SESSION_SECRET=replace-this-secret \
ADMIN_EMAILS=admin1@example.com,admin2@example.com \
npm start
```

Open `http://localhost:3000`.

## Environment variables

- `GOOGLE_CLIENT_ID`: OAuth client ID used by Google Identity Services on the frontend and verified by the server.
- `SESSION_SECRET`: Secret used to sign the session cookie. Replace the default in any real deployment.
- `ADMIN_EMAILS`: Comma-separated list of Google account emails allowed to create, update, and delete entries.
- `PORT`: Optional HTTP port. Defaults to `3000`.

## Notes

- Visitors can search by food item name, food code, or tagged recipe without logging in.
- Only authenticated users whose email is listed in `ADMIN_EMAILS` can create, update, or delete food entries.
- The server verifies Google sign-in credentials against Google's `tokeninfo` endpoint, so outbound network access is required for login.
