const state = {
  config: null,
  session: null,
  items: [],
  selectedItemId: null,
  searchQuery: '',
  authReady: false
};

const elements = {
  signInButton: document.getElementById('signInButton'),
  signOutButton: document.getElementById('signOutButton'),
  googleMount: document.getElementById('googleMount'),
  authStatus: document.getElementById('authStatus'),
  authHint: document.getElementById('authHint'),
  adminSection: document.getElementById('adminSection'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  searchSummary: document.getElementById('searchSummary'),
  resultsGrid: document.getElementById('resultsGrid'),
  emptyState: document.getElementById('emptyState'),
  detailTitle: document.getElementById('detailTitle'),
  detailContent: document.getElementById('detailContent'),
  entryForm: document.getElementById('entryForm'),
  entryId: document.getElementById('entryId'),
  cancelEdit: document.getElementById('cancelEdit'),
  adminMessage: document.getElementById('adminMessage'),
  adminTableBody: document.getElementById('adminTableBody')
};

const scoreFields = [
  ['composite_score', 'Composite'],
  ['nutrition_score', 'Nutrition'],
  ['affordability_score', 'Affordability'],
  ['biodiversity_score', 'Biodiversity'],
  ['land_score', 'Land use'],
  ['water_score', 'Water use'],
  ['carbon_score', 'Carbon footprint']
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseRecipes(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getNumberValue(id) {
  const raw = document.getElementById(id).value.trim();
  return raw === '' ? null : Number(raw);
}

function setAdminMessage(message, isError = false) {
  elements.adminMessage.textContent = message;
  elements.adminMessage.style.color = isError ? '#a93d30' : '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
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

async function loadConfig() {
  state.config = await api('/api/config');
}

async function loadSession() {
  const payload = await api('/api/session');
  state.session = payload.user;
  renderAuth();
}

async function loadItems(query = state.searchQuery) {
  state.searchQuery = query;
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  const payload = await api(`/api/items${params.toString() ? `?${params}` : ''}`, {
    headers: {}
  });
  state.items = payload.items;

  if (!state.items.some((item) => item.id === state.selectedItemId)) {
    state.selectedItemId = state.items[0]?.id ?? null;
  }

  renderResults();
  renderDetail();
  renderAdminTable();
}

function formatScore(value) {
  return value === null || value === undefined ? 'N/A' : Number(value).toFixed(2);
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

function renderResults() {
  elements.resultsGrid.innerHTML = '';
  const queryLabel = state.searchQuery.trim()
    ? `Showing ${state.items.length} result${state.items.length === 1 ? '' : 's'} for "${state.searchQuery.trim()}".`
    : `Showing ${state.items.length} catalog entr${state.items.length === 1 ? 'y' : 'ies'}.`;
  elements.searchSummary.textContent = queryLabel;

  elements.emptyState.classList.toggle('hidden', state.items.length !== 0);

  for (const item of state.items) {
    const card = document.createElement('article');
    card.className = `result-card${item.id === state.selectedItemId ? ' is-active' : ''}`;
    card.innerHTML = `
      <div class="result-topline">
        <span class="pill">Code ${escapeHtml(item.code)}</span>
        <span class="score-chip">Composite ${escapeHtml(formatScore(item.composite_score))}</span>
      </div>
      <h3 class="result-title">${escapeHtml(item.name)}</h3>
      <p class="result-subtitle">
        Nutrition ${escapeHtml(formatScore(item.nutrition_score))} ·
        Affordability ${escapeHtml(formatScore(item.affordability_score))} ·
        Carbon ${escapeHtml(formatScore(item.carbon_score))}
      </p>
      <div class="card-tags">
        ${(item.tagged_recipes || []).slice(0, 4).map((recipe) => `<span class="pill">${escapeHtml(recipe)}</span>`).join('')}
      </div>
    `;
    card.addEventListener('click', () => {
      state.selectedItemId = item.id;
      renderResults();
      renderDetail();
    });
    elements.resultsGrid.appendChild(card);
  }
}

function renderDetail() {
  const item = state.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    elements.detailTitle.textContent = 'Select an entry';
    elements.detailContent.innerHTML = '<p>Choose a card to inspect its score profile and tagged recipes.</p>';
    return;
  }

  elements.detailTitle.textContent = item.name;
  elements.detailContent.innerHTML = `
    <p class="detail-copy">
      Food code <strong>${escapeHtml(item.code)}</strong>. Updated ${escapeHtml(formatDate(item.updated_at))}.
    </p>
    <div class="score-grid">
      ${scoreFields
        .map(
          ([key, label]) => `
            <div class="score-cell">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(formatScore(item[key]))}</strong>
            </div>
          `
        )
        .join('')}
    </div>
    <div>
      <p class="panel-kicker">Tagged recipes</p>
      <div class="detail-tags">
        ${(item.tagged_recipes || []).length
          ? item.tagged_recipes.map((recipe) => `<span class="pill">${escapeHtml(recipe)}</span>`).join('')
          : '<span class="detail-copy">No recipe tags yet.</span>'}
      </div>
    </div>
  `;
}

function renderAuth() {
  const user = state.session;
  const isAdmin = Boolean(user?.isAdmin);

  elements.signOutButton.classList.toggle('hidden', !user);
  elements.adminSection.classList.toggle('hidden', !isAdmin);

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
    elements.authHint.textContent = 'Visitors can search the catalog. Admins can sign in with Google to manage entries.';
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
    return;
  }

  for (const item of state.items) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(formatScore(item.composite_score))}</td>
      <td>${escapeHtml((item.tagged_recipes || []).join(', '))}</td>
      <td>${escapeHtml(formatDate(item.updated_at))}</td>
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
  document.getElementById('code').value = item.code;
  document.getElementById('composite_score').value = item.composite_score ?? '';
  document.getElementById('nutrition_score').value = item.nutrition_score ?? '';
  document.getElementById('affordability_score').value = item.affordability_score ?? '';
  document.getElementById('biodiversity_score').value = item.biodiversity_score ?? '';
  document.getElementById('land_score').value = item.land_score ?? '';
  document.getElementById('water_score').value = item.water_score ?? '';
  document.getElementById('carbon_score').value = item.carbon_score ?? '';
  document.getElementById('tagged_recipes').value = (item.tagged_recipes || []).join(', ');
  elements.cancelEdit.classList.remove('hidden');
  setAdminMessage(`Editing ${item.name}.`);
  elements.adminSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearForm() {
  elements.entryId.value = '';
  elements.entryForm.reset();
  elements.cancelEdit.classList.add('hidden');
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
});

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadItems(elements.searchInput.value);
});

