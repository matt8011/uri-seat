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

const elements = {
  adminNavLabel: document.getElementById('adminNavLabel'),
  signOutButton: document.getElementById('signOutButton'),
  googleMount: document.getElementById('googleMount'),
  authStatus: document.getElementById('authStatus'),
  authHint: document.getElementById('authHint'),
  adminWorkspace: document.getElementById('adminWorkspace'),
  entryForm: document.getElementById('entryForm'),
  entryId: document.getElementById('entryId'),
  cancelEdit: document.getElementById('cancelEdit'),
  adminMessage: document.getElementById('adminMessage'),
  adminTableBody: document.getElementById('adminTableBody'),
  adminTableSummary: document.getElementById('adminTableSummary'),
  csvFile: document.getElementById('csvFile'),
  replaceExisting: document.getElementById('replaceExisting'),
  importButton: document.getElementById('importButton'),
  importMessage: document.getElementById('importMessage'),
  repopulateRecipesButton: document.getElementById('repopulateRecipesButton'),
  recipeMessage: document.getElementById('recipeMessage'),
  recipeTableBody: document.getElementById('recipeTableBody'),
  recipeTableSummary: document.getElementById('recipeTableSummary'),
  clearDatabaseButton: document.getElementById('clearDatabaseButton'),
  clearDatabaseMessage: document.getElementById('clearDatabaseMessage')
};

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

function setRecipeMessage(message, isError = false) {
  elements.recipeMessage.textContent = message;
  elements.recipeMessage.style.color = isError ? '#a93d30' : '';
}

function setClearDatabaseMessage(message, isError = false) {
  elements.clearDatabaseMessage.textContent = message;
  elements.clearDatabaseMessage.style.color = isError ? '#a93d30' : '';
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
  renderAdminTable();
}

async function loadRecipes() {
  const payload = await api('/api/recipes');
  state.recipes = payload.recipes;
  renderRecipeTable();
}

function renderAuth() {
  const user = state.session;
  const isAdmin = Boolean(user?.isAdmin);

  elements.adminNavLabel.textContent = user ? 'Admin' : 'Login';
  elements.signOutButton.classList.toggle('hidden', !user);
  elements.adminWorkspace.classList.toggle('hidden', !isAdmin);

  if (!state.config?.googleAuthEnabled) {
    elements.authStatus.textContent = 'Google Auth is not configured yet.';
    elements.authHint.textContent = 'Set GOOGLE_CLIENT_ID, SESSION_SECRET, and ADMIN_EMAILS on the server to enable admin access.';
    elements.googleMount.classList.add('hidden');
    elements.googleMount.classList.remove('is-ready');
    return;
  }

  if (!user) {
    elements.authStatus.textContent = 'Authorized users only. No session active.';
    elements.authHint.textContent = 'Sign in to manage the SEAT database.';
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

function renderAdminTable() {
  elements.adminTableBody.innerHTML = '';

  if (!state.session?.isAdmin) {
    elements.adminTableSummary.textContent = 'Sign in as an admin to view entries.';
    return;
  }

  elements.adminTableSummary.textContent = `Showing ${state.items.length} entr${state.items.length === 1 ? 'y' : 'ies'}`;

  for (const item of state.items) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Food item">${escapeHtml(item.name)}</td>
      <td data-label="GHG emissions">${escapeHtml(String(item.ghg_emissions ?? ''))}</td>
      <td data-label="Tagged recipes">${escapeHtml((item.tagged_recipes || []).join(', '))}</td>
      <td data-label="Updated">${escapeHtml(formatDateTime(item.updated_at))}</td>
      <td data-label="Actions">
        <div class="table-actions">
          <button class="button button-secondary" type="button" data-action="edit" data-id="${item.id}">Edit</button>
          <button class="button button-danger" type="button" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    elements.adminTableBody.appendChild(row);
  }
}

function renderRecipeTable() {
  elements.recipeTableBody.innerHTML = '';

  if (!state.session?.isAdmin) {
    elements.recipeTableSummary.textContent = 'Sign in as an admin to view recipes.';
    return;
  }

  elements.recipeTableSummary.textContent = `Showing ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}`;

  if (state.recipes.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Recipe">No recipes generated yet.</td>
      <td data-label="Sustainability Index">Pending</td>
      <td data-label="Updated">N/A</td>
    `;
    elements.recipeTableBody.appendChild(row);
    return;
  }

  for (const recipe of state.recipes) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Recipe">${escapeHtml(recipe.name)}</td>
      <td data-label="Sustainability Index">${escapeHtml(formatMetric(recipe.sustainability_index))}</td>
      <td data-label="Updated">${escapeHtml(formatDateTime(recipe.updated_at))}</td>
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
    const confirmed = window.confirm(`Delete ${item.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      setAdminMessage(`Deleting ${item.name}...`);
      await api(`/api/items/${id}`, { method: 'DELETE' });
      await loadItems();
      clearForm();
      setAdminMessage(`${item.name} deleted.`);
    } catch (error) {
      setAdminMessage(error.message, true);
    }
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
    const payload = {
      csvText,
      replaceExisting: elements.replaceExisting.checked
    };

    const result = await api('/api/items/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    await loadItems();
    setImportMessage(`Imported ${result.imported} entr${result.imported === 1 ? 'y' : 'ies'}.`);
    elements.csvFile.value = '';
  } catch (error) {
    setImportMessage(error.message, true);
  }
});

elements.repopulateRecipesButton.addEventListener('click', async () => {
  try {
    setRecipeMessage('Rebuilding recipes from ingredient tags...');
    elements.repopulateRecipesButton.disabled = true;
    const result = await api('/api/recipes/repopulate', {
      method: 'POST'
    });

    state.recipes = result.recipes;
    renderRecipeTable();
    setRecipeMessage(
      `Built ${result.recipeCount} recipe${result.recipeCount === 1 ? '' : 's'} from ${result.ingredientCount} ingredient entr${result.ingredientCount === 1 ? 'y' : 'ies'}.`
    );
  } catch (error) {
    setRecipeMessage(error.message, true);
  } finally {
    elements.repopulateRecipesButton.disabled = false;
  }
});

elements.clearDatabaseButton.addEventListener('click', async () => {
  const firstConfirmation = window.confirm(
    'Are you really sure you want to clear all ingredient and recipe data?'
  );
  if (!firstConfirmation) {
    return;
  }

  const secondConfirmation = window.confirm(
    'Are you really, really sure? This will delete all ingredient and recipe entries.'
  );
  if (!secondConfirmation) {
    return;
  }

  try {
    setClearDatabaseMessage('Clearing ingredient and recipe tables...');
    elements.clearDatabaseButton.disabled = true;
    await api('/api/admin/clear-database', {
      method: 'POST'
    });
    state.items = [];
    state.recipes = [];
    clearForm();
    renderAdminTable();
    renderRecipeTable();
    setAdminMessage('Database cleared.');
    setRecipeMessage('');
    setClearDatabaseMessage('Database cleared.');
  } catch (error) {
    setClearDatabaseMessage(error.message, true);
  } finally {
    elements.clearDatabaseButton.disabled = false;
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
