import {
  api,
  escapeHtml,
  formatDateTime,
  formatMetric,
  getSustainabilityPalette
} from '/shared.js';

const PREVIEW_INGREDIENT_LIMIT = 4;
const MEAL_STORAGE_KEY = 'seat-my-meal-v1';

// ─── Nutrition definitions ────────────────────────────────
const NUTRIENTS = [
  { key: 'protein',       label: 'Protein',     color: '#2a7abf', positive: true,  divisor: 50 },
  { key: 'fiber',         label: 'Fiber',       color: '#3aaa4a', positive: true,  divisor: 25 },
  { key: 'calcium',       label: 'Calcium',     color: '#26c6da', positive: true,  divisor: 1000 },
  { key: 'iron',          label: 'Iron',        color: '#ef5350', positive: true,  divisor: 18 },
  { key: 'vitamin_a',     label: 'Vitamin A',   color: '#ff9800', positive: true,  divisor: 5000 },
  { key: 'vitamin_c',     label: 'Vitamin C',   color: '#ffd600', positive: true,  divisor: 60 },
  { key: 'vitamin_e',     label: 'Vitamin E',   color: '#8bc34a', positive: true,  divisor: 30 },
  { key: 'magnesium',     label: 'Magnesium',   color: '#ab47bc', positive: true,  divisor: 400 },
  { key: 'potassium',     label: 'Potassium',   color: '#26a69a', positive: true,  divisor: 3500 },
  { key: 'saturated_fat', label: 'Sat. Fat',    color: '#ff7043', positive: false, divisor: 20 },
  { key: 'added_sugar',   label: 'Added Sugar', color: '#e53935', positive: false, divisor: 50 },
  { key: 'sodium',        label: 'Sodium',      color: '#b71c1c', positive: false, divisor: 2400 },
];

// ─── Environmental circles config ────────────────────────
const ENV_CIRCLES = [
  {
    id: 'water',
    label: 'Water Footprint',
    unit: 'L/FU',
    color: '#3a7ebf',
    scoreKey: 'water_use_score',
    detail: 'Avg. Freshwater Withdrawals + Stress-Weighted Water Use',
    calc: (r) => averageValues([r.freshwater_withdrawals, r.stress_weighted_water_use]),
  },
  {
    id: 'nitrogen',
    label: 'Nitrogen Footprint',
    unit: 'g SO\u2082-eq/FU',
    color: '#26b090',
    scoreKey: 'nitrogen_use_score',
    detail: 'Avg. Acidifying + Eutrophying Emissions',
    calc: (r) => averageValues([r.acidifying_emissions, r.eutrophying_emissions]),
  },
  {
    id: 'carbon',
    label: 'Carbon Footprint',
    unit: 'kg CO\u2082/FU',
    color: '#78909c',
    scoreKey: 'carbon_use_score',
    detail: 'GHG Emissions per Functional Unit',
    calc: (r) => r.ghg_emissions,
  },
  {
    id: 'land',
    label: 'Land Use',
    unit: 'm\u00b2/FU',
    color: '#66bb6a',
    scoreKey: 'land_use_score',
    detail: 'Agricultural Land Use per Functional Unit',
    calc: (r) => r.land_use,
  },
];

// ─── State ────────────────────────────────────────────────
const state = {
  recipes: [],
  ingredientsByKey: new Map(),
  selectedRecipeId: null,
  selectedIngredientKey: null,
  searchQuery: '',

  mealItems: loadMealItems(),

  // Tab & plate interaction
  activeTab: 'foods',
  activePlatePortionId: null,  // portionId of selected pie slice
  activeEnvCircle: null,       // ENV_CIRCLES id with open tooltip

  // Ingredient counts (not persisted — resets on reload)
  ingredientCounts: {},        // { [portionId]: { [ingredientKey]: number } }

  // Ingredient search
  ingredientSearch: '',
  ingredientSearchResults: [],
  ingredientSearchPortionId: null, // which portion the search dropdown is for

  // Meal recipe search (in overview panel)
  mealRecipeSearch: '',
  mealRecipeSearchResults: [],

  // Active nutrient key (nutrients tab)
  activeNutrientKey: null,

  // Favorites
  favorites: new Set(loadFavorites()),
};

// ─── Elements ─────────────────────────────────────────────
const heroEl           = document.getElementById('heroSection');
const mealPlateEl      = document.getElementById('mealPlate');
const mealPlatePillsEl = document.getElementById('mealPlatePills');
const platePieContEl   = document.getElementById('platePieContainer');
const platePieLegendEl = document.getElementById('platePieLegend');
const plateInfoTitleEl = document.getElementById('plateInfoTitle');
const plateInfoContEl  = document.getElementById('plateInfoContent');
// nutrientPieContEl / nutrientPieLegendEl are now recreated dynamically inside renderNutrientTab()
// We keep these as getters to avoid stale references
function getNutrientPieContEl() { return document.getElementById('nutrientPieContainer'); }
function getNutrientPieLegendEl() { return document.getElementById('nutrientPieLegend'); }
const envCircles4El    = document.getElementById('envCircles4');
const tabFoodsEl       = document.getElementById('tabFoods');
const tabNutrientsEl   = document.getElementById('tabNutrients');
const tabEnvEl         = document.getElementById('tabEnv');
const searchSummaryEl  = document.getElementById('searchSummary');
const resultsGridEl    = document.getElementById('resultsGrid');
const emptyStateEl     = document.getElementById('emptyState');
const catalogSectionEl    = document.getElementById('catalogSection');
const catalogFloatOverlay = document.getElementById('catalogFloatOverlay');
const catalogFloatContent = document.getElementById('catalogFloatContent');
const catalogRecipeSearch = document.getElementById('catalogRecipeSearch');
const clearPlateBtnEl     = document.getElementById('clearPlateBtn');

// ─── Favorites storage ────────────────────────────────────
function loadFavorites() {
  try {
    const raw = window.localStorage.getItem('seat-favorites');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistFavorites() {
  try {
    window.localStorage.setItem('seat-favorites', JSON.stringify([...state.favorites]));
  } catch {}
}

// ─── Meal storage ─────────────────────────────────────────
function loadMealItems() {
  try {
    const raw = window.sessionStorage.getItem(MEAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeMealItem).filter(Boolean);
  } catch { return []; }
}

function persistMealItems() {
  try {
    window.sessionStorage.setItem(MEAL_STORAGE_KEY, JSON.stringify(state.mealItems));
  } catch {}
}

// ─── Utility ──────────────────────────────────────────────
function roundMetric(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function averageValues(values) {
  if (!values || !values.length) return null;
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    total += n;
  }
  return roundMetric(total / values.length);
}

function normalizeIngredientKey(value) {
  return String(value || '').trim().toLowerCase();
}

function snapshotIngredient(ingredient) {
  const name = String(ingredient?.name || '').trim();
  if (!name) return null;
  return {
    id: ingredient?.id ?? null,
    name,
    sustainability_index: ingredient?.sustainability_index == null ? null : Number(ingredient.sustainability_index),
  };
}

function dedupeIngredients(ingredients) {
  const seen = new Map();
  for (const ing of (ingredients || [])) {
    const snap = snapshotIngredient(ing);
    if (!snap) continue;
    const key = normalizeIngredientKey(snap.name);
    if (!seen.has(key)) seen.set(key, snap);
  }
  return Array.from(seen.values());
}

// ─── Ingredient counts helpers ────────────────────────────
function getIngredientCount(portionId, ingredientKey) {
  return (state.ingredientCounts[portionId] ?? {})[ingredientKey] ?? 1;
}

function allIngredientsZero(item) {
  const all = [...item.ingredients, ...(item.addedIngredients || [])];
  if (!all.length) return false;
  return all.every((ing) => getIngredientCount(item.id, normalizeIngredientKey(ing.name)) === 0);
}

function setIngredientCount(portionId, ingredientKey, count) {
  if (!state.ingredientCounts[portionId]) state.ingredientCounts[portionId] = {};
  state.ingredientCounts[portionId][ingredientKey] = Math.max(0, count);
  // If all ingredients now at 0, remove the portion entirely
  const item = getMealItemById(portionId);
  if (item && allIngredientsZero(item)) {
    updateMealItems(state.mealItems.filter((mi) => mi.id !== portionId));
    return;
  }
}

// ─── Meal item management ─────────────────────────────────
function createMealItem(recipe) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    recipeId: recipe.id,
    recipeName: recipe.name,
    ingredients: dedupeIngredients(recipe.tagged_ingredients || []),
    addedIngredients: [],
  };
}

