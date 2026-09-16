import * as CommonTable from './appCommon/commonTable.js';

const manageType = document.querySelector('#hayday-manage-type');
const panels = {
  product: document.querySelector('#hayday-product-panel'),
  storage: document.querySelector('#hayday-storage-panel'),
  analysis: document.querySelector('#hayday-analysis-panel'),
  summary: document.querySelector('#hayday-summary-panel'),
};
const buildingTypeSelect = document.querySelector('#hayday-building-type');
const buildingSelect = document.querySelector('#hayday-building');
const buildingEditTypeSelect = document.querySelector('#hayday-building-edit-type');
const buildingCount = document.querySelector('#hayday-building-count');
const buildingTypeCount = document.querySelector('#hayday-building-type-count');
const productSelect = document.querySelector('#hayday-product');
const productBuildingSelect = document.querySelector('#hayday-product-building');
const productCount = document.querySelector('#hayday-product-count');
const ingredientCount = document.querySelector('#hayday-ingredient-count');
const ingredientSelect = document.querySelector('#hayday-ingredient');
const ingredientBuildingSelect = document.querySelector('#hayday-ingredient-building');
const ingredientList = document.querySelector('#hayday-ingredient-list');
const status = document.querySelector('#hayday-status');
const state = { buildings: [], products: [], ingredients: [] };
state.accounts = [];
state.selectedAccounts = new Set();
const imageDropdowns = new Map();

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function showManagePanel(panelName) {
  Object.entries(panels).forEach(([name, panel]) => {
    panel?.classList.toggle('hidden', name !== panelName);
  });
}

function updateProductManagerControls() {
  const hasBuildingType = Boolean(buildingTypeSelect.value);
  const hasBuilding = Boolean(selectedBuilding());
  const hasProduct = state.products.some((product) => String(product.id) === productSelect.value);
  const hasIngredient = Boolean(ingredientSelect.value);
  const hasIngredientBuilding = Boolean(ingredientBuildingSelect.value);

  const setEnabled = (selector, enabled) => {
    const control = document.querySelector(selector);
    if (!control) return;
    control.disabled = !enabled;
    control.setAttribute('aria-disabled', String(!enabled));
  };

  // A new building needs a selected type; editing/deleting one also needs
  // an actual building selection. Products follow the same dependency.
  setEnabled('#hayday-building-save', hasBuilding);
  setEnabled('#hayday-building-delete', hasBuilding);
  setEnabled('#hayday-product-save', hasProduct);
  setEnabled('#hayday-product-delete', hasProduct);
  setEnabled('#hayday-ingredient-add', hasProduct && hasIngredient);
  setEnabled('#hayday-ingredient-building-save', hasProduct && hasIngredient && hasIngredientBuilding);
}

