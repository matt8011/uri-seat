const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const DB_PATH = path.join(__dirname, 'data.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE = 'food_app_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;

function sqlEscape(value) {
  return String(value).replaceAll("'", "''");
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  return `'${sqlEscape(value)}'`;
}

async function runSql(sql, jsonMode = false) {
  const args = [];
  if (jsonMode) {
    args.push('-json');
  }
  args.push(DB_PATH, sql);

  const { stdout } = await execFileAsync('sqlite3', args, {
    maxBuffer: 1024 * 1024 * 10
  });

  if (!jsonMode) {
    return stdout;
  }

  return stdout.trim() ? JSON.parse(stdout) : [];
}

async function getSql(sql) {
  const rows = await runSql(sql, true);
  return rows[0] || null;
}

async function allSql(sql) {
  return runSql(sql, true);
}

async function initializeDatabase() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS food_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code INTEGER NOT NULL,
      carbon_score REAL,
      land_score REAL,
      water_score REAL,
      nutrition_score REAL,
      biodiversity_score REAL,
      affordability_score REAL,
      composite_score REAL,
      tagged_recipes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      picture TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_food_entries_name ON food_entries(name);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function sendText(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) {
          return [part, ''];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function createSignedSessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');
  return `${token}.${signature}`;
}

function verifySignedSessionToken(value) {
  if (!value || !value.includes('.')) {
    return null;
  }

  const [token, signature] = value.split('.');
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');

  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  return token;
}

function buildCookie(name, value, maxAgeSeconds = null) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  if (maxAgeSeconds !== null) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

function serializeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id),
    email: user.email,
    name: user.name,
    picture: user.picture,
    isAdmin: ADMIN_EMAILS.has(String(user.email || '').toLowerCase())
  };
}

function deserializeRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id),
    code: Number(row.code),
    carbon_score: row.carbon_score === null ? null : Number(row.carbon_score),
    land_score: row.land_score === null ? null : Number(row.land_score),
    water_score: row.water_score === null ? null : Number(row.water_score),
    nutrition_score: row.nutrition_score === null ? null : Number(row.nutrition_score),
    biodiversity_score: row.biodiversity_score === null ? null : Number(row.biodiversity_score),
    affordability_score: row.affordability_score === null ? null : Number(row.affordability_score),
    composite_score: row.composite_score === null ? null : Number(row.composite_score),
    tagged_recipes: row.tagged_recipes ? JSON.parse(row.tagged_recipes) : []
  };
}

function normalizeRecipes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((recipe) => String(recipe || '').trim())
    .filter(Boolean);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateFoodPayload(body) {
  const name = String(body.name || '').trim();
  const code = normalizeNumber(body.code);

  if (!name) {
    return { error: 'Food item name is required.' };
  }
  if (code === null) {
    return { error: 'Food item code is required.' };
  }

  return {
    value: {
      name,
      code,
      carbon_score: normalizeNumber(body.carbon_score),
      land_score: normalizeNumber(body.land_score),
      water_score: normalizeNumber(body.water_score),
      nutrition_score: normalizeNumber(body.nutrition_score),
      biodiversity_score: normalizeNumber(body.biodiversity_score),
      affordability_score: normalizeNumber(body.affordability_score),
      composite_score: normalizeNumber(body.composite_score),
      tagged_recipes: normalizeRecipes(body.tagged_recipes)
    }
  };
}

async function queryItems(search = '') {
  const trimmed = search.trim().toLowerCase();
  const like = `%${trimmed}%`;

  const sql = trimmed
    ? `
        SELECT *
        FROM food_entries
        WHERE lower(name) LIKE ${sqlValue(like)}
           OR CAST(code AS TEXT) LIKE ${sqlValue(like)}
           OR lower(tagged_recipes) LIKE ${sqlValue(like)}
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT 200;
      `
    : `
        SELECT *
        FROM food_entries
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT 200;
      `;

  const rows = await allSql(sql);
  return rows.map(deserializeRow);
}

async function getItemById(id) {
  const row = await getSql(`SELECT * FROM food_entries WHERE id = ${sqlValue(id)} LIMIT 1;`);
  return deserializeRow(row);
}

