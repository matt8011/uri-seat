import {
  api,
  calculateEnvironmentalCompositeScore,
  calculateNutrientRichFoodIndex,
  calculateNutritionCompositeScore,
  calculateSustainabilityIndex,
  escapeHtml,
  formatDateTime,
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
  'environmental_composite_score'
];

const state = {
  config: null,
  session: null,
  items: [],
  authReady: false
};

const elements = {
  signInButton: document.getElementById('signInButton'),
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
  importMessage: document.getElementById('importMessage')
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

function renderAuth() {
  const user = state.session;
  const isAdmin = Boolean(user?.isAdmin);

  elements.signOutButton.classList.toggle('hidden', !user);
  elements.adminWorkspace.classList.toggle('hidden', !isAdmin);

  if (!state.config?.googleAuthEnabled) {
    elements.authStatus.textContent = 'Google Auth is not configured yet.';
    elements.authHint.textContent = 'Set GOOGLE_CLIENT_ID, SESSION_SECRET, and ADMIN_EMAILS on the server to enable admin access.';
    elements.signInButton.classList.add('hidden');
    elements.googleMount.classList.add('hidden');
    return;
  }

  elements.signInButton.classList.remove('hidden');

  if (!user) {
    elements.authStatus.textContent = 'No admin session is active.';
    elements.authHint.textContent = 'This page is reserved for admins managing food entries and CSV imports.';
  } else if (isAdmin) {
    elements.authStatus.textContent = `Signed in as ${user.name}`;
    elements.authHint.textContent = `${user.email} has admin access.`;
  } else {
    elements.authStatus.textContent = `Signed in as ${user.name}`;
    elements.authHint.textContent = `${user.email} is authenticated, but this account is not in ADMIN_EMAILS.`;
  }

  const showGoogleButton = !user;
  elements.googleMount.classList.toggle('hidden', !showGoogleButton);
  if (showGoogleButton) {
    renderGoogleButton();
  }
}

function renderAdminTable() {
  elements.adminTableBody.innerHTML = '';

  if (!state.session?.isAdmin) {
    elements.adminTableSummary.textContent = 'Sign in as an admin to view entries.';
    return;
  }

  elements.adminTableSummary.textContent = `Showing ${state.items.length} entr${state.items.length === 1 ? 'y' : 'ies'}.`;

  for (const item of state.items) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(String(item.ghg_emissions ?? ''))}</td>
      <td>${escapeHtml((item.tagged_recipes || []).join(', '))}</td>
      <td>${escapeHtml(formatDateTime(item.updated_at))}</td>
      <td>
        <div class="table-actions">
          <button class="button button-secondary" type="button" data-action="edit" data-id="${item.id}">Edit</button>
          <button class="button button-danger" type="button" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    elements.adminTableBody.appendChild(row);
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
    environmentalCompositeScore = calculateEnvironmentalCompositeScore(environmentalPayload);
    setReadOnlyFieldValue('environmental_composite_score', environmentalCompositeScore);
  } else {
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
  } catch (error) {
    elements.authStatus.textContent = error.message;
    elements.authHint.textContent = 'Sign-in failed. Confirm GOOGLE_CLIENT_ID matches the client used in Google Cloud.';
  }
}

function renderGoogleButton() {
  if (!state.config?.googleClientId || !window.google?.accounts?.id || state.authReady) {
    return;
  }

  elements.googleMount.innerHTML = '';
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
  state.authReady = true;
}

elements.signInButton.addEventListener('click', () => {
  if (!state.config?.googleAuthEnabled) {
    return;
  }
  elements.googleMount.classList.remove('hidden');
  renderGoogleButton();
  elements.googleMount.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

elements.signOutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  state.session = null;
  state.authReady = false;
  elements.googleMount.innerHTML = '';
  clearForm();
  renderAuth();
  renderAdminTable();
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

async function bootstrap() {
  try {
    await loadConfig();
    await loadSession();
    if (state.session?.isAdmin) {
      await loadItems();
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