function renderAccounts() {
  const select = document.querySelector('#hayday-account');
  fillSelect(select, state.accounts, '-- Select account --', (account) => account.name);
  const container = document.querySelector('#hayday-account-table');
  container.replaceChildren();
  if (!state.accounts.length) return;
  state.accounts.forEach((account) => state.selectedAccounts.add(account.id));
  const totalRow = {
    row_key: 'total', select: 'Total', name: 'Total', level: '', inventory: 'Selected total', barn: '',
    bolt: inventoryTotal('bolt'), plank: inventoryTotal('plank'), tape: inventoryTotal('tape'), need_each_barn: '',
    silo: '', nail: inventoryTotal('nail'), screw: inventoryTotal('screw'), wood_panel: inventoryTotal('wood_panel'), need_each_silo: '',
  };
  const storageRows = state.accounts.flatMap((account) => {
    const barnNeed = storageKitNeed(account.barn_capacity);
    const siloNeed = storageKitNeed(account.silo_capacity);
    const barnMissing = [account.bolt, account.plank, account.tape].reduce((total, value) => total + Math.max(barnNeed - (value ?? 0), 0), 0);
    const siloMissing = [account.nail, account.screw, account.wood_panel].reduce((total, value) => total + Math.max(siloNeed - (value ?? 0), 0), 0);
    return [
      { row_key: `${account.id}-inventory`, select: 'Inventory', name: account.name, level: account.level, inventory: 'Inventory', barn: account.barn_capacity, bolt: account.bolt, plank: account.plank, tape: account.tape, need_each_barn: `${barnNeed} each`, silo: account.silo_capacity, nail: account.nail, screw: account.screw, wood_panel: account.wood_panel, need_each_silo: `${siloNeed} each` },
      { row_key: `${account.id}-missing`, select: '', name: '', level: '', inventory: 'Missing', barn: '', bolt: Math.max(barnNeed - (account.bolt ?? 0), 0), plank: Math.max(barnNeed - (account.plank ?? 0), 0), tape: Math.max(barnNeed - (account.tape ?? 0), 0), need_each_barn: `${barnMissing} total`, silo: '', nail: Math.max(siloNeed - (account.nail ?? 0), 0), screw: Math.max(siloNeed - (account.screw ?? 0), 0), wood_panel: Math.max(siloNeed - (account.wood_panel ?? 0), 0), need_each_silo: `${siloMissing} total` },
    ];
  });
  storageRows.unshift(totalRow);
  const table = CommonTable.createTable(storageRows, {
    table: {
      edit: true,
      actions: false,
      keyName: 'row_key',
      columnListToHide: ['row_key'],
      rowEditable: (row) => row.inventory === 'Inventory',
      onchange: (id, value, column) => {
        const accountId = String(id).split('-')[0];
        return updateAccountCell(accountId, column === 'barn' ? 'barn_capacity' : column === 'silo' ? 'silo_capacity' : column, value);
      },
    },
    column: [
      { columnName: 'select', label: '', readOnly: true, onValue: { value: 'Inventory', render: (cell, row) => {
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'hayday-account-checkbox'; checkbox.checked = state.selectedAccounts.has(Number(String(row.__rowId).split('-')[0]));
        checkbox.addEventListener('change', () => { const id = Number(String(row.__rowId).split('-')[0]); if (checkbox.checked) state.selectedAccounts.add(id); else state.selectedAccounts.delete(id); refreshStorageTotal(); });
        cell.appendChild(checkbox);
      } } },
      { columnName: 'name', readOnly: true },
      { columnName: 'inventory', readOnly: true },
      { columnName: 'need_each_barn', label: 'Need to upgrade', readOnly: true },
      { columnName: 'need_each_silo', readOnly: true },
    ],
  });
  table.classList.add('hayday-storage-table');
  table.querySelectorAll('tbody tr').forEach((row, index) => {
    if (index === 0) return;
    const accountRowIndex = index - 1;
    row.classList.add(accountRowIndex % 2 === 0 ? 'hayday-inventory-row' : 'hayday-missing-row');
    row.classList.add(accountRowIndex % 2 === 0 ? 'hayday-account-start' : 'hayday-account-end');
  });
  container.appendChild(table);
  table.querySelectorAll("tbody td[contenteditable='true']").forEach((cell) => {
    cell.addEventListener('focus', () => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(cell);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  });
}

function inventoryTotal(column) {
  return state.accounts.filter((account) => state.selectedAccounts.has(account.id)).reduce((sum, account) => sum + Number(account[column] ?? 0), 0);
}

function refreshStorageTotal() {
  const total = [...document.querySelectorAll('#hayday-account-table tbody tr')].find((row) => row.dataset.rowId === 'total');
  const set = (column, value) => { const cell = total?.querySelector(`td[data-col-name="${column}"]`); if (cell) cell.textContent = String(value); };
  ['bolt', 'plank', 'tape', 'nail', 'screw', 'wood_panel'].forEach((column) => set(column, inventoryTotal(column)));
}

function storageKitNeed(capacity) {
  const value = Number(capacity);
  if (!value) return 0;
  return value <= 1000 ? value / 25 - 1 : value / 50 + 19;
}

function fillSelect(select, rows, placeholder, label) {
  select.replaceChildren(new Option(placeholder, ''));
  rows.forEach((row) => select.add(new Option(label(row), String(row.id))));
}

function fillNamedSelect(select, names, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  names.forEach((name) => select.add(new Option(name, name)));
}

function imageUrl(_kind, row) {
  return row?.image_file ? `/api/hayday/images/${row.image_file}` : '';
}

function createImageDropdown(select, kind) {
  const wrapper = document.createElement('div');
  wrapper.className = 'hayday-image-dropdown';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'module-control hayday-image-dropdown-trigger';
  const preview = document.createElement('img');
  const text = document.createElement('span');
  trigger.append(preview, text, document.createTextNode('⌄'));
  const menu = document.createElement('div');
  menu.className = 'hayday-image-dropdown-menu hidden';
  let searchInput;
  if (kind === 'products' || kind === 'buildings') {
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'hayday-option-search';
    searchInput.placeholder = kind === 'products' ? 'Search products' : 'Search buildings';
    searchInput.setAttribute('aria-label', kind === 'products' ? 'Search products' : 'Search buildings');
    menu.appendChild(searchInput);
  }
  wrapper.append(trigger, menu);
  select.classList.add('hidden');
  select.after(wrapper);
  const dropdown = { select, kind, trigger, preview, text, menu, searchInput, renderOptions: null };
  imageDropdowns.set(select, dropdown);
  trigger.addEventListener('click', () => menu.classList.toggle('hidden'));
  searchInput?.addEventListener('input', () => dropdown.renderOptions?.());
  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) menu.classList.add('hidden');
  });
  return dropdown;
}

