import {
  api,
  escapeHtml,
  formatDateTime,
  formatMetric,
  getSustainabilityPalette
} from '/shared.js';

const PREVIEW_INGREDIENT_LIMIT = 4;
const MEAL_STORAGE_KEY = 'seat-my-meal-v1';
const INGREDIENT_SEARCH_MIN_CHARS = 2;
const INGREDIENT_SEARCH_DEBOUNCE_MS = 180;

const state = {
  recipes: [],
  ingredientsByKey: new Map(),
  selectedRecipeId: null,
  selectedIngredientKey: null,
  searchQuery: '',
  detailPanelOpen: false,
  mealDrawerOpen: false,
  mealItems: loadMealItems(),
  activeMealItemId: null,
  ingredientSearchQuery: '',
  ingredientSearchResults: [],
  ingredientSearchLoading: false,
  ingredientSearchError: ''
};

const compactDetailMedia = window.matchMedia('(max-width: 1080px)');
const touchRecipePillMedia = window.matchMedia('(hover: none), (pointer: coarse)');
let lockedScrollY = 0;
let isDocumentScrollLocked = false;
let wasDetailOverlayVisible = false;
let lockedScrollbarCompensation = 0;
let ingredientSearchRequestId = 0;
let ingredientSearchTimeoutId = 0;

const elements = {
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  searchSummary: document.getElementById('searchSummary'),
  resultsGrid: document.getElementById('resultsGrid'),
  emptyState: document.getElementById('emptyState'),
  catalogSection: document.getElementById('catalogSection'),
  detailPanel: document.getElementById('detailPanel'),
  detailClose: document.getElementById('detailClose'),
  detailBackdrop: document.getElementById('detailBackdrop'),
  detailTitle: document.getElementById('detailTitle'),
  detailContent: document.getElementById('detailContent'),
  mealToggle: document.getElementById('mealToggle'),
  mealToggleCount: document.getElementById('mealToggleCount'),
  mealDrawer: document.getElementById('mealDrawer'),
  mealDrawerClose: document.getElementById('mealDrawerClose'),
  mealBackdrop: document.getElementById('mealBackdrop'),
  mealDrawerMeta: document.getElementById('mealDrawerMeta'),
  mealDrawerFooter: document.getElementById('mealDrawerFooter'),
  mealItems: document.getElementById('mealItems'),
  mealEmptyState: document.getElementById('mealEmptyState'),
  mealOverallScore: document.getElementById('mealOverallScore')
};

function loadMealItems() {
  try {
    const rawValue = window.sessionStorage.getItem(MEAL_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.map(sanitizeMealItem).filter(Boolean);
  } catch {
    return [];
  }
}

function persistMealItems() {
  try {
    window.sessionStorage.setItem(MEAL_STORAGE_KEY, JSON.stringify(state.mealItems));
  } catch {
    // Ignore storage failures so the meal builder still works for the session.
  }
}

function roundMetric(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function averageValues(values) {
  if (!values.length) {
    return null;
  }

  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue)) {
      return null;
    }

    total += normalizedValue;
  }

  return roundMetric(total / values.length);
}

function isCompactDetailMode() {
  return compactDetailMedia.matches;
}

function setDocumentScrollLock(locked) {
  if (locked === isDocumentScrollLocked) {
    return;
  }

  if (locked) {
    lockedScrollY = window.scrollY;
    lockedScrollbarCompensation = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.paddingRight = lockedScrollbarCompensation
      ? `${lockedScrollbarCompensation}px`
      : '';
    document.body.style.overflow = 'hidden';
  } else {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
    lockedScrollbarCompensation = 0;
    window.scrollTo(0, lockedScrollY);
    requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    });
  }

  isDocumentScrollLocked = locked;
}

function normalizeIngredientKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function snapshotIngredient(ingredient) {
  const name = String(ingredient?.name || '').trim();
  if (!name) {
    return null;
  }

  return {
    id: ingredient?.id ?? null,
    name,
    sustainability_index:
      ingredient?.sustainability_index === null || ingredient?.sustainability_index === undefined
        ? null
        : Number(ingredient.sustainability_index)
  };
}