function sanitizeMealItem(value) {
  const recipeName = String(value?.recipeName || '').trim();
  const ingredients = dedupeIngredients(value?.ingredients || []);
  if (!recipeName) return null;
  return {
    id: String(value?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    recipeId: value?.recipeId == null ? null : Number(value.recipeId),
    recipeName,
    ingredients,
    addedIngredients: Array.isArray(value?.addedIngredients)
      ? value.addedIngredients.filter((ai) => ai && typeof ai.name === 'string')
      : [],
  };
}

function getMealItemById(itemId) {
  return state.mealItems.find((item) => item.id === itemId) || null;
}

function getMealItemScore(mealItem) {
  const allIngs = [
    ...mealItem.ingredients,
    ...(mealItem.addedIngredients || []),
  ];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const ing of allIngs) {
    if (ing.sustainability_index == null) continue;
    const key = normalizeIngredientKey(ing.name);
    const weight = getIngredientCount(mealItem.id, key);
    if (!weight) continue;
    weightedSum += ing.sustainability_index * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? roundMetric(weightedSum / totalWeight) : null;
}

// Split a meal item's weighted SI into nutrition / environmental portions
// by preserving the recipe-level nut:env ratio.
function getMealItemNutritionScore(mealItem) {
  const recipe = state.recipes.find((r) => r.id === mealItem.recipeId);
  if (!recipe) return null;
  const rNut = recipe.nutrition_composite_score;
  const rEnv = recipe.environmental_composite_score;
  if (rNut == null) return null;
  const si = getMealItemScore(mealItem);
  if (si === null) return rNut;
  if (rEnv == null) return si;
  const total = rNut + rEnv;
  if (total === 0) return null;
  return roundMetric(si * (rNut / total));
}

function getMealItemEnvScore(mealItem) {
  const recipe = state.recipes.find((r) => r.id === mealItem.recipeId);
  if (!recipe) return null;
  const rNut = recipe.nutrition_composite_score;
  const rEnv = recipe.environmental_composite_score;
  if (rEnv == null) return null;
  const si = getMealItemScore(mealItem);
  if (si === null) return rEnv;
  if (rNut == null) return si;
  const total = rNut + rEnv;
  if (total === 0) return null;
  return roundMetric(si * (rEnv / total));
}

function getOverallMealScore() {
  if (!state.mealItems.length) return null;
  return averageValues(state.mealItems.map(getMealItemScore));
}

function getAggregateSlices() {
  const map = new Map();
  for (const item of state.mealItems) {
    const key = item.recipeId ?? item.recipeName;
    if (!map.has(key)) {
      map.set(key, { recipeId: item.recipeId, recipeName: item.recipeName, portions: [] });
    }
    map.get(key).portions.push(item);
  }
  return Array.from(map.values());
}

function getPortionCountForRecipe(recipeId) {
  return state.mealItems.filter((item) => item.recipeId === recipeId).length;
}

function updateMealItems(nextItems) {
  const wasEmpty = state.mealItems.length === 0;
  state.mealItems = nextItems.map(sanitizeMealItem).filter(Boolean);

  // Clean stale activePlatePortionId
  if (state.activePlatePortionId && !getMealItemById(state.activePlatePortionId)) {
    state.activePlatePortionId = null;
  }

  // Clean stale ingredientCounts for removed portions
  const livingIds = new Set(state.mealItems.map((i) => i.id));
  for (const id of Object.keys(state.ingredientCounts)) {
    if (!livingIds.has(id)) delete state.ingredientCounts[id];
  }

  // Show/hide
  const hasItems = state.mealItems.length > 0;
  heroEl.classList.toggle('hidden', hasItems);
  mealPlateEl.classList.toggle('hidden', !hasItems);

  // Scroll to mealPlate on first add
  if (wasEmpty && hasItems) {
    setTimeout(() => mealPlateEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  persistMealItems();
  renderMealPlate();
  renderResults(); // update +/- on catalog cards
}

function addPortion(recipe) {
  updateMealItems([...state.mealItems, createMealItem(recipe)]);
}

function removePortion(recipeId) {
  const items = [...state.mealItems];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].recipeId === recipeId) {
      items.splice(i, 1);
      break;
    }
  }
  updateMealItems(items);
}

// ─── Recipe helpers ───────────────────────────────────────
function getSelectedRecipe() {
  return state.recipes.find((r) => r.id === state.selectedRecipeId) || null;
}

function getSelectedIngredient() {
  if (!state.selectedIngredientKey) return null;
  return state.ingredientsByKey.get(state.selectedIngredientKey) || null;
}