function refreshImageDropdown(select, rows, placeholder, kind, label) {
  const dropdown = imageDropdowns.get(select) ?? createImageDropdown(select, kind);
  if (dropdown.searchInput) dropdown.searchInput.value = '';
  const current = rows.find((row) => String(row.id) === select.value);
  dropdown.text.textContent = current ? label(current) : placeholder;
  dropdown.preview.src = current ? imageUrl(kind, current) : '';
  dropdown.preview.classList.toggle('hidden', !current || !dropdown.preview.src);
  const renderOptions = () => {
    const query = dropdown.searchInput?.value.trim().toLowerCase() ?? '';
    dropdown.menu.querySelectorAll('.hayday-image-dropdown-option').forEach((option) => option.remove());
    rows.filter((row) => !query || label(row).toLowerCase().includes(query)).forEach((row) => {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'hayday-image-dropdown-option';
    const image = document.createElement('img'); image.src = imageUrl(kind, row); image.alt = '';
    const name = document.createElement('span'); name.textContent = label(row);
    option.append(image, name);
    option.addEventListener('click', () => {
      select.value = String(row.id);
      dropdown.text.textContent = label(row);
      dropdown.preview.src = imageUrl(kind, row);
      dropdown.preview.classList.toggle('hidden', !dropdown.preview.src);
      select.dispatchEvent(new Event('change'));
      dropdown.menu.classList.add('hidden');
    });
    dropdown.menu.appendChild(option);
    });
  };
  dropdown.renderOptions = renderOptions;
  renderOptions();
}

function selectedBuilding() {
  return state.buildings.find((building) => String(building.id) === buildingSelect.value);
}

