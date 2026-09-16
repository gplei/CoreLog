import * as CommonTable from './appCommon/commonTable.js';
import {
  buildCsvUploadFormData,
  chooseCsvFiles,
  populateSelect,
  renderCsvAssignmentQueue,
  requestJson,
  requestMultipart,
  setStatus,
  show,
} from './appCommon/moduleCommon.js';

const API_BASE = '/api/transaction';

const elements = {
  message: document.querySelector('#transactionMessage'),
  selOptType: document.querySelector('#selOptType'),
  divOptType: document.querySelector('#divOptType'),
  divCatMgr: document.querySelector('#divCatMgr'),
  divTripMgr: document.querySelector('#divTripMgr'),
  divCsvMappingMgr: document.querySelector('#divCsvMappingMgr'),
  divSourceMgr: document.querySelector('#divSourceMgr'),
  divStagingTable: document.querySelector('#divStagingTable'),
  divStagingControls: document.querySelector('#divStagingControls'),
  divStagingSummary: document.querySelector('#divStagingSummary'),
  divStagingActions: document.querySelector('#divStagingActions'),
  btnChooseStagingFile: document.querySelector('#btnChooseStagingFile'),
  btnStaging: document.querySelector('#btnStaging'),
  btnPurge: document.querySelector('#btnPurge'),
  btnApplyRules: document.querySelector('#btnApplyRules'),
  btnMerge: document.querySelector('#btnMerge'),
  stagingActionStatus: document.querySelector('#stagingActionStatus'),
  divStagingQueue: document.querySelector('#divStagingQueue'),
  selCategoryMgr: document.querySelector('#selCategoryMgr'),
  txtCatMgr: document.querySelector('#txtCatMgr'),
  btnAddUpdCat: document.querySelector('#btnAddUpdCat'),
  selSubcategoryMgr: document.querySelector('#selSubcategoryMgr'),
  txtSubcatMgr: document.querySelector('#txtSubcatMgr'),
  btnAddUpdSubcat: document.querySelector('#btnAddUpdSubcat'),
  txtRuleName: document.querySelector('#txtRuleName'),
  txtRulePattern: document.querySelector('#txtRulePattern'),
  selRuleMatchType: document.querySelector('#selRuleMatchType'),
  selRuleCategory: document.querySelector('#selRuleCategory'),
  selRuleSubcategory: document.querySelector('#selRuleSubcategory'),
  selRuleSource: document.querySelector('#selRuleSource'),
  txtRulePriority: document.querySelector('#txtRulePriority'),
  txtRuleNotes: document.querySelector('#txtRuleNotes'),
  btnAddUpdRule: document.querySelector('#btnAddUpdRule'),
  btnGenerateRules: document.querySelector('#btnGenerateRules'),
  txtRuleStatus: document.querySelector('#txtRuleStatus'),
  divRuleTable: document.querySelector('#divRuleTable'),
  divStagingViewMode: document.querySelector('#divStagingViewMode'),
  txtStagingStatus: document.querySelector('#txtStagingStatus'),
  txtStagingTotal: document.querySelector('#txtStagingTotal'),
  divFilter: document.querySelector('#divFilter'),
  divTransactionViewMode: document.querySelector('#divTransactionViewMode'),
  btnClearFilters: document.querySelector('#btnClearFilters'),
  divTransaction: document.querySelector('#divTransaction'),
  txtFilterDesc: document.querySelector('#txtFilterDesc'),
  selPeriod: document.querySelector('#selPeriod'),
  selTrip: document.querySelector('#selTrip'),
  selType: document.querySelector('#selType'),
  selSource: document.querySelector('#selSource'),
  selCategory: document.querySelector('#selCategory'),
  selSubcategory: document.querySelector('#selSubcategory'),
  txtDesc: document.querySelector('#txtDesc'),
  selCitiSource: document.querySelector('#selCitiSource'),
  btnChooseCitiFile: document.querySelector('#btnChooseCitiFile'),
  citiFileName: document.querySelector('#citiFileName'),
  citiImportStatus: document.querySelector('#citiImportStatus'),
  citiMappingPanel: document.querySelector('#citiMappingPanel'),
  citiStagingColumnRows: document.querySelector('#citiStagingColumnRows'),
  btnAddCitiStagingColumn: document.querySelector('#btnAddCitiStagingColumn'),
  btnRemoveCitiStagingColumn: document.querySelector('#btnRemoveCitiStagingColumn'),
  btnSaveCitiStagingColumns: document.querySelector('#btnSaveCitiStagingColumns'),
  citiStagingColumnStatus: document.querySelector('#citiStagingColumnStatus'),
  citiMappingRows: document.querySelector('#citiMappingRows'),
  btnPreviewCitiMapping: document.querySelector('#btnPreviewCitiMapping'),
  btnSaveCitiMapping: document.querySelector('#btnSaveCitiMapping'),
  citiMappingStatus: document.querySelector('#citiMappingStatus'),
  citiMappingPreview: document.querySelector('#citiMappingPreview'),
};

const state = {
  categories: [],
  categoryTree: [],
  categoryRules: [],
  trips: [],
  sources: [],
  transactions: [],
  transactionLines: [],
  transactionTypes: [],
  renderedTransactions: [],
  filteredTransactions: [],
  stagingEntries: [],
  stagingSeq: 0,
  stagingControlsBound: false,
  stagingStatus: '',
  stagingViewMode: 'matched',
  transactionViewMode: 'detail',
  citiFile: null,
  citiHeaders: [],
  transactionStagingColumns: [],
};

const sourceTypeOptions = [
  { value: 'bank', label: 'bank' },
  { value: 'credit_card', label: 'credit card' },
];

const SPLIT_CATEGORY_IND = '<Split>';
const UNCATEGORIZED = '<Uncategorized>';
const UNSUBCATEGORIZED = '__unsubcategorized__';
const UNSUBCATEGORIZED_LABEL = '<Unsubcategorized>';
const TRANSACTION_PERIODS = ['Year to date', 'Q1', 'Q2', 'Q3', 'Q4', ...Array.from({ length: 5 }, (_, index) => String(new Date().getFullYear() - index - 1))];

function setMessage(message = '', isError = false) {
  setStatus(elements.message, message, isError);
}

function createStagingEntry(file) {
  state.stagingSeq += 1;
  return {
    id: state.stagingSeq,
    file,
    accountId: '',
    status: 'queued',
    message: '',
  };
}

function getStagingViewLabel() {
  return state.stagingViewMode === 'all'
    ? 'Showing all staging rows for all accounts.'
    : 'Showing staging rows on or after each account\'s last transaction date.';
}

function buildCategoryTree(rows) {
  const roots = rows
    .filter((row) => row.parent_id === null || row.parent_id === undefined || row.parent_id === '')
    .map((row) => ({
      value: String(row.id),
      label: String(row.name ?? ''),
      children: [],
    }));

  const sortOptions = (left, right) => String(left.label ?? '').localeCompare(String(right.label ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
  roots.sort(sortOptions);

  const tree = [{ value: '', label: '-- Select category --', children: [] }, ...roots];

  rows.forEach((row) => {
    const parentId = row.parent_id;
    if (parentId === null || parentId === undefined || parentId === '') {
      return;
    }

    const parent = tree.find((item) => String(item.value) === String(parentId));
    if (!parent) return;

    if (!parent.children.some((child) => child.value === '')) {
      parent.children.unshift({ value: '', label: '-- Select subcategory --' });
    }

    parent.children.push({
      value: String(row.id),
      label: String(row.name ?? ''),
      children: [],
    });
  });

  tree.slice(1).forEach((parent) => {
    const placeholder = parent.children.find((child) => child.value === '');
    const children = parent.children.filter((child) => child.value !== '').sort(sortOptions);
    parent.children = placeholder ? [placeholder, ...children] : children;
  });

  return tree;
}

function getSelectedLabel(select) {
  if (!select || select.selectedIndex <= 0) {
    return '';
  }
  return String(select.selectedOptions[0]?.textContent ?? '');
}

function formatYearlyTotals(trips) {
  const totals = new Map();
  for (const trip of trips) {
    const dateValue = String(trip.start_date || trip.created_at || '').trim();
    const dateOnly = dateValue.match(/^(\d{4})-\d{2}-\d{2}/);
    const year = dateOnly ? Number(dateOnly[1]) : new Date(dateValue).getFullYear();
    if (!Number.isFinite(year)) continue;
    totals.set(year, (totals.get(year) ?? 0) + Number(trip.amount ?? 0));
  }

  return [...totals.entries()]
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([year, total]) => `${year}: ${Number(total).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`)
    .join('<br/>');
}

function normalizeDate(value) {
  if (!value) return '';
  const raw = String(value);
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const mdY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) {
    const [, mm, dd, yyyy] = mdY;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const ymd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) {
    return dateOnly[1];
  }

  return trimmed;
}

function normalizeSourceType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'bank') return 'bank';
  if (raw === 'credit card' || raw === 'credit_card' || raw === 'creditcard') return 'credit_card';
  return raw;
}

function formatLocalDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateRangeValue(value) {
  return normalizeDate(value);
}

function filterTranByDates(data, start, end) {
  const startDate = normalizeDateRangeValue(start);
  const endDate = normalizeDateRangeValue(end);
  return data.filter((item) => {
    const time = normalizeDateRangeValue(item.date);
    return time >= startDate && time <= endDate;
  });
}

function getOptId(opt) {
  const raw = String(opt ?? '');
  if (raw === 'category' || raw === 'subcategory' || raw === 'trip' || raw === 'source' || raw === 'account') {
    return `${raw}_id`;
  }
  return raw;
}

async function updateCategoryCell(table, id, newValue) {
  const normalized = String(newValue ?? '').trim();
  if (normalized === SPLIT_CATEGORY_IND) {
    return null;
  }

  const categoryValue = normalized === '' ? null : Number(normalized);
  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table, column: 'category_id', newValue: categoryValue }),
  });
  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table, column: 'subcategory_id', newValue: null }),
  });

  return categoryValue;
}

function buildTransactionMaps() {
  const categoryById = new Map(state.categories.map((category) => [String(category.id), category]));
  const tripById = new Map(state.trips.map((trip) => [String(trip.id), trip]));
  const sourceById = new Map(state.sources.map((source) => [String(source.id), source]));
  const linesByTransactionId = new Map();
  for (const line of state.transactionLines) {
    const key = String(line.transaction_id ?? '');
    if (!linesByTransactionId.has(key)) {
      linesByTransactionId.set(key, []);
    }
    linesByTransactionId.get(key).push(line);
  }

  return { categoryById, tripById, sourceById, linesByTransactionId };
}

function formatCategoryLabel(categoryId, subcategoryId) {
  if (!categoryId && !subcategoryId) return '';
  const category = state.categories.find((item) => String(item.id) === String(categoryId));
  const subcategory = state.categories.find((item) => String(item.id) === String(subcategoryId));
  const categoryName = category?.name ?? '';
  const subcategoryName = subcategory?.name ?? '';
  if (!categoryName && !subcategoryName) return '';
  if (subcategoryName) {
    return `${categoryName}|${subcategoryName}`;
  }
  return categoryName;
}

function buildCategoryOptions() {
  const options = [];
  const roots = state.categoryTree.filter((item) => item.value !== '');
  for (const root of roots) {
    options.push({ value: root.value, label: root.label });
    if (!root.children || root.children.length === 0) {
      continue;
    }
    const children = root.children.filter((item) => item.value !== '');
    for (const child of children) {
      options.push({ value: `${root.value}|${child.value}`, label: `${root.label}|${child.label}` });
    }
  }
  return options;
}

function parseCategorySelection(value) {
  const raw = String(value ?? '');
  if (!raw) return { categoryId: '', subcategoryId: '' };
  if (raw.includes('|')) {
    const [categoryId, subcategoryId] = raw.split('|');
    return { categoryId, subcategoryId };
  }
  return { categoryId: raw, subcategoryId: '' };
}

