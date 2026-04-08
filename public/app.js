import {
  api,
  escapeHtml,
  formatDateTime,
  formatMetric,
  getSustainabilityPalette
} from '/shared.js';

const PREVIEW_INGREDIENT_LIMIT = 4;

const state = {
  recipes: [],
  selectedRecipeId: null,
  searchQuery: '',
  detailPanelOpen: false,
  recipeScores: new Map()
};

const compactDetailMedia = window.matchMedia('(max-width: 1080px)');
const touchRecipePillMedia = window.matchMedia('(hover: none), (pointer: coarse)');
let lockedScrollY = 0;
let isDocumentScrollLocked = false;
let wasOverlayVisible = false;
let lockedScrollbarCompensation = 0;

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
  detailContent: document.getElementById('detailContent')
};

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

function syncDetailPanelVisibility() {
  const hasSelectedRecipe = state.recipes.some((recipe) => recipe.id === state.selectedRecipeId);
  const compactMode = isCompactDetailMode();
  const shouldShowOverlay = compactMode && state.detailPanelOpen && hasSelectedRecipe;

  elements.detailPanel.classList.toggle('is-open', shouldShowOverlay);
  elements.detailBackdrop.classList.toggle('hidden', !shouldShowOverlay);
  elements.detailClose.classList.toggle('hidden', !compactMode);
  document.body.classList.toggle('detail-panel-mobile-open', shouldShowOverlay);
  setDocumentScrollLock(shouldShowOverlay);

  if (shouldShowOverlay && !wasOverlayVisible) {
    requestAnimationFrame(() => {
      elements.detailPanel.scrollTop = 0;
      elements.detailContent.scrollTop = 0;
    });
  }

  wasOverlayVisible = shouldShowOverlay;
}

function closeDetailPanel() {
  state.detailPanelOpen = false;
  closeRecipePills();
  syncDetailPanelVisibility();
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
  const sustainabilityLabel = escapeHtml(formatMetric(ingredient.sustainability_index));
  const sustainabilityPalette = getSustainabilityPalette(ingredient.sustainability_index);

  return `
    <button
      class="pill ingredient-pill"
      type="button"
      data-recipe-pill
      data-open="false"
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

async function loadRecipes(query = state.searchQuery) {
  state.searchQuery = query;
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }

  const payload = await api(`/api/public-recipes${params.toString() ? `?${params}` : ''}`);
  state.recipes = payload.recipes;

  if (!state.recipes.some((recipe) => recipe.id === state.selectedRecipeId)) {
    state.selectedRecipeId = state.recipes[0]?.id ?? null;
    state.detailPanelOpen = false;
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
    `;

    card.addEventListener('click', () => {
      closeRecipePills();
      state.selectedRecipeId = recipe.id;
      state.detailPanelOpen = isCompactDetailMode();
      renderResults();
      renderDetail();
      elements.detailContent.scrollTop = 0;
    });

    elements.resultsGrid.appendChild(card);
  }
}

function renderDetail() {
  const recipe = state.recipes.find((entry) => entry.id === state.selectedRecipeId);

  if (!recipe) {
    elements.detailTitle.textContent = 'Select a recipe';
    elements.detailContent.innerHTML =
      '<p>Choose a recipe card to inspect the currently visible public metrics and tagged ingredients.</p>';
    syncDetailPanelVisibility();
    return;
  }

  elements.detailTitle.textContent = recipe.name;
  const sustainabilityPalette = getSustainabilityPalette(recipe.sustainability_index);
  const taggedIngredientCount = (recipe.tagged_ingredients || []).length;
  elements.detailContent.innerHTML = `
    <p class="detail-copy">
      Last updated ${escapeHtml(formatDateTime(recipe.updated_at))}.
    </p>
    <div class="detail-layout">
      <div
        class="score-cell score-cell-sustainability"
        style="background:${escapeHtml(sustainabilityPalette.background)};border:1px solid ${escapeHtml(sustainabilityPalette.border)};color:${escapeHtml(sustainabilityPalette.text)};"
      >
        <span>Sustainability Index</span>
        <strong>${escapeHtml(formatMetric(recipe.sustainability_index))}</strong>
      </div>
      <div class="score-grid score-grid-primary">
        <div class="score-cell score-cell-environment">
          <span>Nutrition Composite Score</span>
          <strong>${escapeHtml(formatMetric(recipe.nutrition_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Protein</span>
              <strong>${escapeHtml(formatMetric(recipe.protein))}</strong>
            </div>
            <div class="score-subcell">
              <span>Fiber</span>
              <strong>${escapeHtml(formatMetric(recipe.fiber))}</strong>
            </div>
            <div class="score-subcell">
              <span>Calcium</span>
              <strong>${escapeHtml(formatMetric(recipe.calcium))}</strong>
            </div>
            <div class="score-subcell">
              <span>Iron</span>
              <strong>${escapeHtml(formatMetric(recipe.iron))}</strong>
            </div>
            <div class="score-subcell">
              <span>Saturated Fat</span>
              <strong>${escapeHtml(formatMetric(recipe.saturated_fat))}</strong>
            </div>
            <div class="score-subcell">
              <span>Sodium</span>
              <strong>${escapeHtml(formatMetric(recipe.sodium))}</strong>
            </div>
          </div>
        </div>
        <div class="score-cell score-cell-environment">
          <span>Environmental Composite Score</span>
          <strong>${escapeHtml(formatMetric(recipe.environmental_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Water Use</span>
              <strong>${escapeHtml(formatMetric(recipe.water_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Nitrogen Use</span>
              <strong>${escapeHtml(formatMetric(recipe.nitrogen_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Carbon Use</span>
              <strong>${escapeHtml(formatMetric(recipe.carbon_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Land Use</span>
              <strong>${escapeHtml(formatMetric(recipe.land_use_score))}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <p class="panel-kicker">Tagged Ingredients (${escapeHtml(String(taggedIngredientCount))})</p>
      <div class="detail-tags">
        ${taggedIngredientCount
          ? recipe.tagged_ingredients.map(renderIngredientScorePill).join('')
          : '<span class="detail-copy">No tagged ingredients yet.</span>'}
      </div>
    </div>
  `;
  syncDetailPanelVisibility();
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

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadRecipes(elements.searchInput.value);
  elements.catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

elements.resultsGrid.addEventListener('click', handleRecipePillClick, true);
elements.detailContent.addEventListener('click', handleRecipePillClick, true);
elements.detailClose.addEventListener('click', closeDetailPanel);
elements.detailBackdrop.addEventListener('click', closeDetailPanel);

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

  if (event.key === 'Escape' && isCompactDetailMode() && state.detailPanelOpen) {
    closeDetailPanel();
  }
});

compactDetailMedia.addEventListener('change', (event) => {
  if (!event.matches) {
    state.detailPanelOpen = false;
    elements.detailContent.scrollTop = 0;
  }
  syncDetailPanelVisibility();
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
  try {
    await loadRecipes();
  } catch (error) {
    elements.searchSummary.textContent = error.message;
  }
}

bootstrap();