function renderBuildings() {
  const selectedBuildingId = buildingSelect.value;
  const type = buildingTypeSelect.value ? buildingTypeSelect.selectedOptions[0]?.textContent : '';
  const buildings = state.buildings.filter((building) => !type || building.type === type).sort((a, b) => a.name.localeCompare(b.name));
  buildingCount.textContent = `${buildings.length} building${buildings.length === 1 ? '' : 's'}`;
  fillSelect(buildingSelect, buildings, '--Select a Building--', (building) => building.name);
  if (buildings.some((building) => String(building.id) === selectedBuildingId)) buildingSelect.value = selectedBuildingId;
  refreshImageDropdown(buildingSelect, buildings, '--Select a Building--', 'buildings', (building) => building.name);
  fillSelect(ingredientBuildingSelect, state.buildings, '--Building name--', (building) => building.name);
  fillNamedSelect(buildingEditTypeSelect, [...new Set(state.buildings.map((building) => building.type))].sort(), '--Building type--');
  populateBuildingFields();
  renderProducts();
  updateProductManagerControls();
}

function populateBuildingFields() {
  const building = selectedBuilding();
  buildingEditTypeSelect.value = building?.type ?? '';
  document.querySelector('#hayday-building-name').value = building?.name ?? '';
  document.querySelector('#hayday-building-level').value = building?.level ?? '';
  document.querySelector('#hayday-building-image-url').value = building?.image_url ?? '';
}

function renderProducts() {
  const selectedProductId = productSelect.value;
  const building = selectedBuilding();
  const products = state.products.filter((product) => !building || product.building_id === building.id).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(productSelect, products, '--Select a Product--', (product) => product.name);
  if (products.some((product) => String(product.id) === selectedProductId)) productSelect.value = selectedProductId;
  refreshImageDropdown(productSelect, products, '--Select a Product--', 'products', (product) => product.name);
  fillSelect(productBuildingSelect, [...state.buildings].sort((left, right) => left.name.localeCompare(right.name)), '--Building for product--', (building) => building.name);
  const selectedProduct = state.products.find((product) => String(product.id) === productSelect.value);
  productBuildingSelect.value = String(selectedProduct?.building_id ?? building?.id ?? '');
  populateProductFields();
  productCount.textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
  ingredientCount.textContent = `${state.products.length} ingredient products`;
  const ingredientProducts = [...state.products].sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(ingredientSelect, ingredientProducts, '--Select a Product and count--', (product) => product.name);
  refreshImageDropdown(ingredientSelect, ingredientProducts, '--Select a Product and count--', 'products', (product) => product.name);
  renderIngredients();
  setStatus('');
  updateProductManagerControls();
}

function populateProductFields() {
  const product = state.products.find((row) => String(row.id) === productSelect.value);
  document.querySelector('#hayday-product-name').value = product?.name ?? '';
  document.querySelector('#hayday-product-level').value = product?.level ?? '';
  document.querySelector('#hayday-product-minute').value = product?.minute ?? '';
  document.querySelector('#hayday-product-ratio').value = product?.barn_product_ratio ?? '';
  document.querySelector('#hayday-product-image-url').value = product?.image_url ?? '';
}

function renderIngredients() {
  ingredientList.replaceChildren();
  const productId = Number(productSelect.value);
  if (!productId) return;
  const ingredients = state.ingredients.filter((ingredient) => ingredient.product_id === productId);
  ingredients.forEach((ingredient) => {
    const ingredientProduct = state.products.find((product) => product.id === ingredient.ingredient_id);
    const row = document.createElement('div');
    row.className = 'hayday-ingredient-row';
    const iconPath = imageUrl('products', ingredientProduct);
    if (iconPath) {
      const icon = document.createElement('img');
      icon.className = 'hayday-ingredient-icon';
      icon.src = iconPath;
      icon.alt = '';
      icon.loading = 'lazy';
      row.appendChild(icon);
    }
    const label = document.createElement('span');
    label.textContent = `${ingredientProduct?.name ?? `Product #${ingredient.ingredient_id}`}(${ingredient.count})`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'hayday-delete-button';
    remove.textContent = '×';
    remove.title = 'Delete ingredient';
    remove.setAttribute('aria-label', `Delete ${label.textContent}`);
    remove.addEventListener('click', () => void deleteIngredient(ingredient.id));
    row.append(label, remove);
    ingredientList.appendChild(row);
  });
}

