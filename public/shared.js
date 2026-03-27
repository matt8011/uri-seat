export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseRecipes(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMetric(value) {
  return value === null || value === undefined ? 'Pending' : Number(value).toFixed(2);
}

export function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleString();
}

function valueOrZero(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function roundMetric(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function calculateNutrientRichFoodIndex(item) {
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

export function calculateNutritionCompositeScore(index) {
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
