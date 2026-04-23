import {
  api,
  calculateEnvironmentalCompositeScore,
  calculateEnvironmentalFactorScores,
  calculateNutrientRichFoodIndex,
  calculateNutritionCompositeScore,
  calculateSustainabilityIndex,
  escapeHtml,
  formatDateTime,
  formatMetric,
  getSustainabilityPalette,
  parseRecipes
} from '/shared.js';

const DB_IMPORT_COLUMNS = [
  'name', 'tagged_recipes', 'protein', 'fiber', 'vitamin_a', 'vitamin_c',
  'vitamin_e', 'calcium', 'iron', 'magnesium', 'potassium', 'saturated_fat',
  'added_sugar', 'sodium', 'freshwater_withdrawals', 'stress_weighted_water_use',
  'acidifying_emissions', 'eutrophying_emissions', 'ghg_emissions', 'land_use'
];
const RECIPE_IMPORT_COLUMNS = [
  'recipe_name',
  'ingredient_name',
  'grams_in_portion'
];

const REQUIRED_FIELDS = [
  'protein', 'fiber', 'vitamin_a', 'vitamin_c', 'vitamin_e',
  'calcium', 'iron', 'magnesium', 'potassium', 'saturated_fat', 'added_sugar', 'sodium',
  'freshwater_withdrawals', 'stress_weighted_water_use', 'acidifying_emissions',
  'eutrophying_emissions', 'ghg_emissions', 'land_use'
];

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/, '');
}

function autoMatchHeader(csvHeader) {
  const normalized = normalizeHeader(csvHeader);
  return DB_IMPORT_COLUMNS.find((col) => col === normalized) ?? null;
}