async function deleteIngredient(id) {
  try {
    const response = await fetch(`/api/tool/database/hayday/table/ingredient/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to delete ingredient.');
    state.ingredients = state.ingredients.filter((ingredient) => ingredient.id !== id);
    renderIngredients();
    setStatus('Ingredient deleted.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function addIngredient() {
  const productId = Number(productSelect.value);
  const ingredientId = Number(ingredientSelect.value);
  const countInput = document.querySelector('#hayday-ingredient-amount');
  const count = Number(countInput.value);
  if (!productId || !ingredientId || !Number.isInteger(count) || count < 1) {
    setStatus('Select a product, ingredient, and positive count.', true);
    return;
  }
  try {
    const response = await fetch('/api/tool/hayday/ingredient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, ingredientId, count }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to add ingredient.');
    await loadProductData();
    productSelect.value = String(productId);
    renderIngredients();
    countInput.value = '';
    setStatus('Ingredient saved.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveHaydayRecord(entity) {
  const building = selectedBuilding();
  const product = state.products.find((row) => String(row.id) === productSelect.value);
  const buildingType = building ? buildingEditTypeSelect.value : buildingTypeSelect.selectedOptions[0]?.textContent;
  if (entity === 'building' && !buildingType) {
    setStatus('Select a building type first.', true);
    return;
  }
  if (entity === 'product' && !building) {
    setStatus('Select a building first.', true);
    return;
  }
  const payload = entity === 'building'
    ? { id: building?.id, name: document.querySelector('#hayday-building-name').value, level: Number(document.querySelector('#hayday-building-level').value), imageUrl: document.querySelector('#hayday-building-image-url').value, type: buildingType }
    : { id: product?.id, name: document.querySelector('#hayday-product-name').value, level: Number(document.querySelector('#hayday-product-level').value), minute: Number(document.querySelector('#hayday-product-minute').value), barnProductRatio: Number(document.querySelector('#hayday-product-ratio').value), imageUrl: document.querySelector('#hayday-product-image-url').value, buildingId: building?.id ?? product?.building_id };
  const response = await fetch(`/api/tool/hayday/${entity}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Unable to save ${entity}.`);
  await loadProductData();
  setStatus(`${entity[0].toUpperCase() + entity.slice(1)} saved.`);
}

async function deleteHaydayRecord(entity) {
  const record = entity === 'building' ? selectedBuilding() : state.products.find((row) => String(row.id) === productSelect.value);
  if (!record) { setStatus(`Select a ${entity} first.`, true); return; }
  if (!window.confirm(`Delete ${entity} "${record.name}"?`)) return;
  const response = await fetch(`/api/tool/hayday/${entity}/${record.id}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Unable to delete ${entity}.`);
  await loadProductData();
  setStatus(`${entity[0].toUpperCase() + entity.slice(1)} deleted.`);
}

async function loadProductData() {
  try {
    const selectedBuildingType = buildingTypeSelect.selectedOptions[0]?.textContent ?? '';
    const results = await Promise.all(['buildings', 'products', 'ingredients', 'account'].map(async (table) => {
    const tableName = table === 'buildings' ? 'building' : table === 'products' ? 'product' : table === 'ingredients' ? 'ingredient' : table;
    const response = await fetch(`/api/tool/database/hayday/table/${tableName}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to load ${table}.`);
      return [table, result.rows ?? []];
    }));
    results.forEach(([table, rows]) => { state[table === 'account' ? 'accounts' : table] = rows; });
    renderAccounts();
    const types = [...new Set(state.buildings.map((building) => building.type))].sort();
    buildingTypeCount.textContent = `${types.length} type${types.length === 1 ? '' : 's'}`;
    fillSelect(buildingTypeSelect, types.map((type, id) => ({ id, name: type })), '--Select Building Type--', (type) => type.name);
    const matchingType = [...buildingTypeSelect.options].find((option) => option.textContent === selectedBuildingType);
    if (matchingType) buildingTypeSelect.value = matchingType.value;
    renderBuildings();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

document.querySelector('#hayday-account').addEventListener('change', () => {
  const account = state.accounts.find((row) => String(row.id) === document.querySelector('#hayday-account').value);
  document.querySelector('#hayday-account-name').value = account?.name ?? '';
});

async function updateAccountCell(id, column, value) {
  const numeric = ['level', 'barn_capacity', 'silo_capacity', 'bolt', 'plank', 'tape', 'nail', 'screw', 'wood_panel'].includes(column);
  const newValue = numeric ? (value === '' ? 0 : Number(value)) : value;
  const response = await fetch('/api/tool/database/hayday/table/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, column, newValue }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to update account.');
  const account = state.accounts.find((row) => String(row.id) === String(id));
  if (account) {
    account[column] = newValue;
    refreshStorageCalculatedRows(account);
  }
  document.querySelector('#hayday-account-status').textContent = 'Saved.';
}

function refreshStorageCalculatedRows(account) {
  const barnNeed = storageKitNeed(account.barn_capacity);
  const siloNeed = storageKitNeed(account.silo_capacity);
  const barnMissing = [account.bolt, account.plank, account.tape].reduce((sum, value) => sum + Math.max(barnNeed - (value ?? 0), 0), 0);
  const siloMissing = [account.nail, account.screw, account.wood_panel].reduce((sum, value) => sum + Math.max(siloNeed - (value ?? 0), 0), 0);
  const rows = [...document.querySelectorAll('#hayday-account-table tbody tr')];
  const inventory = rows.find((row) => row.dataset.rowId === `${account.id}-inventory`);
  const missing = rows.find((row) => row.dataset.rowId === `${account.id}-missing`);
  const set = (row, column, value) => { const cell = row?.querySelector(`td[data-col-name="${column}"]`); if (cell) cell.textContent = String(value); };
  set(inventory, 'need_each_barn', `${barnNeed} each`);
  set(inventory, 'need_each_silo', `${siloNeed} each`);
  set(missing, 'bolt', Math.max(barnNeed - (account.bolt ?? 0), 0));
  set(missing, 'plank', Math.max(barnNeed - (account.plank ?? 0), 0));
  set(missing, 'tape', Math.max(barnNeed - (account.tape ?? 0), 0));
  set(missing, 'need_each_barn', `${barnMissing} total`);
  set(missing, 'nail', Math.max(siloNeed - (account.nail ?? 0), 0));
  set(missing, 'screw', Math.max(siloNeed - (account.screw ?? 0), 0));
  set(missing, 'wood_panel', Math.max(siloNeed - (account.wood_panel ?? 0), 0));
  set(missing, 'need_each_silo', `${siloMissing} total`);
  const total = rows.find((row) => row.dataset.rowId === 'total');
  ['bolt', 'plank', 'tape', 'nail', 'screw', 'wood_panel'].forEach((column) => set(total, column, inventoryTotal(column)));
}

document.querySelector('#hayday-account-save').addEventListener('click', async () => {
  const account = state.accounts.find((row) => String(row.id) === document.querySelector('#hayday-account').value);
  const payload = {
    id: account?.id,
    name: document.querySelector('#hayday-account-name').value,
  };
  try {
    const response = await fetch('/api/tool/hayday/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save account.');
    await loadProductData(); setStatus('Account saved.');
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
});

document.querySelector('#hayday-account-delete').addEventListener('click', async () => {
  const id = document.querySelector('#hayday-account').value;
  if (!id) return;
  try {
    const response = await fetch(`/api/tool/hayday/account/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to delete account.');
    await loadProductData(); setStatus('Account deleted.');
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
});

function initAnalysis() {
  const capacity = document.querySelector('#hayday-capacity');
  const from = document.querySelector('#hayday-capacity-from');
  const to = document.querySelector('#hayday-capacity-to');
  const kit = document.querySelector('#hayday-kit-number');
  const total = document.querySelector('#hayday-total-kits');
  const values = [];
  for (let value = 50; value <= 10000; value += value < 1000 ? 25 : 50) values.push(value);
  [capacity, from, to].forEach((select) => values.forEach((value) => select.add(new Option(String(value), String(value)))));
  from.value = '50';
  const kits = (value) => value <= 1000 ? value / 25 - 2 : value / 50 + 18;
  capacity.addEventListener('change', () => { kit.textContent = capacity.value ? kits(Number(capacity.value)) : ''; });
  const updateTotal = () => {
    if (!from.value || !to.value) return;
    let sum = 0;
    for (let value = Number(from.value); value <= Number(to.value); value += value < 1000 ? 25 : 50) sum += kits(value);
    total.textContent = String(sum);
  };
  from.addEventListener('change', updateTotal);
  to.addEventListener('change', updateTotal);
  const product = document.querySelector('#hayday-analysis-product');
  fillSelect(product, [...state.products].sort((a, b) => a.name.localeCompare(b.name)), '--Select a product--', (row) => row.name);
  product.addEventListener('change', () => {
    const selected = state.products.find((row) => String(row.id) === product.value);
    document.querySelector('#hayday-ratio-out').value = selected?.barn_product_ratio ?? '';
    document.querySelector('#hayday-selected-product').textContent = selected ? `: ${selected.name}` : '';
  });
  document.querySelector('#hayday-exchange-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const ratioIn = Number(document.querySelector('#hayday-ratio-in').value);
    const ratioOut = Number(document.querySelector('#hayday-ratio-out').value);
    const resultIn = document.querySelector('#hayday-result-in');
    const resultOut = document.querySelector('#hayday-result-out');
    if (!ratioIn || !ratioOut) return;
    if (resultIn.value) resultOut.value = String(Number(resultIn.value) * ratioOut / ratioIn);
    else if (resultOut.value) resultIn.value = String(Number(resultOut.value) * ratioIn / ratioOut);
  });
}