function buildTransactionRows(rows) {
  const { tripById, sourceById, linesByTransactionId } = buildTransactionMaps();
  const splitCategoryId = state.categories.find((item) => String(item.name ?? '').trim() === SPLIT_CATEGORY_IND)?.id;
  return rows.map((row) => {
    const splitLines = linesByTransactionId.get(String(row.id)) ?? [];
    const isSplit = splitLines.length > 0 || (splitCategoryId !== undefined && String(row.category_id) === String(splitCategoryId));
    const category = isSplit
      ? SPLIT_CATEGORY_IND
      : formatCategoryLabel(row.category_id, row.subcategory_id);
    const trip = tripById.get(String(row.trip_id))?.name ?? '';
    const sourceRecord = sourceById.get(String(row.account_id));
    const source = sourceRecord?.name ?? row.source ?? '';
    const accountFrom = String(row.account_from ?? '');
    const accountTo = String(row.account_to ?? '');
    const note = String(row.note ?? '');
    const description = String(row.description ?? '');
    const type = String(row.type ?? '');

    return {
      id: row.id,
      date: String(row.date ?? ''),
      amount: Number(row.amount ?? 0),
      type,
      category,
      trip,
    account: source,
    account_type: normalizeSourceType(sourceRecord?.type),
      account_from: accountFrom,
      account_to: accountTo,
      description,
      note,
      owner: String(row.owner ?? ''),
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      trip_id: row.trip_id,
      account_id: row.account_id,
      active: row.active,
      __splitLines: splitLines,
    };
  });
}

async function loadTransactionData() {
  const [transactions, transactionLines] = await Promise.all([
    requestJson(`${API_BASE}/table/txn_log`),
    requestJson(`${API_BASE}/table/txn_log_line`),
  ]);

  state.transactions = Array.isArray(transactions)
    ? transactions.slice().sort((left, right) => normalizeDateRangeValue(String(right.date ?? '')).localeCompare(normalizeDateRangeValue(String(left.date ?? ''))))
    : [];
  state.transactionLines = Array.isArray(transactionLines) ? transactionLines.slice() : [];
  state.transactionTypes = [...new Set(state.transactions.map((row) => String(row.type ?? '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function getStartEndDate() {
  const today = new Date();
  const year = today.getFullYear();
  const selectedPeriod = String(elements.selPeriod?.selectedOptions?.[0]?.text ?? '').trim();
  if (selectedPeriod.toLowerCase() === 'year to date') {
    return { startDate: `${year}-01-01`, endDate: formatLocalDateInput(today) };
  }
  if (selectedPeriod.toLowerCase() === 'q1') return { startDate: `${year}-01-01`, endDate: `${year}-03-31` };
  if (selectedPeriod.toLowerCase() === 'q2') return { startDate: `${year}-04-01`, endDate: `${year}-06-30` };
  if (selectedPeriod.toLowerCase() === 'q3') return { startDate: `${year}-07-01`, endDate: `${year}-09-30` };
  if (selectedPeriod.toLowerCase() === 'q4') return { startDate: `${year}-10-01`, endDate: `${year}-12-31` };
  if (/^\d{4}$/.test(selectedPeriod)) return { startDate: `${selectedPeriod}-01-01`, endDate: `${selectedPeriod}-12-31` };
  return { startDate: '2016-01-01', endDate: `${year}-12-31` };
}

function selectedCategoryNode() {
  return state.categoryTree.find((node) => String(node.value) === String(elements.selCategoryMgr?.value ?? ''));
}

function selectedSubcategoryNode() {
  const parent = selectedCategoryNode();
  if (!parent) return null;
  return (parent.children ?? []).find((node) => String(node.value) === String(elements.selSubcategoryMgr?.value ?? ''));
}

function selectedRuleCategoryNode() {
  return state.categoryTree.find((node) => String(node.value) === String(elements.selRuleCategory?.value ?? ''));
}

function selectedRuleSubcategoryNode() {
  const parent = selectedRuleCategoryNode();
  if (!parent) return null;
  return (parent.children ?? []).find((node) => String(node.value) === String(elements.selRuleSubcategory?.value ?? ''));
}

function syncCategoryFields() {
  if (elements.txtCatMgr) {
    elements.txtCatMgr.value = getSelectedLabel(elements.selCategoryMgr);
  }

  const parent = selectedCategoryNode();
  populateSelect(elements.selSubcategoryMgr, parent?.children?.filter((item) => item.value !== '') ?? [], '-- Select subcategory --');

  if (elements.txtSubcatMgr) {
    elements.txtSubcatMgr.value = getSelectedLabel(elements.selSubcategoryMgr);
  }

}

function syncRuleFields() {
  const parent = selectedRuleCategoryNode();
  populateSelect(elements.selRuleSubcategory, parent?.children?.filter((item) => item.value !== '') ?? [], '-- Select subcategory --');
}

function buildCategoryRuleRows(rows) {
  return rows.map((row) => ({
    ...row,
    category: formatCategoryLabel(row.category_id, row.subcategory_id),
    account: String(row.account_id ?? ''),
    rule_name: String(row.rule_name ?? ''),
    pattern: String(row.pattern ?? ''),
    match_type: String(row.match_type ?? 'contains'),
    priority: Number(row.priority ?? 0),
    active: Number(row.active ?? 1),
    stop_after_match: Number(row.stop_after_match ?? 1),
    notes: String(row.notes ?? ''),
  }));
}

function renderCategoryRuleMgr() {
  if (!elements.divRuleTable) return;

  const inactiveRuleCount = state.categoryRules.filter((rule) => Number(rule.active ?? 1) === 0).length;
  if (elements.txtRuleStatus) {
    elements.txtRuleStatus.textContent = `Loaded ${state.categoryRules.length} rule(s) · ${inactiveRuleCount} inactive`;
  }

  const categoryRoots = state.categoryTree.filter((item) => item.value !== '');
  populateSelect(elements.selRuleCategory, [
    { value: UNCATEGORIZED, label: UNCATEGORIZED },
    ...categoryRoots,
  ], '-- Select category --');
  syncRuleFields();
  populateSelect(elements.selRuleSource, state.sources.map((source) => ({
    value: source.id,
    label: source.name,
  })), '-- Any account --');
  if (elements.selRuleMatchType && !elements.selRuleMatchType.value) {
    elements.selRuleMatchType.value = 'contains';
  }
  if (elements.txtRulePriority && !String(elements.txtRulePriority.value ?? '').trim()) {
    elements.txtRulePriority.value = '100';
  }

  elements.divRuleTable.innerHTML = '';

  const ruleRows = buildCategoryRuleRows(state.categoryRules);
  if (ruleRows.length === 0) {
    elements.divRuleTable.innerHTML = '<div class="muted">No category rules yet.</div>';
    return;
  }

  const updateRule = async (id, newValue, column) => {
    column = getOptId(column);
    let value = newValue;

    if (column === 'category') {
      const { categoryId, subcategoryId } = parseCategorySelection(newValue);
      if (!categoryId || String(newValue ?? '') === UNCATEGORIZED) {
        return;
      }
      await requestJson(`${API_BASE}/table`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), table: 'txn_category_rule', column: 'category_id', newValue: Number(categoryId) }),
      });
      await requestJson(`${API_BASE}/table`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), table: 'txn_category_rule', column: 'subcategory_id', newValue: subcategoryId ? Number(subcategoryId) : null }),
      });
      return;
    }

    if (column === 'account_id') {
      value = String(newValue ?? '').trim() === '' ? null : Number(newValue);
    } else if (column === 'priority' || column === 'active' || column === 'stop_after_match' || column === 'category_id' || column === 'subcategory_id') {
      value = String(newValue ?? '').trim() === '' ? null : Number(newValue);
    }

    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_category_rule', column, newValue: value }),
    });
  };

  const deleteRule = async (id) => {
    await requestJson(`${API_BASE}/table/${encodeURIComponent(id)}/txn_category_rule`, {
      method: 'DELETE',
    });
    await loadCategoryData();
    renderCategoryRuleMgr();
  };

  const ruleTable = CommonTable.createTable(ruleRows, {
    table: {
      onchange: updateRule,
      onselect: updateRule,
      ondelete: deleteRule,
      columnListToHide: ['category_id', 'subcategory_id', 'account_id'],
    },
    column: [
      { columnName: 'rule_name' },
      { columnName: 'pattern' },
      {
        columnName: 'match_type',
        type: 'SELECT',
        optionData: [
          { value: 'contains', label: 'contains' },
          { value: 'starts_with', label: 'starts_with' },
          { value: 'equals', label: 'equals' },
          { value: 'regex', label: 'regex' },
        ],
      },
      {
        columnName: 'category',
        type: 'SELECT_SUB',
        optionData: state.categoryTree.filter((item) => item.value !== ''),
      },
      {
        columnName: 'account',
        type: 'SELECT',
        optionData: state.sources.map((source) => ({ value: source.id, label: source.name })),
      },
      { columnName: 'priority' },
      {
        columnName: 'active',
        type: 'SELECT',
        optionData: [
          { value: '1', label: '1' },
          { value: '0', label: '0' },
        ],
      },
      {
        columnName: 'stop_after_match',
        type: 'SELECT',
        optionData: [
          { value: '1', label: '1' },
          { value: '0', label: '0' },
        ],
      },
      { columnName: 'notes' },
    ],
  });

  elements.divRuleTable.appendChild(ruleTable);
}

async function generateCategoryRules() {
  setMessage('Analyzing real transactions and rebuilding rules...');
  const result = await requestJson(`${API_BASE}/category-rules/generate`, { method: 'POST' });
  await loadCategoryData();
  renderCategoryRuleMgr();
  setMessage(`Deleted ${result.deleted ?? 0} old rule(s) and created ${result.created ?? 0} active rule(s).`);
}

async function loadCategoryData() {
  const [categories, rules] = await Promise.all([
    requestJson(`${API_BASE}/table/txn_category`),
    requestJson(`${API_BASE}/table/txn_category_rule`),
  ]);

  state.categories = Array.isArray(categories) ? categories.slice() : [];
  state.categoryRules = Array.isArray(rules) ? rules.slice() : [];
  state.categoryTree = buildCategoryTree(state.categories);

  populateSelect(
    elements.selCategoryMgr,
    state.categoryTree.filter((item) => item.value !== ''),
    '-- Select category --',
  );
  syncCategoryFields();
  syncRuleFields();
  renderCategoryRuleMgr();
}

async function loadTripData() {
  const trips = await requestJson(`${API_BASE}/table/txn_trip`);
  state.trips = Array.isArray(trips)
    ? trips.slice().sort((left, right) => String(right.start_date ?? '').localeCompare(String(left.start_date ?? '')))
    : [];

  const tripCosts = await Promise.all(state.trips.map((trip) => requestJson(`${API_BASE}/tripCost/${encodeURIComponent(trip.id)}`)));
  state.trips = state.trips.map((trip, index) => ({
    ...trip,
    amount: Number(tripCosts[index]?.amount ?? 0),
  }));
}

async function loadSourceData() {
  const sources = await requestJson(`${API_BASE}/table/txn_account`);
  state.sources = Array.isArray(sources)
    ? sources.slice().map((source) => ({
      ...source,
      type: normalizeSourceType(source.type),
    })).sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? '')))
    : [];
  populateStagingSourceSelect();
  populateCitiSourceSelect();
  renderCategoryRuleMgr();
}

function populateCitiSourceSelect() {
  if (!elements.selCitiSource) return;
  const sources = state.sources
    .map((source) => ({ value: source.id, label: source.name }));
  populateSelect(elements.selCitiSource, sources, '-- Select account --');
}

function setCitiImportStatus(message = '', isError = false) {
  setStatus(elements.citiImportStatus, message, isError, 'transaction-staging-status');
}

function setCitiMappingStatus(message = '', isError = false) {
  setStatus(elements.citiMappingStatus, message, isError, 'transaction-staging-status');
}

let transactionStagingColumnOptions = [];

function renderStagingColumnRows(columns = state.transactionStagingColumns) {
  if (!elements.citiStagingColumnRows) return;
  elements.citiStagingColumnRows.replaceChildren();
  columns.forEach((selected) => {
    const row = document.createElement('div');
    row.className = 'csv-staging-column-row';
    const select = document.createElement('select');
    select.className = 'module-control';
    populateSelect(select, transactionStagingColumnOptions.map((column) => ({ value: column, label: column })), '-- select staging column --');
    select.value = selected;
    row.appendChild(select);
    elements.citiStagingColumnRows.appendChild(row);
  });
}