function parseCsvFirstRow(csvText) {
  const bom = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
  const firstLine = bom.split(/\r?\n/)[0];
  const headers = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (inQuotes) {
      if (ch === '"' && firstLine[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { headers.push(field.trim()); field = ''; }
      else { field += ch; }
    }
  }
  headers.push(field.trim());
  return headers;
}

const editableNumberFields = [
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
  'freshwater_withdrawals',
  'stress_weighted_water_use',
  'acidifying_emissions',
  'eutrophying_emissions',
  'ghg_emissions',
  'land_use'
];

const nutritionNumberFields = [
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
  'sodium'
];
const environmentalNumberFields = [
  'freshwater_withdrawals',
  'stress_weighted_water_use',
  'acidifying_emissions',
  'eutrophying_emissions',
  'ghg_emissions',
  'land_use'
];

const readOnlyFields = [
  'sustainability_index',
  'nutrient_rich_food_index',
  'nutrition_composite_score',
  'environmental_composite_score',
  'water_use_score',
  'nitrogen_use_score',
  'carbon_use_score',
  'land_use_score'
];

const state = {
  config: null,
  session: null,
  items: [],
  recipes: [],
  authReady: false
};

// Pagination state
const pagination = {
  ingredientPage: 1,
  ingredientPageSize: 15,
  recipePage: 1,
  recipePageSize: 15
};

// Filter/search state
let ingredientSearchQuery = '';
let recipeSearchQuery = '';
let showIncompleteOnly = false;

const elements = {
  adminNavLabel: document.getElementById('adminNavLabel'),
  signOutButton: document.getElementById('signOutButton'),
  googleMount: document.getElementById('googleMount'),
  authStatus: document.getElementById('authStatus'),
  authHint: document.getElementById('authHint'),
  adminWorkspace: document.getElementById('adminWorkspace'),
  dangerZonePanel: document.getElementById('dangerZonePanel'),
  entryForm: document.getElementById('entryForm'),
  entryId: document.getElementById('entryId'),
  cancelEdit: document.getElementById('cancelEdit'),
  adminMessage: document.getElementById('adminMessage'),
  adminTableBody: document.getElementById('adminTableBody'),
  adminTableSummary: document.getElementById('adminTableSummary'),
  ingredientCount: document.getElementById('ingredientCount'),
  ingredientSearch: document.getElementById('ingredientSearch'),
  incompleteFilter: document.getElementById('incompleteFilter'),
  ingredientPrevBtn: document.getElementById('ingredientPrevBtn'),
  ingredientNextBtn: document.getElementById('ingredientNextBtn'),
  ingredientPageInfo: document.getElementById('ingredientPageInfo'),
  csvFile: document.getElementById('csvFile'),
  replaceExisting: document.getElementById('replaceExisting'),
  importButton: document.getElementById('importButton'),
  exportIngredientsButton: document.getElementById('exportIngredientsButton'),
  importMessage: document.getElementById('importMessage'),
  recipeCsvFile: document.getElementById('recipeCsvFile'),
  replaceRecipeExisting: document.getElementById('replaceRecipeExisting'),
  recipeImportButton: document.getElementById('recipeImportButton'),
  recipeImportMessage: document.getElementById('recipeImportMessage'),
  repopulateRecipesButton: document.getElementById('repopulateRecipesButton'),
  recipeMessage: document.getElementById('recipeMessage'),
  recipeTableBody: document.getElementById('recipeTableBody'),
  recipeTableSummary: document.getElementById('recipeTableSummary'),
  recipeRangeSummary: document.getElementById('recipeRangeSummary'),
  recipeCount: document.getElementById('recipeCount'),
  recipeSearch: document.getElementById('recipeSearch'),
  exportPortionsButton: document.getElementById('exportPortionsButton'),
  exportRecipesButton: document.getElementById('exportRecipesButton'),
  recipePrevBtn: document.getElementById('recipePrevBtn'),
  recipeNextBtn: document.getElementById('recipeNextBtn'),
  recipePageInfo: document.getElementById('recipePageInfo'),
  clearIngredientsButton: document.getElementById('clearIngredientsButton'),
  clearIngredientsMessage: document.getElementById('clearIngredientsMessage'),
  clearRecipesButton: document.getElementById('clearRecipesButton'),
  clearRecipesMessage: document.getElementById('clearRecipesMessage'),
  columnMappingDialog: document.getElementById('columnMappingDialog'),
  columnMappingList: document.getElementById('columnMappingList'),
  columnMappingConfirm: document.getElementById('columnMappingConfirm'),
  columnMappingCancel: document.getElementById('columnMappingCancel')
};

function resolveColumnMapping(unmatchedHeaders) {
  return new Promise((resolve) => {
    elements.columnMappingList.innerHTML = '';

    for (const header of unmatchedHeaders) {
      const row = document.createElement('div');
      row.className = 'mapping-row';
      const options = DB_IMPORT_COLUMNS.map(
        (col) => `<option value="${escapeHtml(col)}">${escapeHtml(col)}</option>`
      ).join('');
      row.innerHTML = `
        <p class="mapping-row-label">Column <strong>"${escapeHtml(header)}"</strong> could not be matched.</p>
        <select class="mapping-select" data-csv-header="${escapeHtml(header)}">
          <option value="">— Ignore this column</option>
          ${options}
        </select>
      `;
      elements.columnMappingList.appendChild(row);
    }

    elements.columnMappingDialog.showModal();

    const onConfirm = () => {
      const mapping = {};
      elements.columnMappingList.querySelectorAll('select[data-csv-header]').forEach((select) => {
        mapping[select.dataset.csvHeader] = select.value || null;
      });
      cleanup();
      resolve(mapping);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    function cleanup() {
      elements.columnMappingDialog.close();
      elements.columnMappingConfirm.removeEventListener('click', onConfirm);
      elements.columnMappingCancel.removeEventListener('click', onCancel);
    }

    elements.columnMappingConfirm.addEventListener('click', onConfirm);
    elements.columnMappingCancel.addEventListener('click', onCancel);
  });
}

function getNumberValue(id) {
  const raw = document.getElementById(id).value.trim();
  if (raw === '') {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setReadOnlyFieldValue(id, value) {
  document.getElementById(id).value = value === null || value === undefined ? '' : value;
}

function updateSustainabilityFieldStyle(value) {
  const field = document.getElementById('sustainability_index');
  const palette = getSustainabilityPalette(value);
  field.style.background = palette.background;
  field.style.borderColor = palette.border;
  field.style.color = palette.text;
}

function setAdminMessage(message, isError = false) {
  elements.adminMessage.textContent = message;
  elements.adminMessage.style.color = isError ? '#a93d30' : '';
}

function setImportMessage(message, isError = false) {
  elements.importMessage.textContent = message;
  elements.importMessage.style.color = isError ? '#a93d30' : '';
}

function setRecipeImportMessage(message, isError = false) {
  elements.recipeImportMessage.textContent = message;
  elements.recipeImportMessage.style.color = isError ? '#a93d30' : '';
}

function setRecipeMessage(message, isError = false) {
  elements.recipeMessage.textContent = message;
  elements.recipeMessage.style.color = isError ? '#a93d30' : '';
}

function setClearIngredientsMessage(message, isError = false) {
  elements.clearIngredientsMessage.textContent = message;
  elements.clearIngredientsMessage.style.color = isError ? '#a93d30' : '';
}

function setClearRecipesMessage(message, isError = false) {
  elements.clearRecipesMessage.textContent = message;
  elements.clearRecipesMessage.style.color = isError ? '#a93d30' : '';
}

async function loadConfig() {
  state.config = await api('/api/config');
}

async function loadSession() {
  const payload = await api('/api/session');
  state.session = payload.user;
  renderAuth();
}

async function loadItems() {
  const payload = await api('/api/items');
  state.items = payload.items;
  pagination.ingredientPage = 1;
  renderAdminTable();
}

async function loadRecipes() {
  const payload = await api('/api/recipes');
  state.recipes = payload.recipes;
  pagination.recipePage = 1;
  renderRecipeTable();
}

function renderAuth() {
  const user = state.session;
  const isAdmin = Boolean(user?.isAdmin);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  elements.adminNavLabel.textContent = user ? 'Admin' : 'Login';
  elements.signOutButton.classList.toggle('hidden', !user);
  elements.adminWorkspace.classList.toggle('hidden', !isAdmin);
  elements.dangerZonePanel.classList.toggle('hidden', !isSuperAdmin);

  if (!state.config?.googleAuthEnabled) {
    elements.authStatus.textContent = 'Google Auth is not configured yet.';
    elements.authHint.textContent = 'Set GOOGLE_CLIENT_ID, SESSION_SECRET, ADMIN_EMAILS, and SUPERADMIN_EMAILS on the server to enable admin access.';
    elements.googleMount.classList.add('hidden');
    elements.googleMount.classList.remove('is-ready');
    return;
  }

  if (!user) {
    elements.authStatus.textContent = 'Authorized users only. No session active.';
    elements.authHint.textContent = 'Sign in to manage the SEAT database.';
  } else if (isSuperAdmin) {
    elements.authStatus.textContent = `Signed in as ${user.name}`;
    elements.authHint.textContent = `${user.email} has super admin access.`;
  } else if (isAdmin) {
    elements.authStatus.textContent = `Signed in as ${user.name}`;
    elements.authHint.textContent = `${user.email} has admin access.`;
  } else {
    elements.authStatus.textContent = `Signed in as ${user.name}`;
    elements.authHint.textContent = `${user.email} is not authorized to manage
	the database.`;
  }

  const showGoogleButton = !user;
  if (showGoogleButton) {
    renderGoogleButton();
  } else {
    elements.googleMount.classList.add('hidden');
    elements.googleMount.classList.remove('is-ready');
  }
}

function getFilteredItems() {
  let filtered = state.items;
  if (showIncompleteOnly) {
    filtered = filtered.filter((item) =>
      REQUIRED_FIELDS.some((f) => item[f] === null || item[f] === undefined)
    );
  }
  if (ingredientSearchQuery) {
    const q = ingredientSearchQuery.toLowerCase();
    filtered = filtered.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.tagged_recipes || []).join(',').toLowerCase().includes(q)
    );
  }
  return filtered;
}

function getFilteredRecipes() {
  if (!recipeSearchQuery) return state.recipes;
  const q = recipeSearchQuery.toLowerCase();
  return state.recipes.filter((r) => r.name.toLowerCase().includes(q));
}

function renderAdminTable() {
  elements.adminTableBody.innerHTML = '';

  if (!state.session?.isAdmin) {
    elements.adminTableSummary.textContent = 'Sign in as an admin to view entries.';
    return;
  }

  elements.ingredientCount.textContent = state.items.length;

  const filteredItems = getFilteredItems();
  const total = filteredItems.length;
  const pageSize = pagination.ingredientPageSize;
  const page = pagination.ingredientPage;
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = filteredItems.slice(startIdx, endIdx);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) {
    elements.adminTableSummary.textContent = 'No entries found.';
  } else {
    elements.adminTableSummary.textContent = `Showing ${startIdx + 1}–${endIdx} of ${total} ingredient${total === 1 ? '' : 's'}`;
  }

  elements.ingredientPrevBtn.disabled = page <= 1;
  elements.ingredientNextBtn.disabled = page >= totalPages;
  elements.ingredientPageInfo.textContent = `Page ${page} of ${totalPages}`;

  for (const item of pageItems) {
    const isMissing = REQUIRED_FIELDS.some((f) => item[f] === null || item[f] === undefined);
    const deleteButton = state.session?.isSuperAdmin
      ? `<button class="button button-danger" type="button" data-action="delete" data-id="${item.id}">Delete</button>`
      : '';
    const row = document.createElement('tr');
    if (isMissing) row.classList.add('row-incomplete');
    row.innerHTML = `
      <td data-label="Food item">${escapeHtml(item.name)}</td>
      <td data-label="SI Score">${item.sustainability_index != null ? escapeHtml(item.sustainability_index.toFixed(2)) : ''}</td>
      <td data-label="Tagged recipes">${escapeHtml((item.tagged_recipes || []).join(', '))}</td>
      <td data-label="Updated">${escapeHtml(formatDateTime(item.updated_at))}</td>
      <td data-label="Actions">
        <div class="table-actions">
          <button class="button button-secondary" type="button" data-action="edit" data-id="${item.id}">Edit</button>
          ${deleteButton}
        </div>
      </td>
    `;
    elements.adminTableBody.appendChild(row);
  }
}

function renderRecipeTable() {
  elements.recipeTableBody.innerHTML = '';

  if (!state.session?.isAdmin) {
    elements.recipeRangeSummary.textContent = 'Sign in as an admin to view recipes.';
    return;
  }

  elements.recipeCount.textContent = state.recipes.length;

  const filteredRecipes = getFilteredRecipes();
  const total = filteredRecipes.length;
  const pageSize = pagination.recipePageSize;
  const page = pagination.recipePage;
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRecipes = filteredRecipes.slice(startIdx, endIdx);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) {
    elements.recipeRangeSummary.textContent = state.recipes.length === 0 ? 'No recipes generated yet.' : 'No recipes match search.';
  } else {
    elements.recipeRangeSummary.textContent = `Showing ${startIdx + 1}–${endIdx} of ${total} recipe${total === 1 ? '' : 's'}`;
  }

  elements.recipePrevBtn.disabled = page <= 1;
  elements.recipeNextBtn.disabled = page >= totalPages;
  elements.recipePageInfo.textContent = `Page ${page} of ${totalPages}`;

  if (state.recipes.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Recipe">No recipes generated yet.</td>
      <td data-label="Sustainability Index">Pending</td>
      <td data-label="Updated">N/A</td>
      <td data-label="Actions"></td>
    `;
    elements.recipeTableBody.appendChild(row);
    return;
  }

  for (const recipe of pageRecipes) {
    const deleteButton = state.session?.isSuperAdmin
      ? `<button class="button button-danger" type="button" data-action="delete-recipe" data-id="${recipe.id}" data-name="${escapeHtml(recipe.name)}">Delete</button>`
      : '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Recipe">${escapeHtml(recipe.name)}</td>
      <td data-label="Sustainability Index">${escapeHtml(formatMetric(recipe.sustainability_index))}</td>
      <td data-label="Updated">${escapeHtml(formatDateTime(recipe.updated_at))}</td>
      <td data-label="Actions">
        <div class="table-actions">
          ${deleteButton}
        </div>
      </td>
    `;
    elements.recipeTableBody.appendChild(row);
  }
}