// ─── SVG Pie chart engine ─────────────────────────────────
function polarToCart(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(cx, cy, r, startDeg, endDeg) {
  const span = endDeg - startDeg;
  if (span >= 359.99) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const s = polarToCart(cx, cy, r, startDeg);
  const e = polarToCart(cx, cy, r, endDeg);
  const large = span > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)} Z`;
}

/**
 * slices: Array<{ label, value, color, clickId?, highlighted?, dimmed? }>
 * Returns { svg: string, legendItems: Array<{label, color}> }
 */
function renderPieChart(slices, { cx = 100, cy = 100, r = 92, minLabelDeg = 22 } = {}) {
  const total = slices.reduce((s, sl) => s + (sl.value || 0), 0);

  if (!total || !slices.length) {
    return {
      svg: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="92" fill="rgba(0,33,71,0.05)" stroke="rgba(0,33,71,0.08)" stroke-width="1"/>
        <text x="100" y="108" text-anchor="middle" font-size="13" fill="#9aabb8" font-family="Manrope,sans-serif">No data</text>
      </svg>`,
      legendItems: [],
    };
  }

  const paths = [];
  const textEls = [];
  const legendItems = [];
  let currentDeg = 0;

  for (const slice of slices) {
    const spanDeg = (slice.value / total) * 360;
    if (spanDeg < 0.01) continue;
    const startDeg = currentDeg;
    const endDeg = currentDeg + spanDeg;

    const d = sectorPath(cx, cy, r, startDeg, endDeg);
    const opacity = slice.dimmed ? 0.22 : 1;
    const strokeColor = slice.highlighted ? slice.color : 'rgba(255,255,255,0.9)';
    const strokeWidth = slice.highlighted ? 4 : 1.5;

    const attrs = [
      `d="${d}"`,
      `fill="${escapeHtml(slice.color)}"`,
      `opacity="${opacity}"`,
      `stroke="${escapeHtml(strokeColor)}"`,
      `stroke-width="${strokeWidth}"`,
      slice.clickId ? `data-pie-click="${escapeHtml(String(slice.clickId))}"` : '',
      slice.clickId ? 'style="cursor:pointer;"' : '',
      `aria-label="${escapeHtml(slice.label)}"`,
    ].filter(Boolean).join(' ');

    paths.push(`<path ${attrs}/>`);

    if (spanDeg >= minLabelDeg) {
      const midDeg = startDeg + spanDeg / 2;
      const labelR = r * 0.62;
      const lp = polarToCart(cx, cy, labelR, midDeg);
      const fontSize = spanDeg > 55 ? 10 : 8;
      const labelText = slice.label.length > 14 ? slice.label.slice(0, 13) + '\u2026' : slice.label;
      textEls.push(
        `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" fill="white" font-weight="700" pointer-events="none" font-family="Manrope,sans-serif">${escapeHtml(labelText)}</text>`
      );
    } else {
      legendItems.push({ label: slice.label, color: slice.color });
    }

    currentDeg = endDeg;
  }

  const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;overflow:visible;">
    ${paths.join('\n    ')}
    ${textEls.join('\n    ')}
  </svg>`;

  return { svg, legendItems };
}

function renderLegend(legendItems) {
  if (!legendItems.length) return '';
  return legendItems.map((li) =>
    `<div class="legend-item">
      <span class="legend-swatch" style="background:${escapeHtml(li.color)};"></span>
      <span>${escapeHtml(li.label)}</span>
    </div>`
  ).join('');
}

// ─── Score grids (used in catalog info) ──────────────────
function renderScoreProminentGrid(entry) {
  const siPal = getSustainabilityPalette(entry.sustainability_index);
  const nutScore = entry.nutrition_composite_score;
  const envScore = entry.environmental_composite_score;
  const nutPal = getSustainabilityPalette(nutScore != null ? nutScore * 2 : null);
  const envPal = getSustainabilityPalette(envScore != null ? envScore * 2 : null);

  return `
    <div class="score-prominent-grid">
      <div class="score-prominent-card score-prominent-si" style="background:${siPal.background};border-color:${siPal.border};color:${siPal.text};">
        <span class="score-prominent-label">Sustainability Index</span>
        <strong class="score-prominent-value">${escapeHtml(formatMetric(entry.sustainability_index))}</strong>
        <span class="score-prominent-eq">= Nutrition + Environmental</span>
      </div>
      <div class="score-prominent-card" style="background:${nutPal.background};border-color:${nutPal.border};color:${nutPal.text};">
        <span class="score-prominent-label">Nutrition</span>
        <strong class="score-prominent-value">${escapeHtml(formatMetric(nutScore))}</strong>
        <span class="score-prominent-eq">out of 5</span>
      </div>
      <div class="score-prominent-card" style="background:${envPal.background};border-color:${envPal.border};color:${envPal.text};">
        <span class="score-prominent-label">Environmental</span>
        <strong class="score-prominent-value">${escapeHtml(formatMetric(envScore))}</strong>
        <span class="score-prominent-eq">out of 5</span>
      </div>
    </div>`;
}

function renderNutrientSubgrid(entry) {
  return `
    <div class="score-subgrid">
      <div class="score-subcell"><span>Protein</span><strong>${escapeHtml(formatMetric(entry.protein))}</strong></div>
      <div class="score-subcell"><span>Fiber</span><strong>${escapeHtml(formatMetric(entry.fiber))}</strong></div>
      <div class="score-subcell"><span>Calcium</span><strong>${escapeHtml(formatMetric(entry.calcium))}</strong></div>
      <div class="score-subcell"><span>Iron</span><strong>${escapeHtml(formatMetric(entry.iron))}</strong></div>
      <div class="score-subcell"><span>Sat. Fat</span><strong>${escapeHtml(formatMetric(entry.saturated_fat))}</strong></div>
      <div class="score-subcell"><span>Sodium</span><strong>${escapeHtml(formatMetric(entry.sodium))}</strong></div>
    </div>`;
}

function renderEnvSubgrid(entry) {
  return `
    <div class="score-subgrid">
      <div class="score-subcell"><span>Water Use</span><strong>${escapeHtml(formatMetric(entry.water_use_score))}</strong></div>
      <div class="score-subcell"><span>Nitrogen</span><strong>${escapeHtml(formatMetric(entry.nitrogen_use_score))}</strong></div>
      <div class="score-subcell"><span>Carbon</span><strong>${escapeHtml(formatMetric(entry.carbon_use_score))}</strong></div>
      <div class="score-subcell"><span>Land Use</span><strong>${escapeHtml(formatMetric(entry.land_use_score))}</strong></div>
    </div>`;
}

function renderIngredientScorePill(ingredient) {
  const name = escapeHtml(ingredient.name);
  const key = escapeHtml(normalizeIngredientKey(ingredient.name));
  const label = escapeHtml(formatMetric(ingredient.sustainability_index));
  const pal = getSustainabilityPalette(ingredient.sustainability_index);

  return `<button
    class="pill ingredient-pill"
    type="button"
    data-recipe-pill
    data-open="false"
    data-ingredient-detail-trigger
    data-ingredient-key="${key}"
    title="SI ${label}"
    aria-label="${name} sustainability index ${label}"
    aria-expanded="false"
  >
    <span>${name}</span>
    <span class="ingredient-pill-score"
      style="--ingredient-score-bg-start:${escapeHtml(pal.background)};--ingredient-score-bg-end:${escapeHtml(pal.border)};--ingredient-score-text:${escapeHtml(pal.text)};--ingredient-score-border:${escapeHtml(pal.border)};">
      SI ${label}
    </span>
  </button>`;
}

// ─── Plate Pie (Foods tab) ────────────────────────────────
function buildPlateSlices() {
  const totalPortions = state.mealItems.length;
  if (!totalPortions) return [];

  // Every portion = 1 equal slice. Same recipe gets same base color, slight shade variation.
  // We assign colors by recipeId to ensure same recipe = same hue family.
  const recipeColorMap = new Map();
  let colorIdx = 0;
  const PALETTE = [
    ['#2a7abf', '#1a5a9f'], ['#3aaa4a', '#2a8a3a'], ['#ef5350', '#bf3330'],
    ['#ff9800', '#df7800'], ['#ab47bc', '#8b27ac'], ['#26a69a', '#06867a'],
    ['#78909c', '#58707c'], ['#66bb6a', '#46a04a'], ['#ffd600', '#cfb600'],
    ['#ff7043', '#df5023'],
  ];

  // Use getAggregateSlices() so same-recipe portions are grouped/adjacent in the pie
  const aggregates = getAggregateSlices();
  for (const agg of aggregates) {
    const key = agg.recipeId ?? agg.recipeName;
    if (!recipeColorMap.has(key)) {
      recipeColorMap.set(key, PALETTE[colorIdx % PALETTE.length]);
      colorIdx++;
    }
  }

  const recipePortion = new Map(); // key → count so far (for shade variation)
  const slices = [];
  for (const agg of aggregates) {
    const key = agg.recipeId ?? agg.recipeName;
    const colors = recipeColorMap.get(key);
    for (const item of agg.portions) {
      const countSoFar = recipePortion.get(key) ?? 0;
      recipePortion.set(key, countSoFar + 1);
      const color = countSoFar % 2 === 0 ? colors[0] : colors[1];
      const isSelected = state.activePlatePortionId === item.id;
      slices.push({
        label: item.recipeName,
        value: 1,
        color,
        clickId: `portion:${item.id}`,
        highlighted: isSelected,
        dimmed: state.activePlatePortionId !== null && !isSelected,
      });
    }
  }
  return slices;
}

function renderPlatePie() {
  const slices = buildPlateSlices();
  if (!slices.length) {
    platePieContEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.4;font-size:0.85rem;color:var(--muted);">Add recipes to see your plate</div>`;
    platePieLegendEl.innerHTML = '';
    return;
  }
  const { svg, legendItems } = renderPieChart(slices);
  platePieContEl.innerHTML = svg;
  platePieLegendEl.innerHTML = renderLegend(legendItems);
}

// ─── Plate Info Panel ─────────────────────────────────────
function renderIngredientRow(portionId, ingKey, ingName, isAdded) {
  const count = getIngredientCount(portionId, ingKey);
  const safePortionId = escapeHtml(portionId);
  const safeKey = escapeHtml(ingKey);
  const safeName = escapeHtml(ingName);
  const xBtn = isAdded
    ? `<button class="ing-remove-btn" type="button" data-ing-remove data-portion-id="${safePortionId}" data-ing-key="${safeKey}" aria-label="Remove ${safeName}">\u00d7</button>`
    : '';
  return `<div class="ing-row${isAdded ? ' ing-row-added' : ''}">
    <div class="qty-control qty-control-sm">
      <button class="qty-btn qty-minus" type="button" data-ing-minus data-portion-id="${safePortionId}" data-ing-key="${safeKey}" aria-label="Decrease ${safeName}">&#8722;</button>
      <span class="qty-value">${count}</span>
      <button class="qty-btn qty-plus" type="button" data-ing-plus data-portion-id="${safePortionId}" data-ing-key="${safeKey}" aria-label="Increase ${safeName}">+</button>
    </div>
    <span class="ing-name">${safeName}</span>
    ${xBtn}
  </div>`;
}

