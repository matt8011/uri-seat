const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const DEFAULT_DB_PATH = path.join(__dirname, 'data.sqlite');
const DB_PATH = path.resolve(process.env.DB_PATH || DEFAULT_DB_PATH);
const SEED_DB_PATH = process.env.SEED_DB_PATH ? path.resolve(process.env.SEED_DB_PATH) : null;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE = 'food_app_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_ITEMS = 200;
const MIN_SESSION_SECRET_LENGTH = 32;
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 5000);
const FOOD_COLUMNS = [
  'id',
  'name',
  'sustainability_index',
  'tagged_recipes',
  'created_at',
  'updated_at',
  'protein',
  'fiber',
  'vitamin_a',
  'vitamin_c',
  'vitamin_e',
  'calcium',
  'iron',
  'magnesium',
  'potassium',
  'saturated_fat',
  'added_sugar',
  'sodium',
  'nutrient_rich_food_index',
  'nutrition_composite_score',
  'freshwater_withdrawals',
  'stress_weighted_water_use',
  'acidifying_emissions',
  'eutrophying_emissions',
  'ghg_emissions',
  'land_use',
  'environmental_composite_score'
];
const RECIPE_COLUMNS = [
  'id',
  'name',
  'sustainability_index',
  'tagged_ingredients',
  'created_at',
  'updated_at',
  'protein',
  'fiber',
  'calcium',
  'iron',
  'saturated_fat',
  'sodium',
  'nutrition_composite_score',
  'environmental_composite_score',
  'water_use_score',
  'nitrogen_use_score',
  'carbon_use_score',
  'land_use_score'
];
const NUTRITION_NUMERIC_FIELDS = [
  ['protein', 'Protein'],
  ['fiber', 'Fiber'],
  ['vitamin_a', 'Vitamin A'],
  ['vitamin_c', 'Vitamin C'],
  ['vitamin_e', 'Vitamin E'],
  ['calcium', 'Calcium'],
  ['iron', 'Iron'],
  ['magnesium', 'Magnesium'],
  ['potassium', 'Potassium'],
  ['saturated_fat', 'Saturated Fat'],
  ['added_sugar', 'Added Sugar'],
  ['sodium', 'Sodium']
];
const ENVIRONMENTAL_NUMERIC_FIELDS = [
  ['freshwater_withdrawals', '2-1 Freshwater Withdrawals'],
  ['stress_weighted_water_use', '2-2 Stress-Weighted Water Use'],
  ['acidifying_emissions', '2-3 Acidifying Emissions'],
  ['eutrophying_emissions', '2-4 Eutrophying Emissions'],
  ['ghg_emissions', '2-5 GHG Emissions'],
  ['land_use', '2-6 Land Use']
];

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
  args.push('-cmd', `.timeout ${SQLITE_BUSY_TIMEOUT_MS}`);
  if (jsonMode) {
    args.push('-json');
  }
  args.push(DB_PATH, sql);

  const { stdout } = await execFileAsync('sqlite3', args, {
    maxBuffer: 1024 * 1024 * 20
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

function normalizeRecipeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function ensureDatabasePath() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // Seed a new database only when an explicit seed path is provided.
  if (SEED_DB_PATH && DB_PATH !== SEED_DB_PATH && !fs.existsSync(DB_PATH) && fs.existsSync(SEED_DB_PATH)) {
    fs.copyFileSync(SEED_DB_PATH, DB_PATH);
  }
}

function createFoodEntriesTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS food_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sustainability_index REAL,
      tagged_recipes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      protein REAL,
      fiber REAL,
      vitamin_a REAL,
      vitamin_c REAL,
      vitamin_e REAL,
      calcium REAL,
      iron REAL,
      magnesium REAL,
      potassium REAL,
      saturated_fat REAL,
      added_sugar REAL,
      sodium REAL,
      nutrient_rich_food_index REAL,
      nutrition_composite_score REAL,
      freshwater_withdrawals REAL,
      stress_weighted_water_use REAL,
      acidifying_emissions REAL,
      eutrophying_emissions REAL,
      ghg_emissions REAL,
      land_use REAL,
      environmental_composite_score REAL
    );

    CREATE INDEX IF NOT EXISTS idx_food_entries_name ON food_entries(name);
  `;
}

function createRecipesTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sustainability_index REAL,
      tagged_ingredients TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      protein REAL,
      fiber REAL,
      calcium REAL,
      iron REAL,
      saturated_fat REAL,
      sodium REAL,
      nutrition_composite_score REAL,
      environmental_composite_score REAL,
      water_use_score REAL,
      nitrogen_use_score REAL,
      carbon_use_score REAL,
      land_use_score REAL
    );

    CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
  `;
}