async function loadTransactionStagingColumns() {
  const [savedResult, stagingTableResult] = await Promise.allSettled([
    requestJson('/api/tool/module-staging-columns?module=transaction'),
    requestJson('/api/tool/database/transaction/table/txn_log_stg'),
  ]);
  const saved = savedResult.status === 'fulfilled' ? savedResult.value : { columns: [] };
  const stagingTable = stagingTableResult.status === 'fulfilled' ? stagingTableResult.value : { columns: [] };
  transactionStagingColumnOptions = (stagingTable.columns ?? [])
    .map((column) => String(column))
    .filter((column) => !['id', 'created_at', 'updated_at'].includes(column));
  state.transactionStagingColumns = Array.isArray(saved.columns) ? saved.columns : [];
  renderStagingColumnRows();
}

async function saveTransactionStagingColumns() {
  const columns = [...elements.citiStagingColumnRows.querySelectorAll('select')]
    .map((select) => select.value).filter(Boolean);
  if (new Set(columns).size !== columns.length) throw new Error('Each staging column can only be selected once.');
  const result = await requestJson('/api/tool/module-staging-columns', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module: 'transaction', columns }),
  });
  state.transactionStagingColumns = result.columns ?? columns;
  setStatus(elements.citiStagingColumnStatus, 'Staging columns saved.', false, 'transaction-staging-status');
}

function splitCsvHeader(line) {
  const headers = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      headers.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  headers.push(value.trim());
  return headers.filter(Boolean);
}

function createMappingSelect(headers, selected = '') {
  const select = document.createElement('select');
  select.className = 'module-control';
  populateSelect(select, headers.map((header) => ({ value: header, label: header })), '-- Not mapped --');
  const selectedValue = Array.isArray(selected) ? selected[0] : selected;
  const matchingHeader = headers.find((header) => String(header).trim().toLowerCase() === String(selectedValue ?? '').trim().toLowerCase());
  select.value = matchingHeader ?? '';
  return select;
}

function createRuleTypeSelect(selected = '') {
  const select = document.createElement('select');
  select.className = 'module-control csv-rule-type';
  populateSelect(select, [
    { value: 'direct', label: 'Direct map' },
    { value: 'constant', label: 'Constant' },
    { value: 'math', label: 'Math expression' },
    { value: 'if_else', label: 'If else' },
  ], '--select rule type--');
  select.value = selected;
  return select;
}

function createRuleInput(placeholder, value = '') {
  const input = document.createElement('input');
  input.className = 'module-control';
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function readSourceEnvelope() {
  const accountId = Number(elements.selCitiSource?.value);
  const source = state.sources.find((item) => Number(item.id) === accountId);
  if (!source?.mapping_json) return null;
  try {
    const parsed = JSON.parse(String(source.mapping_json));
    if (!parsed || typeof parsed !== 'object') return null;
    if ((parsed.mapping || parsed.map) && typeof (parsed.mapping || parsed.map) === 'object') {
      return { ...parsed, mapping: parsed.mapping ?? parsed.map };
    }
    const { csv_header, stg_header: _stgHeader, ...mapping } = parsed;
    return { csv_header: csv_header ?? [], mapping };
  } catch {
    return null;
  }
}

function readSourceMapping() {
  return readSourceEnvelope()?.mapping ?? null;
}

function withoutStagingHeader(envelope = {}) {
  const { stg_header: _stgHeader, ...rest } = envelope;
  return rest;
}

function sameHeaders(left = [], right = []) {
  return left.length === right.length
    && left.every((header, index) => String(header).trim().toLowerCase() === String(right[index]).trim().toLowerCase());
}

async function saveCitiHeaders(headers) {
  const accountId = Number(elements.selCitiSource.value);
  if (!Number.isFinite(accountId) || headers.length === 0) return;
  const source = state.sources.find((item) => Number(item.id) === accountId);
  const existing = readSourceEnvelope();
  const savedHeaders = Array.isArray(existing?.csv_header) ? existing.csv_header : [];
  if (savedHeaders.length > 0 && sameHeaders(savedHeaders, headers)) return;
  if (savedHeaders.length > 0 && !window.confirm('The CSV headers differ from the saved headers. Update the saved headers?')) {
    setCitiMappingStatus('CSV headers differ; saved headers were kept.');
    return;
  }
  const envelope = {
    ...withoutStagingHeader(existing ?? {}),
    csv_header: headers,
    mapping: existing?.mapping ?? {},
  };
  const mappingJson = JSON.stringify(envelope);
  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: accountId, table: 'txn_account', column: 'mapping_json', newValue: mappingJson }),
  });
  if (source) source.mapping_json = mappingJson;
  setCitiMappingStatus(savedHeaders.length > 0 ? 'CSV headers updated.' : 'CSV headers saved.');
}

function getMappingType(spec) {
  if (!spec || typeof spec !== 'object') return '';
  if (spec.type) return spec.type;
  if (spec.rules) return 'if_else';
  return spec.column ? 'direct' : '';
}

function getMappingValue(spec) {
  if (!spec || typeof spec !== 'object') return '';
  if (spec.type === 'direct' || spec.column) return String(spec.column ?? '');
  if (spec.type === 'constant') return String(spec.value ?? '');
  if (spec.type === 'math') return String(spec.expression ?? '');
  return '';
}

function renderRuleBuilder(row, field, sourceSelect, existingSpec = null, fixedValue) {
  const rule = row.querySelector('.csv-mapping-rule');
  rule.replaceChildren();
  if (fixedValue !== undefined) {
    row.dataset.fixedMapping = 'true';
    sourceSelect.disabled = true;
    const fixed = document.createElement('span');
    fixed.className = 'csv-fixed-value';
    fixed.textContent = `= ${fixedValue}`;
    rule.appendChild(fixed);
    return;
  }
  const ruleType = createRuleTypeSelect(getMappingType(existingSpec));
  rule.appendChild(ruleType);

  const fields = document.createElement('div');
  fields.className = 'csv-rule-fields csv-expression';
  rule.appendChild(fields);

  const addExpressionPrefix = () => {
    const prefix = document.createElement('span');
    prefix.className = 'csv-expression-prefix';
    prefix.textContent = '=';
    fields.appendChild(prefix);
  };
  const addExpressionWord = (text) => {
    const word = document.createElement('span');
    word.className = 'csv-expression-word';
    word.textContent = text;
    fields.appendChild(word);
  };

  const addLabel = (text) => {
    const label = document.createElement('label');
    label.className = 'csv-rule-field';
    const caption = document.createElement('span');
    caption.textContent = text;
    label.appendChild(caption);
    fields.appendChild(label);
    return label;
  };
  const addSelect = (label, selected = '') => {
    const container = addLabel(label);
    container.appendChild(createMappingSelect(state.citiHeaders, selected));
    return container.querySelector('select');
  };
  const addInput = (label, placeholder, value = '') => {
    const container = addLabel(label);
    container.appendChild(createRuleInput(placeholder, value));
    return container.querySelector('input');
  };

  const renderFields = () => {
    const selectedOperator = fields.querySelector('[data-rule-operator]')?.value ?? 'contains';
    fields.replaceChildren();
    sourceSelect.disabled = state.citiHeaders.length === 0;
    if (!ruleType.value) {
      const hint = document.createElement('span');
      hint.className = 'csv-rule-hint';
      hint.textContent = 'Choose how to create this staging value.';
      fields.appendChild(hint);
    } else if (ruleType.value === 'direct') {
      addExpressionPrefix();
      const hint = document.createElement('span');
      hint.className = 'csv-rule-hint';
      hint.textContent = 'selected CSV column';
      fields.appendChild(hint);
    } else if (ruleType.value === 'math') {
      addExpressionPrefix();
      addInput('Expression', field.key === 'amount' ? '-Debit' : 'Debit - Credit', getMappingValue(existingSpec));
    } else if (ruleType.value === 'constant') {
      addExpressionPrefix();
      addInput('Value', field.key === 'type' ? 'expense' : '', getMappingValue(existingSpec));
    } else {
      const condition = existingSpec?.condition ?? {};
      const thenSpec = existingSpec?.then;
      const elseSpec = existingSpec?.else;
      addExpressionWord('IF');
      addSelect('Condition column', preferredHeader(field.key === 'type'
        ? ['description', 'transaction description', 'merchant']
        : ['debit', 'credit', 'amount']) || condition.column || '');
      const operator = addSelect('Operator');
      operator.dataset.ruleOperator = 'true';
      populateSelect(operator, [
        { value: 'contains', label: 'contains' },
        { value: 'equals', label: 'equals' },
        { value: 'not_empty', label: 'is not empty' },
      ], 'operator');
      operator.value = condition.operator || selectedOperator;
      operator.addEventListener('change', renderFields);
      addInput('Condition value', 'AUTOPAY', condition.value ?? '');
      addExpressionWord('THEN');
      addInput('Then', field.key === 'type' ? 'transfer' : 'Debit', getMappingValue(thenSpec));
      addExpressionWord('ELSE');
      addInput('Else', field.key === 'type' ? 'expense' : 'Credit', getMappingValue(elseSpec));
    }
  };
  const preferredHeader = (names) => state.citiHeaders.find((header) => names.includes(header.toLowerCase())) ?? '';
  ruleType.addEventListener('change', renderFields);
  renderFields();
}

function renderCitiMapping() {
  if (!elements.citiMappingRows) return;
  elements.citiMappingRows.replaceChildren();
  const accountId = Number(elements.selCitiSource.value);
  const selectedSource = state.sources.find((source) => Number(source.id) === accountId);
  const configuredColumns = state.transactionStagingColumns.filter((key) => key !== 'account_id' && key !== 'source');
  const fields = configuredColumns.map((key) => ({
    key,
    label: key,
    transform: key === 'date' ? 'date' : undefined,
  })).concat([
    { key: 'account_id', label: 'account_id', fixedValue: Number.isFinite(accountId) ? String(accountId) : '' },
    { key: 'source', label: 'account', fixedValue: String(selectedSource?.name ?? '') },
  ]);
  const existingMapping = readSourceMapping();
  fields.forEach((field) => {
    const row = document.createElement('div');
    row.className = 'csv-mapping-row';
    const target = document.createElement('span');
    target.className = 'csv-mapping-target';
    target.textContent = field.label;
    target.dataset.mappingKey = field.key;
    row.appendChild(target);

    const existingSpec = existingMapping?.[field.key] ?? null;
    const sourceSelect = createMappingSelect(state.citiHeaders, existingSpec?.column || existingSpec?.csvHeader || existingSpec?.condition?.column || '');
    sourceSelect.dataset.mappingRole = 'source';
    row.appendChild(sourceSelect);
    const rule = document.createElement('div');
    rule.className = 'csv-mapping-rule';
    row.appendChild(rule);
    renderRuleBuilder(row, field, sourceSelect, existingSpec, field.fixedValue);
    elements.citiMappingRows.appendChild(row);
  });
  show(elements.citiMappingPanel, true);
}

function collectCitiMapping() {
  const rows = [...elements.citiMappingRows.querySelectorAll('.csv-mapping-row')];
  const mapping = {};
  rows.forEach((row) => {
    const target = row.querySelector('.csv-mapping-target');
    const field = target?.dataset.mappingKey || target?.textContent;
    if (!field) return;
    const source = row.querySelector('[data-mapping-role="source"]')?.value ?? '';
    const type = row.querySelector('.csv-rule-type')?.value ?? '';
    if (row.dataset.fixedMapping === 'true') {
      const fixedValue = row.querySelector('.csv-fixed-value')?.textContent?.replace(/^=\s*/, '') ?? '';
      mapping[field] = { type: 'constant', value: fixedValue, csvHeader: [], stgHeader: field };
      return;
    }
    if (!type) throw new Error(`Select a rule type for ${field}.`);
    const inputs = [...row.querySelectorAll('.csv-rule-fields input')].map((input) => input.value.trim());
    const selects = [...row.querySelectorAll('.csv-rule-fields select')].map((select) => select.value);
    if (type === 'direct') {
      if (!source) throw new Error(`Select a CSV header for ${field}.`);
      mapping[field] = { type, column: source, csvHeader: source, stgHeader: field, ...(field === 'date' ? { transform: 'date' } : {}), ...(field === 'amount' ? { transform: 'number' } : {}) };
    } else if (type === 'math') {
      mapping[field] = { type, expression: inputs[0] ?? '', csvHeader: state.citiHeaders.filter((header) => (inputs[0] ?? '').toLowerCase().includes(header.toLowerCase())), stgHeader: field, transform: field === 'amount' ? 'number' : undefined };
    } else if (type === 'constant') {
      mapping[field] = { type, value: inputs[0] ?? '', csvHeader: [], stgHeader: field };
    } else {
      mapping[field] = {
        type,
        condition: { column: selects[0] ?? '', operator: selects[1] ?? 'contains', value: inputs[0] ?? '' },
        csvHeader: selects[0] ?? '',
        stgHeader: field,
        then: { type: row.querySelector('.csv-rule-fields input')?.value?.trim() && state.citiHeaders.includes(inputs[1]) ? 'direct' : 'constant', ...(state.citiHeaders.includes(inputs[1]) ? { column: inputs[1] } : { value: inputs[1] ?? '' }) },
        else: { type: state.citiHeaders.includes(inputs[2]) ? 'direct' : 'constant', ...(state.citiHeaders.includes(inputs[2]) ? { column: inputs[2] } : { value: inputs[2] ?? '' }) },
      };
    }
  });
  return mapping;
}