const summaryReports = [
  ['Buildings by level', () => [...state.buildings].sort((a, b) => a.level - b.level)],
  ['Buildings by type', () => [...state.buildings].sort((a, b) => a.type.localeCompare(b.type))],
  ['Products', () => [...state.products].sort((a, b) => a.level - b.level)],
  ['Product ingredient counts', () => state.products.map((p) => ({ product: p.name, ingredient_types: state.ingredients.filter((i) => i.product_id === p.id).length })).filter((row) => row.ingredient_types)],
  ['Products without ingredients', () => state.products.filter((p) => !state.ingredients.some((i) => i.product_id === p.id)).map((p) => ({ product: p.name }))],
  ['Buildings without products', () => state.buildings.filter((b) => !state.products.some((p) => p.building_id === b.id)).map((b) => ({ building: b.name }))],
  ['Buildings, products and ingredients', () => state.ingredients.map((i) => { const p = state.products.find((row) => row.id === i.product_id); const b = state.buildings.find((row) => row.id === p?.building_id); const ingredient = state.products.find((row) => row.id === i.ingredient_id); return { building: b?.name, product: p?.name, ingredient: ingredient?.name, count: i.count }; })],
  ['Find building from product', (value) => state.products.filter((p) => p.name.toLowerCase() === value.toLowerCase()).map((p) => ({ building: state.buildings.find((b) => b.id === p.building_id)?.name, product: p.name })), 'Product name'],
  ['Products with ingredient', (value) => state.ingredients.filter((i) => state.products.find((p) => p.id === i.ingredient_id)?.name.toLowerCase() === value.toLowerCase()).map((i) => ({ product: state.products.find((p) => p.id === i.product_id)?.name, ingredient: value, count: i.count })), 'Ingredient name'],
  ['Products by building type', (value) => state.products.filter((p) => state.buildings.find((b) => b.id === p.building_id)?.type.toLowerCase() === value.toLowerCase()).map((p) => ({ product: p.name, level: p.level })), 'Building type'],
  ['Product machine count', () => state.buildings.filter((b) => b.type.toLowerCase() === 'product machine').map((b) => ({ building: b.name, products: state.products.filter((p) => p.building_id === b.id).length }))],
  ['Type building count', () => state.buildings.reduce((result, b) => { const key = `${b.type}: ${b.name}`; result[key] = (result[key] ?? 0) + state.products.filter((p) => p.building_id === b.id).length; return result; }, {}) && Object.entries(state.buildings.reduce((result, b) => { const key = `${b.type}: ${b.name}`; result[key] = (result[key] ?? 0) + state.products.filter((p) => p.building_id === b.id).length; return result; }, {})).map(([building, products]) => ({ building, products }))],
];