function renderIngredientSearch(portionId) {
  const isActive = state.ingredientSearchPortionId === portionId;
  const query = isActive ? state.ingredientSearch : '';
  const results = isActive ? state.ingredientSearchResults : [];
  const safePortionId = escapeHtml(portionId);

  const dropdownHtml = results.length > 0
    ? `<div class="ing-search-dropdown">
        ${results.slice(0, 8).map((item) => {
          const pal = getSustainabilityPalette(item.sustainability_index);
          return `<button class="ing-search-result" type="button"
            data-ing-search-pick
            data-portion-id="${safePortionId}"
            data-ing-name="${escapeHtml(item.name)}"
            data-ing-si="${escapeHtml(String(item.sustainability_index ?? ''))}"
            data-ing-id="${escapeHtml(String(item.id ?? ''))}"
          >
            <span>${escapeHtml(item.name)}</span>
            <span class="score-chip" style="background:${escapeHtml(pal.background)};border:1px solid ${escapeHtml(pal.border)};color:${escapeHtml(pal.text)};">SI ${escapeHtml(formatMetric(item.sustainability_index))}</span>
          </button>`;
        }).join('')}
      </div>`
    : '';

  return `<div class="ing-search-wrap" data-ing-search-wrap data-portion-id="${safePortionId}">
    <input
      class="ing-search-input"
      type="search"
      placeholder="Add ingredient\u2026"
      autocomplete="off"
      data-ing-search-input
      data-portion-id="${safePortionId}"
      value="${escapeHtml(query)}"
    >
    ${dropdownHtml}
  </div>`;
}

function renderPlateInfoPanel() {
  const portionId = state.activePlatePortionId;

  if (portionId) {
    const item = getMealItemById(portionId);
    if (item) {
      const baseRows = item.ingredients.map((ing) => {
        const key = normalizeIngredientKey(ing.name);
        return renderIngredientRow(portionId, key, ing.name, false);
      }).join('');

      const addedRows = (item.addedIngredients || []).map((ing) => {
        const key = normalizeIngredientKey(ing.name);
        return renderIngredientRow(portionId, key, ing.name, true);
      }).join('');

      plateInfoTitleEl.textContent = item.recipeName;
      plateInfoContEl.innerHTML = `
        <button class="button button-secondary detail-back-button" type="button" data-plate-info-back>
          \u2190 Back to Overview
        </button>
        ${item.ingredients.length ? `<p class="panel-kicker">Base Ingredients</p><div class="ing-list">${baseRows}</div>` : '<p class="detail-copy">No base ingredients.</p>'}
        ${item.addedIngredients?.length ? `<p class="panel-kicker">Added Ingredients</p><div class="ing-list">${addedRows}</div>` : ''}
        <p class="panel-kicker" style="margin-top:8px;">Add Ingredient</p>
        ${renderIngredientSearch(portionId)}
      `;
      return;
    }
  }

  // Default overview
  const overallScore = getOverallMealScore();
  const overallPal = getSustainabilityPalette(overallScore);
  const aggregates = getAggregateSlices();

  // Compute nutrition and environmental composite averages (ingredient-count weighted)
  const nutScores = state.mealItems.map(getMealItemNutritionScore).filter((v) => v !== null);
  const envScores = state.mealItems.map(getMealItemEnvScore).filter((v) => v !== null);
  const avgNutScore = nutScores.length ? roundMetric(nutScores.reduce((a, b) => a + b, 0) / nutScores.length) : null;
  const avgEnvScore = envScores.length ? roundMetric(envScores.reduce((a, b) => a + b, 0) / envScores.length) : null;
  const nutPal = getSustainabilityPalette(avgNutScore != null ? avgNutScore * 2 : null);
  const envPal = getSustainabilityPalette(avgEnvScore != null ? avgEnvScore * 2 : null);

  // Mini 2-slice pie SVG (60×60) showing nutrition vs environmental proportion
  function miniPie2(a, b, colA, colB) {
    if (a == null && b == null) return '';
    const va = a ?? 0; const vb = b ?? 0; const tot = va + vb;
    if (tot === 0) return '';
    const spanA = (va / tot) * 360;
    const { svg: pieSvg } = renderPieChart(
      [{ label: 'Nutrition', value: va, color: colA }, { label: 'Environmental', value: vb, color: colB }],
      { cx: 30, cy: 30, r: 28, minLabelDeg: 999 }
    );
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" class="si-breakdown-mini-pie">${pieSvg.replace(/<svg[^>]*>|<\/svg>/g, '')}</svg>`;
  }
  const miniPieSvg = miniPie2(avgNutScore, avgEnvScore, nutPal.border, envPal.border);

  // Meal recipe search dropdown HTML
  const searchQuery = state.mealRecipeSearch || '';
  const searchResults = state.mealRecipeSearchResults || [];
  const dropdownHtml = searchResults.length > 0
    ? `<div class="meal-recipe-search-dropdown">
        ${searchResults.slice(0, 8).map((r) => {
          const rPal = getSustainabilityPalette(r.sustainability_index);
          return `<button class="meal-recipe-search-result" type="button"
            data-meal-recipe-search-pick
            data-recipe-id="${escapeHtml(String(r.id))}"
          >
            <span>${escapeHtml(r.name)}</span>
            <span class="score-chip" style="background:${escapeHtml(rPal.background)};border:1px solid ${escapeHtml(rPal.border)};color:${escapeHtml(rPal.text)};">SI ${escapeHtml(formatMetric(r.sustainability_index))}</span>
          </button>`;
        }).join('')}
      </div>`
    : '';

  plateInfoTitleEl.textContent = 'Meal Overview';
  plateInfoContEl.innerHTML = `
    <div class="score-prominent-grid">
      <div class="score-prominent-card score-prominent-si" style="background:${overallPal.background};border-color:${overallPal.border};color:${overallPal.text};">
        <span class="score-prominent-label">Overall Meal SI</span>
        <strong class="score-prominent-value">${escapeHtml(formatMetric(overallScore))}</strong>
        <span class="score-prominent-eq">avg. sustainability index</span>
      </div>
    </div>
    <div class="si-breakdown-row">
      ${miniPieSvg ? miniPieSvg : ''}
      <div class="si-breakdown-cards">
        <div class="si-breakdown-card" style="background:${nutPal.background};border-color:${nutPal.border};color:${nutPal.text};">
          <span>Nutrition</span>
          <strong>${escapeHtml(formatMetric(avgNutScore))}</strong>
        </div>
        <div class="si-breakdown-card" style="background:${envPal.background};border-color:${envPal.border};color:${envPal.text};">
          <span>Environmental</span>
          <strong>${escapeHtml(formatMetric(avgEnvScore))}</strong>
        </div>
      </div>
    </div>
    <p class="panel-kicker">Recipes</p>
    <div class="meal-aggregate-list">
      ${aggregates.map((agg) => {
        const avgScore = averageValues(agg.portions.map(getMealItemScore));
        const pal = getSustainabilityPalette(avgScore);
        const safeRecipeId = escapeHtml(String(agg.recipeId ?? ''));
        return `<div class="meal-agg-row" data-meal-agg-row data-recipe-id="${safeRecipeId}">
          <span class="meal-agg-name">${escapeHtml(agg.recipeName)}</span>
          <span class="meal-agg-count-center">${escapeHtml(String(agg.portions.length))}\u00d7</span>
          <span class="score-chip" style="background:${pal.background};border:1px solid ${pal.border};color:${pal.text};">SI ${escapeHtml(formatMetric(avgScore))}</span>
          <div class="qty-control qty-control-sm">
            <button class="qty-btn qty-minus" type="button" data-meal-agg-minus data-recipe-id="${safeRecipeId}" aria-label="Remove one portion">&#8722;</button>
            <span class="qty-value">${escapeHtml(String(agg.portions.length))}</span>
            <button class="qty-btn qty-plus" type="button" data-meal-agg-plus data-recipe-id="${safeRecipeId}" aria-label="Add one portion">+</button>
          </div>
          <button class="meal-agg-remove-btn" type="button" data-meal-agg-remove data-recipe-id="${safeRecipeId}" aria-label="Remove all">\u00d7</button>
        </div>`;
      }).join('')}
    </div>
    <div class="meal-recipe-search-wrap">
      <input
        class="meal-recipe-search-input"
        type="search"
        placeholder="Add another recipe\u2026"
        autocomplete="off"
        data-meal-recipe-search
        value="${escapeHtml(searchQuery)}"
      >
      ${dropdownHtml}
    </div>
  `;
}