function previewCitiMapping() {
  try {
    const existing = readSourceEnvelope();
    const rows = [...elements.citiMappingRows.querySelectorAll('.csv-mapping-row')];
    const preview = {
      ...withoutStagingHeader(existing ?? {}),
      csv_header: existing?.csv_header ?? [...state.citiHeaders],
      mapping: collectCitiMapping(),
    };
    elements.citiMappingPreview.textContent = JSON.stringify(preview, null, 2);
    setCitiMappingStatus('Mapping preview updated.');
  } catch (error) {
    elements.citiMappingPreview.textContent = '';
    setCitiMappingStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveCitiMapping() {
  const accountId = Number(elements.selCitiSource.value);
  if (!Number.isFinite(accountId)) throw new Error('Select a Citi card account first.');
  const rows = [...elements.citiMappingRows.querySelectorAll('.csv-mapping-row')];
  const existing = readSourceEnvelope();
  const mappingJson = JSON.stringify({
    ...withoutStagingHeader(existing ?? {}),
    csv_header: existing?.csv_header ?? [],
    mapping: collectCitiMapping(),
  });
  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: accountId, table: 'txn_account', column: 'mapping_json', newValue: mappingJson }),
  });
  const source = state.sources.find((item) => Number(item.id) === accountId);
  if (source) source.mapping_json = mappingJson;
  setCitiMappingStatus('Mapping saved.');
}

async function chooseCitiFile() {
  const files = await chooseCsvFiles();
  if (files.length === 0) return;
  if (files.length > 1) {
    throw new Error('Choose one Citi CSV file at a time.');
  }
  state.citiFile = files[0];
  const csvText = await state.citiFile.text();
  const headerLine = csvText.split(/\r?\n/).find((line) => line.trim()) ?? '';
  state.citiHeaders = splitCsvHeader(headerLine);
  elements.citiFileName.textContent = state.citiFile.name;
  await saveCitiHeaders(state.citiHeaders);
  renderCitiMapping();
  setCitiImportStatus('Ready to map.');
}

function populateStagingSourceSelect() {
  renderStagingQueue();
}

function setStagingStatus(message = '', isError = false) {
  state.stagingStatus = message;
  setStatus(elements.txtStagingStatus, message, isError, 'is-error');
}

function updateStagingQueueStatus(fileId, patch) {
  const entry = state.stagingEntries.find((item) => item.id === fileId);
  if (!entry) return;
  Object.assign(entry, patch);
  renderStagingQueue();
}

function renderStagingQueue() {
  renderCsvAssignmentQueue(elements.divStagingQueue, state.stagingEntries, {
    assignmentKey: 'accountId',
    assignmentOptions: state.sources.map((source) => ({ value: source.id, label: source.name })),
    assignmentPlaceholder: '-- Select account --',
    formatStatus: (entry) => {
      if (entry.status === 'error') return { text: `error: ${entry.message || 'staging failed'}`, isError: true };
      if (entry.status === 'matched') return null;
      if (entry.status === 'staged') return `staged (${Number(entry.records ?? 0)} records)`;
      if (entry.status === 'staging') return 'staging...';
      if (entry.message) return entry.message;
      return `queued (${Number(entry.records ?? 0)} records)`;
    },
    onRemove: (entry) => {
      state.stagingEntries = state.stagingEntries.filter((item) => item.id !== entry.id);
      renderStagingQueue();
    },
  });
}

function renderStagingTable() {
  if (!elements.divStagingTable) return;

  elements.divStagingTable.innerHTML = '';
  const stagingRows = state.stagingRows ?? [];
  const sourcesById = new Map(state.sources.map((source) => [String(source.id), source]));
  const getSourceLastTxnDate = (row) => normalizeDate(sourcesById.get(String(row.account_id))?.last_txn_date);
  const getRowDate = (row) => normalizeDate(row.date);
  const isOlderThanSource = (row) => {
    const sourceLastTxnDate = getSourceLastTxnDate(row);
    const rowDate = getRowDate(row);
    return Boolean(sourceLastTxnDate && rowDate && rowDate < sourceLastTxnDate);
  };
  const isMatchSourceDate = (row) => {
    const sourceLastTxnDate = getSourceLastTxnDate(row);
    const rowDate = getRowDate(row);
    return Boolean(sourceLastTxnDate && rowDate && rowDate >= sourceLastTxnDate);
  };
  const fullRows = stagingRows.map((row) => {
    const source = sourcesById.get(String(row.account_id));
    const trip = state.trips.find((item) => String(item.id ?? '') === String(row.trip_id ?? ''));
    const autoNoImport = isOlderThanSource(row);
    const isNoImport = Number(row.import_flag ?? 0) === 0;
    return {
      id: row.id,
      date: String(row.date ?? ''),
      amount: Number(row.amount ?? 0),
      type: String(row.type ?? ''),
      category: formatCategoryLabel(row.category_id, row.subcategory_id),
      trip: trip?.name ?? '',
      account: source?.name ?? row.account_id,
      description: String(row.description ?? ''),
      note: String(row.note ?? ''),
      import_flag: Number(row.import_flag ?? 1),
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      trip_id: row.trip_id,
      account_id: row.account_id,
      account_from: String(row.account_from ?? ''),
      account_to: String(row.account_to ?? ''),
      owner: String(row.owner ?? ''),
      active: row.active,
      last_txn_date: source?.last_txn_date ?? '',
      row_status: isNoImport ? 'no_import' : (autoNoImport ? 'older_than_last_txn_date' : (isMatchSourceDate(row) ? 'match_last_txn_date' : 'keep')),
    };
  });

  const visibleRows = state.stagingViewMode === 'all'
    ? fullRows
    : fullRows.filter((row) => isMatchSourceDate(row));
  const purgeCandidates = fullRows.filter((row) => row.row_status === 'no_import' || row.row_status === 'older_than_last_txn_date').length;
  const uncategorizedRows = fullRows.filter((row) => row.category_id == null || Number(row.category_id) === 0).length;
  if (elements.txtStagingTotal) {
    elements.txtStagingTotal.textContent = `${Number(visibleRows.length)} shown / ${Number(fullRows.length)} total · ${uncategorizedRows} uncategorized · ${purgeCandidates} purge candidate(s)`;
  }

  if (stagingRows.length === 0) {
    elements.divStagingTable.innerHTML = '<div class="transaction-empty-state">No staging data yet</div>';
    return;
  }
  if (visibleRows.length === 0) {
    elements.divStagingTable.innerHTML = state.stagingViewMode === 'all'
      ? '<div>No staging rows available.</div>'
      : '<div>No rows are on or after account last_txn_date.</div>';
    return;
  }

  const updateStagingRow = async (id, newValue, colName) => {
    colName = getOptId(colName);
    let value = newValue;

    if (colName === 'amount') {
      const normalized = String(newValue ?? '').replace(/[^0-9.-]/g, '').trim();
      value = normalized === '' || Number.isNaN(Number(normalized)) ? '0' : String(Number(normalized));
    } else if (colName === 'category_id') {
      const categoryValue = await updateCategoryCell('txn_log_stg', id, newValue);
      if (categoryValue === null && String(newValue ?? '').trim() === SPLIT_CATEGORY_IND) return;
      const stagingRow = state.stagingRows.find((row) => String(row.id) === String(id));
      if (stagingRow) {
        stagingRow.category_id = categoryValue;
        stagingRow.subcategory_id = null;
      }
      return;
    } else if (colName === 'subcategory_id') {
      value = String(newValue ?? '').trim() === '' ? null : Number(newValue);
      colName = 'subcategory_id';
    } else if (colName === 'trip') {
      const trip = state.trips.find((item) => String(item.name ?? '') === String(newValue ?? ''));
      value = trip ? Number(trip.id) : null;
      colName = 'trip_id';
    } else if (colName === 'account_id') {
      const source = state.sources.find((item) => String(item.name ?? '') === String(newValue ?? ''));
      value = source ? Number(source.id) : null;
    } else if (colName === 'import_flag' || colName === 'active') {
      value = String(newValue ?? '').trim() === '' ? 0 : Number(newValue);
    }

    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_log_stg', column: colName, newValue: value }),
    });
    const stagingRow = state.stagingRows.find((row) => String(row.id) === String(id));
    if (stagingRow) stagingRow[colName] = value;
    if (['type', 'subcategory_id', 'trip_id', 'account_id', 'import_flag', 'active'].includes(colName)) return;
    await loadStagingRows();
    renderStagingTable();
  };

  elements.divStagingTable.appendChild(CommonTable.createTable(visibleRows, {
    table: {
      onchange: updateStagingRow,
      onselect: updateStagingRow,
      edit: true,
      columnListToHide: ['account_id', 'category_id', 'subcategory_id', 'trip_id', 'account_from', 'account_to', 'owner', 'active', 'last_txn_date', 'row_status'],
    },
    column: buildTransactionTableColumns({
      includeId: true,
      includeImportFlag: true,
      includeSplitAction: true,
    }),
  }));
}

async function loadStagingRows() {
  state.stagingRows = await requestJson(`${API_BASE}/table/txn_log_stg`);
}

function initTransactionFilterOptions() {
  const periodSelect = elements.selPeriod;
  if (periodSelect) {
    populateSelect(periodSelect, TRANSACTION_PERIODS.map((item) => ({ value: item, label: item })), '-- Select period --');
    periodSelect.selectedIndex = 1;
  }

  populateSelect(elements.selTrip, state.trips.map((trip) => ({
    value: trip.name,
    label: trip.name,
  })), '-- Select trip --');

  const transactionTypes = state.transactionTypes.length > 0
    ? state.transactionTypes
    : ['expense', 'income', 'transfer'];
  populateSelect(elements.selType, transactionTypes.map((type) => ({
    value: type,
    label: type,
  })), '-- Select type --');

  populateSelect(elements.selSource, state.sources.map((source) => ({
    value: source.name,
    label: source.name,
  })), '-- Select account --');

  populateSelect(elements.selCategory, [
    { value: UNCATEGORIZED, label: UNCATEGORIZED },
    ...state.categoryTree.filter((item) => item.value !== ''),
  ], '-- Select category --');
  const categoryRoot = state.categoryTree.find((node) => String(node.value) === String(elements.selCategory?.value ?? ''));
  populateSelect(elements.selSubcategory, [
    { value: UNSUBCATEGORIZED, label: 'Unsubcategorized' },
    ...(categoryRoot?.children?.filter((item) => item.value !== '') ?? []),
  ], '-- Select subcategory --');

}

function syncTransactionCategoryFilter() {
  const selectedCategoryId = elements.selCategory?.value ?? '';
  if (selectedCategoryId === UNCATEGORIZED) {
    populateSelect(elements.selSubcategory, [], '-- Select subcategory --');
    return;
  }

  const parent = state.categoryTree.find((node) => String(node.value) === String(selectedCategoryId));
  populateSelect(elements.selSubcategory, [
    { value: UNSUBCATEGORIZED, label: 'Unsubcategorized' },
    ...(parent?.children?.filter((item) => item.value !== '') ?? []),
  ], '-- Select subcategory --');
}

function getSelectedOptionText(select) {
  return String(select?.selectedOptions?.[0]?.textContent ?? '').trim();
}