function renderSummary(rows) {
  const target = document.querySelector('#hayday-summary-table');
  target.replaceChildren();
  if (!rows.length) return;
  const table = document.createElement('table'); table.className = 'data-table';
  const columns = Object.keys(rows[0]);
  table.innerHTML = `<thead><tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead>`;
  const body = document.createElement('tbody');
  rows.forEach((row) => { const tr = document.createElement('tr'); columns.forEach((column) => { const td = document.createElement('td'); td.textContent = row[column] ?? ''; tr.appendChild(td); }); body.appendChild(tr); });
  table.appendChild(body); target.appendChild(table);
  document.querySelector('#hayday-summary-count').textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
}

function initSummary() {
  const select = document.querySelector('#hayday-summary-request');
  const param = document.querySelector('#hayday-summary-param');
  summaryReports.forEach(([name]) => select.add(new Option(name, name)));
  select.addEventListener('change', () => {
    const report = summaryReports.find(([name]) => name === select.value);
    param.classList.toggle('hidden', !report?.[2]);
    param.placeholder = report?.[2] ?? 'Search value';
  });
  document.querySelector('#hayday-summary-run').addEventListener('click', () => {
    const report = summaryReports.find(([name]) => name === select.value);
    renderSummary(report ? report[1](param.value.trim()) : []);
  });
}