// ─── Nutrients tab ────────────────────────────────────────
function getAggregatedNutrientValues() {
  const result = {};
  for (const nut of NUTRIENTS) result[nut.key] = 0;
  for (const item of state.mealItems) {
    const recipe = state.recipes.find((r) => r.id === item.recipeId);
    if (recipe) {
      for (const nut of NUTRIENTS) {
        result[nut.key] += Math.abs(Number(recipe[nut.key] || 0) / nut.divisor);
      }
    }
  }
  return result;
}

function renderNutrientTab() {
  if (!state.mealItems.length) {
    tabNutrientsEl.innerHTML = `<div class="pie-empty-state" style="height:200px;"><span>Add meals to see nutrition breakdown</span></div>`;
    return;
  }

  const values = getAggregatedNutrientValues();

  // Compute overall nutrition composite score (ingredient-count weighted)
  const nutScores = state.mealItems.map(getMealItemNutritionScore).filter((v) => v !== null);
  const avgNutScore = nutScores.length ? roundMetric(nutScores.reduce((a, b) => a + b, 0) / nutScores.length) : null;
  const nutPal = getSustainabilityPalette(avgNutScore != null ? avgNutScore * 2 : null);

  const hasSelection = state.activeNutrientKey !== null;

  const slices = NUTRIENTS.map((nut) => ({
    label: nut.label,
    value: values[nut.key] || 0,
    color: nut.color,
    clickId: `nutrient:${nut.label}`,
    highlighted: state.activeNutrientKey === nut.label,
    dimmed: hasSelection && state.activeNutrientKey !== nut.label,
  })).filter((s) => s.value > 0.0001);

  const { svg } = renderPieChart(slices);

  // Full legend — all visible nutrient slices, always shown at far left
  const fullLegendHtml = slices.map((s) => `
    <div class="legend-item nutrient-legend-item${state.activeNutrientKey === s.label ? ' is-active' : ''}">
      <span class="legend-swatch" style="background:${escapeHtml(s.color)};"></span>
      <span>${escapeHtml(s.label)}</span>
    </div>`).join('');

  // Build info panel HTML if a nutrient is selected
  let infoPanelHtml = '';
  if (hasSelection) {
    const selectedNut = NUTRIENTS.find((n) => n.label === state.activeNutrientKey);
    if (selectedNut) {
      const rows = state.mealItems.map((mi) => {
        const r = state.recipes.find((rec) => rec.id === mi.recipeId);
        const val = r ? Math.abs(Number(r[selectedNut.key] || 0)) : 0;
        return { name: mi.recipeName, val };
      });
      infoPanelHtml = `
        <div class="nutrient-info-panel">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <strong>${escapeHtml(selectedNut.label)} by Recipe</strong>
            <button class="button button-secondary" type="button" data-nutrient-back style="padding:6px 12px;font-size:0.82rem;">← Back</button>
          </div>
          <div class="nutrient-breakdown-list">
            ${rows.map((row) => `<div class="nutrient-breakdown-row">
              <div class="nutrient-breakdown-name">
                <span class="nutrient-swatch" style="background:${escapeHtml(selectedNut.color)};"></span>
                <span>${escapeHtml(row.name)}</span>
              </div>
              <span class="nutrient-count">${escapeHtml(row.val.toFixed(1))}</span>
            </div>`).join('')}
          </div>
        </div>`;
    }
  }

  // Score card HTML
  const scoreCardHtml = `
    <div class="nutrient-score-card" style="background:${nutPal.background};border-color:${nutPal.border};color:${nutPal.text};">
      <span class="score-prominent-label">Nutrition Score</span>
      <strong class="score-prominent-value">${escapeHtml(formatMetric(avgNutScore))}</strong>
      <span class="score-prominent-eq">avg. nutrition composite</span>
    </div>`;

  tabNutrientsEl.innerHTML = `
    ${scoreCardHtml}
    <div class="nutrient-tab-layout${hasSelection ? ' has-selection' : ''}">
      <div class="nutrient-legend-col">
        ${fullLegendHtml}
      </div>
      <div class="nutrient-pie-col">
        <div id="nutrientPieContainer" class="pie-container nutrient-pie">${svg}</div>
      </div>
      ${infoPanelHtml}
    </div>`;

  // Animate info panel sliding in
  if (hasSelection) {
    const panel = tabNutrientsEl.querySelector('.nutrient-info-panel');
    if (panel) {
      panel.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('is-entering')));
    }
  }
}

// ─── Environmental tab ────────────────────────────────────
function getAvgEnvValues() {
  if (!state.mealItems.length) return {};
  const out = {};
  for (const ec of ENV_CIRCLES) {
    let total = 0;
    let weight = 0;
    for (const item of state.mealItems) {
      const allIngs = [...item.ingredients, ...(item.addedIngredients || [])];
      for (const ing of allIngs) {
        const count = getIngredientCount(item.id, normalizeIngredientKey(ing.name));
        if (!count) continue;
        const fullIng = state.ingredientsByKey.get(normalizeIngredientKey(ing.name));
        if (!fullIng) continue;
        const val = ec.calc(fullIng);
        if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
          total += Number(val) * count;
          weight += count;
        }
      }
    }
    out[ec.id] = weight > 0 ? roundMetric(total / weight) : null;
  }
  return out;
}

function getAvgScoreValues() {
  if (!state.mealItems.length) return {};
  const out = {};
  for (const ec of ENV_CIRCLES) {
    const vals = state.mealItems.map((item) => {
      const recipe = state.recipes.find((r) => r.id === item.recipeId);
      return recipe != null ? (recipe[ec.scoreKey] != null ? Number(recipe[ec.scoreKey]) : null) : null;
    }).filter((v) => v !== null && v !== undefined);
    out[ec.id] = averageValues(vals);
  }
  return out;
}

function renderEnvTab() {
  if (!state.mealItems.length) {
    tabEnvEl.innerHTML = '<p class="detail-copy" style="text-align:center;padding:32px;">Add meals to see environmental impact.</p>';
    return;
  }

  const rawVals = getAvgEnvValues();
  const scoreVals = getAvgScoreValues();

  // Compute overall environmental composite score (ingredient-count weighted)
  const envScores = state.mealItems.map(getMealItemEnvScore).filter((v) => v !== null);
  const avgEnvScore = envScores.length ? roundMetric(envScores.reduce((a, b) => a + b, 0) / envScores.length) : null;
  const envPal = getSustainabilityPalette(avgEnvScore != null ? avgEnvScore * 2 : null);

  const scoreCardHtml = `
    <div class="env-score-card-wrap">
      <div class="score-prominent-card score-prominent-si" style="background:${envPal.background};border-color:${envPal.border};color:${envPal.text};">
        <span class="score-prominent-label">Environmental Score</span>
        <strong class="score-prominent-value">${escapeHtml(formatMetric(avgEnvScore))}</strong>
        <span class="score-prominent-eq">avg. environmental composite</span>
      </div>
    </div>`;

  const circlesHtml = ENV_CIRCLES.map((ec) => {
    const rawVal = rawVals[ec.id];
    const score = scoreVals[ec.id];
    const pct = score !== null && score !== undefined
      ? Math.max(0, Math.min(100, Math.round(((score - 1) / 4) * 100)))
      : 0;
    const isActive = state.activeEnvCircle === ec.id;
    const displayScore = score !== null && score !== undefined ? formatMetric(score) : 'N/A';
    const hasRaw = rawVal !== null && rawVal !== undefined;
    const displayVal = hasRaw ? Number(rawVal).toFixed(2) : null;

    const tooltip = isActive
      ? `<div class="env4-tooltip">
          <strong>${escapeHtml(ec.label)}</strong>
          <span>${escapeHtml(ec.detail)}</span>
          ${hasRaw
            ? `<span>${escapeHtml(displayVal)} ${escapeHtml(ec.unit)}</span>`
            : `<span>Score: ${escapeHtml(displayScore)} / 5</span>`}
        </div>`
      : '';

    return `<div class="env-circle4-wrap${isActive ? ' is-active' : ''}" data-env-circle4="${escapeHtml(ec.id)}">
      <div class="env-circle4" style="--ec-color:${escapeHtml(ec.color)};--ec-pct:${pct}%;" title="${escapeHtml(displayVal)} ${escapeHtml(ec.unit)}">
        <span class="env-circle4-val">${escapeHtml(displayScore)}</span>
        <span class="env-circle4-unit">/ 5</span>
      </div>
      <span class="env-circle4-label">${escapeHtml(ec.label)}</span>
      ${tooltip}
    </div>`;
  }).join('');

  tabEnvEl.innerHTML = `
    ${scoreCardHtml}
    <div id="envCircles4" class="env-circles-4" data-env-tab-bg>
      ${circlesHtml}
    </div>`;
}