async function ensureFoodEntriesSchema() {
  const table = await getSql(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'food_entries'
    LIMIT 1;
  `);

  if (table) {
    const columns = await allSql('PRAGMA table_info(food_entries);');
    const actualColumns = columns.map((column) => String(column.name));
    const hasExpectedColumns =
      actualColumns.length === FOOD_COLUMNS.length &&
      FOOD_COLUMNS.every((name, index) => actualColumns[index] === name);

    if (!hasExpectedColumns) {
      await runSql('DROP TABLE IF EXISTS food_entries;');
    }
  }

  await runSql(createFoodEntriesTableSql());
}

async function ensureRecipesSchema() {
  const table = await getSql(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'recipes'
    LIMIT 1;
  `);

  if (table) {
    const columns = await allSql('PRAGMA table_info(recipes);');
    const actualColumns = columns.map((column) => String(column.name));
    const hasExpectedColumns =
      actualColumns.length === RECIPE_COLUMNS.length &&
      RECIPE_COLUMNS.every((name, index) => actualColumns[index] === name);

    if (!hasExpectedColumns) {
      await runSql('DROP TABLE IF EXISTS recipes;');
    }
  }

  await runSql(createRecipesTableSql());
}

async function initializeDatabase() {
  ensureDatabasePath();

  await runSql('PRAGMA journal_mode = WAL;');
  await runSql(`
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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);

  await ensureFoodEntriesSchema();
  await ensureRecipesSchema();
  await backfillCalculatedNutritionScores();
  await repopulateRecipes();
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

function parseTextBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
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
  if (NODE_ENV === 'production') {
    parts.push('Secure');
  }
  if (maxAgeSeconds !== null) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

function validateConfiguration() {
  const problems = [];

  if (!GOOGLE_CLIENT_ID) {
    problems.push('GOOGLE_CLIENT_ID must be configured.');
  }
  if (!SESSION_SECRET) {
    problems.push('SESSION_SECRET must be configured.');
  } else if (SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long.`
    );
  }
  if (ADMIN_EMAILS.size === 0) {
    problems.push('ADMIN_EMAILS must include at least one admin email address.');
  }
  if (!Number.isFinite(PORT) || PORT <= 0) {
    problems.push('PORT must be a positive number.');
  }
  if (!path.isAbsolute(DB_PATH)) {
    problems.push('DB_PATH must resolve to an absolute filesystem path.');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid server configuration:\n- ${problems.join('\n- ')}`);
  }
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

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRecipes(value) {
  if (Array.isArray(value)) {
    return value
      .map((recipe) => String(recipe || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((recipe) => recipe.trim())
      .filter(Boolean);
  }

  return [];
}

function valueOrZero(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function roundMetric(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function averageMetric(values) {
  const numbers = values.filter(isFiniteNumber).map(Number);
  if (numbers.length === 0) {
    return null;
  }

  return roundMetric(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function sumMetric(values) {
  const numbers = values.filter(isFiniteNumber).map(Number);
  if (numbers.length === 0) {
    return null;
  }

  return roundMetric(numbers.reduce((sum, value) => sum + value, 0));
}

function calculateNutrientRichFoodIndex(item) {
  const index =
    (valueOrZero(item.protein) / 50 +
      valueOrZero(item.fiber) / 25 +
      valueOrZero(item.vitamin_a) / 5000 +
      valueOrZero(item.vitamin_c) / 60 +
      valueOrZero(item.vitamin_e) / 30 +
      valueOrZero(item.calcium) / 1000 +
      valueOrZero(item.iron) / 18 +
      valueOrZero(item.magnesium) / 400 +
      valueOrZero(item.potassium) / 3500 -
      valueOrZero(item.saturated_fat) / 20 -
      valueOrZero(item.added_sugar) / 50 -
      valueOrZero(item.sodium) / 2400) *
    100;

  return roundMetric(index);
}

function calculateNutritionCompositeScore(index) {
  if (index <= 4.1) {
    return 1;
  }
  if (index <= 10.6) {
    return 2;
  }
  if (index <= 18.2) {
    return 3;
  }
  if (index <= 30.5) {
    return 4;
  }
  return 5;
}

function calculateEnvironmentalCompositeScore(item) {
  const values = {
    freshwater_withdrawals: item.freshwater_withdrawals,
    stress_weighted_water_use: item.stress_weighted_water_use,
    acidifying_emissions: item.acidifying_emissions,
    eutrophying_emissions: item.eutrophying_emissions,
    ghg_emissions: item.ghg_emissions,
    land_use: item.land_use
  };

  if (Object.values(values).some((value) => value === null || value === undefined)) {
    return null;
  }

  const {
    scoreFreshwaterWithdrawals,
    scoreStressWeightedWaterUse,
    scoreAcidifyingEmissions,
    scoreEutrophyingEmissions,
    scoreGhgEmissions,
    scoreLandUse
  } = calculateEnvironmentalIndicatorScores(values);

  return roundMetric(
    (
      scoreFreshwaterWithdrawals +
      scoreStressWeightedWaterUse +
      scoreAcidifyingEmissions +
      scoreEutrophyingEmissions +
      scoreGhgEmissions +
      scoreLandUse
    ) / 6
  );
}

function calculateEnvironmentalIndicatorScores(item) {
  return {
    scoreFreshwaterWithdrawals: Number(item.freshwater_withdrawals) > 549.9
      ? 1
      : Number(item.freshwater_withdrawals) > 377.1
        ? 2
        : Number(item.freshwater_withdrawals) > 263.7
          ? 3
          : Number(item.freshwater_withdrawals) > 161.4
            ? 4
            : 5,
    scoreStressWeightedWaterUse: Number(item.stress_weighted_water_use) > 18475
      ? 1
      : Number(item.stress_weighted_water_use) > 12806
        ? 2
        : Number(item.stress_weighted_water_use) > 9079
          ? 3
          : Number(item.stress_weighted_water_use) > 5601
            ? 4
            : 5,
    scoreAcidifyingEmissions: Number(item.acidifying_emissions) > 34.4
      ? 1
      : Number(item.acidifying_emissions) > 22.6
        ? 2
        : Number(item.acidifying_emissions) > 15.4
          ? 3
          : Number(item.acidifying_emissions) > 9.3
            ? 4
            : 5,
    scoreEutrophyingEmissions: Number(item.eutrophying_emissions) > 28
      ? 1
      : Number(item.eutrophying_emissions) > 16.3
        ? 2
        : Number(item.eutrophying_emissions) > 10.2
          ? 3
          : Number(item.eutrophying_emissions) > 6.1
            ? 4
            : 5,
    scoreGhgEmissions: Number(item.ghg_emissions) > 5.8
      ? 1
      : Number(item.ghg_emissions) > 3.4
        ? 2
        : Number(item.ghg_emissions) > 2.2
          ? 3
          : Number(item.ghg_emissions) > 1.4
            ? 4
            : 5,
    scoreLandUse: Number(item.land_use) > 13
      ? 1
      : Number(item.land_use) > 5.9
        ? 2
        : Number(item.land_use) > 3.7
          ? 3
          : Number(item.land_use) > 2.1
            ? 4
            : 5
  };
}

function calculateEnvironmentalFactorScores(item) {
  const values = [
    item.freshwater_withdrawals,
    item.stress_weighted_water_use,
    item.acidifying_emissions,
    item.eutrophying_emissions,
    item.ghg_emissions,
    item.land_use
  ];

  if (values.some((value) => value === null || value === undefined)) {
    return {
      water_use_score: null,
      nitrogen_use_score: null,
      carbon_use_score: null,
      land_use_score: null
    };
  }

  const {
    scoreFreshwaterWithdrawals,
    scoreStressWeightedWaterUse,
    scoreAcidifyingEmissions,
    scoreEutrophyingEmissions,
    scoreGhgEmissions,
    scoreLandUse
  } = calculateEnvironmentalIndicatorScores(item);

  return {
    water_use_score: roundMetric(
      (scoreFreshwaterWithdrawals + scoreStressWeightedWaterUse) / 2
    ),
    nitrogen_use_score: roundMetric(
      (scoreAcidifyingEmissions + scoreEutrophyingEmissions) / 2
    ),
    carbon_use_score: roundMetric(scoreGhgEmissions),
    land_use_score: roundMetric(scoreLandUse)
  };
}

function calculateSustainabilityIndex(nutritionCompositeScore, environmentalCompositeScore) {
  if (
    nutritionCompositeScore === null ||
    nutritionCompositeScore === undefined ||
    environmentalCompositeScore === null ||
    environmentalCompositeScore === undefined
  ) {
    return null;
  }

  return roundMetric(Number(nutritionCompositeScore) + Number(environmentalCompositeScore));
}

function withCalculatedNutrition(item) {
  const nutrientRichFoodIndex = calculateNutrientRichFoodIndex(item);

  return {
    ...item,
    nutrient_rich_food_index: nutrientRichFoodIndex,
    nutrition_composite_score: calculateNutritionCompositeScore(nutrientRichFoodIndex)
  };
}

function withCalculatedFields(item) {
  const nutritionValues = withCalculatedNutrition(item);
  const environmentalCompositeScore = calculateEnvironmentalCompositeScore(item);
  const environmentalFactorScores = calculateEnvironmentalFactorScores(item);

  return {
    ...nutritionValues,
    ...environmentalFactorScores,
    sustainability_index: calculateSustainabilityIndex(
      nutritionValues.nutrition_composite_score,
      environmentalCompositeScore
    ),
    environmental_composite_score: environmentalCompositeScore
  };
}

function deserializeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    sustainability_index:
      row.sustainability_index === null ? null : Number(row.sustainability_index),
    tagged_recipes: row.tagged_recipes ? JSON.parse(row.tagged_recipes) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    protein: row.protein === null ? null : Number(row.protein),
    fiber: row.fiber === null ? null : Number(row.fiber),
    vitamin_a: row.vitamin_a === null ? null : Number(row.vitamin_a),
    vitamin_c: row.vitamin_c === null ? null : Number(row.vitamin_c),
    vitamin_e: row.vitamin_e === null ? null : Number(row.vitamin_e),
    calcium: row.calcium === null ? null : Number(row.calcium),
    iron: row.iron === null ? null : Number(row.iron),
    magnesium: row.magnesium === null ? null : Number(row.magnesium),
    potassium: row.potassium === null ? null : Number(row.potassium),
    saturated_fat: row.saturated_fat === null ? null : Number(row.saturated_fat),
    added_sugar: row.added_sugar === null ? null : Number(row.added_sugar),
    sodium: row.sodium === null ? null : Number(row.sodium),
    nutrient_rich_food_index:
      row.nutrient_rich_food_index === null ? null : Number(row.nutrient_rich_food_index),
    nutrition_composite_score:
      row.nutrition_composite_score === null ? null : Number(row.nutrition_composite_score),
    freshwater_withdrawals:
      row.freshwater_withdrawals === null ? null : Number(row.freshwater_withdrawals),
    stress_weighted_water_use:
      row.stress_weighted_water_use === null ? null : Number(row.stress_weighted_water_use),
    acidifying_emissions:
      row.acidifying_emissions === null ? null : Number(row.acidifying_emissions),
    eutrophying_emissions:
      row.eutrophying_emissions === null ? null : Number(row.eutrophying_emissions),
    ghg_emissions: row.ghg_emissions === null ? null : Number(row.ghg_emissions),
    land_use: row.land_use === null ? null : Number(row.land_use),
    environmental_composite_score:
      row.environmental_composite_score === null
        ? null
        : Number(row.environmental_composite_score),
    ...calculateEnvironmentalFactorScores({
      freshwater_withdrawals:
        row.freshwater_withdrawals === null ? null : Number(row.freshwater_withdrawals),
      stress_weighted_water_use:
        row.stress_weighted_water_use === null ? null : Number(row.stress_weighted_water_use),
      acidifying_emissions:
        row.acidifying_emissions === null ? null : Number(row.acidifying_emissions),
      eutrophying_emissions:
        row.eutrophying_emissions === null ? null : Number(row.eutrophying_emissions),
      ghg_emissions: row.ghg_emissions === null ? null : Number(row.ghg_emissions),
      land_use: row.land_use === null ? null : Number(row.land_use)
    })
  };
}

function deserializeRecipeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    sustainability_index:
      row.sustainability_index === null ? null : Number(row.sustainability_index),
    tagged_ingredients: row.tagged_ingredients ? JSON.parse(row.tagged_ingredients) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    protein: row.protein === null ? null : Number(row.protein),
    fiber: row.fiber === null ? null : Number(row.fiber),
    calcium: row.calcium === null ? null : Number(row.calcium),
    iron: row.iron === null ? null : Number(row.iron),
    saturated_fat: row.saturated_fat === null ? null : Number(row.saturated_fat),
    sodium: row.sodium === null ? null : Number(row.sodium),
    nutrition_composite_score:
      row.nutrition_composite_score === null ? null : Number(row.nutrition_composite_score),
    environmental_composite_score:
      row.environmental_composite_score === null
        ? null
        : Number(row.environmental_composite_score),
    water_use_score: row.water_use_score === null ? null : Number(row.water_use_score),
    nitrogen_use_score:
      row.nitrogen_use_score === null ? null : Number(row.nitrogen_use_score),
    carbon_use_score: row.carbon_use_score === null ? null : Number(row.carbon_use_score),
    land_use_score: row.land_use_score === null ? null : Number(row.land_use_score)
  };
}

function validateFoodPayload(body) {
  const name = String(body.name || '').trim();
  const taggedRecipes = normalizeRecipes(body.tagged_recipes);
  const normalizedNumbers = Object.fromEntries(
    [...NUTRITION_NUMERIC_FIELDS, ...ENVIRONMENTAL_NUMERIC_FIELDS].map(([key]) => [
      key,
      normalizeNumber(body[key])
    ])
  );

  if (!name) {
    return { error: 'Food item name is required.' };
  }

  if (taggedRecipes.length === 0) {
    return { error: 'Tagged recipes are required.' };
  }

  for (const [key, label] of [...NUTRITION_NUMERIC_FIELDS, ...ENVIRONMENTAL_NUMERIC_FIELDS]) {
    if (normalizedNumbers[key] === null) {
      return { error: `${label} is required.` };
    }
  }

  return {
    value: withCalculatedFields({
      name,
      sustainability_index: null,
      tagged_recipes: taggedRecipes,
      protein: normalizedNumbers.protein,
      fiber: normalizedNumbers.fiber,
      vitamin_a: normalizedNumbers.vitamin_a,
      vitamin_c: normalizedNumbers.vitamin_c,
      vitamin_e: normalizedNumbers.vitamin_e,
      calcium: normalizedNumbers.calcium,
      iron: normalizedNumbers.iron,
      magnesium: normalizedNumbers.magnesium,
      potassium: normalizedNumbers.potassium,
      saturated_fat: normalizedNumbers.saturated_fat,
      added_sugar: normalizedNumbers.added_sugar,
      sodium: normalizedNumbers.sodium,
      nutrient_rich_food_index: null,
      nutrition_composite_score: null,
      freshwater_withdrawals: normalizedNumbers.freshwater_withdrawals,
      stress_weighted_water_use: normalizedNumbers.stress_weighted_water_use,
      acidifying_emissions: normalizedNumbers.acidifying_emissions,
      eutrophying_emissions: normalizedNumbers.eutrophying_emissions,
      ghg_emissions: normalizedNumbers.ghg_emissions,
      land_use: normalizedNumbers.land_use,
      environmental_composite_score: null
    })
  };
}

async function backfillCalculatedNutritionScores() {
  const rows = await allSql('SELECT * FROM food_entries ORDER BY id ASC;');

  for (const row of rows) {
    const item = withCalculatedFields(deserializeRow(row));
    await runSql(`
      UPDATE food_entries
      SET sustainability_index = ${sqlValue(item.sustainability_index)},
          nutrient_rich_food_index = ${sqlValue(item.nutrient_rich_food_index)},
          nutrition_composite_score = ${sqlValue(item.nutrition_composite_score)},
          environmental_composite_score = ${sqlValue(item.environmental_composite_score)}
      WHERE id = ${sqlValue(item.id)};
    `);
  }
}

function foodInsertSql(item, timestamp, explicitCreatedAt = null) {
  const createdAt = explicitCreatedAt || timestamp;

  return `
    INSERT INTO food_entries (
      name,
      sustainability_index,
      tagged_recipes,
      created_at,
      updated_at,
      protein,
      fiber,
      vitamin_a,
      vitamin_c,
      vitamin_e,
      calcium,
      iron,
      magnesium,
      potassium,
      saturated_fat,
      added_sugar,
      sodium,
      nutrient_rich_food_index,
      nutrition_composite_score,
      freshwater_withdrawals,
      stress_weighted_water_use,
      acidifying_emissions,
      eutrophying_emissions,
      ghg_emissions,
      land_use,
      environmental_composite_score
    ) VALUES (
      ${sqlValue(item.name)},
      ${sqlValue(item.sustainability_index)},
      ${sqlValue(JSON.stringify(item.tagged_recipes))},
      ${sqlValue(createdAt)},
      ${sqlValue(timestamp)},
      ${sqlValue(item.protein)},
      ${sqlValue(item.fiber)},
      ${sqlValue(item.vitamin_a)},
      ${sqlValue(item.vitamin_c)},
      ${sqlValue(item.vitamin_e)},
      ${sqlValue(item.calcium)},
      ${sqlValue(item.iron)},
      ${sqlValue(item.magnesium)},
      ${sqlValue(item.potassium)},
      ${sqlValue(item.saturated_fat)},
      ${sqlValue(item.added_sugar)},
      ${sqlValue(item.sodium)},
      ${sqlValue(item.nutrient_rich_food_index)},
      ${sqlValue(item.nutrition_composite_score)},
      ${sqlValue(item.freshwater_withdrawals)},
      ${sqlValue(item.stress_weighted_water_use)},
      ${sqlValue(item.acidifying_emissions)},
      ${sqlValue(item.eutrophying_emissions)},
      ${sqlValue(item.ghg_emissions)},
      ${sqlValue(item.land_use)},
      ${sqlValue(item.environmental_composite_score)}
    );
  `;
}

function foodUpdateSql(id, item, timestamp) {
  return `
    UPDATE food_entries
    SET name = ${sqlValue(item.name)},
        sustainability_index = ${sqlValue(item.sustainability_index)},
        tagged_recipes = ${sqlValue(JSON.stringify(item.tagged_recipes))},
        updated_at = ${sqlValue(timestamp)},
        protein = ${sqlValue(item.protein)},
        fiber = ${sqlValue(item.fiber)},
        vitamin_a = ${sqlValue(item.vitamin_a)},
        vitamin_c = ${sqlValue(item.vitamin_c)},
        vitamin_e = ${sqlValue(item.vitamin_e)},
        calcium = ${sqlValue(item.calcium)},
        iron = ${sqlValue(item.iron)},
        magnesium = ${sqlValue(item.magnesium)},
        potassium = ${sqlValue(item.potassium)},
        saturated_fat = ${sqlValue(item.saturated_fat)},
        added_sugar = ${sqlValue(item.added_sugar)},
        sodium = ${sqlValue(item.sodium)},
        nutrient_rich_food_index = ${sqlValue(item.nutrient_rich_food_index)},
        nutrition_composite_score = ${sqlValue(item.nutrition_composite_score)},
        freshwater_withdrawals = ${sqlValue(item.freshwater_withdrawals)},
        stress_weighted_water_use = ${sqlValue(item.stress_weighted_water_use)},
        acidifying_emissions = ${sqlValue(item.acidifying_emissions)},
        eutrophying_emissions = ${sqlValue(item.eutrophying_emissions)},
        ghg_emissions = ${sqlValue(item.ghg_emissions)},
        land_use = ${sqlValue(item.land_use)},
        environmental_composite_score = ${sqlValue(item.environmental_composite_score)}
    WHERE id = ${sqlValue(id)};
  `;
}

async function queryItems(search = '') {
  const trimmed = search.trim().toLowerCase();
  const like = `%${trimmed}%`;
  const sql = trimmed
    ? `
        SELECT *
        FROM food_entries
        WHERE lower(name) LIKE ${sqlValue(like)}
           OR lower(tagged_recipes) LIKE ${sqlValue(like)}
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT ${MAX_ITEMS};
      `
    : `
        SELECT *
        FROM food_entries
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT ${MAX_ITEMS};
      `;

  const rows = await allSql(sql);
  return rows.map(deserializeRow);
}

async function getItemById(id) {
  const row = await getSql(`SELECT * FROM food_entries WHERE id = ${sqlValue(id)} LIMIT 1;`);
  return deserializeRow(row);
}

async function queryRecipes(search = '') {
  const trimmed = search.trim().toLowerCase();
  const like = `%${trimmed}%`;
  const sql = trimmed
    ? `
        SELECT *
        FROM recipes
        WHERE lower(name) LIKE ${sqlValue(like)}
           OR lower(tagged_ingredients) LIKE ${sqlValue(like)}
        ORDER BY name COLLATE NOCASE ASC, id ASC;
      `
    : `
        SELECT *
        FROM recipes
        ORDER BY name COLLATE NOCASE ASC, id ASC;
      `;

  const rows = await allSql(sql);
  return rows.map(deserializeRecipeRow);
}

async function queryItemsByNames(names) {
  const normalizedNames = Array.from(
    new Map(
      names
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name])
    ).values()
  );

  if (normalizedNames.length === 0) {
    return [];
  }

  const clauses = normalizedNames
    .map((name) => `lower(name) = ${sqlValue(name.toLowerCase())}`)
    .join(' OR ');
  const rows = await allSql(`
    SELECT *
    FROM food_entries
    WHERE ${clauses}
    ORDER BY name COLLATE NOCASE ASC, id ASC;
  `);

  return rows.map(deserializeRow);
}

async function queryRecipeScoresByNames(recipeNames) {
  const uniqueRecipeNames = Array.from(
    new Set(
      (recipeNames || [])
        .map((recipeName) => String(recipeName || '').trim())
        .filter(Boolean)
    )
  );

  if (!uniqueRecipeNames.length) {
    return {};
  }

  const rows = await allSql(`
    SELECT name, sustainability_index
    FROM recipes
    WHERE lower(name) IN (${uniqueRecipeNames.map((name) => sqlValue(normalizeRecipeKey(name))).join(', ')})
    ORDER BY name COLLATE NOCASE ASC;
  `);

  return Object.fromEntries(
    rows.map((row) => [
      normalizeRecipeKey(row.name),
      row.sustainability_index === null ? null : Number(row.sustainability_index)
    ])
  );
}

function buildRecipeRows(items, timestamp) {
  const groupedRecipes = new Map();

  for (const item of items) {
    const uniqueTags = new Map();
    for (const recipeName of normalizeRecipes(item.tagged_recipes)) {
      const normalizedKey = recipeName.toLowerCase();
      if (!uniqueTags.has(normalizedKey)) {
        uniqueTags.set(normalizedKey, recipeName);
      }
    }

    for (const [normalizedKey, recipeName] of uniqueTags.entries()) {
      if (!groupedRecipes.has(normalizedKey)) {
        groupedRecipes.set(normalizedKey, {
          name: recipeName,
          ingredients: []
        });
      }

      const recipe = groupedRecipes.get(normalizedKey);
      recipe.ingredients.push(item);
    }
  }

  return Array.from(groupedRecipes.values())
    .map((recipe) => {
      const taggedIngredients = recipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        sustainability_index: ingredient.sustainability_index
      }));
      const nutritionCompositeScore = averageMetric(
        recipe.ingredients.map((ingredient) => ingredient.nutrition_composite_score)
      );
      const environmentalCompositeScore = averageMetric(
        recipe.ingredients.map((ingredient) => ingredient.environmental_composite_score)
      );

      return {
        name: recipe.name,
        sustainability_index: calculateSustainabilityIndex(
          nutritionCompositeScore,
          environmentalCompositeScore
        ),
        tagged_ingredients: taggedIngredients,
        created_at: timestamp,
        updated_at: timestamp,
        protein: sumMetric(recipe.ingredients.map((ingredient) => ingredient.protein)),
        fiber: sumMetric(recipe.ingredients.map((ingredient) => ingredient.fiber)),
        calcium: sumMetric(recipe.ingredients.map((ingredient) => ingredient.calcium)),
        iron: sumMetric(recipe.ingredients.map((ingredient) => ingredient.iron)),
        saturated_fat: sumMetric(
          recipe.ingredients.map((ingredient) => ingredient.saturated_fat)
        ),
        sodium: sumMetric(recipe.ingredients.map((ingredient) => ingredient.sodium)),
        nutrition_composite_score: nutritionCompositeScore,
        environmental_composite_score: environmentalCompositeScore,
        water_use_score: averageMetric(
          recipe.ingredients.map((ingredient) => ingredient.water_use_score)
        ),
        nitrogen_use_score: averageMetric(
          recipe.ingredients.map((ingredient) => ingredient.nitrogen_use_score)
        ),
        carbon_use_score: averageMetric(
          recipe.ingredients.map((ingredient) => ingredient.carbon_use_score)
        ),
        land_use_score: averageMetric(
          recipe.ingredients.map((ingredient) => ingredient.land_use_score)
        )
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

function recipeInsertSql(recipe) {
  return `
    INSERT INTO recipes (
      name,
      sustainability_index,
      tagged_ingredients,
      created_at,
      updated_at,
      protein,
      fiber,
      calcium,
      iron,
      saturated_fat,
      sodium,
      nutrition_composite_score,
      environmental_composite_score,
      water_use_score,
      nitrogen_use_score,
      carbon_use_score,
      land_use_score
    ) VALUES (
      ${sqlValue(recipe.name)},
      ${sqlValue(recipe.sustainability_index)},
      ${sqlValue(JSON.stringify(recipe.tagged_ingredients))},
      ${sqlValue(recipe.created_at)},
      ${sqlValue(recipe.updated_at)},
      ${sqlValue(recipe.protein)},
      ${sqlValue(recipe.fiber)},
      ${sqlValue(recipe.calcium)},
      ${sqlValue(recipe.iron)},
      ${sqlValue(recipe.saturated_fat)},
      ${sqlValue(recipe.sodium)},
      ${sqlValue(recipe.nutrition_composite_score)},
      ${sqlValue(recipe.environmental_composite_score)},
      ${sqlValue(recipe.water_use_score)},
      ${sqlValue(recipe.nitrogen_use_score)},
      ${sqlValue(recipe.carbon_use_score)},
      ${sqlValue(recipe.land_use_score)}
    );
  `;
}

async function repopulateRecipes() {
  const ingredients = (await allSql('SELECT * FROM food_entries ORDER BY id ASC;'))
    .map(deserializeRow);
  const now = new Date().toISOString();
  const recipes = buildRecipeRows(ingredients, now);

  let sql = 'DELETE FROM recipes;';
  if (recipes.length > 0) {
    sql += `\n${recipes.map((recipe) => recipeInsertSql(recipe)).join('\n')}`;
  }

  await runSql(sql);

  return {
    recipes: await queryRecipes(),
    ingredientCount: ingredients.length,
    recipeCount: recipes.length
  };
}

async function clearDatabase() {
  await runSql(`
    DELETE FROM food_entries;
    DELETE FROM recipes;
    DELETE FROM sqlite_sequence
    WHERE name IN ('food_entries', 'recipes');
  `);

  return {
    foodEntryCount: 0,
    recipeCount: 0
  };
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

function parseCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  const text = String(csvText || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      if (currentRow.some((value) => String(value).trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);
  if (currentRow.some((value) => String(value).trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

function normalizeCsvHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapCsvRow(row, headers) {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = row[index] ?? '';
  });
  return record;
}

function getCsvValue(record, aliases) {
  for (const alias of aliases) {
    if (record[alias] !== undefined) {
      return record[alias];
    }
  }
  return '';
}

function csvRecordToPayload(record) {
  return {
    name: getCsvValue(record, ['name', 'food_item_name', 'food_name']),
    tagged_recipes: getCsvValue(record, ['tagged_recipes', 'tagged_recipe', 'recipe_tags']),
    protein: getCsvValue(record, ['protein']),
    fiber: getCsvValue(record, ['fiber']),
    vitamin_a: getCsvValue(record, ['vitamin_a']),
    vitamin_c: getCsvValue(record, ['vitamin_c']),
    vitamin_e: getCsvValue(record, ['vitamin_e']),
    calcium: getCsvValue(record, ['calcium']),
    iron: getCsvValue(record, ['iron']),
    magnesium: getCsvValue(record, ['magnesium']),
    potassium: getCsvValue(record, ['potassium']),
    saturated_fat: getCsvValue(record, ['saturated_fat']),
    added_sugar: getCsvValue(record, ['added_sugar']),
    sodium: getCsvValue(record, ['sodium']),
    freshwater_withdrawals: getCsvValue(record, ['freshwater_withdrawals']),
    stress_weighted_water_use: getCsvValue(record, ['stress_weighted_water_use']),
    acidifying_emissions: getCsvValue(record, ['acidifying_emissions']),
    eutrophying_emissions: getCsvValue(record, ['eutrophying_emissions']),
    ghg_emissions: getCsvValue(record, ['ghg_emissions']),
    land_use: getCsvValue(record, ['land_use'])
  };
}

function parseCsvRecords(csvText) {
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    throw new Error('CSV payload did not contain any rows.');
  }

  const headers = rows[0].map(normalizeCsvHeader);

  if (!headers.some(Boolean)) {
    throw new Error('CSV header row is invalid.');
  }

  return rows.slice(1).map((row) => mapCsvRow(row, headers));
}

function serveStatic(pathname, method, res) {
  const routeAliases = {
    '/': '/index.html',
    '/admin': '/admin.html',
    '/admin/': '/admin.html'
  };

  const relativePath = routeAliases[pathname] || pathname;
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

async function handleCsvImport(req, res) {
  if (!await requireAdmin(req, res)) {
    return;
  }

  try {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    let csvText = '';
    let replaceExisting = false;

    if (contentType.includes('application/json')) {
      const body = await parseJsonBody(req);
      csvText = String(body.csvText || '');
      replaceExisting = Boolean(body.replaceExisting);
    } else {
      csvText = await parseTextBody(req);
      replaceExisting = String(req.headers['x-replace-existing'] || '').toLowerCase() === 'true';
    }

    if (!csvText.trim()) {
      return sendJson(res, 400, { error: 'CSV content is required.' });
    }

    const records = parseCsvRecords(csvText);

    if (records.length === 0) {
      return sendJson(res, 400, { error: 'CSV file only contained a header row.' });
    }

    const items = [];
    for (let index = 0; index < records.length; index += 1) {
      const payload = csvRecordToPayload(records[index]);
      const validated = validateFoodPayload(payload);
      if (validated.error) {
        return sendJson(res, 400, {
          error: `Row ${index + 2}: ${validated.error}`
        });
      }
      items.push(validated.value);
    }

    const now = new Date().toISOString();
    let sql = '';
    if (replaceExisting) {
      sql += 'DELETE FROM food_entries;';
    }
    sql += items.map((item) => foodInsertSql(item, now)).join('\n');

    await runSql(sql);
    await repopulateRecipes();

    return sendJson(res, 200, {
      imported: items.length,
      replacedExisting: replaceExisting
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 400, {
      error: error.message || 'CSV import failed.'
    });
  }
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

  if (pathname === '/api/items/import' && method === 'POST') {
    return handleCsvImport(req, res);
  }

  if (pathname === '/api/public-recipes' && method === 'GET') {
    const search = searchParams.get('q') || '';
    const recipes = await queryRecipes(search);
    const ingredients = await queryItemsByNames(
      recipes.flatMap((recipe) => (recipe.tagged_ingredients || []).map((ingredient) => ingredient.name))
    );

    return sendJson(res, 200, {
      recipes,
      ingredients,
      query: search
    });
  }

  if (pathname === '/api/items' && method === 'GET') {
    const search = searchParams.get('q') || '';
    const items = await queryItems(search);
    return sendJson(res, 200, {
      items,
      query: search,
      recipeScores: await queryRecipeScoresByNames(items.flatMap((item) => item.tagged_recipes || []))
    });
  }

  if (pathname === '/api/recipes' && method === 'GET') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    return sendJson(res, 200, {
      recipes: await queryRecipes()
    });
  }

  if (pathname === '/api/recipes/repopulate' && method === 'POST') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    try {
      const result = await repopulateRecipes();
      return sendJson(res, 200, result);
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, {
        error: error.message || 'Unable to repopulate recipes.'
      });
    }
  }

  if (pathname === '/api/admin/clear-database' && method === 'POST') {
    if (!await requireAdmin(req, res)) {
      return;
    }

    try {
      const result = await clearDatabase();
      return sendJson(res, 200, result);
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, {
        error: error.message || 'Unable to clear database.'
      });
    }
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
      await runSql(foodInsertSql(item, now));
      await repopulateRecipes();

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

      const existing = await getItemById(id);
      if (!existing) {
        return sendJson(res, 404, { error: 'Food item not found.' });
      }

      const body = await parseJsonBody(req);
      const validated = validateFoodPayload(body);
      if (validated.error) {
        return sendJson(res, 400, { error: validated.error });
      }

      await runSql(foodUpdateSql(id, validated.value, new Date().toISOString()));
      await repopulateRecipes();
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
    await repopulateRecipes();
    return sendJson(res, 200, { success: true });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer(async (req, res) => {
  try {
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
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Unexpected server error.' });
  }
});

validateConfiguration();

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