function populateForm(item) {
  elements.entryId.value = item.id;
  document.getElementById('name').value = item.name;
  document.getElementById('tagged_recipes').value = (item.tagged_recipes || []).join(', ');

  for (const field of editableNumberFields) {
    document.getElementById(field).value = item[field] ?? '';
  }

  for (const field of readOnlyFields) {
    document.getElementById(field).value = item[field] ?? '';
  }
  updateSustainabilityFieldStyle(item.sustainability_index);

  elements.cancelEdit.classList.remove('hidden');
  setAdminMessage(`Editing ${item.name}.`);
  elements.entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  updateDerivedPreview();
}

function clearForm() {
  elements.entryId.value = '';
  elements.entryForm.reset();
  elements.cancelEdit.classList.add('hidden');
  for (const field of readOnlyFields) {
    document.getElementById(field).value = '';
  }
  updateSustainabilityFieldStyle(null);
  updateDerivedPreview();
}

function buildPayload() {
  const payload = {
    name: document.getElementById('name').value.trim(),
    tagged_recipes: parseRecipes(document.getElementById('tagged_recipes').value)
  };

  for (const field of editableNumberFields) {
    payload[field] = getNumberValue(field);
  }

  return payload;
}

function updateDerivedPreview() {
  const hasAllNutritionValues = nutritionNumberFields.every(
    (field) => getNumberValue(field) !== null
  );
  const hasAllEnvironmentalValues = environmentalNumberFields.every(
    (field) => getNumberValue(field) !== null
  );

  let nutritionCompositeScore = null;
  if (hasAllNutritionValues) {
    const nutritionPayload = Object.fromEntries(
      nutritionNumberFields.map((field) => [field, getNumberValue(field)])
    );
    const nutrientRichFoodIndex = calculateNutrientRichFoodIndex(nutritionPayload);
    nutritionCompositeScore = calculateNutritionCompositeScore(nutrientRichFoodIndex);
    setReadOnlyFieldValue('nutrient_rich_food_index', nutrientRichFoodIndex);
    setReadOnlyFieldValue('nutrition_composite_score', nutritionCompositeScore);
  } else {
    setReadOnlyFieldValue('nutrient_rich_food_index', null);
    setReadOnlyFieldValue('nutrition_composite_score', null);
  }

  let environmentalCompositeScore = null;
  if (hasAllEnvironmentalValues) {
    const environmentalPayload = Object.fromEntries(
      environmentalNumberFields.map((field) => [field, getNumberValue(field)])
    );
    const environmentalFactorScores = calculateEnvironmentalFactorScores(environmentalPayload);
    environmentalCompositeScore = calculateEnvironmentalCompositeScore(environmentalPayload);
    setReadOnlyFieldValue('water_use_score', environmentalFactorScores.water_use_score);
    setReadOnlyFieldValue('nitrogen_use_score', environmentalFactorScores.nitrogen_use_score);
    setReadOnlyFieldValue('carbon_use_score', environmentalFactorScores.carbon_use_score);
    setReadOnlyFieldValue('land_use_score', environmentalFactorScores.land_use_score);
    setReadOnlyFieldValue('environmental_composite_score', environmentalCompositeScore);
  } else {
    setReadOnlyFieldValue('water_use_score', null);
    setReadOnlyFieldValue('nitrogen_use_score', null);
    setReadOnlyFieldValue('carbon_use_score', null);
    setReadOnlyFieldValue('land_use_score', null);
    setReadOnlyFieldValue('environmental_composite_score', null);
  }

  const sustainabilityIndex = calculateSustainabilityIndex(
    nutritionCompositeScore,
    environmentalCompositeScore
  );
  setReadOnlyFieldValue('sustainability_index', sustainabilityIndex);
  updateSustainabilityFieldStyle(sustainabilityIndex);
}