// ─── Meal plate pills ─────────────────────────────────────
function renderMealPlatePills() {
  const totalPortions = state.mealItems.length;
  const overallScore = getOverallMealScore();
  const siPal = getSustainabilityPalette(overallScore);

  mealPlatePillsEl.innerHTML = `
    <span class="pill meal-pill-portions">${escapeHtml(String(totalPortions))} Portion${totalPortions === 1 ? '' : 's'}</span>
    <span class="pill meal-pill-si" style="background:${escapeHtml(siPal.background)};border:1px solid ${escapeHtml(siPal.border)};color:${escapeHtml(siPal.text)};">
      SI ${overallScore !== null ? escapeHtml(formatMetric(overallScore)) : '\u2014'}
    </span>`;
}

// ─── Tab switching ────────────────────────────────────────
function switchTab(tabId) {
  state.activeTab = tabId;

  const tabPanels = {
    foods: tabFoodsEl,
    nutrients: tabNutrientsEl,
    environmental: tabEnvEl,
  };

  for (const [id, el] of Object.entries(tabPanels)) {
    el.classList.toggle('hidden', id !== tabId);
  }

  const tabBtns = mealPlateEl.querySelectorAll('.tab-btn');
  for (const btn of tabBtns) {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

// ─── Full meal plate render ───────────────────────────────
function renderMealPlate() {
  renderMealPlatePills();
  renderPlatePie();
  renderPlateInfoPanel();
  renderNutrientTab();
  renderEnvTab();
}

// ─── Catalog render ───────────────────────────────────────
function renderIngredientPreview(ingredients) {
  const visible = ingredients.slice(0, PREVIEW_INGREDIENT_LIMIT);
  const overflow = Math.max(ingredients.length - visible.length, 0);
  return `
    ${visible.map((ing) => `<span class="pill">${escapeHtml(ing.name)}</span>`).join('')}
    ${overflow ? `<span class="pill pill-muted">+${overflow} more</span>` : ''}`;
}

function buildRecipeCard(recipe) {
  const card = document.createElement('article');
  card.className = `result-card${recipe.id === state.selectedRecipeId ? ' is-active' : ''}`;
  card.dataset.recipeId = String(recipe.id);
  const pal = getSustainabilityPalette(recipe.sustainability_index);
  const taggedIngredients = recipe.tagged_ingredients || [];
  const portionCount = getPortionCountForRecipe(recipe.id);
  const isStarred = state.favorites.has(recipe.id);

  const actionHtml = portionCount === 0
    ? `<button class="button button-primary result-add-button" type="button" data-add-recipe data-recipe-id="${escapeHtml(String(recipe.id))}">+ Add to Meal</button>`
    : `<div class="qty-control">
         <button class="qty-btn qty-minus" type="button" data-qty-minus data-recipe-id="${escapeHtml(String(recipe.id))}" aria-label="Remove">&#8722;</button>
         <span class="qty-value">${escapeHtml(String(portionCount))}</span>
         <button class="qty-btn qty-plus" type="button" data-qty-plus data-recipe-id="${escapeHtml(String(recipe.id))}" aria-label="Add more">+</button>
       </div>`;

  card.innerHTML = `
    <button class="star-btn${isStarred ? ' is-starred' : ''}" type="button" data-star-recipe data-recipe-id="${escapeHtml(String(recipe.id))}" aria-label="Favorite">\u2605</button>
    <div class="result-topline">
      <span class="score-chip" style="background:${escapeHtml(pal.background)};border:1px solid ${escapeHtml(pal.border)};color:${escapeHtml(pal.text)};">
        Sustainability ${escapeHtml(formatMetric(recipe.sustainability_index))}
      </span>
    </div>
    <h3 class="result-title">${escapeHtml(recipe.name)}</h3>
    <p class="result-subtitle">
      Nutrition ${escapeHtml(formatMetric(recipe.nutrition_composite_score))} &middot;
      Environmental ${escapeHtml(formatMetric(recipe.environmental_composite_score))}
    </p>
    <div class="card-tags">
      ${taggedIngredients.length
        ? renderIngredientPreview(taggedIngredients)
        : '<span class="detail-copy">No tagged ingredients yet.</span>'}
    </div>
    <div class="result-actions">${actionHtml}</div>`;

  return card;
}

function renderResults() {
  resultsGridEl.innerHTML = '';

  const summary = state.searchQuery.trim()
    ? `Showing ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'} for "${state.searchQuery.trim()}".`
    : `Showing ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'} in the catalog.`;
  searchSummaryEl.textContent = summary;
  emptyStateEl.classList.toggle('hidden', state.recipes.length !== 0);

  // Favorites section
  const favoriteRecipes = state.recipes.filter((r) => state.favorites.has(r.id));
  if (favoriteRecipes.length > 0) {
    const favSection = document.createElement('div');
    favSection.className = 'favorites-section';
    const kicker = document.createElement('p');
    kicker.className = 'panel-kicker';
    kicker.textContent = 'Favorites';
    const favGrid = document.createElement('div');
    favGrid.className = 'favorites-grid results-grid-wide';
    for (const recipe of favoriteRecipes) {
      favGrid.appendChild(buildRecipeCard(recipe));
    }
    favSection.appendChild(kicker);
    favSection.appendChild(favGrid);
    resultsGridEl.appendChild(favSection);
  }

  for (const recipe of state.recipes) {
    resultsGridEl.appendChild(buildRecipeCard(recipe));
  }
}

// ─── Pill helpers (catalog info panel) ───────────────────
function setRecipePillOpen(pill, open) {
  if (!pill) return;
  pill.dataset.open = open ? 'true' : 'false';
  pill.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeRecipePills(root = document, exception = null) {
  for (const pill of root.querySelectorAll('[data-recipe-pill][data-open="true"]')) {
    if (pill !== exception) setRecipePillOpen(pill, false);
  }
}

// ─── Catalog float panel (recipe/ingredient detail) ───────

function closeCatalogFloat() {
  state.selectedRecipeId = null;
  state.selectedIngredientKey = null;
  catalogFloatOverlay.classList.add('hidden');
  catalogFloatContent.innerHTML = '';
  renderResults();
}

function renderCatalogDetail() {
  const recipe = getSelectedRecipe();

  if (!recipe) {
    catalogFloatOverlay.classList.add('hidden');
    catalogFloatContent.innerHTML = '';
    return;
  }

  const ingredient = getSelectedIngredient();
  catalogFloatOverlay.classList.remove('hidden');

  if (ingredient) {
    const usedIn = (ingredient.tagged_recipes || []).length;
    catalogFloatContent.innerHTML = `
      <div class="catalog-float-header">
        <h3>${escapeHtml(ingredient.name)}</h3>
        <button class="button button-secondary" type="button" data-catalog-detail-back>
          \u2190 Back to ${escapeHtml(recipe.name)}
        </button>
      </div>
      <div class="catalog-detail-inner">
        <p class="detail-copy">Last updated ${escapeHtml(formatDateTime(ingredient.updated_at))}.</p>
        ${renderScoreProminentGrid(ingredient)}
        <p class="panel-kicker">Nutrition</p>
        ${renderNutrientSubgrid(ingredient)}
        <p class="panel-kicker">Environmental</p>
        ${renderEnvSubgrid(ingredient)}
        <p class="detail-copy">Used in ${escapeHtml(String(usedIn))} recipe${usedIn === 1 ? '' : 's'}.</p>
      </div>`;
    return;
  }

  const taggedCount = (recipe.tagged_ingredients || []).length;
  catalogFloatContent.innerHTML = `
    <div class="catalog-float-header">
      <h3>${escapeHtml(recipe.name)}</h3>
      <button class="button button-secondary" type="button" data-catalog-detail-close>Close</button>
    </div>
    <div class="catalog-detail-inner">
      <p class="detail-copy">Last updated ${escapeHtml(formatDateTime(recipe.updated_at))}.</p>
      ${renderScoreProminentGrid(recipe)}
      <p class="panel-kicker">Nutrition Details</p>
      ${renderNutrientSubgrid(recipe)}
      <p class="panel-kicker">Environmental Details</p>
      ${renderEnvSubgrid(recipe)}
      <div>
        <p class="panel-kicker">Tagged Ingredients (${escapeHtml(String(taggedCount))})</p>
        <div class="detail-tags">
          ${taggedCount
            ? recipe.tagged_ingredients.map(renderIngredientScorePill).join('')
            : '<span class="detail-copy">No tagged ingredients yet.</span>'}
        </div>
      </div>
    </div>`;
}

// ─── Ingredient search (debounced) ────────────────────────
let _ingSearchTimer = null;

function handleIngredientSearchInput(portionId, query) {
  state.ingredientSearchPortionId = portionId;
  state.ingredientSearch = query;
  state.ingredientSearchResults = [];

  clearTimeout(_ingSearchTimer);
  if (!query.trim()) {
    renderPlateInfoPanel();
    return;
  }
  _ingSearchTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({ q: query.trim() });
      const data = await api(`/api/items?${params}`);
      if (state.ingredientSearch !== query || state.ingredientSearchPortionId !== portionId) return;
      state.ingredientSearchResults = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    } catch {
      state.ingredientSearchResults = [];
    }
    renderPlateInfoPanel();
  }, 250);
}

