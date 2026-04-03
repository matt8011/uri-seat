import {
  api,
  escapeHtml,
  formatDateTime,
  formatMetric,
  getSustainabilityPalette
} from '/shared.js';

const state = {
  items: [],
  selectedItemId: null,
  searchQuery: '',
  detailPanelOpen: false
};

const compactDetailMedia = window.matchMedia('(max-width: 1080px)');

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

function syncDetailPanelVisibility() {
  const hasSelectedItem = state.items.some((item) => item.id === state.selectedItemId);
  const compactMode = isCompactDetailMode();
  const shouldShowOverlay = compactMode && state.detailPanelOpen && hasSelectedItem;

  elements.detailPanel.classList.toggle('is-open', shouldShowOverlay);
  elements.detailBackdrop.classList.toggle('hidden', !shouldShowOverlay);
  elements.detailClose.classList.toggle('hidden', !compactMode);
  document.body.classList.toggle('detail-panel-mobile-open', shouldShowOverlay);
}

function closeDetailPanel() {
  state.detailPanelOpen = false;
  syncDetailPanelVisibility();
}

async function loadItems(query = state.searchQuery) {
  state.searchQuery = query;
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }

  const payload = await api(`/api/items${params.toString() ? `?${params}` : ''}`);
  state.items = payload.items;

  if (!state.items.some((item) => item.id === state.selectedItemId)) {
    state.selectedItemId = state.items[0]?.id ?? null;
    state.detailPanelOpen = false;
  }

  renderResults();
  renderDetail();
}

function renderResults() {
  elements.resultsGrid.innerHTML = '';

  const summary = state.searchQuery.trim()
    ? `Showing ${state.items.length} result${state.items.length === 1 ? '' : 's'} for "${state.searchQuery.trim()}".`
    : `Showing ${state.items.length} catalog entr${state.items.length === 1 ? 'y' : 'ies'}.`;
  elements.searchSummary.textContent = summary;
  elements.emptyState.classList.toggle('hidden', state.items.length !== 0);

  for (const item of state.items) {
    const card = document.createElement('article');
    card.className = `result-card${item.id === state.selectedItemId ? ' is-active' : ''}`;
    const sustainabilityPalette = getSustainabilityPalette(item.sustainability_index);
    card.innerHTML = `
      <div class="result-topline">
        <span
          class="score-chip"
          style="background:${escapeHtml(sustainabilityPalette.background)};border:1px solid ${escapeHtml(sustainabilityPalette.border)};color:${escapeHtml(sustainabilityPalette.text)};"
        >
          Sustainability ${escapeHtml(formatMetric(item.sustainability_index))}
        </span>
      </div>
      <h3 class="result-title">${escapeHtml(item.name)}</h3>
      <p class="result-subtitle">
        Nutrition ${escapeHtml(formatMetric(item.nutrition_composite_score))} ·
        Environmental ${escapeHtml(formatMetric(item.environmental_composite_score))}
      </p>
      <div class="card-tags">
        ${(item.tagged_recipes || []).slice(0, 4).map((recipe) => `<span class="pill">${escapeHtml(recipe)}</span>`).join('')}
      </div>
    `;

    card.addEventListener('click', () => {
      state.selectedItemId = item.id;
      state.detailPanelOpen = isCompactDetailMode();
      renderResults();
      renderDetail();
      elements.detailContent.scrollTop = 0;
    });

    elements.resultsGrid.appendChild(card);
  }
}

function renderDetail() {
  const item = state.items.find((entry) => entry.id === state.selectedItemId);

  if (!item) {
    elements.detailTitle.textContent = 'Select an entry';
    elements.detailContent.innerHTML =
      '<p>Choose a card to inspect the currently visible public metrics and recipe tags.</p>';
    syncDetailPanelVisibility();
    return;
  }

  elements.detailTitle.textContent = item.name;
  const sustainabilityPalette = getSustainabilityPalette(item.sustainability_index);
  const taggedRecipeCount = (item.tagged_recipes || []).length;
  elements.detailContent.innerHTML = `
    <p class="detail-copy">
      Last updated ${escapeHtml(formatDateTime(item.updated_at))}.
    </p>
    <div class="detail-layout">
      <div
        class="score-cell score-cell-sustainability"
        style="background:${escapeHtml(sustainabilityPalette.background)};border:1px solid ${escapeHtml(sustainabilityPalette.border)};color:${escapeHtml(sustainabilityPalette.text)};"
      >
        <span>Sustainability Index</span>
        <strong>${escapeHtml(formatMetric(item.sustainability_index))}</strong>
      </div>
      <div class="score-grid score-grid-primary">
        <div class="score-cell score-cell-environment">
          <span>Nutrition Composite Score</span>
          <strong>${escapeHtml(formatMetric(item.nutrition_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Protein</span>
              <strong>${escapeHtml(formatMetric(item.protein))}</strong>
            </div>
            <div class="score-subcell">
              <span>Fiber</span>
              <strong>${escapeHtml(formatMetric(item.fiber))}</strong>
            </div>
            <div class="score-subcell">
              <span>Calcium</span>
              <strong>${escapeHtml(formatMetric(item.calcium))}</strong>
            </div>
            <div class="score-subcell">
              <span>Iron</span>
              <strong>${escapeHtml(formatMetric(item.iron))}</strong>
            </div>
            <div class="score-subcell">
              <span>Saturated Fat</span>
              <strong>${escapeHtml(formatMetric(item.saturated_fat))}</strong>
            </div>
            <div class="score-subcell">
              <span>Sodium</span>
              <strong>${escapeHtml(formatMetric(item.sodium))}</strong>
            </div>
          </div>
        </div>
        <div class="score-cell score-cell-environment">
          <span>Environmental Composite Score</span>
          <strong>${escapeHtml(formatMetric(item.environmental_composite_score))}</strong>
          <div class="score-subgrid">
            <div class="score-subcell">
              <span>Water Use</span>
              <strong>${escapeHtml(formatMetric(item.water_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Nitrogen Use</span>
              <strong>${escapeHtml(formatMetric(item.nitrogen_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Carbon Use</span>
              <strong>${escapeHtml(formatMetric(item.carbon_use_score))}</strong>
            </div>
            <div class="score-subcell">
              <span>Land Use</span>
              <strong>${escapeHtml(formatMetric(item.land_use_score))}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <p class="panel-kicker">Tagged recipes (${escapeHtml(String(taggedRecipeCount))})</p>
      <div class="detail-tags">
        ${taggedRecipeCount
          ? item.tagged_recipes.map((recipe) => `<span class="pill">${escapeHtml(recipe)}</span>`).join('')
          : '<span class="detail-copy">No recipe tags yet.</span>'}
      </div>
    </div>
  `;
  syncDetailPanelVisibility();
}

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadItems(elements.searchInput.value);
  elements.catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

elements.detailClose.addEventListener('click', closeDetailPanel);
elements.detailBackdrop.addEventListener('click', closeDetailPanel);

window.addEventListener('keydown', (event) => {
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

async function bootstrap() {
  try {
    await loadItems();
  } catch (error) {
    elements.searchSummary.textContent = error.message;
  }
}

bootstrap();