async function handleCredentialResponse(response) {
  try {
    await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    await loadSession();
    await loadItems();
    await loadRecipes();
  } catch (error) {
    elements.authStatus.textContent = error.message;
    elements.authHint.textContent = 'Sign-in failed. Confirm GOOGLE_CLIENT_ID matches the client used in Google Cloud.';
  }
}

function renderGoogleButton() {
  if (!state.config?.googleClientId || !window.google?.accounts?.id || state.authReady) {
    return;
  }

  elements.googleMount.classList.add('hidden');
  elements.googleMount.classList.remove('is-ready');
  elements.googleMount.innerHTML = '';

  const revealWhenReady = () => {
    if (!elements.googleMount.childElementCount) {
      return;
    }
    elements.googleMount.classList.remove('hidden');
    elements.googleMount.classList.add('is-ready');
    observer.disconnect();
  };

  const observer = new MutationObserver(revealWhenReady);
  observer.observe(elements.googleMount, { childList: true, subtree: true });

  window.google.accounts.id.initialize({
    client_id: state.config.googleClientId,
    callback: handleCredentialResponse
  });
  window.google.accounts.id.renderButton(elements.googleMount, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with'
  });
  revealWhenReady();
  state.authReady = true;
}

// --- Event listeners ---

elements.signOutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  state.session = null;
  state.authReady = false;
  elements.googleMount.innerHTML = '';
  elements.googleMount.classList.add('hidden');
  elements.googleMount.classList.remove('is-ready');
  clearForm();
  renderAuth();
  renderAdminTable();
  renderRecipeTable();
});