function addIngredientToPortion(portionId, ingName, ingId, siValue) {
  const item = getMealItemById(portionId);
  if (!item) return;

  const key = normalizeIngredientKey(ingName);
  const alreadyBase = item.ingredients.some((i) => normalizeIngredientKey(i.name) === key);
  const alreadyAdded = (item.addedIngredients || []).some((i) => normalizeIngredientKey(i.name) === key);
  if (alreadyBase || alreadyAdded) return;

  const updated = state.mealItems.map((mi) => {
    if (mi.id !== portionId) return mi;
    return {
      ...mi,
      addedIngredients: [
        ...(mi.addedIngredients || []),
        {
          id: ingId || null,
          name: ingName,
          sustainability_index: siValue !== '' && siValue != null ? Number(siValue) : null,
          key,
        },
      ],
    };
  });

  setIngredientCount(portionId, key, 1);

  // Clear search
  state.ingredientSearch = '';
  state.ingredientSearchResults = [];

  updateMealItems(updated);
}

function removeAddedIngredient(portionId, ingKey) {
  const updated = state.mealItems.map((mi) => {
    if (mi.id !== portionId) return mi;
    return {
      ...mi,
      addedIngredients: (mi.addedIngredients || []).filter(
        (ai) => normalizeIngredientKey(ai.name) !== ingKey
      ),
    };
  });
  updateMealItems(updated);
}

// ─── Load recipes ─────────────────────────────────────────
async function loadRecipes(query = state.searchQuery) {
  state.searchQuery = query;
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());

  const payload = await api(`/api/public-recipes${params.toString() ? `?${params}` : ''}`);
  state.recipes = payload.recipes;
  state.ingredientsByKey = new Map(
    (payload.ingredients || []).map((ing) => [normalizeIngredientKey(ing.name), ing])
  );

  if (!state.recipes.some((r) => r.id === state.selectedRecipeId)) {
    state.selectedRecipeId = state.recipes[0]?.id ?? null;
    state.selectedIngredientKey = null;
  }

  renderResults();
  renderMealPlate();
}

// ─── Event wiring ─────────────────────────────────────────

// Tab buttons
mealPlateEl.addEventListener('click', (event) => {
  const btn = event.target.closest('.tab-btn[data-tab]');
  if (btn) {
    switchTab(btn.dataset.tab);
    return;
  }
});

// Plate pie
platePieContEl.addEventListener('click', (event) => {
  const path = event.target.closest('[data-pie-click]');
  if (!path) {
    state.activePlatePortionId = null;
    renderPlatePie();
    renderPlateInfoPanel();
    return;
  }
  const clickId = path.dataset.pieClick;
  if (clickId.startsWith('portion:')) {
    const portionId = clickId.slice('portion:'.length);
    state.activePlatePortionId = state.activePlatePortionId === portionId ? null : portionId;
    state.ingredientSearch = '';
    state.ingredientSearchResults = [];
    state.ingredientSearchPortionId = null;
    renderPlatePie();
    renderPlateInfoPanel();
  }
});

// Plate info panel — delegated
plateInfoContEl.addEventListener('click', (event) => {
  // Back button
  if (event.target.closest('[data-plate-info-back]')) {
    state.activePlatePortionId = null;
    state.ingredientSearch = '';
    state.ingredientSearchResults = [];
    state.ingredientSearchPortionId = null;
    renderPlatePie();
    renderPlateInfoPanel();
    return;
  }

  // Ingredient minus
  const ingMinus = event.target.closest('[data-ing-minus]');
  if (ingMinus) {
    const pid = ingMinus.dataset.portionId;
    const key = ingMinus.dataset.ingKey;
    setIngredientCount(pid, key, getIngredientCount(pid, key) - 1);
    renderMealPlatePills();
    renderPlateInfoPanel();
    return;
  }

  // Ingredient plus
  const ingPlus = event.target.closest('[data-ing-plus]');
  if (ingPlus) {
    const pid = ingPlus.dataset.portionId;
    const key = ingPlus.dataset.ingKey;
    setIngredientCount(pid, key, getIngredientCount(pid, key) + 1);
    renderMealPlatePills();
    renderPlateInfoPanel();
    return;
  }

  // Remove added ingredient
  const ingRemove = event.target.closest('[data-ing-remove]');
  if (ingRemove) {
    removeAddedIngredient(ingRemove.dataset.portionId, ingRemove.dataset.ingKey);
    return;
  }

  // Pick ingredient search result
  const searchPick = event.target.closest('[data-ing-search-pick]');
  if (searchPick) {
    const pid = searchPick.dataset.portionId;
    const name = searchPick.dataset.ingName;
    const id = searchPick.dataset.ingId;
    const si = searchPick.dataset.ingSi;
    addIngredientToPortion(pid, name, id, si);
    return;
  }

  // Meal recipe search pick (add recipe to meal from overview panel)
  const mealRecipePick = event.target.closest('[data-meal-recipe-search-pick]');
  if (mealRecipePick) {
    const recipeId = Number(mealRecipePick.dataset.recipeId);
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (recipe) {
      state.mealRecipeSearch = '';
      state.mealRecipeSearchResults = [];
      addPortion(recipe);
    }
    return;
  }

  // Meal aggregate row minus (remove one portion of recipe)
  const aggMinus = event.target.closest('[data-meal-agg-minus]');
  if (aggMinus) {
    const recipeId = Number(aggMinus.dataset.recipeId);
    removePortion(recipeId);
    return;
  }

  // Meal aggregate row plus (add one portion of recipe)
  const aggPlus = event.target.closest('[data-meal-agg-plus]');
  if (aggPlus) {
    const recipeId = Number(aggPlus.dataset.recipeId);
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (recipe) addPortion(recipe);
    return;
  }

  // Meal aggregate row remove-all (remove all portions of recipe)
  const aggRemove = event.target.closest('[data-meal-agg-remove]');
  if (aggRemove) {
    const recipeId = Number(aggRemove.dataset.recipeId);
    updateMealItems(state.mealItems.filter((mi) => mi.recipeId !== recipeId));
    return;
  }

  // Meal aggregate row click → select first portion of that recipe
  const aggRow = event.target.closest('[data-meal-agg-row]');
  if (aggRow && !event.target.closest('[data-meal-agg-minus],[data-meal-agg-plus],[data-meal-agg-remove]')) {
    const recipeId = Number(aggRow.dataset.recipeId);
    const firstPortion = state.mealItems.find((mi) => mi.recipeId === recipeId);
    if (firstPortion) {
      state.activePlatePortionId = firstPortion.id;
      state.ingredientSearch = '';
      state.ingredientSearchResults = [];
      renderPlatePie();
      renderPlateInfoPanel();
    }
    return;
  }
});