function getSelectedOptionValue(select) {
  return String(select?.value ?? '').trim();
}

function getCategoryIdsByLabel(label) {
  const normalized = String(label ?? '').trim();
  if (!normalized || normalized === UNCATEGORIZED || normalized === SPLIT_CATEGORY_IND) {
    return { categoryId: '', subcategoryId: '' };
  }

  const [categoryLabel, subcategoryLabel] = normalized.split('|').map((item) => item.trim());
  const category = state.categories.find((item) => String(item.name ?? '') === categoryLabel && (!item.parent_id || item.parent_id === null || item.parent_id === undefined || item.parent_id === ''));
  if (!subcategoryLabel) {
    return { categoryId: String(category?.id ?? ''), subcategoryId: '' };
  }

  const subcategory = state.categories.find((item) => String(item.name ?? '') === subcategoryLabel && String(item.parent_id ?? '') === String(category?.id ?? ''));
  return {
    categoryId: String(category?.id ?? ''),
    subcategoryId: String(subcategory?.id ?? ''),
  };
}

function buildTransactionFilterRows() {
  const rows = buildTransactionRows(state.transactions);
  let filtered = rows.slice();

  const period = getSelectedOptionValue(elements.selPeriod);
  if (period) {
    const { startDate, endDate } = getStartEndDate();
    filtered = filterTranByDates(filtered, startDate, endDate);
  }

  const tripName = getSelectedOptionValue(elements.selTrip);
  if (tripName) {
    filtered = filtered.filter((row) => String(row.trip ?? '') === tripName);
  }

  const typeValue = String(elements.selType?.value ?? '').trim();
  if (typeValue) {
    filtered = filtered.filter((row) => String(row.type ?? '') === typeValue);
  }

  const sourceName = getSelectedOptionValue(elements.selSource);
  if (sourceName) {
    filtered = filtered.filter((row) => String(row.account ?? '') === sourceName);
  }

  const categoryValue = String(elements.selCategory?.value ?? '').trim();
  const subcategoryValue = String(elements.selSubcategory?.value ?? '').trim();
  if (categoryValue) {
    const splitCategoryId = String(state.categories.find((item) => String(item.name ?? '').trim() === SPLIT_CATEGORY_IND)?.id ?? '');
    if (categoryValue === UNCATEGORIZED) {
      filtered = filtered.filter((row) => row.category !== SPLIT_CATEGORY_IND
        && !String(row.category_id ?? '').trim()
        && !String(row.subcategory_id ?? '').trim());
    } else if (categoryValue === splitCategoryId) {
      filtered = filtered.filter((row) => row.category === SPLIT_CATEGORY_IND);
    } else if (subcategoryValue === UNSUBCATEGORIZED) {
      filtered = filtered.filter((row) => {
        if (row.category === SPLIT_CATEGORY_IND) {
          return (row.__splitLines ?? []).some((line) => String(line.category_id ?? '') === categoryValue
            && !String(line.subcategory_id ?? '').trim());
        }
        return String(row.category_id ?? '') === categoryValue && !String(row.subcategory_id ?? '').trim();
      });
    } else if (subcategoryValue) {
      filtered = filtered.filter((row) => {
        if (row.category === SPLIT_CATEGORY_IND) {
          return (row.__splitLines ?? []).some((line) => String(line.category_id ?? '') === categoryValue
            && String(line.subcategory_id ?? '') === subcategoryValue);
        }
        return String(row.category_id ?? '') === categoryValue && String(row.subcategory_id ?? '') === subcategoryValue;
      });
    } else {
      filtered = filtered.filter((row) => {
        if (row.category === SPLIT_CATEGORY_IND) {
          return (row.__splitLines ?? []).some((line) => String(line.category_id ?? '') === categoryValue);
        }
        return String(row.category_id ?? '') === categoryValue;
      });
    }
  }

  const desc = String(elements.txtDesc?.value ?? '').trim().toLowerCase();
  if (desc) {
    filtered = filtered.filter((row) => String(row.description ?? '').toLowerCase().includes(desc));
  }

  state.filteredTransactions = filtered.slice();
  return filtered;
}

function getTransactionFilterDescription() {
  const parts = [];
  const period = getSelectedOptionValue(elements.selPeriod);
  if (period) parts.push(period);

  const tripName = getSelectedOptionValue(elements.selTrip);
  if (tripName) parts.push(`trip: ${tripName}`);

  const typeValue = String(elements.selType?.value ?? '').trim();
  if (typeValue) parts.push(`type: ${typeValue}`);

  const sourceName = getSelectedOptionValue(elements.selSource);
  if (sourceName) parts.push(`account: ${sourceName}`);

  const categoryValue = String(elements.selCategory?.value ?? '').trim();
  const subcategoryValue = String(elements.selSubcategory?.value ?? '').trim();
  if (categoryValue) {
    if (categoryValue === UNCATEGORIZED) {
      parts.push('category: uncategorized');
    } else if (subcategoryValue) {
      const categoryText = getSelectedOptionText(elements.selCategory);
      const subcategoryText = getSelectedOptionText(elements.selSubcategory);
      parts.push(`category: ${categoryText}${subcategoryText ? ` | ${subcategoryText}` : ''}`);
    } else {
      parts.push(`category: ${getSelectedOptionText(elements.selCategory)}`);
    }
  }

  const desc = String(elements.txtDesc?.value ?? '').trim();
  if (desc) parts.push(`desc: ${desc}`);

  return parts.length > 0 ? parts.join(', ') : 'No filter';
}

function updateTransactionFilterDescription() {
  if (!elements.txtFilterDesc) return;
  elements.txtFilterDesc.textContent = getTransactionFilterDescription();
}

function getSummaryAmount(row, amount = row.amount) {
  const numericAmount = Number(amount ?? 0);
  return String(row.type ?? '').toLowerCase() === 'expense'
    && String(row.account_type ?? '').trim().toLowerCase() === 'bank'
    ? Math.abs(numericAmount)
    : numericAmount;
}

function renderTransactionSummary(data) {
  const summaryHost = elements.divTransaction;
  if (!summaryHost) return;

  const totals = data.reduce((acc, row) => {
    const key = String(row.type ?? '');
    acc[key] = (acc[key] ?? 0) + getSummaryAmount(row);
    return acc;
  }, {});
  const totalSum = Object.entries(totals).map(([key, value]) => `${key}: ${Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`).join(', ');
  const count = document.createElement('span');
  count.className = 'trade-table-status';
  count.textContent = data.length > 0
    ? `There are total ${data.length} transactions with ${totalSum}`
    : 'No transactions match the current filters.';
  summaryHost.appendChild(count);
}

function renderTransactionSummaryTable(data) {
  const divTransaction = elements.divTransaction;
  if (!divTransaction) return;

  const summaryTypes = ['expense', 'income', 'transfer'];
  const summaryRowsByType = new Map(summaryTypes.map((type) => [type, []]));
  const addSummaryAmount = (type, categoryValue, amount) => {
    const summaryRows = summaryRowsByType.get(type);
    if (!summaryRows) return;
    const category = String(categoryValue ?? '').trim() || UNCATEGORIZED;
    const [cat, rawSubcategory = ''] = category.split('|');
    const subcat = rawSubcategory.trim() || UNSUBCATEGORIZED_LABEL;
    let parent = summaryRows.find((item) => item.category === cat);
    if (!parent) {
      parent = { category: cat, amount: 0, children: [] };
      summaryRows.push(parent);
    }
    parent.amount += Number(amount ?? 0);
    const child = parent.children.find((item) => item.subcategory === subcat);
    if (child) {
      child.amount += Number(amount ?? 0);
    } else {
      parent.children.push({ subcategory: subcat, amount: Number(amount ?? 0) });
    }
  };

  data.forEach((row) => {
    const type = String(row.type ?? '').trim().toLowerCase();
    if (!summaryRowsByType.has(type)) return;
    const splitLines = Array.isArray(row.__splitLines) ? row.__splitLines : [];
    if (String(row.category ?? '').trim() === SPLIT_CATEGORY_IND) {
      if (splitLines.length === 0) {
        addSummaryAmount(type, UNCATEGORIZED, getSummaryAmount(row));
        return;
      }
      splitLines.forEach((line) => {
        addSummaryAmount(type,
          formatCategoryLabel(line.category_id, line.subcategory_id),
          getSummaryAmount(row, line.amount),
        );
      });
      return;
    }
    addSummaryAmount(type, row.__categoryLabel || row.category, getSummaryAmount(row));
  });

  divTransaction.innerHTML = '';
  renderTransactionSummary(data);
  summaryTypes.forEach((type) => {
    const section = document.createElement('section');
    const heading = document.createElement('div');
    heading.className = 'module-table-heading';
    const title = document.createElement('span');
    title.className = 'module-section-title';
    title.textContent = `${type.charAt(0).toUpperCase()}${type.slice(1)} Summary`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'module-action-button';
    toggle.textContent = '−';
    toggle.title = 'Collapse summary';
    const content = document.createElement('div');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      toggle.textContent = isExpanded ? '+' : '−';
      toggle.title = isExpanded ? 'Expand summary' : 'Collapse summary';
      content.classList.toggle('hidden', isExpanded);
    });
    heading.append(title, toggle);
    section.appendChild(heading);
    section.appendChild(content);
    divTransaction.appendChild(section);

    const sortedTree = summaryRowsByType.get(type)
      .sort((left, right) => String(left.category ?? '').localeCompare(String(right.category ?? '')))
      .map((node) => ({
        ...node,
        children: node.children.slice().sort((left, right) => String(left.subcategory ?? '').localeCompare(String(right.subcategory ?? ''))),
      }));
    if (sortedTree.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = `No ${type} transactions.`;
      content.appendChild(empty);
      return;
    }

    const catTable = CommonTable.createTable(sortedTree, {
      table: {
        sort: false,
      },
      column: [{ columnName: 'amount', type: 'CURRENCY' }],
    });
    const rows = catTable.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i += 1) {
      const cells = rows[i].querySelectorAll('td');
      cells[2].innerHTML = '';
      const categoryNode = sortedTree.find((node) => node.category === (cells[0].textContent ?? ''));
      if (categoryNode?.children) {
        const childTable = CommonTable.createTable(categoryNode.children, {
          table: {
            style: 'inline',
            thType: 'sub',
            sort: false,
          },
          column: [{ columnName: 'amount', type: 'CURRENCY' }],
        });
        cells[2].appendChild(childTable);
      }
    }
    content.appendChild(catTable);
  });
}

async function updateTransactionRow(id, newValue, column) {
  column = getOptId(column);
  let value = newValue;
  if (column === 'amount') {
    const normalized = String(newValue ?? '').replace(/[^0-9.-]/g, '').trim();
    value = normalized === '' || Number.isNaN(Number(normalized)) ? '0' : String(Number(normalized));
  }

  if (column === 'category_id') {
    await updateCategoryCell('txn_log', id, newValue);
    return;
  }

  if (column === 'subcategory_id') {
    value = String(newValue ?? '').trim() === '' ? null : Number(newValue);
    column = 'subcategory_id';
  }

  if (column === 'trip') {
    const trip = state.trips.find((item) => String(item.name ?? '') === String(newValue ?? ''));
    value = trip ? Number(trip.id) : null;
    column = 'trip_id';
  }

  if (column === 'account_id') {
    const source = state.sources.find((item) => String(item.name ?? '') === String(newValue ?? ''));
    value = source ? Number(source.id) : null;
  }

  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table: 'txn_log', column, newValue: value }),
  });
}

function updateLocalTransactionRow(rows, id, newValue, column) {
  const row = rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  const normalizedColumn = getOptId(column);
  if (normalizedColumn === 'category_id') {
    row.category_id = String(newValue ?? '').trim() === '' ? null : Number(newValue);
    row.subcategory_id = null;
  } else if (normalizedColumn === 'subcategory_id') {
    row.subcategory_id = String(newValue ?? '').trim() === '' ? null : Number(newValue);
  } else if (normalizedColumn === 'trip_id') {
    row.trip_id = state.trips.find((item) => String(item.name ?? '') === String(newValue ?? ''))?.id ?? null;
  } else if (normalizedColumn === 'account_id') {
    row.account_id = state.sources.find((item) => String(item.name ?? '') === String(newValue ?? ''))?.id ?? null;
  } else {
    row[normalizedColumn] = newValue;
  }
}