manageType.addEventListener('change', () => showManagePanel(manageType.value));
buildingTypeSelect.addEventListener('change', renderBuildings);
buildingSelect.addEventListener('change', () => { populateBuildingFields(); renderProducts(); updateProductManagerControls(); });
buildingEditTypeSelect.addEventListener('change', updateProductManagerControls);
productSelect.addEventListener('change', () => {
  populateProductFields();
  const product = state.products.find((row) => String(row.id) === productSelect.value);
  productBuildingSelect.value = String(product?.building_id ?? '');
  renderIngredients();
  updateProductManagerControls();
});
ingredientSelect.addEventListener('change', updateProductManagerControls);
productBuildingSelect.addEventListener('change', updateProductManagerControls);
ingredientBuildingSelect.addEventListener('change', updateProductManagerControls);
document.querySelector('#hayday-ingredient-add').addEventListener('click', () => void addIngredient());
document.querySelector('#hayday-building-save').addEventListener('click', () => void saveHaydayRecord('building').catch((error) => setStatus(error.message, true)));
document.querySelector('#hayday-building-delete').addEventListener('click', () => void deleteHaydayRecord('building').catch((error) => setStatus(error.message, true)));
document.querySelector('#hayday-product-save').addEventListener('click', () => void saveHaydayRecord('product').catch((error) => setStatus(error.message, true)));
document.querySelector('#hayday-product-delete').addEventListener('click', () => void deleteHaydayRecord('product').catch((error) => setStatus(error.message, true)));
showManagePanel('product');
updateProductManagerControls();
void loadProductData().then(() => { initAnalysis(); initSummary(); });