function serveStatic(pathname, method, res) {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${relativePath}`);

  if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) {
    return false;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  };

  res.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  });
  if (method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function cleanupExpiredSessions() {
  await runSql(`DELETE FROM sessions WHERE expires_at <= ${sqlValue(new Date().toISOString())};`);
}

async function getCurrentUser(req) {
  await cleanupExpiredSessions();
  const cookies = parseCookies(req);
  const sessionToken = verifySignedSessionToken(cookies[SESSION_COOKIE]);

  if (!sessionToken) {
    return null;
  }

  const row = await getSql(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ${sqlValue(sessionToken)}
      AND sessions.expires_at > ${sqlValue(new Date().toISOString())}
    LIMIT 1;
  `);

  return row ? serializeUser(row) : null;
}

async function requireAdmin(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return null;
  }
  if (!user.isAdmin) {
    sendJson(res, 403, { error: 'Admin access required.' });
    return null;
  }
  return user;
}

async function verifyGoogleToken(credential) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured on the server.');
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );

  if (!response.ok) {
    throw new Error('Google token verification failed.');
  }

  const payload = await response.json();
  const issuer = payload.iss;

  if (
    payload.aud !== GOOGLE_CLIENT_ID ||
    !payload.email ||
    payload.email_verified !== 'true' ||
    !payload.sub ||
    (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com')
  ) {
    throw new Error('Google token payload was invalid.');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || null
  };
}

async function upsertUser(profile) {
  const now = new Date().toISOString();
  const existing = await getSql(`
    SELECT *
    FROM users
    WHERE google_sub = ${sqlValue(profile.sub)}
       OR lower(email) = lower(${sqlValue(profile.email)})
    LIMIT 1;
  `);

  if (existing) {
    await runSql(`
      UPDATE users
      SET google_sub = ${sqlValue(profile.sub)},
          email = ${sqlValue(profile.email)},
          name = ${sqlValue(profile.name)},
          picture = ${sqlValue(profile.picture)},
          updated_at = ${sqlValue(now)},
          last_login_at = ${sqlValue(now)}
      WHERE id = ${sqlValue(existing.id)};
    `);
    return getSql(`SELECT * FROM users WHERE id = ${sqlValue(existing.id)} LIMIT 1;`);
  }

  await runSql(`
    INSERT INTO users (google_sub, email, name, picture, created_at, updated_at, last_login_at)
    VALUES (
      ${sqlValue(profile.sub)},
      ${sqlValue(profile.email)},
      ${sqlValue(profile.name)},
      ${sqlValue(profile.picture)},
      ${sqlValue(now)},
      ${sqlValue(now)},
      ${sqlValue(now)}
    );
  `);

  return getSql(`SELECT * FROM users WHERE google_sub = ${sqlValue(profile.sub)} LIMIT 1;`);
}