async function createSplitTable(transactionId) {
  const panel = document.createElement('div');
  panel.className = 'transaction-split-panel';

  const buildSplitData = () => (state.transactionLines ?? [])
    .filter((line) => String(line.transaction_id ?? '') === String(transactionId))
    .map((line) => ({
      id: line.id,
      description: String(line.description ?? ''),
      amount: Number(line.amount ?? 0),
      category: formatCategoryLabel(line.category_id, line.subcategory_id),
      transaction_id: line.transaction_id,
      category_id: line.category_id,
      subcategory_id: line.subcategory_id,
      note: String(line.note ?? ''),
    }));

  const renderSplitTable = () => {
    const splitData = buildSplitData();
    const splitTable = CommonTable.createTable(splitData, {
      table: {
        header: ['id', 'description', 'amount', 'category', 'action'],
        style: 'inline',
        thType: 'sub',
        onchange: updateTranDetail,
        onselect: updateTranDetail,
        edit: true,
        showEmptyTable: true,
        columnListToHide: ['transaction_id', 'category_id', 'subcategory_id', 'note'],
      },
      column: [
        { columnName: 'amount', type: 'CURRENCY' },
        {
          columnName: 'category',
          type: 'SELECT_SUB',
          optionData: state.categoryTree.filter((item) => item.value !== ''),
        },
      ],
    });

    const headerRow = splitTable.querySelector('thead tr');
    const headerCells = headerRow ? Array.from(headerRow.children) : [];
    const actionHeaderCell = headerCells[headerCells.length - 1];
    if (actionHeaderCell) {
      actionHeaderCell.textContent = 'Action';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'module-action-button';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', addTranDetail);
      actionHeaderCell.appendChild(addBtn);
    }

    const rows = Array.from(splitTable.querySelectorAll('tbody tr'));
    rows.forEach((tr) => {
      const td = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'module-action-button';
      delBtn.textContent = '-';
      delBtn.addEventListener('click', async () => {
        const id = tr.cells[0]?.textContent ?? '';
        if (!id) return;
        await deleteTranDetail(id);
      });
      td.appendChild(delBtn);
      tr.appendChild(td);
    });

    panel.replaceChildren(splitTable);
  };

  const refreshAfterChange = async () => {
    await loadTransactionData();
    renderSplitTable();
    applyTransactionFilters();
  };

  const updateTranDetail = async (id, newValue, column) => {
    column = getOptId(column);
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_log_line', column, newValue }),
    });
    const line = state.transactionLines.find((item) => String(item.id) === String(id));
    if (line) line[column] = newValue;
    if (column === 'category_id' || column === 'subcategory_id') return;
    await refreshAfterChange();
  };

  const deleteTranDetail = async (id) => {
    await requestJson(`${API_BASE}/table/${encodeURIComponent(id)}/txn_log_line`, {
      method: 'DELETE',
    });
    await refreshAfterChange();
  };

  const addTranDetail = async () => {
    const result = await requestJson(`${API_BASE}/table/txn_log_line`, { method: 'POST' });
    const lineId = Number(result.id);
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineId, table: 'txn_log_line', column: 'transaction_id', newValue: Number(transactionId) }),
    });
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineId, table: 'txn_log_line', column: 'description', newValue: '' }),
    });
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineId, table: 'txn_log_line', column: 'amount', newValue: 0 }),
    });
    await refreshAfterChange();
  };

  renderSplitTable();
  return panel;
}

function showItemDetail(id, tdSelect) {
  if (!tdSelect || tdSelect.querySelector('.transaction-split-toggle')) {
    return;
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'module-action-button transaction-split-toggle';
  toggle.textContent = '>';
  toggle.addEventListener('click', async () => {
    const existing = tdSelect.querySelector('.transaction-split-panel');
    if (existing) {
      existing.remove();
      toggle.textContent = '>';
      return;
    }

    const splitTable = await createSplitTable(id);
    tdSelect.appendChild(splitTable);
    toggle.textContent = '<';
  });
  tdSelect.appendChild(toggle);
}

function buildCategoryColumn(includeSplitAction = false) {
  return {
    columnName: 'category',
    type: 'SELECT_SUB',
    optionData: state.categoryTree.filter((item) => item.value !== ''),
    categoryPlaceholder: '--select category--',
    subcategoryPlaceholder: '--select subcategory--',
    onValue: includeSplitAction ? {
      value: SPLIT_CATEGORY_IND,
      render: (td, row) => {
        const label = document.createElement('span');
        label.className = 'transaction-split-label';
        label.textContent = SPLIT_CATEGORY_IND;
        td.appendChild(label);
        showItemDetail(row.id, td);
      },
      action: showItemDetail,
    } : undefined,
  };
}

function buildTransactionTableColumns({
  includeId = false,
  includeSplitAction = false,
  includeImportFlag = false,
} = {}) {
  const columns = [];

  if (includeId) {
    columns.push({ columnName: 'id', readOnly: true });
  }

  columns.push(
    { columnName: 'date', type: 'DATE' },
    { columnName: 'amount', type: 'CURRENCY' },
    { columnName: 'type', type: 'SELECT', optionData: state.transactionTypes.map((item) => ({ value: item, label: item })) },
    buildCategoryColumn(includeSplitAction),
    { columnName: 'trip', type: 'SELECT', optionData: state.trips.map((trip) => ({ value: trip.name, label: trip.name })) },
    { columnName: 'account', type: 'SELECT', optionData: state.sources.map((source) => ({ value: source.name, label: source.name })) },
    { columnName: 'description' },
    { columnName: 'note' },
  );

  if (includeImportFlag) {
    columns.push({
      columnName: 'import_flag',
      type: 'SELECT',
      optionData: [
        { value: '1', label: '1' },
        { value: '0', label: '0' },
      ],
    });
  }

  return columns;
}

function renderTransactions(data) {
  state.renderedTransactions = data.slice();
  const divTransaction = elements.divTransaction;
  if (!divTransaction) return;

  divTransaction.innerHTML = '';
  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No transactions match the current filters.';
    divTransaction.appendChild(empty);
    return;
  }

  const updateTransaction = async (id, newValue, column) => {
    const normalizedColumn = getOptId(column);
    await updateTransactionRow(id, newValue, column);
    if (normalizedColumn === 'category_id') {
      return;
    }
    await loadTransactionData();
    applyTransactionFilters();
  };

  const updateTransactionSelect = async (id, newValue, column) => {
    await updateTransactionRow(id, newValue, column);
    updateLocalTransactionRow(state.transactions, id, newValue, column);
  };

  const table = CommonTable.createTable(data, {
    table: {
      columnListToHide: ['account_from', 'account_to', 'category_id', 'subcategory_id', 'trip_id', 'account_id', 'account_type', '__splitLines', '__categoryLabel'],
      onchange: updateTransaction,
      onselect: updateTransactionSelect,
    },
    column: buildTransactionTableColumns({ includeSplitAction: true }),
  });

  const count = document.createElement('span');
  const totalSum = Object.entries(
    data.reduce((acc, cur) => {
      acc[cur.type] = (acc[cur.type] ?? 0) + Number(cur.amount ?? 0);
      return acc;
    }, {}),
  )
    .map(([k, v]) => `${k}: ${Number(v).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`)
    .join(', ');
  count.className = 'trade-table-status';
  count.textContent = `Showing ${data.length} transaction(s)${totalSum ? ` with ${totalSum}` : ''}.`;
  divTransaction.appendChild(count);
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container transaction-fixed-table';
  tableContainer.appendChild(table);
  divTransaction.appendChild(tableContainer);
}

function applyTransactionFilters() {
  const filtered = buildTransactionFilterRows();
  state.filteredTransactions = filtered.slice();
  updateTransactionFilterDescription();
  if (state.transactionViewMode === 'summary') {
    renderTransactionSummaryTable(filtered);
  } else {
    renderTransactions(filtered);
  }
}

function initTransactionWorkbench() {
  if (!elements.divFilter || !elements.divTransaction) return;

  populateSelect(elements.selPeriod, TRANSACTION_PERIODS.map((item) => ({ value: item, label: item })), '-- Select period --');
  if (elements.selPeriod) {
    elements.selPeriod.selectedIndex = 1;
  }
  populateSelect(elements.selTrip, state.trips.map((trip) => ({ value: trip.name, label: trip.name })), '-- Select trip --');
  populateSelect(elements.selType, (state.transactionTypes.length > 0 ? state.transactionTypes : ['expense', 'income', 'transfer']).map((type) => ({ value: type, label: type })), '-- Select type --');
  populateSelect(elements.selSource, state.sources.map((source) => ({ value: source.name, label: source.name })), '-- Select account --');

  const categoryRoots = state.categoryTree.filter((item) => item.value !== '');
  populateSelect(elements.selCategory, [{ value: UNCATEGORIZED, label: UNCATEGORIZED }, ...categoryRoots], '-- Select category --');
  syncTransactionCategoryFilter();

  elements.selPeriod?.addEventListener('change', applyTransactionFilters);
  elements.selTrip?.addEventListener('change', applyTransactionFilters);
  elements.selType?.addEventListener('change', applyTransactionFilters);
  elements.selSource?.addEventListener('change', applyTransactionFilters);
  elements.selCategory?.addEventListener('change', () => {
    syncTransactionCategoryFilter();
    applyTransactionFilters();
  });
  elements.selSubcategory?.addEventListener('change', applyTransactionFilters);
  elements.txtDesc?.addEventListener('blur', applyTransactionFilters);

  elements.btnClearFilters?.addEventListener('click', async () => {
    if (elements.selPeriod) elements.selPeriod.selectedIndex = 0;
    if (elements.selTrip) elements.selTrip.selectedIndex = 0;
    if (elements.selType) elements.selType.selectedIndex = 0;
    if (elements.selSource) elements.selSource.selectedIndex = 0;
    if (elements.selCategory) elements.selCategory.selectedIndex = 0;
    if (elements.selSubcategory) elements.selSubcategory.selectedIndex = 0;
    if (elements.txtDesc) elements.txtDesc.value = '';
    syncTransactionCategoryFilter();
    applyTransactionFilters();
  });

  elements.divTransactionViewMode?.addEventListener('change', (event) => {
    const viewMode = event.target?.value;
    if (viewMode !== 'detail' && viewMode !== 'summary') return;
    state.transactionViewMode = viewMode;
    applyTransactionFilters();
  });

  updateTransactionFilterDescription();
  applyTransactionFilters();
}

function renderTripMgr() {
  if (!elements.divTripMgr) return;

  elements.divTripMgr.innerHTML = '';

  const addTripRow = document.createElement('div');
  addTripRow.className = 'form-row';
  const txtTripName = document.createElement('input');
  txtTripName.type = 'text';
  txtTripName.className = 'module-control';
  txtTripName.placeholder = 'Trip name';
  const btnAddTrip = document.createElement('button');
  btnAddTrip.id = 'btnAddTrip';
  btnAddTrip.type = 'button';
  btnAddTrip.className = 'module-control';
  btnAddTrip.textContent = 'Add Trip';
  btnAddTrip.addEventListener('click', async () => {
    const tripName = txtTripName.value.trim();
    if (!tripName) {
      setMessage('Trip name is required.', true);
      return;
    }

    const result = await requestJson(`${API_BASE}/table/txn_trip`, { method: 'POST' });
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(result.id), table: 'txn_trip', column: 'name', newValue: tripName }),
    });
    txtTripName.value = '';
    await loadTripData();
    renderTripMgr();
  });
  addTripRow.append(txtTripName, btnAddTrip);
  elements.divTripMgr.appendChild(addTripRow);

  const updateTrip = async (id, newValue, column) => {
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_trip', column, newValue }),
    });

    if (column === 'amount' || column === 'name') {
      const tripCost = await requestJson(`${API_BASE}/tripCost/${encodeURIComponent(id)}`);
      await requestJson(`${API_BASE}/table`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), table: 'txn_trip', column: 'amount', newValue: String(tripCost.amount ?? 0) }),
      });
    }

    await loadTripData();
    renderTripMgr();
  };

  const deleteTrip = async (id) => {
    await requestJson(`${API_BASE}/table/${encodeURIComponent(id)}/txn_trip`, {
      method: 'DELETE',
    });
    await loadTripData();
    renderTripMgr();
  };

  const tripTable = CommonTable.createTable(state.trips, {
    table: { onchange: updateTrip, ondelete: deleteTrip },
    column: [
      { columnName: 'days', readOnly: true },
      { columnName: 'amount', type: 'CURRENCY' },
    ],
  });

  const tripTableHost = document.createElement('div');
  tripTableHost.className = 'table-container transaction-fixed-table';
  tripTableHost.appendChild(tripTable);
  elements.divTripMgr.appendChild(tripTableHost);

  const yearSummary = document.createElement('div');
  yearSummary.className = 'transaction-trip-summary';
  yearSummary.innerHTML = `<div class="transaction-trip-summary-title">Yearly totals</div><div class="transaction-trip-summary-values">${formatYearlyTotals(state.trips)}</div>`;
  elements.divTripMgr.appendChild(yearSummary);
}