for (const field of editableNumberFields) {
  document.getElementById(field).addEventListener('input', () => {
    updateDerivedPreview();
  });
}

elements.entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!elements.entryForm.reportValidity()) {
    return;
  }
  const id = elements.entryId.value;

  try {
    setAdminMessage(id ? 'Updating entry...' : 'Creating entry...');
    await api(id ? `/api/items/${id}` : '/api/items', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(buildPayload())
    });
    clearForm();
    await loadItems();
    await loadRecipes();
    setAdminMessage(id ? 'Entry updated.' : 'Entry created.');
  } catch (error) {
    setAdminMessage(error.message, true);
  }
});

elements.cancelEdit.addEventListener('click', () => {
  clearForm();
  setAdminMessage('Edit cancelled.');
});

elements.adminTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  if (button.dataset.action === 'edit') {
    populateForm(item);
    return;
  }

  if (button.dataset.action === 'delete') {
    if (!state.session?.isSuperAdmin) {
      setAdminMessage('Super admin access required to delete ingredients.', true);
      return;
    }
    const confirmed = window.confirm(`Delete ${item.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      setAdminMessage(`Deleting ${item.name}...`);
      await api(`/api/items/${id}`, { method: 'DELETE' });
      await loadItems();
      await loadRecipes();
      clearForm();
      setAdminMessage(`${item.name} deleted.`);
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  }
});

elements.recipeTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="delete-recipe"]');
  if (!button) return;
  if (!state.session?.isSuperAdmin) {
    setRecipeMessage('Super admin access required to delete recipes.', true);
    return;
  }

  const id = Number(button.dataset.id);
  const name = button.dataset.name;
  const confirmed = window.confirm(`Delete recipe "${name}"?`);
  if (!confirmed) return;

  try {
    await api(`/api/recipes/${id}`, { method: 'DELETE' });
    await loadRecipes();
    await loadItems();
    setRecipeMessage(`Recipe "${name}" deleted.`);
  } catch (error) {
    setRecipeMessage(error.message, true);
  }
});

// Ingredient search
let ingredientSearchTimer = null;
elements.ingredientSearch.addEventListener('input', () => {
  clearTimeout(ingredientSearchTimer);
  ingredientSearchTimer = setTimeout(() => {
    ingredientSearchQuery = elements.ingredientSearch.value.trim().toLowerCase();
    pagination.ingredientPage = 1;
    renderAdminTable();
  }, 200);
});

// Incomplete filter
elements.incompleteFilter.addEventListener('change', () => {
  showIncompleteOnly = elements.incompleteFilter.checked;
  pagination.ingredientPage = 1;
  renderAdminTable();
});

// Ingredient pagination
elements.ingredientPrevBtn.addEventListener('click', () => {
  if (pagination.ingredientPage > 1) {
    pagination.ingredientPage--;
    renderAdminTable();
  }
});
elements.ingredientNextBtn.addEventListener('click', () => {
  const filteredItems = getFilteredItems();
  const totalPages = Math.ceil(filteredItems.length / pagination.ingredientPageSize);
  if (pagination.ingredientPage < totalPages) {
    pagination.ingredientPage++;
    renderAdminTable();
  }
});

// Recipe search
let recipeSearchTimer = null;
elements.recipeSearch.addEventListener('input', () => {
  clearTimeout(recipeSearchTimer);
  recipeSearchTimer = setTimeout(() => {
    recipeSearchQuery = elements.recipeSearch.value.trim().toLowerCase();
    pagination.recipePage = 1;
    renderRecipeTable();
  }, 200);
});

// Recipe pagination
elements.recipePrevBtn.addEventListener('click', () => {
  if (pagination.recipePage > 1) {
    pagination.recipePage--;
    renderRecipeTable();
  }
});
elements.recipeNextBtn.addEventListener('click', () => {
  const filteredRecipes = getFilteredRecipes();
  const totalPages = Math.ceil(filteredRecipes.length / pagination.recipePageSize);
  if (pagination.recipePage < totalPages) {
    pagination.recipePage++;
    renderRecipeTable();
  }
});

elements.importButton.addEventListener('click', async () => {
  const file = elements.csvFile.files?.[0];
  if (!file) {
    setImportMessage('Choose a CSV file first.', true);
    return;
  }

  try {
    setImportMessage('Reading CSV...');
    const csvText = await file.text();

    const csvHeaders = parseCsvFirstRow(csvText);
    if (!csvHeaders.length || csvHeaders.every((h) => !h)) {
      setImportMessage('CSV file appears to be empty or has no headers.', true);
      return;
    }

    const columnMapping = {};
    const unmatchedHeaders = [];

    for (const header of csvHeaders) {
      if (!header) continue;
      const match = autoMatchHeader(header);
      if (match) {
        columnMapping[header] = match;
      } else {
        unmatchedHeaders.push(header);
      }
    }

    if (unmatchedHeaders.length > 0) {
      const resolved = await resolveColumnMapping(unmatchedHeaders);
      if (resolved === null) {
        setImportMessage('Import cancelled.');
        return;
      }
      Object.assign(columnMapping, resolved);
    }

    setImportMessage('Importing...');
    const result = await api('/api/items/import', {
      method: 'POST',
      body: JSON.stringify({
        csvText,
        columnMapping,
        replaceExisting: elements.replaceExisting.checked
      })
    });

    await loadItems();
    await loadRecipes();
    const parts = [];
    if (result.inserted > 0) parts.push(`${result.inserted} inserted`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.skipped > 0) parts.push(`${result.skipped} skipped (no name)`);
    setImportMessage(parts.length ? parts.join(', ') + '.' : 'Nothing to import.');
    elements.csvFile.value = '';
  } catch (error) {
    setImportMessage(error.message, true);
  }
});

elements.recipeImportButton.addEventListener('click', async () => {
  const file = elements.recipeCsvFile.files?.[0];
  if (!file) {
    setRecipeImportMessage('Choose a recipe CSV file first.', true);
    return;
  }

  try {
    setRecipeImportMessage('Reading recipe CSV...');
    const csvText = await file.text();
    const csvHeaders = parseCsvFirstRow(csvText).map(normalizeHeader);
    const missingHeaders = RECIPE_IMPORT_COLUMNS.filter((header) => !csvHeaders.includes(header));

    if (missingHeaders.length > 0) {
      setRecipeImportMessage(
        `Missing required headers: ${missingHeaders.join(', ')}.`,
        true
      );
      return;
    }

    setRecipeImportMessage('Importing recipe portions...');
    const result = await api('/api/recipes/import', {
      method: 'POST',
      body: JSON.stringify({
        csvText,
        replaceExisting: elements.replaceRecipeExisting.checked
      })
    });

    await loadRecipes();
    const parts = [];
    if (result.inserted > 0) parts.push(`${result.inserted} inserted`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
    const suffix = result.mode === 'portion-sized'
      ? ` Built ${result.recipeCount} weighted recipe${result.recipeCount === 1 ? '' : 's'}.`
      : '';
    setRecipeImportMessage(
      `${parts.length ? parts.join(', ') : 'Nothing to import.'}${suffix}`
    );
    elements.recipeCsvFile.value = '';
  } catch (error) {
    setRecipeImportMessage(error.message, true);
  }
});

elements.exportIngredientsButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/export', { credentials: 'same-origin' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Export failed.' }));
      setImportMessage(err.error || 'Export failed.', true);
      return;
    }
    const csvText = await response.text();
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ingredients-export-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setImportMessage(error.message, true);
  }
});

elements.exportPortionsButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/export-portions', { credentials: 'same-origin' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Portions export failed.' }));
      setRecipeImportMessage(err.error || 'Portions export failed.', true);
      return;
    }
    const csvText = await response.text();
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portions-export-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setRecipeImportMessage(error.message, true);
  }
});

elements.exportRecipesButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/export-recipes', { credentials: 'same-origin' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Recipe export failed.' }));
      setRecipeMessage(err.error || 'Recipe export failed.', true);
      return;
    }
    const csvText = await response.text();
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipes-export-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setRecipeMessage(error.message, true);
  }
});

elements.repopulateRecipesButton.addEventListener('click', async () => {
  try {
    setRecipeMessage('Rebuilding recipes...');
    elements.repopulateRecipesButton.disabled = true;
    const result = await api('/api/recipes/repopulate', {
      method: 'POST'
    });

    state.recipes = result.recipes;
    pagination.recipePage = 1;
    renderRecipeTable();
    const modeSummary = result.mode === 'portion-sized'
      ? `${result.recipeCount} weighted recipe${result.recipeCount === 1 ? '' : 's'} from ${result.recipeIngredientCount} recipe portion row${result.recipeIngredientCount === 1 ? '' : 's'}.`
      : `${result.recipeCount} fallback recipe${result.recipeCount === 1 ? '' : 's'} from ${result.ingredientCount} ingredient entr${result.ingredientCount === 1 ? 'y' : 'ies'}.`;
    setRecipeMessage(
      `Built ${modeSummary}`
    );
  } catch (error) {
    setRecipeMessage(error.message, true);
  } finally {
    elements.repopulateRecipesButton.disabled = false;
  }
});

elements.clearIngredientsButton.addEventListener('click', async () => {
  if (!state.session?.isSuperAdmin) {
    setClearIngredientsMessage('Super admin access required to clear ingredients.', true);
    return;
  }
  const firstConfirmation = window.confirm(
    'Are you sure you want to clear all ingredient AND recipe data?'
  );
  if (!firstConfirmation) return;

  const secondConfirmation = window.confirm(
    'Are you really, really sure? This will delete all ingredient and recipe entries.'
  );
  if (!secondConfirmation) return;

  try {
    setClearIngredientsMessage('Clearing ingredient and recipe tables...');
    elements.clearIngredientsButton.disabled = true;
    await api('/api/admin/clear-ingredients', { method: 'POST' });
    state.items = [];
    state.recipes = [];
    clearForm();
    pagination.ingredientPage = 1;
    pagination.recipePage = 1;
    renderAdminTable();
    renderRecipeTable();
    setClearIngredientsMessage('Ingredients and recipes cleared.');
  } catch (error) {
    setClearIngredientsMessage(error.message, true);
  } finally {
    elements.clearIngredientsButton.disabled = false;
  }
});

elements.clearRecipesButton.addEventListener('click', async () => {
  if (!state.session?.isSuperAdmin) {
    setClearRecipesMessage('Super admin access required to clear recipes.', true);
    return;
  }
  const firstConfirmation = window.confirm(
    'Are you sure you want to clear all recipe data only?'
  );
  if (!firstConfirmation) return;

  const secondConfirmation = window.confirm(
    'Are you really, really sure? This will delete all recipe entries.'
  );
  if (!secondConfirmation) return;

  try {
    setClearRecipesMessage('Clearing recipes table...');
    elements.clearRecipesButton.disabled = true;
    await api('/api/admin/clear-recipes', { method: 'POST' });
    state.recipes = [];
    pagination.recipePage = 1;
    renderRecipeTable();
    setClearRecipesMessage('Recipes cleared.');
  } catch (error) {
    setClearRecipesMessage(error.message, true);
  } finally {
    elements.clearRecipesButton.disabled = false;
  }
});

async function bootstrap() {
  try {
    await loadConfig();
    await loadSession();
    if (state.session?.isAdmin) {
      await loadItems();
      await loadRecipes();
    }

    const poll = window.setInterval(() => {
      if (!state.config?.googleAuthEnabled || state.session || state.authReady) {
        window.clearInterval(poll);
        return;
      }
      renderGoogleButton();
    }, 500);
  } catch (error) {
    elements.authStatus.textContent = 'Unable to load admin workspace.';
    elements.authHint.textContent = error.message;
  }
}

bootstrap();