function dedupeIngredients(ingredients) {
  const uniqueIngredients = new Map();

  for (const ingredient of ingredients || []) {
    const snapshot = snapshotIngredient(ingredient);
    if (!snapshot) {
      continue;
    }

    const ingredientKey = normalizeIngredientKey(snapshot.name);
    if (!uniqueIngredients.has(ingredientKey)) {
      uniqueIngredients.set(ingredientKey, snapshot);
    }
  }

  return Array.from(uniqueIngredients.values());
}

function createMealItem(recipe) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    recipeId: recipe.id,
    recipeName: recipe.name,
    ingredients: dedupeIngredients(recipe.tagged_ingredients || [])
  };
}

function sanitizeMealItem(value) {
  const recipeName = String(value?.recipeName || '').trim();
  const ingredients = dedupeIngredients(value?.ingredients || []);

  if (!recipeName) {
    return null;
  }

  return {
    id: String(value?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    recipeId: value?.recipeId === null || value?.recipeId === undefined ? null : Number(value.recipeId),
    recipeName,
    ingredients
  };
}

function getSelectedRecipe() {
  return state.recipes.find((entry) => entry.id === state.selectedRecipeId) || null;
}

function getSelectedIngredient() {
  if (!state.selectedIngredientKey) {
    return null;
  }

  return state.ingredientsByKey.get(state.selectedIngredientKey) || null;
}

function getMealItemById(itemId) {
  return state.mealItems.find((mealItem) => mealItem.id === itemId) || null;
}

function resetIngredientSearch() {
  state.ingredientSearchQuery = '';
  state.ingredientSearchResults = [];
  state.ingredientSearchLoading = false;
  state.ingredientSearchError = '';
  ingredientSearchRequestId += 1;
  window.clearTimeout(ingredientSearchTimeoutId);
}

function getMealItemScore(mealItem) {
  return averageValues(mealItem.ingredients.map((ingredient) => ingredient.sustainability_index));
}

function getOverallMealScore() {
  if (!state.mealItems.length) {
    return null;
  }

  return averageValues(state.mealItems.map((mealItem) => getMealItemScore(mealItem)));
}

function updateMealItems(nextMealItems) {
  state.mealItems = nextMealItems.map(sanitizeMealItem).filter(Boolean);
  if (state.activeMealItemId && !getMealItemById(state.activeMealItemId)) {
    state.activeMealItemId = null;
    resetIngredientSearch();
  }

  persistMealItems();
  renderMealDrawer();
}

function setMealEditor(itemId) {
  if (!getMealItemById(itemId)) {
    return;
  }

  if (state.activeMealItemId === itemId) {
    state.activeMealItemId = null;
    resetIngredientSearch();
    renderMealDrawer();
    return;
  }

  state.activeMealItemId = itemId;
  resetIngredientSearch();
  renderMealDrawer();
  focusMealSearchInput(itemId);
}

function focusMealSearchInput(itemId) {
  requestAnimationFrame(() => {
    const input = Array.from(elements.mealItems.querySelectorAll('[data-meal-ingredient-search]')).find(
      (field) => field.dataset.mealItemId === itemId
    );

    if (input) {
      input.focus();
    }
  });
}

function addRecipeToMeal(recipe) {
  const newMealItem = createMealItem(recipe);
  const shouldOpenDrawer = !state.mealItems.length || state.mealDrawerOpen;

  if (shouldOpenDrawer) {
    state.mealDrawerOpen = true;
    state.activeMealItemId = newMealItem.id;
    resetIngredientSearch();
  }

  updateMealItems([...state.mealItems, newMealItem]);
}

function removeMealItem(itemId) {
  updateMealItems(state.mealItems.filter((mealItem) => mealItem.id !== itemId));
}

function removeIngredientFromMealItem(itemId, ingredientKey) {
  updateMealItems(
    state.mealItems.map((mealItem) => {
      if (mealItem.id !== itemId) {
        return mealItem;
      }

      return {
        ...mealItem,
        ingredients: mealItem.ingredients.filter(
          (ingredient) => normalizeIngredientKey(ingredient.name) !== ingredientKey
        )
      };
    })
  );
}

function addIngredientToMealItem(itemId, ingredient) {
  const ingredientSnapshot = snapshotIngredient(ingredient);
  if (!ingredientSnapshot) {
    return;
  }

  const ingredientKey = normalizeIngredientKey(ingredientSnapshot.name);
  updateMealItems(
    state.mealItems.map((mealItem) => {
      if (mealItem.id !== itemId) {
        return mealItem;
      }

      if (
        mealItem.ingredients.some(
          (existingIngredient) => normalizeIngredientKey(existingIngredient.name) === ingredientKey
        )
      ) {
        return mealItem;
      }

      return {
        ...mealItem,
        ingredients: [...mealItem.ingredients, ingredientSnapshot]
      };
    })
  );
}

function openMealDrawer() {
  state.mealDrawerOpen = true;
  if (isCompactDetailMode()) {
    closeDetailPanel();
  }
  renderMealDrawer();
}

function closeMealDrawer() {
  state.mealDrawerOpen = false;
  syncOverlayVisibility();
}

function toggleMealDrawer() {
  if (state.mealDrawerOpen) {
    closeMealDrawer();
    return;
  }

  openMealDrawer();
}

function syncOverlayVisibility() {
  const hasSelectedRecipe = state.recipes.some((recipe) => recipe.id === state.selectedRecipeId);
  const shouldShowDetailOverlay = isCompactDetailMode() && state.detailPanelOpen && hasSelectedRecipe;

  elements.detailPanel.classList.toggle('is-open', shouldShowDetailOverlay);
  elements.detailBackdrop.classList.toggle('hidden', !shouldShowDetailOverlay);
  elements.detailClose.classList.toggle('hidden', !isCompactDetailMode());
  elements.mealDrawer.classList.toggle('is-open', state.mealDrawerOpen);
  elements.mealBackdrop.classList.toggle('hidden', !state.mealDrawerOpen);
  elements.mealToggle.classList.toggle('is-hidden', state.mealDrawerOpen);
  elements.mealToggle.setAttribute('aria-expanded', state.mealDrawerOpen ? 'true' : 'false');
  document.body.classList.toggle('detail-panel-mobile-open', shouldShowDetailOverlay);
  document.body.classList.toggle('meal-drawer-open', state.mealDrawerOpen);
  setDocumentScrollLock(shouldShowDetailOverlay || state.mealDrawerOpen);

  if (shouldShowDetailOverlay && !wasDetailOverlayVisible) {
    requestAnimationFrame(() => {
      elements.detailPanel.scrollTop = 0;
      elements.detailContent.scrollTop = 0;
    });
  }

  wasDetailOverlayVisible = shouldShowDetailOverlay;
}

function closeDetailPanel() {
  state.detailPanelOpen = false;
  closeRecipePills();
  syncOverlayVisibility();
}

function setRecipePillOpen(pill, open) {
  if (!pill) {
    return;
  }

  pill.dataset.open = open ? 'true' : 'false';
  pill.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeRecipePills(root = document, exception = null) {
  const pills = root.querySelectorAll('[data-recipe-pill][data-open="true"]');
  for (const pill of pills) {
    if (pill === exception) {
      continue;
    }

    setRecipePillOpen(pill, false);
  }
}

function renderScoreLayout(entry) {
  const sustainabilityPalette = getSustainabilityPalette(entry.sustainability_index);

  return `
    <div class="detail-layout">
      <div
        class="score-cell score-cell-sustainability"
        style="background:${escapeHtml(sustainabilityPalette.background)};border:1px solid ${escapeHtml(sustainabilityPalette.border)};color:${escapeHtml(sustainabilityPalette.text)};"
      >
        <span>Sustainability Index</span>
        <strong>${escapeHtml(formatMetric(entry.sustainability_index))}</strong>
      </div>
      <div class="score-grid score-grid-primary">
        <div class="score-cell score-cell-environment">
          <span>Nutrition Composite Score</span>
          <strong>${escapeHtml(formatMetric(entry.nutrition_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Protein</span>
              <strong>${escapeHtml(formatMetric(entry.protein))}</strong>
            </div>
            <div class="score-subcell">
              <span>Fiber</span>
              <strong>${escapeHtml(formatMetric(entry.fiber))}</strong>
            </div>
            <div class="score-subcell">
              <span>Calcium</span>
              <strong>${escapeHtml(formatMetric(entry.calcium))}</strong>
            </div>
            <div class="score-subcell">
              <span>Iron</span>
              <strong>${escapeHtml(formatMetric(entry.iron))}</strong>
            </div>
            <div class="score-subcell">
              <span>Saturated Fat</span>
              <strong>${escapeHtml(formatMetric(entry.saturated_fat))}</strong>
            </div>
            <div class="score-subcell">
              <span>Sodium</span>
              <strong>${escapeHtml(formatMetric(entry.sodium))}</strong>
            </div>
          </div>
        </div>
        <div class="score-cell score-cell-environment">
          <span>Environmental Composite Score</span>
          <strong>${escapeHtml(formatMetric(entry.environmental_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Water Use</span>
              <strong>${escapeHtml(formatMetric(entry.water_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Nitrogen Use</span>
              <strong>${escapeHtml(formatMetric(entry.nitrogen_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Carbon Use</span>
              <strong>${escapeHtml(formatMetric(entry.carbon_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Land Use</span>
              <strong>${escapeHtml(formatMetric(entry.land_use_score))}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderIngredientPreview(ingredients) {
  const visibleIngredients = ingredients.slice(0, PREVIEW_INGREDIENT_LIMIT);
  const overflowCount = Math.max(ingredients.length - visibleIngredients.length, 0);

  return `
    ${visibleIngredients
      .map((ingredient) => `<span class="pill">${escapeHtml(ingredient.name)}</span>`)
      .join('')}
    ${overflowCount ? `<span class="pill pill-muted">+${escapeHtml(String(overflowCount))} more</span>` : ''}
  `;
}

function renderIngredientScorePill(ingredient) {
  const ingredientName = escapeHtml(ingredient.name);
  const ingredientKey = escapeHtml(normalizeIngredientKey(ingredient.name));
  const sustainabilityLabel = escapeHtml(formatMetric(ingredient.sustainability_index));
  const sustainabilityPalette = getSustainabilityPalette(ingredient.sustainability_index);

  return `
    <button
      class="pill ingredient-pill"
      type="button"
      data-recipe-pill
      data-open="false"
      data-ingredient-detail-trigger
      data-ingredient-key="${ingredientKey}"
      title="SI ${sustainabilityLabel}"
      aria-label="${ingredientName} sustainability index ${sustainabilityLabel}"
      aria-expanded="false"
    >
      <span>${ingredientName}</span>
      <span
        class="ingredient-pill-score"
        style="--ingredient-score-bg-start:${escapeHtml(sustainabilityPalette.background)};--ingredient-score-bg-end:${escapeHtml(sustainabilityPalette.border)};--ingredient-score-text:${escapeHtml(sustainabilityPalette.text)};--ingredient-score-border:${escapeHtml(sustainabilityPalette.border)};"
      >
        SI ${sustainabilityLabel}
      </span>
    </button>
  `;
}

function renderMealIngredientPills(mealItem, editable) {
  if (!mealItem.ingredients.length) {
    return '<span class="detail-copy">No ingredients selected yet.</span>';
  }

  return mealItem.ingredients
    .map((ingredient) => {
      const ingredientKey = normalizeIngredientKey(ingredient.name);
      const scoreText = escapeHtml(formatMetric(ingredient.sustainability_index));
      if (!editable) {
        return `<span class="pill meal-ingredient-pill">${escapeHtml(ingredient.name)} · SI ${scoreText}</span>`;
      }

      return `
        <button
          class="pill meal-ingredient-pill meal-ingredient-pill-editable"
          type="button"
          data-meal-remove-ingredient
          data-meal-item-id="${escapeHtml(mealItem.id)}"
          data-ingredient-key="${escapeHtml(ingredientKey)}"
          aria-label="Remove ${escapeHtml(ingredient.name)} from ${escapeHtml(mealItem.recipeName)}"
        >
          <span>${escapeHtml(ingredient.name)} · SI ${scoreText}</span>
          <span aria-hidden="true">×</span>
        </button>
      `;
    })
    .join('');
}

function renderIngredientSearchResults(mealItem) {
  const trimmedQuery = state.ingredientSearchQuery.trim();

  if (state.ingredientSearchLoading) {
    return '<p class="detail-copy meal-search-feedback">Searching ingredients...</p>';
  }

  if (state.ingredientSearchError) {
    return `<p class="detail-copy meal-search-feedback">${escapeHtml(state.ingredientSearchError)}</p>`;
  }

  if (trimmedQuery.length < INGREDIENT_SEARCH_MIN_CHARS) {
    return `<p class="detail-copy meal-search-feedback">Type at least ${INGREDIENT_SEARCH_MIN_CHARS} characters to search the ingredient catalog.</p>`;
  }

  const selectedIngredientKeys = new Set(
    mealItem.ingredients.map((ingredient) => normalizeIngredientKey(ingredient.name))
  );
  const availableResults = state.ingredientSearchResults.filter(
    (ingredient) => !selectedIngredientKeys.has(normalizeIngredientKey(ingredient.name))
  );

  if (!availableResults.length) {
    return '<p class="detail-copy meal-search-feedback">No new ingredients matched that search.</p>';
  }

  return `
    <div class="meal-search-results-grid">
      ${availableResults
        .map((ingredient) => {
          const ingredientKey = normalizeIngredientKey(ingredient.name);
          const scorePalette = getSustainabilityPalette(ingredient.sustainability_index);
          return `
            <button
              class="meal-search-result"
              type="button"
              data-meal-add-ingredient
              data-meal-item-id="${escapeHtml(mealItem.id)}"
              data-ingredient-key="${escapeHtml(ingredientKey)}"
            >
              <span>${escapeHtml(ingredient.name)}</span>
              <strong
                class="meal-search-result-score"
                style="background:linear-gradient(135deg, ${escapeHtml(scorePalette.background)}, ${escapeHtml(scorePalette.border)});color:${escapeHtml(scorePalette.text)};border-color:${escapeHtml(scorePalette.border)};"
              >
                SI ${escapeHtml(formatMetric(ingredient.sustainability_index))}
              </strong>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderMealItems() {
  if (!state.mealItems.length) {
    return '';
  }

  return state.mealItems
    .map((mealItem, index) => {
      const mealItemScore = getMealItemScore(mealItem);
      const scorePalette = getSustainabilityPalette(mealItemScore);
      const isEditing = state.activeMealItemId === mealItem.id;

      return `
        <article class="meal-item-card${isEditing ? ' is-editing' : ''}">
          <div class="meal-item-header">
            <div>
              <p class="panel-kicker">Meal Item ${escapeHtml(String(index + 1))}</p>
              <h3>${escapeHtml(mealItem.recipeName)}</h3>
              <p class="detail-copy">
                ${escapeHtml(String(mealItem.ingredients.length))} ingredient${mealItem.ingredients.length === 1 ? '' : 's'} selected
              </p>
            </div>
            <span
              class="score-chip meal-score-chip"
              style="background:${escapeHtml(scorePalette.background)};border:1px solid ${escapeHtml(scorePalette.border)};color:${escapeHtml(scorePalette.text)};"
            >
              SI ${escapeHtml(formatMetric(mealItemScore))}
            </span>
          </div>

          <div class="meal-ingredient-list">
            ${renderMealIngredientPills(mealItem, isEditing)}
          </div>

          <div class="meal-item-actions">
            <button
              class="button button-secondary"
              type="button"
              data-meal-edit-toggle
              data-meal-item-id="${escapeHtml(mealItem.id)}"
            >
              ${isEditing ? 'Done Editing' : 'Edit Ingredients'}
            </button>
            <button
              class="button button-ghost"
              type="button"
              data-meal-remove
              data-meal-item-id="${escapeHtml(mealItem.id)}"
            >
              Remove from Meal
            </button>
          </div>

          ${isEditing
            ? `
              <div class="meal-editor">
                <label class="meal-search-label">
                  <span>Add ingredients</span>
                  <input
                    type="search"
                    value="${escapeHtml(state.ingredientSearchQuery)}"
                    placeholder="Search bacon, spinach, tomato..."
                    autocomplete="off"
                    data-meal-ingredient-search
                    data-meal-item-id="${escapeHtml(mealItem.id)}"
                  >
                </label>
                <p class="detail-copy">
                  Remove ingredients above or search the full ingredient database to add more.
                </p>
                <div class="meal-search-results" data-meal-search-results>
                  ${renderIngredientSearchResults(mealItem)}
                </div>
              </div>
            `
            : ''}
        </article>
      `;
    })
    .join('');
}

function renderMealDrawer() {
  const mealItemCount = state.mealItems.length;
  const overallMealScore = getOverallMealScore();
  const overallScorePalette = getSustainabilityPalette(overallMealScore);

  elements.mealItems.innerHTML = renderMealItems();
  elements.mealEmptyState.classList.toggle('hidden', mealItemCount !== 0);
  elements.mealDrawerFooter.classList.toggle('hidden', mealItemCount === 0);
  elements.mealToggleCount.textContent = String(mealItemCount);
  elements.mealToggleCount.classList.toggle('hidden', mealItemCount === 0);
  elements.mealDrawerMeta.textContent = mealItemCount
    ? `${mealItemCount} meal item${mealItemCount === 1 ? '' : 's'} saved for this browser session.`
    : 'Add recipes from the catalog and customize their ingredients here.';
  elements.mealOverallScore.textContent = formatMetric(overallMealScore);
  elements.mealOverallScore.style.background = `linear-gradient(135deg, ${overallScorePalette.background}, ${overallScorePalette.border})`;
  elements.mealOverallScore.style.color = overallScorePalette.text;
  elements.mealOverallScore.style.borderColor = overallScorePalette.border;
  elements.mealToggle.setAttribute(
    'aria-label',
    mealItemCount ? `Open My Meal with ${mealItemCount} items` : 'Open My Meal'
  );
  syncOverlayVisibility();
}

function renderActiveMealSearchResults() {
  const activeMealItem = getMealItemById(state.activeMealItemId);
  const resultsContainer = elements.mealItems.querySelector('[data-meal-search-results]');

  if (!activeMealItem || !resultsContainer) {
    return;
  }

  resultsContainer.innerHTML = renderIngredientSearchResults(activeMealItem);
}

async function searchIngredients(query) {
  const trimmedQuery = query.trim();
  const requestId = ++ingredientSearchRequestId;
  window.clearTimeout(ingredientSearchTimeoutId);

  if (trimmedQuery.length < INGREDIENT_SEARCH_MIN_CHARS) {
    state.ingredientSearchResults = [];
    state.ingredientSearchLoading = false;
    state.ingredientSearchError = '';
    renderActiveMealSearchResults();
    return;
  }

  state.ingredientSearchLoading = true;
  state.ingredientSearchError = '';
  renderActiveMealSearchResults();

  ingredientSearchTimeoutId = window.setTimeout(async () => {
    try {
      const params = new URLSearchParams({ q: trimmedQuery });
      const payload = await api(`/api/items?${params.toString()}`);

      if (requestId !== ingredientSearchRequestId || trimmedQuery !== state.ingredientSearchQuery.trim()) {
        return;
      }

      state.ingredientSearchResults = dedupeIngredients(payload.items || []);
      state.ingredientSearchLoading = false;
      renderActiveMealSearchResults();
    } catch (error) {
      if (requestId !== ingredientSearchRequestId) {
        return;
      }

      state.ingredientSearchResults = [];
      state.ingredientSearchLoading = false;
      state.ingredientSearchError = error.message;
      renderActiveMealSearchResults();
    }
  }, INGREDIENT_SEARCH_DEBOUNCE_MS);
}

async function loadRecipes(query = state.searchQuery) {
  state.searchQuery = query;
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }

  const payload = await api(`/api/public-recipes${params.toString() ? `?${params}` : ''}`);
  state.recipes = payload.recipes;
  state.ingredientsByKey = new Map(
    (payload.ingredients || []).map((ingredient) => [
      normalizeIngredientKey(ingredient.name),
      ingredient
    ])
  );

  if (!state.recipes.some((recipe) => recipe.id === state.selectedRecipeId)) {
    state.selectedRecipeId = state.recipes[0]?.id ?? null;
    state.detailPanelOpen = false;
    state.selectedIngredientKey = null;
  }

  if (state.selectedIngredientKey && !state.ingredientsByKey.has(state.selectedIngredientKey)) {
    state.selectedIngredientKey = null;
  }

  renderResults();
  renderDetail();
}

function renderResults() {
  elements.resultsGrid.innerHTML = '';

  const summary = state.searchQuery.trim()
    ? `Showing ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'} for "${state.searchQuery.trim()}".`
    : `Showing ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'} in the catalog.`;
  elements.searchSummary.textContent = summary;
  elements.emptyState.classList.toggle('hidden', state.recipes.length !== 0);

  for (const recipe of state.recipes) {
    const card = document.createElement('article');
    card.className = `result-card${recipe.id === state.selectedRecipeId ? ' is-active' : ''}`;
    const sustainabilityPalette = getSustainabilityPalette(recipe.sustainability_index);
    const taggedIngredients = recipe.tagged_ingredients || [];
    card.innerHTML = `
      <div class="result-topline">
        <span
          class="score-chip"
          style="background:${escapeHtml(sustainabilityPalette.background)};border:1px solid ${escapeHtml(sustainabilityPalette.border)};color:${escapeHtml(sustainabilityPalette.text)};"
        >
          Sustainability ${escapeHtml(formatMetric(recipe.sustainability_index))}
        </span>
      </div>
      <h3 class="result-title">${escapeHtml(recipe.name)}</h3>
      <p class="result-subtitle">
        Nutrition ${escapeHtml(formatMetric(recipe.nutrition_composite_score))} ·
        Environmental ${escapeHtml(formatMetric(recipe.environmental_composite_score))}
      </p>
      <div class="card-tags">
        ${taggedIngredients.length
          ? renderIngredientPreview(taggedIngredients)
          : '<span class="detail-copy">No tagged ingredients yet.</span>'}
      </div>
      <div class="result-actions">
        <button class="button button-primary result-add-button" type="button">
          Add to Meal
        </button>
      </div>
    `;

    card.addEventListener('click', () => {
      closeRecipePills();
      state.selectedRecipeId = recipe.id;
      state.selectedIngredientKey = null;
      state.detailPanelOpen = isCompactDetailMode();
      renderResults();
      renderDetail();
      elements.detailContent.scrollTop = 0;
    });

    const addButton = card.querySelector('.result-add-button');
    addButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addRecipeToMeal(recipe);
    });

    elements.resultsGrid.appendChild(card);
  }
}

function renderDetail() {
  const recipe = getSelectedRecipe();

  if (!recipe) {
    elements.detailTitle.textContent = 'Select a recipe';
    elements.detailContent.innerHTML =
      '<p>Choose a recipe card to inspect the currently visible public metrics and tagged ingredients.</p>';
    syncOverlayVisibility();
    return;
  }

  const ingredient = getSelectedIngredient();
  if (ingredient) {
    const usedInCount = (ingredient.tagged_recipes || []).length;
    elements.detailTitle.textContent = ingredient.name;
    elements.detailContent.innerHTML = `
      <button class="button button-secondary detail-back-button" type="button" data-detail-back>
        Back to ${escapeHtml(recipe.name)}
      </button>
      <p class="detail-copy">
        Last updated ${escapeHtml(formatDateTime(ingredient.updated_at))}.
      </p>
      ${renderScoreLayout(ingredient)}
      <div>
        <p class="panel-kicker">Used in (${escapeHtml(String(usedInCount))}) ${usedInCount === 1 ? 'recipe' : 'recipes'}</p>
        <p class="detail-copy">
          This ingredient appears across the current dining hall catalog.
        </p>
      </div>
    `;
    syncOverlayVisibility();
    return;
  }

  elements.detailTitle.textContent = recipe.name;
  const taggedIngredientCount = (recipe.tagged_ingredients || []).length;
  elements.detailContent.innerHTML = `
    <p class="detail-copy">
      Last updated ${escapeHtml(formatDateTime(recipe.updated_at))}.
    </p>
    ${renderScoreLayout(recipe)}
    <div>
      <p class="panel-kicker">Tagged Ingredients (${escapeHtml(String(taggedIngredientCount))})</p>
      <div class="detail-tags">
        ${taggedIngredientCount
          ? recipe.tagged_ingredients.map(renderIngredientScorePill).join('')
          : '<span class="detail-copy">No tagged ingredients yet.</span>'}
      </div>
    </div>
    <p class="detail-copy">
      Add this recipe from its catalog card to include it in My Meal and customize its ingredients.
    </p>
  `;
  syncOverlayVisibility();
}

function handleDetailContentClick(event) {
  const backButton = event.target.closest('[data-detail-back]');
  if (backButton) {
    event.preventDefault();
    state.selectedIngredientKey = null;
    renderDetail();
    return;
  }

  const ingredientTrigger = event.target.closest('[data-ingredient-detail-trigger]');
  if (ingredientTrigger) {
    event.preventDefault();
    event.stopPropagation();
    state.selectedIngredientKey = ingredientTrigger.dataset.ingredientKey || null;
    closeRecipePills();
    renderDetail();
    return;
  }

  handleRecipePillClick(event);
}

function handleRecipePillClick(event) {
  const pill = event.target.closest('[data-recipe-pill]');
  if (!pill) {
    return;
  }

  event.stopPropagation();

  if (!touchRecipePillMedia.matches) {
    return;
  }

  event.preventDefault();
  const shouldOpen = pill.dataset.open !== 'true';
  closeRecipePills(document, pill);
  setRecipePillOpen(pill, shouldOpen);
}

function handleMealDrawerClick(event) {
  const editToggle = event.target.closest('[data-meal-edit-toggle]');
  if (editToggle) {
    event.preventDefault();
    setMealEditor(editToggle.dataset.mealItemId || '');
    return;
  }

  const removeButton = event.target.closest('[data-meal-remove]');
  if (removeButton) {
    event.preventDefault();
    removeMealItem(removeButton.dataset.mealItemId || '');
    return;
  }

  const removeIngredientButton = event.target.closest('[data-meal-remove-ingredient]');
  if (removeIngredientButton) {
    event.preventDefault();
    removeIngredientFromMealItem(
      removeIngredientButton.dataset.mealItemId || '',
      removeIngredientButton.dataset.ingredientKey || ''
    );
    return;
  }

  const addIngredientButton = event.target.closest('[data-meal-add-ingredient]');
  if (addIngredientButton) {
    event.preventDefault();
    const mealItemId = addIngredientButton.dataset.mealItemId || '';
    const ingredientKey = addIngredientButton.dataset.ingredientKey || '';
    const ingredient = state.ingredientSearchResults.find(
      (item) => normalizeIngredientKey(item.name) === ingredientKey
    );
    if (!ingredient) {
      return;
    }

    addIngredientToMealItem(mealItemId, ingredient);
    focusMealSearchInput(mealItemId);
  }
}

function handleMealDrawerInput(event) {
  const ingredientSearchInput = event.target.closest('[data-meal-ingredient-search]');
  if (!ingredientSearchInput) {
    return;
  }

  state.ingredientSearchQuery = ingredientSearchInput.value;
  state.ingredientSearchError = '';
  searchIngredients(state.ingredientSearchQuery);
}

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadRecipes(elements.searchInput.value);
  elements.catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

elements.resultsGrid.addEventListener('click', handleRecipePillClick, true);
elements.detailContent.addEventListener('click', handleDetailContentClick, true);
elements.detailClose.addEventListener('click', closeDetailPanel);
elements.detailBackdrop.addEventListener('click', closeDetailPanel);
elements.mealToggle.addEventListener('click', toggleMealDrawer);
elements.mealDrawerClose.addEventListener('click', closeMealDrawer);
elements.mealBackdrop.addEventListener('click', closeMealDrawer);
elements.mealItems.addEventListener('click', handleMealDrawerClick);
elements.mealItems.addEventListener('input', handleMealDrawerInput);

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-recipe-pill]')) {
    return;
  }

  closeRecipePills();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeRecipePills();
  }

  if (event.key === 'Escape' && state.mealDrawerOpen) {
    closeMealDrawer();
    return;
  }

  if (event.key === 'Escape' && isCompactDetailMode() && state.detailPanelOpen) {
    closeDetailPanel();
  }
});

compactDetailMedia.addEventListener('change', (event) => {
  if (!event.matches) {
    state.detailPanelOpen = false;
    elements.detailContent.scrollTop = 0;
  }
  syncOverlayVisibility();
});

window.addEventListener('resize', () => {
  if (document.body.classList.contains('detail-panel-mobile-open')) {
    requestAnimationFrame(() => {
      elements.detailPanel.scrollTop = 0;
      elements.detailContent.scrollTop = 0;
    });
  }
});

async function bootstrap() {
  renderMealDrawer();

  try {
    await loadRecipes();
  } catch (error) {
    elements.searchSummary.textContent = error.message;
  }
}

bootstrap();