function renderSourceMgr() {
  if (!elements.divSourceMgr) return;

  let sourceTableHost = elements.divSourceMgr.querySelector('#divSourceTable');
  if (!sourceTableHost) {
    sourceTableHost = document.createElement('div');
    sourceTableHost.id = 'divSourceTable';
    sourceTableHost.className = 'table-container';
    elements.divSourceMgr.prepend(sourceTableHost);
  }

  let sourceForm = elements.divSourceMgr.querySelector('#divSourceForm');
  if (!sourceForm) {
    sourceForm = document.createElement('div');
    sourceForm.id = 'divSourceForm';
    sourceForm.className = 'form-row';
    const txtSourceName = document.createElement('input');
    txtSourceName.type = 'text';
    txtSourceName.className = 'module-control';
    txtSourceName.placeholder = 'Account name';
    const btnAddSource = document.createElement('button');
    btnAddSource.type = 'button';
    btnAddSource.className = 'module-control';
    btnAddSource.textContent = 'Add Account';
    btnAddSource.addEventListener('click', async () => {
      const sourceName = txtSourceName.value.trim();
      if (!sourceName) {
        setMessage('Account name is required.', true);
        return;
      }

      const result = await requestJson(`${API_BASE}/table/txn_account`, { method: 'POST' });
      await requestJson(`${API_BASE}/table`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(result.id), table: 'txn_account', column: 'name', newValue: sourceName }),
      });
      await requestJson(`${API_BASE}/table`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(result.id), table: 'txn_account', column: 'type', newValue: 'bank' }),
      });
      txtSourceName.value = '';
      await loadSourceData();
      renderSourceMgr();
    });
    sourceForm.append(txtSourceName, btnAddSource);
    elements.divSourceMgr.prepend(sourceForm);
  }

  let sourceManagerTitle = elements.divSourceMgr.querySelector('#divSourceManagerTitle');
  if (!sourceManagerTitle) {
    sourceManagerTitle = document.createElement('div');
    sourceManagerTitle.id = 'divSourceManagerTitle';
    sourceManagerTitle.className = 'transaction-manage-subtitle';
    sourceManagerTitle.textContent = 'Account manager';
    elements.divSourceMgr.prepend(sourceManagerTitle);
  }

  const btnChooseFiles = elements.btnChooseStagingFile;
  const btnStaging = elements.btnStaging;
  const btnMerge = elements.btnMerge;
  const btnPurge = elements.btnPurge;
  const btnApplyRules = elements.btnApplyRules;
  const stagingActionStatus = elements.stagingActionStatus;
  const divStagingViewMode = elements.divStagingViewMode;
  const txtStagingStatus = elements.txtStagingStatus;
  const divStagingControls = elements.divStagingControls;
  const divStagingSummary = elements.divStagingSummary;
  const txtStagingTotal = elements.txtStagingTotal;
  const divStagingQueue = elements.divStagingQueue;
  const divStagingActions = elements.divStagingActions;

  const tableHost = elements.divSourceMgr.querySelector('#divStagingTable');

  if (!btnChooseFiles || !btnStaging || !btnPurge || !btnApplyRules || !btnMerge || !stagingActionStatus || !divStagingControls || !divStagingSummary || !txtStagingTotal || !divStagingQueue || !divStagingActions || !txtStagingStatus || !divStagingViewMode) {
    throw new Error('Missing staging controls in transaction.html');
  }

  divStagingControls.replaceChildren(btnChooseFiles, txtStagingStatus);
  divStagingSummary.replaceChildren(divStagingViewMode, txtStagingTotal);

  sourceTableHost.innerHTML = '';

  const runActionWithStatus = async (actionFn, successText) => {
    stagingActionStatus.textContent = '...';
    stagingActionStatus.classList.remove('is-error');
    try {
      const result = await actionFn();
      stagingActionStatus.textContent = typeof successText === 'function' ? successText(result) : successText;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      stagingActionStatus.textContent = `error: ${message}`;
      stagingActionStatus.classList.add('is-error');
      throw error;
    }
  };

  const updateSource = async (id, newValue, column) => {
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_account', column, newValue }),
    });
    await loadSourceData();
    renderSourceMgr();
  };

  const updateSourceSelect = async (id, newValue, column) => {
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), table: 'txn_account', column, newValue }),
    });
    const source = state.sources.find((item) => String(item.id) === String(id));
    if (source) source[column] = newValue;
  };

  const deleteSource = async (id) => {
    await requestJson(`${API_BASE}/table/${encodeURIComponent(id)}/txn_account`, {
      method: 'DELETE',
    });
    await loadSourceData();
    renderSourceMgr();
  };

  const sourceTable = CommonTable.createTable(state.sources, {
    table: { onchange: updateSource, onselect: updateSourceSelect, ondelete: deleteSource },
    column: [
      {
        columnName: 'name',
        onValue: {
          render: (td, row) => {
            td.innerHTML = '';
            if (row.url) {
              const link = document.createElement('a');
              link.href = row.url;
              link.target = '_blank';
              link.rel = 'noreferrer';
              link.className = 'app-link';
              link.textContent = String(row.name ?? '');
              td.appendChild(link);
              return;
            }
            td.textContent = String(row.name ?? '');
          },
        },
      },
      { columnName: 'type', type: 'SELECT', optionData: sourceTypeOptions },
      { columnName: 'last_txn_date', type: 'DATE' },
      { columnName: 'last_merge_date', type: 'DATE' },
      { columnName: 'url', hideInReadMode: true },
      { columnName: 'staging_params', hideInReadMode: true },
      { columnName: 'mapping_json', hideInReadMode: true },
    ],
  });
  sourceTableHost.appendChild(sourceTable);

  const updateImportFlag = async () => {
    await loadStagingRows();
    renderStagingTable();
  };

  if (!state.stagingControlsBound) {
    btnChooseFiles.addEventListener('click', () => chooseMappedStagingFiles().catch((error) => setMessage(error.message, true)));
    btnStaging.addEventListener('click', () => runActionWithStatus(async () => {
      return stageMappedQueuedFiles();
    }, (message) => message || 'staged').catch((error) => setMessage(error.message, true)));
    btnApplyRules.addEventListener('click', () => runActionWithStatus(async () => {
      const result = await requestJson(`${API_BASE}/staging/apply-rules`, { method: 'POST' });
      await loadStagingRows();
      renderStagingTable();
      return result?.message || `applied category rules to ${Number(result?.updated ?? 0)} staging rows`;
    }, (message) => message).catch((error) => setMessage(error.message, true)));
    btnMerge.addEventListener('click', () => runActionWithStatus(async () => {
      return mergeQueuedFiles();
    }, (message) => message || 'merged').catch((error) => setMessage(error.message, true)));
    btnPurge.addEventListener('click', () => runActionWithStatus(async () => {
      return purgeStagingRows();
    }, (message) => message).catch((error) => setMessage(error.message, true)));
    divStagingViewMode.addEventListener('change', (event) => {
      const viewMode = event.target?.value;
      if (viewMode !== 'matched' && viewMode !== 'all') return;
      state.stagingViewMode = viewMode;
      renderStagingTable();
    });
    state.stagingControlsBound = true;
  }

  renderStagingQueue();
  void updateImportFlag;
}

async function saveCategory() {
  const name = elements.txtCatMgr?.value.trim() ?? '';
  if (!name) return;

  const categoryId = elements.selCategoryMgr?.value ?? '';
  let id = categoryId;
  if (!id) {
    const result = await requestJson(`${API_BASE}/table/txn_category`, { method: 'POST' });
    id = String(result.id ?? '');
  }

  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table: 'txn_category', column: 'name', newValue: name }),
  });

  await loadCategoryData();
  if (elements.selCategoryMgr) {
    elements.selCategoryMgr.value = String(id);
    syncCategoryFields();
  }
}

async function saveSubcategory() {
  const categoryId = elements.selCategoryMgr?.value ?? '';
  if (!categoryId) {
    setMessage('Please select a category first.', true);
    return;
  }

  const name = elements.txtSubcatMgr?.value.trim() ?? '';
  if (!name) return;

  const selectedSubcategoryId = elements.selSubcategoryMgr?.value ?? '';
  let id = selectedSubcategoryId;
  if (!id) {
    const result = await requestJson(`${API_BASE}/table/txn_category`, { method: 'POST' });
    id = String(result.id ?? '');
  }

  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table: 'txn_category', column: 'parent_id', newValue: Number(categoryId) }),
  });
  await requestJson(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), table: 'txn_category', column: 'name', newValue: name }),
  });

  await loadCategoryData();
  if (elements.selCategoryMgr) {
    elements.selCategoryMgr.value = String(categoryId);
  }
  if (elements.selSubcategoryMgr) {
    elements.selSubcategoryMgr.value = String(id);
  }
  syncCategoryFields();
}