async function createSession(res, userId) {
  const signedToken = createSignedSessionToken();
  const token = signedToken.split('.')[0];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  await runSql(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (
      ${sqlValue(token)},
      ${sqlValue(userId)},
      ${sqlValue(expiresAt)},
      ${sqlValue(now.toISOString())}
    );
  `);

  return {
    headers: {
      'Set-Cookie': buildCookie(
        SESSION_COOKIE,
        signedToken,
        Math.floor(SESSION_DURATION_MS / 1000)
      )
    },
    expiresAt
  };
}

async function clearSession(req, res) {
  const cookies = parseCookies(req);
  const sessionToken = verifySignedSessionToken(cookies[SESSION_COOKIE]);
  if (sessionToken) {
    await runSql(`DELETE FROM sessions WHERE id = ${sqlValue(sessionToken)};`);
  }
  res.writeHead(204, {
    'Set-Cookie': buildCookie(SESSION_COOKIE, '', 0)
  });
  res.end();
}

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method.toUpperCase();

  if (pathname === '/api/config' && method === 'GET') {
    return sendJson(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID || null,
      googleAuthEnabled: Boolean(GOOGLE_CLIENT_ID),
      adminEmailsConfigured: ADMIN_EMAILS.size > 0
    });
  }

  if (pathname === '/api/session' && method === 'GET') {
    return sendJson(res, 200, {
      user: await getCurrentUser(req)
    });
  }

  if (pathname === '/api/auth/google' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const credential = String(body.credential || '').trim();
      if (!credential) {
        return sendJson(res, 400, { error: 'Google credential is required.' });
      }

      const profile = await verifyGoogleToken(credential);
      const user = await upsertUser(profile);
      const session = await createSession(res, user.id);

      return sendJson(
        res,
        200,
        {
          user: serializeUser(user),
          expiresAt: session.expiresAt
        },
        session.headers
      );
    } catch (error) {
      console.error(error);
      return sendJson(res, 401, { error: error.message || 'Authentication failed.' });
    }
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return clearSession(req, res);
  }

  if (pathname === '/api/items' && method === 'GET') {
    const search = searchParams.get('q') || '';
    return sendJson(res, 200, {
      items: await queryItems(search),
      query: search
    });
  }

  if (pathname.startsWith('/api/items/') && method === 'GET') {
    const id = Number(pathname.split('/').pop());
    if (!Number.isInteger(id)) {
      return sendJson(res, 400, { error: 'Invalid item id.' });
    }
    const item = await getItemById(id);
    if (!item) {
      return sendJson(res, 404, { error: 'Food item not found.' });
    }
    return sendJson(res, 200, item);
  }

  if (pathname === '/api/items' && method === 'POST') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const validated = validateFoodPayload(body);
      if (validated.error) {
        return sendJson(res, 400, { error: validated.error });
      }
      const item = validated.value;
      const now = new Date().toISOString();

      await runSql(`
        INSERT INTO food_entries (
          name, code, carbon_score, land_score, water_score,
          nutrition_score, biodiversity_score, affordability_score,
          composite_score, tagged_recipes, created_at, updated_at
        ) VALUES (
          ${sqlValue(item.name)},
          ${sqlValue(item.code)},
          ${sqlValue(item.carbon_score)},
          ${sqlValue(item.land_score)},
          ${sqlValue(item.water_score)},
          ${sqlValue(item.nutrition_score)},
          ${sqlValue(item.biodiversity_score)},
          ${sqlValue(item.affordability_score)},
          ${sqlValue(item.composite_score)},
          ${sqlValue(JSON.stringify(item.tagged_recipes))},
          ${sqlValue(now)},
          ${sqlValue(now)}
        );
      `);

      const inserted = await getSql('SELECT * FROM food_entries ORDER BY id DESC LIMIT 1;');
      return sendJson(res, 201, deserializeRow(inserted));
    } catch (error) {
      console.error(error);
      return sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  if (pathname.startsWith('/api/items/') && method === 'PUT') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    try {
      const id = Number(pathname.split('/').pop());
      if (!Number.isInteger(id)) {
        return sendJson(res, 400, { error: 'Invalid item id.' });
      }
      if (!await getItemById(id)) {
        return sendJson(res, 404, { error: 'Food item not found.' });
      }

      const body = await parseJsonBody(req);
      const validated = validateFoodPayload(body);
      if (validated.error) {
        return sendJson(res, 400, { error: validated.error });
      }
      const item = validated.value;

      await runSql(`
        UPDATE food_entries
        SET name = ${sqlValue(item.name)},
            code = ${sqlValue(item.code)},
            carbon_score = ${sqlValue(item.carbon_score)},
            land_score = ${sqlValue(item.land_score)},
            water_score = ${sqlValue(item.water_score)},
            nutrition_score = ${sqlValue(item.nutrition_score)},
            biodiversity_score = ${sqlValue(item.biodiversity_score)},
            affordability_score = ${sqlValue(item.affordability_score)},
            composite_score = ${sqlValue(item.composite_score)},
            tagged_recipes = ${sqlValue(JSON.stringify(item.tagged_recipes))},
            updated_at = ${sqlValue(new Date().toISOString())}
        WHERE id = ${sqlValue(id)};
      `);

      return sendJson(res, 200, await getItemById(id));
    } catch (error) {
      console.error(error);
      return sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  if (pathname.startsWith('/api/items/') && method === 'DELETE') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    const id = Number(pathname.split('/').pop());
    if (!Number.isInteger(id)) {
      return sendJson(res, 400, { error: 'Invalid item id.' });
    }
    if (!await getItemById(id)) {
      return sendJson(res, 404, { error: 'Food item not found.' });
    }

    await runSql(`DELETE FROM food_entries WHERE id = ${sqlValue(id)};`);
    return sendJson(res, 200, { success: true });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, requestUrl.searchParams);
  }

  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return sendText(res, 405, 'Method Not Allowed');
  }

  if (serveStatic(pathname, method, res)) {
    return;
  }

  return sendText(res, 404, 'Not Found');
});

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Food app server is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database.', error);
    process.exit(1);
  });