elements.entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById('name').value.trim(),
    code: Number(document.getElementById('code').value),
    composite_score: getNumberValue('composite_score'),
    nutrition_score: getNumberValue('nutrition_score'),
    affordability_score: getNumberValue('affordability_score'),
    biodiversity_score: getNumberValue('biodiversity_score'),
    land_score: getNumberValue('land_score'),
    water_score: getNumberValue('water_score'),
    carbon_score: getNumberValue('carbon_score'),
    tagged_recipes: parseRecipes(document.getElementById('tagged_recipes').value)
  };

  const id = elements.entryId.value;

  try {
    setAdminMessage(id ? 'Updating entry...' : 'Creating entry...');
    await api(id ? `/api/items/${id}` : '/api/items', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    clearForm();
    await loadItems(state.searchQuery);
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
      if (state.selectedItemId === id) {
        state.selectedItemId = null;
      }
      await loadItems(state.searchQuery);
      setAdminMessage(`${item.name} deleted.`);
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  }
});

async function bootstrap() {
  try {
    await loadConfig();
    await loadSession();
    await loadItems();
    const poll = window.setInterval(() => {
      if (!state.config?.googleAuthEnabled || state.session || state.authReady) {
        window.clearInterval(poll);
        return;
      }
      renderGoogleButton();
    }, 500);
  } catch (error) {
    elements.searchSummary.textContent = error.message;
    elements.authStatus.textContent = 'Unable to load application state.';
    elements.authHint.textContent = 'Check the server console for details.';
  }
}

bootstrap();