async function saveCategoryRule() {
  const ruleName = elements.txtRuleName?.value.trim() ?? '';
  const pattern = elements.txtRulePattern?.value.trim() ?? '';
  const categoryId = elements.selRuleCategory?.value ?? '';
  const subcategoryId = elements.selRuleSubcategory?.value ?? '';
  const accountId = elements.selRuleSource?.value ?? '';
  const matchType = elements.selRuleMatchType?.value ?? 'contains';
  const priority = String(elements.txtRulePriority?.value ?? '').trim() || '100';
  const notes = elements.txtRuleNotes?.value.trim() ?? '';

  if (!categoryId || categoryId === UNCATEGORIZED) {
    setMessage('Please select a category for the rule.', true);
    return;
  }
  if (!pattern) {
    setMessage('Rule pattern is required.', true);
    return;
  }

  const result = await requestJson(`${API_BASE}/table/txn_category_rule`, { method: 'POST' });
  const id = Number(result.id ?? 0);
  const payloads = [
    { column: 'rule_name', newValue: ruleName },
    { column: 'pattern', newValue: pattern },
    { column: 'match_type', newValue: matchType },
    { column: 'category_id', newValue: Number(categoryId) },
    { column: 'subcategory_id', newValue: subcategoryId ? Number(subcategoryId) : null },
    { column: 'account_id', newValue: accountId ? Number(accountId) : null },
    { column: 'priority', newValue: Number(priority) },
    { column: 'active', newValue: 1 },
    { column: 'stop_after_match', newValue: 1 },
    { column: 'notes', newValue: notes },
  ];

  for (const payload of payloads) {
    await requestJson(`${API_BASE}/table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, table: 'txn_category_rule', ...payload }),
    });
  }

  if (elements.txtRuleName) elements.txtRuleName.value = '';
  if (elements.txtRulePattern) elements.txtRulePattern.value = '';
  if (elements.selRuleMatchType) elements.selRuleMatchType.value = 'contains';
  if (elements.selRuleSource) elements.selRuleSource.selectedIndex = 0;
  if (elements.txtRulePriority) elements.txtRulePriority.value = '100';
  if (elements.txtRuleNotes) elements.txtRuleNotes.value = '';
  syncRuleFields();

  await loadCategoryData();
  renderCategoryRuleMgr();
}

function bindManageOptions() {
  if (!elements.selOptType) return;

  const syncPanels = () => {
    const selected = elements.selOptType.value;
    const visible = Boolean(selected);
    show(elements.divOptType, visible);
    show(elements.divCatMgr, selected === 'Category');
    show(elements.divTripMgr, selected === 'Trip');
    show(elements.divCsvMappingMgr, selected === 'CSV Mapping');
    show(elements.divSourceMgr, selected === 'Source');
    if (selected === 'Category') {
      syncCategoryFields();
      renderCategoryRuleMgr();
    }
    if (selected === 'Trip') {
      renderTripMgr();
    }
    if (selected === 'CSV Mapping') {
      renderSourceMgr();
      renderStagingColumnRows(state.transactionStagingColumns);
      renderCitiMapping();
      renderStagingTable();
    }
    if (selected === 'Source') {
      renderSourceMgr();
      renderStagingTable();
    }
  };

  elements.selOptType.addEventListener('change', syncPanels);
  syncPanels();
}

function bindCategoryManager() {
  elements.selCategoryMgr?.addEventListener('change', () => {
    syncCategoryFields();
  });

  elements.selSubcategoryMgr?.addEventListener('change', () => {
    if (elements.txtSubcatMgr) {
      elements.txtSubcatMgr.value = getSelectedLabel(elements.selSubcategoryMgr);
    }
  });

  elements.selRuleCategory?.addEventListener('change', () => {
    syncRuleFields();
  });
  elements.selRuleSubcategory?.addEventListener('change', () => {
    syncRuleFields();
  });

  elements.btnAddUpdCat?.addEventListener('click', () => saveCategory().catch((error) => setMessage(error.message, true)));
  elements.btnAddUpdSubcat?.addEventListener('click', () => saveSubcategory().catch((error) => setMessage(error.message, true)));
  elements.btnAddUpdRule?.addEventListener('click', () => saveCategoryRule().catch((error) => setMessage(error.message, true)));
  elements.btnGenerateRules?.addEventListener('click', () => generateCategoryRules().catch((error) => setMessage(error.message, true)));
}

async function chooseStagingFiles() {
  const files = await chooseCsvFiles();
  if (files.length > 0) {
    state.stagingEntries = state.stagingEntries.concat(files.map((file) => createStagingEntry(file)));
    renderStagingQueue();
    return;
  }

  throw new Error('Please choose at least one CSV file.');
}

function readSourceMappingEnvelope(source) {
  if (!source?.mapping_json) return {};
  try {
    const parsed = JSON.parse(String(source.mapping_json));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedHeaderSet(headers) {
  return new Set((headers ?? []).map((header) => String(header).trim().toLowerCase()).filter(Boolean));
}

function csvHeadersMatch(savedHeaders, actualHeaders) {
  const saved = normalizedHeaderSet(savedHeaders);
  const actual = normalizedHeaderSet(actualHeaders);
  return saved.size > 0 && saved.size === actual.size && [...saved].every((header) => actual.has(header));
}

async function identifyCsvSource(file) {
  const csvText = await file.text();
  const headerLine = csvText.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const headers = splitCsvHeader(headerLine);
  const matches = state.sources.filter((source) => {
    const savedHeaders = readSourceMappingEnvelope(source).csv_header;
    return Array.isArray(savedHeaders) && csvHeadersMatch(savedHeaders, headers);
  });
  return { headers, matches };
}

async function chooseMappedStagingFiles() {
  const files = await chooseCsvFiles();
  if (files.length === 0) throw new Error('Please choose at least one CSV file.');

  const entries = await Promise.all(files.map(async (file) => {
    const entry = createStagingEntry(file);
    const { matches } = await identifyCsvSource(file);
    if (matches.length === 1) {
      entry.accountId = String(matches[0].id);
      entry.status = 'matched';
      entry.message = `matched source: ${matches[0].name}`;
    } else if (matches.length > 1) {
      entry.status = 'error';
      entry.message = `ambiguous header; matches: ${matches.map((source) => source.name).join(', ')}`;
    } else {
      entry.status = 'error';
        entry.message = 'no account matched saved CSV header';
    }
    return entry;
  }));
  state.stagingEntries = state.stagingEntries.concat(entries);
  renderStagingQueue();
}

async function stageQueuedFiles() {
  if (state.stagingEntries.length === 0) {
    return 'No CSV files selected';
  }

  const missingSources = state.stagingEntries.filter((entry) => !entry.accountId);
  if (missingSources.length > 0) {
    throw new Error(`Please select an account for ${missingSources.map((entry) => entry.file.name).join(', ')}`);
  }

  const formData = buildCsvUploadFormData(state.stagingEntries, 'accountId', 'accountIds');

  state.stagingEntries = state.stagingEntries.map((entry) => ({ ...entry, status: 'staging', message: '' }));
  renderStagingQueue();

  const results = await requestMultipart(`${API_BASE}/staging`, formData);
  const resultsByName = new Map(Array.isArray(results) ? results.map((item) => [String(item.fileName ?? item.job ?? ''), item]) : []);
  const successCount = Array.isArray(results)
    ? results.filter((item) => item.status === 'success').length
    : 0;
  const totalRecords = Array.isArray(results)
    ? results.reduce((sum, item) => sum + Number(item.records ?? 0), 0)
    : 0;
  const failures = Array.isArray(results)
    ? results.filter((item) => item.status !== 'success').map((item) => item.message || item.fileName || item.job).filter(Boolean)
    : [];

  state.stagingEntries = state.stagingEntries.map((entry) => {
    const result = resultsByName.get(entry.file.name);
    if (!result) {
      return {
        ...entry,
        status: 'error',
        message: 'No response from server',
        records: 0,
      };
    }
    return {
      ...entry,
      status: result.status === 'success' ? 'staged' : 'error',
      message: result.message || '',
      records: Number(result.records ?? 0),
    };
  });
  renderStagingQueue();

  const message = failures.length > 0
    ? `Staging completed with ${totalRecords} records across ${successCount} file(s). Issues: ${failures.join(', ')}`
    : `Staging completed with ${totalRecords} records across ${successCount} file(s).`;
  setMessage(message, failures.length > 0);
  setStagingStatus(message, failures.length > 0);
  await Promise.all([loadSourceData(), loadStagingRows()]);
  renderSourceMgr();
  renderStagingTable();
}

async function stageMappedQueuedFiles() {
  if (state.stagingEntries.length === 0) return 'No CSV files selected';
  const missingSources = state.stagingEntries.filter((entry) => !entry.accountId);
  if (missingSources.length > 0) {
    throw new Error(`Please select an account for ${missingSources.map((entry) => entry.file.name).join(', ')}`);
  }

  const formData = buildCsvUploadFormData(state.stagingEntries, 'accountId', 'accountIds');
  state.stagingEntries = state.stagingEntries.map((entry) => ({ ...entry, status: 'staging', message: '' }));
  renderStagingQueue();

  const results = await requestMultipart(`${API_BASE}/staging/mapped`, formData);
  const resultsByName = new Map(Array.isArray(results) ? results.map((item) => [String(item.fileName ?? ''), item]) : []);
  let successCount = 0;
  let totalRecords = 0;
  const failures = [];
  state.stagingEntries = state.stagingEntries.map((entry) => {
    const result = resultsByName.get(entry.file.name);
    if (!result) return { ...entry, status: 'error', message: 'No response from server', records: 0 };
    const success = result.status === 'success';
    if (success) successCount += 1;
    totalRecords += Number(result.records ?? 0);
    if (!success) failures.push(result.message || result.fileName || entry.file.name);
    return { ...entry, status: success ? 'staged' : 'error', message: result.message || '', records: Number(result.records ?? 0) };
  });
  renderStagingQueue();
  const message = failures.length > 0
    ? `Mapped staging completed with ${totalRecords} records across ${successCount} file(s). Issues: ${failures.join(', ')}`
    : `Mapped staging completed with ${totalRecords} records across ${successCount} file(s).`;
  setMessage(message, failures.length > 0);
  setStagingStatus(message, failures.length > 0);
  await Promise.all([loadSourceData(), loadStagingRows()]);
  renderSourceMgr();
  renderStagingTable();
  return message;
}

async function mergeQueuedFiles() {
  const mergeCount = (state.stagingRows ?? []).filter((row) => Number(row.import_flag ?? 0) === 1).length;
  if (!window.confirm(`${mergeCount} staging row(s) will be merged into transactions. Continue?`)) {
    return 'merge cancelled';
  }

  const result = await requestJson(`${API_BASE}/merge`, {
    method: 'POST',
  });
  await Promise.all([loadSourceData(), loadStagingRows()]);
  renderSourceMgr();
  renderStagingTable();
  return result?.message || `merged ${Number(result?.merged ?? 0)} staging rows`;
}

async function purgeStagingRows() {
  const result = await requestJson(`${API_BASE}/staging/purge`, {
    method: 'POST',
  });
  const message = result?.message || 'Purge completed';
  await Promise.all([loadSourceData(), loadStagingRows()]);
  renderSourceMgr();
  renderStagingTable();
  return message;
}

function arrangeTransactionCsvManager() {
  const workbench = elements.divCsvMappingMgr?.querySelector('.transaction-import-panel');
  const sourceManager = elements.divSourceMgr;
  if (!workbench || !sourceManager || sourceManager.childNodes.length === 0) return;

  const uploadPanel = document.createElement('div');
  uploadPanel.className = 'transaction-import-upload-panel';
  uploadPanel.append(...Array.from(sourceManager.childNodes));
  workbench.appendChild(uploadPanel);

  const mappingLabel = workbench.querySelector('.module-panel-label');
  mappingLabel?.remove();
  const collapsible = document.createElement('details');
  collapsible.className = 'csv-mapping-collapsible';
  collapsible.open = false;
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.textContent = 'CSV mapping';
  const toggle = document.createElement('span');
  toggle.className = 'csv-mapping-toggle';
  toggle.textContent = '>';
  toggle.setAttribute('aria-hidden', 'true');
  summary.append(label, toggle);
  collapsible.addEventListener('toggle', () => {
    toggle.textContent = collapsible.open ? '<' : '>';
  });
  const mappingContent = Array.from(workbench.children).filter((child) => child !== uploadPanel);
  collapsible.append(summary, ...mappingContent);
  workbench.insertBefore(collapsible, uploadPanel ?? null);
  if (uploadPanel) {
    const divider = document.createElement('hr');
    divider.className = 'csv-upload-divider';
    workbench.insertBefore(divider, uploadPanel);
  }
}

async function init() {
  arrangeTransactionCsvManager();
  bindManageOptions();
  bindCategoryManager();
  await loadCategoryData();
  await loadTripData();
  await loadSourceData();
  await loadTransactionStagingColumns();
  await loadTransactionData();
  await loadStagingRows();
  initTransactionWorkbench();
}

elements.btnChooseCitiFile?.addEventListener('click', () => chooseCitiFile().catch((error) => setCitiImportStatus(error.message, true)));
elements.btnAddCitiStagingColumn?.addEventListener('click', () => {
  const columns = [...elements.citiStagingColumnRows.querySelectorAll('select')].map((select) => select.value);
  renderStagingColumnRows([...columns, '']);
});
elements.btnRemoveCitiStagingColumn?.addEventListener('click', () => {
  const rows = [...elements.citiStagingColumnRows.querySelectorAll('.csv-staging-column-row')];
  if (rows.length > 0) rows[rows.length - 1].remove();
});
elements.btnSaveCitiStagingColumns?.addEventListener('click', () => saveTransactionStagingColumns().catch((error) => setStatus(elements.citiStagingColumnStatus, error.message, true, 'transaction-staging-status')));
elements.selCitiSource?.addEventListener('change', () => {
  const envelope = readSourceEnvelope();
  const mapping = envelope?.mapping;
  const mappingFound = Boolean(mapping && typeof mapping === 'object' && Object.keys(mapping).length > 0);
  const savedHeaders = envelope?.csv_header;
  state.citiHeaders = Array.isArray(savedHeaders) ? savedHeaders : [];
  renderCitiMapping();
  setCitiMappingStatus(mappingFound ? 'Mapping found and loaded.' : 'Mapping not found.');
  if (elements.citiMappingPreview) {
    elements.citiMappingPreview.textContent = mappingFound ? JSON.stringify(envelope, null, 2) : 'Mapping not found.';
  }
});
elements.btnPreviewCitiMapping?.addEventListener('click', () => previewCitiMapping());
elements.btnSaveCitiMapping?.addEventListener('click', () => saveCitiMapping().catch((error) => setCitiMappingStatus(error.message, true)));

init().catch((error) => setMessage(error.message, true));