// Ingredient search input + meal recipe search input
plateInfoContEl.addEventListener('input', (event) => {
  const searchInput = event.target.closest('[data-ing-search-input]');
  if (searchInput) {
    const pid = searchInput.dataset.portionId;
    handleIngredientSearchInput(pid, searchInput.value);
    return;
  }

  const mealRecipeSearch = event.target.closest('[data-meal-recipe-search]');
  if (mealRecipeSearch) {
    handleMealRecipeSearchInput(mealRecipeSearch.value);
  }
});

let _mealRecipeSearchTimer = null;

function handleMealRecipeSearchInput(query) {
  state.mealRecipeSearch = query;
  clearTimeout(_mealRecipeSearchTimer);
  if (!query.trim()) {
    state.mealRecipeSearchResults = [];
    renderPlateInfoPanel();
    const el = plateInfoContEl.querySelector('[data-meal-recipe-search]');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    return;
  }
  _mealRecipeSearchTimer = setTimeout(() => {
    const q = query.trim().toLowerCase();
    state.mealRecipeSearchResults = state.recipes.filter((r) =>
      r.name.toLowerCase().includes(q)
    );
    if (state.mealRecipeSearch === query) {
      renderPlateInfoPanel();
      const el = plateInfoContEl.querySelector('[data-meal-recipe-search]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }, 200);
}

// Nutrients tab — delegated click for pie slices and back button
tabNutrientsEl.addEventListener('click', (event) => {
  // Back button
  if (event.target.closest('[data-nutrient-back]')) {
    state.activeNutrientKey = null;
    renderNutrientTab();
    return;
  }
  // Pie slice click
  const path = event.target.closest('[data-pie-click]');
  if (path) {
    const clickId = path.dataset.pieClick;
    if (clickId && clickId.startsWith('nutrient:')) {
      const label = clickId.slice('nutrient:'.length);
      state.activeNutrientKey = state.activeNutrientKey === label ? null : label;
      renderNutrientTab();
    }
    return;
  }
});

// Environmental circles — delegated on tabEnvEl so it survives re-render
tabEnvEl.addEventListener('click', (event) => {
  const wrap = event.target.closest('[data-env-circle4]');
  if (!wrap) {
    // Click on blank area (including env-circles-4 or tabEnvEl itself) → deselect
    if (state.activeEnvCircle !== null) {
      state.activeEnvCircle = null;
      renderEnvTab();
    }
    return;
  }
  const id = wrap.dataset.envCircle4;
  state.activeEnvCircle = state.activeEnvCircle === id ? null : id;
  renderEnvTab();
});

// Results grid — delegated
resultsGridEl.addEventListener('click', (event) => {
  const addBtn = event.target.closest('[data-add-recipe]');
  if (addBtn) {
    event.stopPropagation();
    const recipeId = Number(addBtn.dataset.recipeId);
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (recipe) addPortion(recipe);
    return;
  }

  const minusBtn = event.target.closest('[data-qty-minus]');
  if (minusBtn) {
    event.stopPropagation();
    removePortion(Number(minusBtn.dataset.recipeId));
    return;
  }

  const plusBtn = event.target.closest('[data-qty-plus]');
  if (plusBtn) {
    event.stopPropagation();
    const recipeId = Number(plusBtn.dataset.recipeId);
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (recipe) addPortion(recipe);
    return;
  }

  // Star button
  const starBtn = event.target.closest('[data-star-recipe]');
  if (starBtn) {
    event.stopPropagation();
    const recipeId = Number(starBtn.dataset.recipeId);
    if (state.favorites.has(recipeId)) state.favorites.delete(recipeId);
    else state.favorites.add(recipeId);
    persistFavorites();
    renderResults();
    return;
  }

  // Card click → open float detail panel (toggle if same recipe)
  const card = event.target.closest('.result-card');
  if (card) {
    const cards = Array.from(resultsGridEl.querySelectorAll('.result-card'));
    const idx = cards.indexOf(card);
    if (idx < 0) return;
    // Find the recipe for this card — iterate across favorites + main to find the recipe
    // The card order matches the order in the DOM which we need to trace
    const recipeId = Number(card.dataset.recipeId);
    if (!recipeId) return;
    closeRecipePills();
    const wasSelected = state.selectedRecipeId === recipeId;
    state.selectedRecipeId = wasSelected ? null : recipeId;
    state.selectedIngredientKey = null;
    renderResults();
    renderCatalogDetail();
  }
});

// Catalog float panel — close / back / ingredient pills (delegated on overlay content)
catalogFloatContent.addEventListener('click', (event) => {
  if (event.target.closest('[data-catalog-detail-close]')) {
    closeCatalogFloat();
    return;
  }

  if (event.target.closest('[data-catalog-detail-back]')) {
    state.selectedIngredientKey = null;
    renderCatalogDetail();
    return;
  }

  const ingTrigger = event.target.closest('[data-ingredient-detail-trigger]');
  if (ingTrigger) {
    event.preventDefault();
    event.stopPropagation();
    state.selectedIngredientKey = ingTrigger.dataset.ingredientKey || null;
    closeRecipePills();
    renderCatalogDetail();
    return;
  }

  const pill = event.target.closest('[data-recipe-pill]');
  if (pill) {
    event.stopPropagation();
    const shouldOpen = pill.dataset.open !== 'true';
    closeRecipePills(catalogFloatContent, pill);
    setRecipePillOpen(pill, shouldOpen);
  }
});

// Float overlay background click → close
catalogFloatOverlay.addEventListener('click', (event) => {
  if (event.target === catalogFloatOverlay) {
    closeCatalogFloat();
  }
});

// Close pills on outside click; also deselect active portion when clicking outside the meal plate.
// Guard: if renderPlatePie() replaced innerHTML before this bubbles, event.target is detached —
// isConnected will be false, so we skip the deselect rather than firing it incorrectly.
document.addEventListener('click', (event) => {
  closeRecipePills();
  if (
    state.activePlatePortionId !== null &&
    event.target.isConnected &&
    !mealPlateEl.contains(event.target)
  ) {
    state.activePlatePortionId = null;
    state.ingredientSearch = '';
    state.ingredientSearchResults = [];
    state.ingredientSearchPortionId = null;
    renderPlatePie();
    renderPlateInfoPanel();
  }
});

// Catalog recipe search (live filter)
let _catalogSearchTimer = null;
catalogRecipeSearch.addEventListener('input', () => {
  clearTimeout(_catalogSearchTimer);
  _catalogSearchTimer = setTimeout(() => loadRecipes(catalogRecipeSearch.value), 250);
});

// Clear plate button
clearPlateBtnEl.addEventListener('click', () => {
  state.activePlatePortionId = null;
  state.ingredientCounts = {};
  state.ingredientSearch = '';
  state.ingredientSearchResults = [];
  state.ingredientSearchPortionId = null;
  updateMealItems([]);
});

// Keyboard
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeRecipePills();
    // Close float overlay
    if (!catalogFloatOverlay.classList.contains('hidden')) {
      closeCatalogFloat();
      return;
    }
    // Close ingredient search dropdown
    if (state.ingredientSearchResults.length) {
      state.ingredientSearchResults = [];
      renderPlateInfoPanel();
    }
  }
});

// ─── Bootstrap ────────────────────────────────────────────
async function bootstrap() {
  // Restore show/hide from persisted meal items
  const hasItems = state.mealItems.length > 0;
  heroEl.classList.toggle('hidden', hasItems);
  mealPlateEl.classList.toggle('hidden', !hasItems);

  if (hasItems) {
    renderMealPlate();
  }

  try {
    await loadRecipes();
  } catch (error) {
    searchSummaryEl.textContent = error.message;
  }
}

bootstrap();
