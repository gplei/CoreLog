function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getColumnSpecMap(featureParam = {}) {
  const map = new Map();
  const defaultSelectHandler = featureParam.table?.onselect ?? featureParam.table?.onchange;
  (featureParam.column ?? []).forEach((spec) => {
    const isSelect = spec.type === 'SELECT' || spec.type === 'SELECT_SUB';
    map.set(spec.columnName, isSelect && !spec.onSelChange && defaultSelectHandler
      ? { ...spec, onSelChange: defaultSelectHandler }
      : spec);
  });
  return map;
}

function normalizeCurrencyValue(rawValue) {
  const normalized = (rawValue ?? '').replace(/[^0-9.-]/g, '').trim();
  if (normalized === '' || Number.isNaN(Number(normalized))) {
    return '';
  }
  return `${Number(normalized)}`;
}

function normalizeSortNumber(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeSortDate(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '') return null;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareSortValues(leftValue, rightValue) {
  const leftNumber = normalizeSortNumber(leftValue);
  const rightNumber = normalizeSortNumber(rightValue);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  const leftDate = normalizeSortDate(leftValue);
  const rightDate = normalizeSortDate(rightValue);
  if (leftDate !== null && rightDate !== null) {
    return leftDate - rightDate;
  }

  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function isUncategorizedValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === ''
    || normalized === '<uncategorized>'
    || normalized === 'uncategorized'
    || normalized === '--select category--';
}

function normalizeColumnName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeColumnMatchName(value) {
  return normalizeColumnName(value).replace(/_id$/, '');
}

function isNoWrapColumn(columnSpec) {
  return Boolean(columnSpec?.nowrap || columnSpec?.type === 'SELECT_SUB');
}

function isColumnDate(columnName, columnSpec) {
  return Boolean((columnSpec && columnSpec.type === 'DATE') || columnName.toLowerCase().includes('date'));
}

function isColumnCurrency(columnName, columnSpec) {
  const currencyNames = ['price', 'cost', 'total', 'value', 'diff', 'gain'];
  return Boolean((columnSpec && columnSpec.type === 'CURRENCY') || currencyNames.some((item) => columnName.toLowerCase().includes(item)));
}

function renderCurrency(td, value) {
  const raw = String(value ?? '');
  const isNumeric = raw.trim() !== '' && !Number.isNaN(Number(raw));
  if (!isNumeric) {
    td.textContent = raw;
    return;
  }

  const amt = Number(raw.trim());
  td.textContent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amt);
  if (amt < 0) {
    td.style.color = 'red';
  }
}

function renderSelect(id, tdSelect, cellValue, columnSpec) {
  const { columnName, optionData, onSelChange } = columnSpec;
  if (!optionData) return;

  tdSelect.innerHTML = '';
  const select = document.createElement('select');
  select.className = 'module-control';
  for (const option of optionData) {
    const opt = document.createElement('option');
    opt.value = String(option.value ?? '');
    opt.textContent = String(option.text ?? option.label ?? option.value ?? '');
    select.appendChild(opt);
  }
  select.value = String(cellValue ?? '');
  if (onSelChange) {
    select.addEventListener('change', async (event) => {
      const newValue = event.target.value;
      tdSelect.dataset.rawValue = String(newValue ?? '');
      const row = tdSelect.closest('tr');
      if (row?.__rowData) row.__rowData[columnName] = newValue;
      await onSelChange(id, newValue, columnName);
    });
  }
  tdSelect.appendChild(select);
}

function renderActionValue(td, row, colName, columnSpec) {
  const onValue = columnSpec?.onValue;
  if (!onValue) return false;
  const value = row[colName];
  const shouldRender = onValue.value === undefined || String(value ?? '') === String(onValue.value ?? '');
  if (!shouldRender) return false;

  td.innerHTML = '';
  if (typeof onValue.render === 'function') {
    onValue.render(td, row, colName, value);
    return true;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'module-action-button';
  button.textContent = String(value ?? onValue.value ?? '');
  button.addEventListener('click', async () => {
    await onValue.action(row.id, row, colName, td);
  });
  td.appendChild(button);
  return true;
}

function renderSelectReadOnly(td, value, columnSpec) {
  const match = (columnSpec.optionData ?? []).find((option) => String(option.value ?? '') === String(value ?? ''));
  td.textContent = String(match?.text ?? match?.label ?? value ?? '');
}

function findSelectSubLabels(value, optionData = []) {
  const [categoryValue = '', subcategoryValue = ''] = String(value ?? '').split('|');
  const category = optionData.find((option) => String(option.value ?? '') === String(categoryValue ?? ''));
  const categoryLabel = String(category?.text ?? category?.label ?? categoryValue ?? '');
  if (!subcategoryValue) {
    return categoryLabel;
  }

  const subcategory = (category?.children ?? []).find((option) => String(option.value ?? '') === String(subcategoryValue ?? ''));
  const subcategoryLabel = String(subcategory?.text ?? subcategory?.label ?? subcategoryValue ?? '');
  if (!categoryLabel && !subcategoryLabel) {
    return '';
  }
  return subcategoryLabel ? `${categoryLabel}|${subcategoryLabel}` : categoryLabel;
}

function getColumnSortValue(row, cell, sortKey, columnSpec) {
  const rawValue = row?.__rowData?.[sortKey] ?? cell?.dataset.rawValue ?? cell?.textContent ?? '';

  if (columnSpec?.type === 'SELECT') {
    const option = (columnSpec.optionData ?? []).find((item) => String(item.value ?? '') === String(rawValue ?? ''));
    return option?.text ?? option?.label ?? rawValue;
  }

  if (columnSpec?.type === 'SELECT_SUB') {
    return findSelectSubLabels(rawValue, columnSpec.optionData ?? []);
  }

  return rawValue;
}

function renderSelectSubReadOnly(td, value, columnSpec, row) {
  td.innerHTML = '';
  const rawValue = String(value ?? '');
  const placeholder = String(columnSpec?.categoryPlaceholder ?? '--select category--');
  const displayValue = rawValue === '<Split>' ? rawValue : (!rawValue ? placeholder : rawValue);
  const [categoryText = '', subcategoryText = ''] = displayValue.split('|');

  const categorySpan = document.createElement('span');
  categorySpan.textContent = categoryText;
  td.appendChild(categorySpan);

  if (subcategoryText) {
    const separatorSpan = document.createElement('span');
    separatorSpan.textContent = '|';
    separatorSpan.style.padding = '0 4px';
    td.appendChild(separatorSpan);

    const subcategorySpan = document.createElement('span');
    subcategorySpan.textContent = subcategoryText;
    td.appendChild(subcategorySpan);
  }

  const onValue = columnSpec?.onValue;
  const actionValue = rawValue === '<Split>' ? rawValue : categoryText;
  if (onValue && String(onValue.value ?? '') === actionValue && typeof onValue.action === 'function') {
    onValue.action(row?.id ?? '', td, true);
  }
}

function createInlineSelect(optionData = [], selectedVal = '', placeholderText = '') {
  const select = document.createElement('select');
  select.className = 'module-control category-subcategory-select';
  const hasExplicitPlaceholder = Array.isArray(optionData)
    && optionData.some((option) => String(option?.value ?? '') === '');
  if (String(placeholderText ?? '') !== '' && !hasExplicitPlaceholder) {
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = String(placeholderText);
    select.appendChild(placeholderOption);
  }
  for (const option of optionData ?? []) {
    const opt = document.createElement('option');
    opt.value = String(option.value ?? '');
    opt.textContent = String(option.text ?? option.label ?? option.textContent ?? option.value ?? '');
    if (Array.isArray(option.children)) {
      opt.dataset.children = '1';
    }
    select.appendChild(opt);
  }

  const normalizedSelectedVal = String(selectedVal ?? '').trim();
  const selectedId = (optionData ?? []).find((option) => String(option.value ?? '').trim() === normalizedSelectedVal || String(option.text ?? option.label ?? option.textContent ?? '').trim() === normalizedSelectedVal)?.value;
  if (selectedId !== undefined) {
    select.value = String(selectedId);
  } else if (String(placeholderText ?? '') !== '' && !hasExplicitPlaceholder) {
    select.value = '';
  }
  return select;
}

export function createCategorySubCellRenderer(config = {}) {
  const {
    isEditable = false,
    columnName = 'category',
    splitLabel = '<Split>',
    getDisplayLabel = (_row, value) => String(value ?? ''),
    getCategoryValue = (row) => String(row.category_id ?? ''),
    getSubcategoryValue = (row) => String(row.subcategory_id ?? ''),
    getCategoryOptions = () => [],
    getSubcategoryOptions = () => [],
    isSplit = () => false,
    onChange,
    onSplitToggle,
    categoryPlaceholder = '--select category--',
    subcategoryPlaceholder = '--select subcategory--',
  } = config;

  return {
    render: (td, row, _colName, value) => {
      td.innerHTML = '';
      const rowId = String(row.id ?? '');

      if (!isEditable) {
        if (isSplit(row)) {
          const text = document.createElement('span');
          text.textContent = splitLabel;
          text.className = 'transaction-split-label';
          td.appendChild(text);

          if (typeof onSplitToggle === 'function') {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'module-action-button';
            toggle.textContent = '>';
            toggle.addEventListener('click', async () => {
              const existing = td.querySelector('.category-subcategory-split-panel');
              if (existing) {
                existing.remove();
                toggle.textContent = '>';
                return;
              }

              const panel = document.createElement('div');
              panel.className = 'category-subcategory-split-panel';
              td.appendChild(panel);
              await onSplitToggle({
                row,
                rowId,
                td,
                panel,
                toggle,
              });
              toggle.textContent = '<';
            });
            td.appendChild(toggle);
          }
          return;
        }

        td.textContent = getDisplayLabel(row, value);
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'category-subcategory-editor';

      const categorySelect = createInlineSelect(getCategoryOptions(row), getCategoryValue(row, value), categoryPlaceholder);
      const subcategorySelect = document.createElement('select');
      subcategorySelect.className = 'module-control category-subcategory-select';

      const appendOption = (select, optionValue, optionLabel) => {
        const opt = document.createElement('option');
        opt.value = String(optionValue ?? '');
        opt.textContent = String(optionLabel ?? optionValue ?? '');
        select.appendChild(opt);
      };

      const syncSubcategoryOptions = () => {
        const selectedCategory = String(categorySelect.value ?? '');
        const subcategoryOptions = getSubcategoryOptions(selectedCategory, row) ?? [];
        subcategorySelect.innerHTML = '';
        appendOption(subcategorySelect, '', subcategoryPlaceholder);
        subcategoryOptions.forEach((option) => appendOption(subcategorySelect, option.value, option.label));
      };

      const saveSelection = async () => {
        if (typeof onChange !== 'function') return;
        const categoryValue = String(categorySelect.value ?? '');
        const subcategoryValue = String(subcategorySelect.value ?? '');
        const combinedValue = categoryValue && subcategoryValue ? `${categoryValue}|${subcategoryValue}` : categoryValue;
        await onChange(rowId, combinedValue, columnName);
      };

      syncSubcategoryOptions();
      subcategorySelect.value = String(getSubcategoryValue(row, value) ?? '');

      categorySelect.addEventListener('change', async () => {
        syncSubcategoryOptions();
        subcategorySelect.value = '';
        await saveSelection();
      });
      subcategorySelect.addEventListener('change', saveSelection);

      wrapper.append(categorySelect, subcategorySelect);
      td.appendChild(wrapper);
    },
  };
}

function renderSelectSub(id, tdSelect, value, columnSpec) {
  const { columnName, optionData, onSelChange, onSelSubChange, onValue } = columnSpec;
  if (!optionData || !onSelChange) return;

  tdSelect.innerHTML = '';
  const rowId = String(tdSelect.dataset.rowId ?? id ?? '');
  tdSelect.dataset.rowId = rowId;
  tdSelect.dataset.rawValue = String(value ?? '');

  const [selectedCat = '', selectedSubcat = ''] = String(value ?? '').split('|');

  const categoryPlaceholder = String(columnSpec?.categoryPlaceholder ?? '--select category--');
  const subcategoryPlaceholder = String(columnSpec?.subcategoryPlaceholder ?? '--select subcategory--');
  const rootOptions = createInlineSelect(optionData, selectedCat, categoryPlaceholder);
  tdSelect.appendChild(rootOptions);

  const createSubcat = (catValue, selectedSubValue = '') => {
    if (String(catValue ?? '') === '<Split>') {
      const existing = tdSelect.querySelectorAll('select')[1];
      if (existing) {
        existing.remove();
      }
      return;
    }

    const subcatData = (optionData ?? []).find((item) => String(item.text ?? item.label ?? item.textContent ?? '') === String(catValue ?? ''))?.children ?? [];
    const existing = tdSelect.querySelectorAll('select')[1];
    if (existing) {
      existing.remove();
    }
    const subSelect = createInlineSelect(subcatData, selectedSubValue, subcategoryPlaceholder);
    tdSelect.appendChild(subSelect);

    subSelect.addEventListener('change', async (event) => {
      const selOpt = event.target;
      const selectedCategoryText = rootOptions.selectedOptions?.[0]?.textContent ?? '';
      const selectedSubText = selOpt?.selectedOptions?.[0]?.textContent ?? '';
      tdSelect.dataset.rawValue = `${selectedCategoryText}|${selectedSubText}`;
      const row = tdSelect.closest('tr');
      if (row?.__rowData) row.__rowData[columnName] = tdSelect.dataset.rawValue;
      if (onSelSubChange) {
        await onSelSubChange(rowId, (event.target).value, `sub${columnName}`, columnSpec, tdSelect);
      } else {
        await onSelChange(rowId, (event.target).value, `sub${columnName}`, columnSpec, tdSelect);
      }
    });
  };

  rootOptions.addEventListener('change', async (event) => {
    const selOpt = event.target;
    const newValue = selOpt.value;
    const selectedCategoryText = selOpt.selectedOptions?.[0]?.textContent ?? '';
    tdSelect.dataset.rawValue = selectedCategoryText;
    const row = tdSelect.closest('tr');
    if (row?.__rowData) row.__rowData[columnName] = selectedCategoryText;
    await onSelChange(rowId, newValue, columnName, columnSpec, tdSelect);
    createSubcat(selectedCategoryText, '');
  });

  createSubcat(selectedCat, selectedSubcat);

  if (onValue && onValue.value === selectedCat) {
    onValue.action(rowId, tdSelect);
  }
}

function renderDate(td, value, columnName, onchange) {
  td.innerHTML = '';
  const input = document.createElement('input');
  input.className = 'module-control';
  input.type = 'date';
  input.value = String(value ?? '');
  input.addEventListener('change', async () => {
    if (onchange) {
      await onchange(td.dataset.rowId ?? '', input.value, columnName);
    }
  });
  td.appendChild(input);
}

function enableCellEdit(row, column = [], bEdit = false, featureParam = {}) {
  const thRow = row?.parentElement?.parentElement?.querySelector('thead tr');
  if (!thRow) return;
  const keyName = featureParam.table?.keyName ?? 'id';
  const resolvedColumns = Array.from(getColumnSpecMap(featureParam).values());

  Array.from(row.cells).forEach((cell, index) => {
    const headerText = thRow.children[index]?.textContent?.trim() ?? '';
    const colName = normalizeColumnMatchName(headerText);
    const configuredColumnName = cell.dataset.colName ?? '';
    const columnSpec = resolvedColumns.find((spec) => spec.columnName === configuredColumnName)
      ?? resolvedColumns.find((spec) => normalizeColumnMatchName(spec.columnName) === colName);
    const updateColumnName = columnSpec?.columnName || configuredColumnName || colName;

    if (columnSpec?.hideInReadMode === true) {
      cell.classList.toggle('table-column-hidden', !bEdit);
      thRow.children[index]?.classList.toggle('table-column-hidden', !bEdit);
    }

    if (columnSpec?.type === 'SELECT') {
      if (bEdit) {
        const currentValue = cell.dataset.rawValue ?? cell.textContent ?? '';
        renderSelect(cell.dataset.rowId ?? '', cell, currentValue, columnSpec);
      } else {
        const currentValue = cell.dataset.rawValue ?? cell.textContent ?? '';
        renderSelectReadOnly(cell, currentValue, columnSpec);
      }
    } else if (columnSpec?.type === 'SELECT_SUB') {
      if (bEdit) {
        const currentValue = cell.dataset.rawValue ?? cell.textContent ?? '';
        renderSelectSub(cell.dataset.rowId ?? '', cell, currentValue, columnSpec);
      } else {
        const currentValue = cell.dataset.rawValue ?? cell.textContent ?? '';
        renderSelectSubReadOnly(cell, currentValue, columnSpec, row);
      }
    } else if (isColumnDate(colName, columnSpec) && columnSpec?.readOnly !== true) {
      if (bEdit) {
        renderDate(cell, cell.textContent ?? '', updateColumnName, featureParam.table?.onchange);
      } else {
        const input = cell.querySelector('input');
        cell.textContent = input?.value || cell.textContent || '';
      }
    }

    if (bEdit) {
      cell.contentEditable = String(colName !== normalizeColumnMatchName(keyName) && !isColumnDate(colName, columnSpec) && columnSpec?.readOnly !== true);
      if (!cell.dataset.rowId) {
        cell.dataset.rowId = String(row.dataset.rowId ?? row.cells[0]?.textContent ?? '');
      }
      if (!cell.dataset.colName) {
        cell.dataset.colName = updateColumnName;
      }
      if (cell.dataset.colName !== keyName) {
        cell.dataset.editable = '1';
      }
      if (!cell.dataset.currency && isColumnCurrency(colName, columnSpec)) {
        cell.dataset.currency = '1';
      }
    } else {
      cell.contentEditable = 'false';
    }
  });
}

function attachEditableCellFocusoutHandler(tbody, onchange) {
  if (!onchange || tbody.dataset.focusoutBound === '1') return;

  tbody.addEventListener('focusout', async (event) => {
    const target = event.target;
    const td = target?.closest?.('td');
    if (!td) return;
    if (!td.isContentEditable && td.dataset.editable !== '1') return;

    const tr = td.parentElement;
    if (!tr || td.closest('tbody') !== tbody) return;
    if (td.querySelector('select') || td.querySelector('input')) return;

    const rowId = td.dataset.rowId ?? tr.dataset.rowId ?? tr.cells[0]?.textContent?.trim() ?? '';
    const colNameFromDataset = td.dataset.colName ?? '';
    const colIndex = Array.from(tr.cells).indexOf(td);
    const headerText = colIndex >= 0 ? (tbody.parentElement?.querySelectorAll('thead th')[colIndex]?.textContent ?? '') : '';
    const colName = normalizeColumnMatchName(colNameFromDataset || headerText);
    if (!rowId || !colName || colName.toLowerCase() === 'action') return;

    let newValue = td.textContent ?? '';
    if (td.dataset.currency === '1' || isColumnCurrency(colName)) {
      newValue = normalizeCurrencyValue(newValue);
    }
    try {
      await onchange(rowId, newValue, colName);
    } catch (error) {
      console.error(error);
    }
  });

  tbody.dataset.focusoutBound = '1';
}

function createActionCell(id, featureParam = {}) {
  const td = document.createElement('td');
  td.style.whiteSpace = 'nowrap';

  if (featureParam.table?.onchange) {
    const editBtn = document.createElement('button');
    editBtn.className = 'module-action-button';
    editBtn.type = 'button';
    editBtn.textContent = 'edit';
    editBtn.addEventListener('click', (event) => {
      const btn = event.target;
      const row = btn.parentElement?.parentElement;
      if (btn.textContent === 'edit') {
        btn.textContent = 'done';
        enableCellEdit(row, featureParam?.column, true, featureParam);
      } else {
        btn.textContent = 'edit';
        enableCellEdit(row, featureParam?.column, false, featureParam);
      }
    });
    td.appendChild(editBtn);
  }

  if (featureParam.table?.ondelete) {
    const delBtn = document.createElement('button');
    delBtn.className = 'module-action-button';
    delBtn.type = 'button';
    delBtn.textContent = 'del';
    delBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this row?')) {
        const row = delBtn.parentElement?.parentElement;
        row?.parentElement?.removeChild(row);
        await featureParam.table.ondelete(id);
      }
    });
    td.appendChild(delBtn);
  }

  return td;
}

function createRow(row, featureParam = {}, columnSpecMap = getColumnSpecMap(featureParam), rowIndex = 0) {
  const isTableEditable = featureParam.table?.edit === true
    && (typeof featureParam.table?.rowEditable !== 'function' || featureParam.table.rowEditable(row));
  const ondelete = featureParam.table?.ondelete;
  const onchange = featureParam.table?.onchange;
  const tr = document.createElement('tr');
  const rowId = row.__rowId ?? row.id ?? '';
  tr.dataset.rowId = String(rowId);
  tr.dataset.sortIndex = String(rowIndex);
  Object.defineProperty(tr, '__rowData', {
    value: row,
    enumerable: false,
    configurable: true,
  });

  Object.entries(row).forEach(([colName, colVal], index) => {
    if (colName === '__rowId') return;
    const keyName = featureParam.table?.keyName ?? 'id';
    const value = colVal?.toString?.() ?? '';
    const columnSpec = columnSpecMap.get(colName);
    const td = document.createElement('td');
    td.classList.add(`data-table-cell-${normalizeColumnName(colName)}`);
    if (value) td.title = value;

    if (columnSpec?.hideInReadMode === true && !isTableEditable) {
      td.classList.add('table-column-hidden');
    }

    if (isNoWrapColumn(columnSpec)) {
      td.classList.add('table-nowrap');
    }

    if (columnSpec?.enableColor && value.includes('-')) {
      td.style.color = 'red';
    }

    if (columnSpec?.style?.includes('bold')) {
      const textOnly = value.replace(/<[^>]*>/g, '').trim();
      if (textOnly === 'Total') {
        tr.style.fontWeight = 'bold';
      }
    }

    const canEditCell = !(colName === keyName || isColumnDate(colName, columnSpec) || columnSpec?.readOnly === true);
    const isTdEditable = isTableEditable && canEditCell;

    if (renderActionValue(td, row, colName, columnSpec)) {
      // custom value renderer handled the cell
    } else if (columnSpec?.type === 'SELECT') {
      if (isTdEditable) {
        renderSelect(String(rowId), td, value, columnSpec);
      } else {
        renderSelectReadOnly(td, value, columnSpec);
      }
    } else if (columnSpec?.type === 'SELECT_SUB') {
      if (isTdEditable) {
        renderSelectSub(String(rowId), td, value, columnSpec);
      } else {
        renderSelectSubReadOnly(td, value, columnSpec, row);
      }
    } else if (isColumnDate(colName, columnSpec)) {
      td.textContent = value;
    } else if (isColumnCurrency(colName, columnSpec)) {
      renderCurrency(td, value);
    } else {
      td.textContent = value;
    }

    td.contentEditable = String(isTdEditable);
    if (isColumnCurrency(colName, columnSpec)) {
      td.dataset.currency = '1';
    }
    td.dataset.rowId = String(rowId);
    td.dataset.colName = colName;
    if (columnSpec?.type === 'SELECT') {
      td.dataset.rawValue = value;
    }
    if (columnSpec?.type === 'SELECT_SUB') {
      td.dataset.rawValue = value;
    }
    if (canEditCell && onchange) {
      td.dataset.editable = '1';
    }
    tr.appendChild(td);
  });

  if (featureParam.table?.actions !== false && isTableEditable !== true && (onchange || ondelete)) {
    tr.appendChild(createActionCell(String(rowId), featureParam));
  }
  return tr;
}

function createRows(tbody, data, featureParam = {}, columnSpecMap = getColumnSpecMap(featureParam)) {
  attachEditableCellFocusoutHandler(tbody, featureParam.table?.onchange);
  const fragment = document.createDocumentFragment();
  data.forEach((row, index) => fragment.appendChild(createRow(row, featureParam, columnSpecMap, index)));
  tbody.appendChild(fragment);
}

function createHeader(data, featureParam = {}, columnOrder = []) {
  const ondelete = featureParam.table?.ondelete ?? false;
  const onchange = featureParam.table?.onchange;

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  let headers = featureParam.table?.header;
  if (!headers) {
    headers = Object.keys(data[0]);
  }
  headers.forEach((header, index) => {
    const th = document.createElement('th');
    const columnSpec = featureParam.column?.find((spec) => normalizeColumnMatchName(spec.columnName) === normalizeColumnMatchName(header));
    if (columnSpec?.hideInReadMode === true && featureParam.table?.edit !== true) {
      th.classList.add('table-column-hidden');
    }
    if (featureParam.table?.thType) {
      th.setAttribute('type', featureParam.table.thType);
    }
    const headerWrap = document.createElement('span');
    headerWrap.className = 'data-table-header-label';
    headerWrap.textContent = columnSpec?.label ?? header;
    th.appendChild(headerWrap);
    if (featureParam.table?.resize !== false) {
      const handle = document.createElement('span');
      handle.className = 'data-table-resize-handle';
      handle.title = 'Resize column';
      th.appendChild(handle);
    }
    if (featureParam.table?.sort !== false && index < columnOrder.length) {
      th.classList.add('sortable');
      th.dataset.sortKey = columnOrder[index];
      th.dataset.sortDirection = 'none';
      const columnSpec = featureParam.column?.find((spec) => normalizeColumnMatchName(spec.columnName) === normalizeColumnMatchName(columnOrder[index]));
      if (isNoWrapColumn(columnSpec)) {
        th.classList.add('table-nowrap');
      }
    }
    tr.appendChild(th);
  });

  if (featureParam.table?.actions !== false && !featureParam.table?.edit && (ondelete || onchange)) {
    const th = document.createElement('th');
    th.textContent = 'Action';
    tr.appendChild(th);
  }
  thead.append(tr);
  return thead;
}

export function createTable(data, featureParam = {}) {
  const table = document.createElement('table');
  table.classList.add('data-table');
  if (featureParam.table?.showEmptyTable === true && !featureParam.table?.header && (!data || data.length === 0)) {
    table.innerHTML = '<div>No data to display</div>';
    return table;
  }
  if ((!data || data.length === 0) && featureParam.table?.showEmptyTable !== true) {
    table.innerHTML = '<div>No data to display</div>';
    return table;
  }

  const columnListToHide = featureParam.table?.columnListToHide ?? [];
  const rowData = data.map((item) => {
    const newRow = { ...item };
    const rowId = newRow[featureParam.table?.keyName ?? 'id'];
    Object.defineProperty(newRow, '__rowId', {
      value: rowId,
      enumerable: false,
      configurable: true,
    });
    ['created_at', 'updated_at', ...columnListToHide].forEach((col) => delete newRow[col]);
    return newRow;
  });
  const columnOrder = rowData[0] ? Object.keys(rowData[0]).filter((column) => column !== '__rowId') : [];

  const thead = createHeader(rowData, featureParam, columnOrder);
  const tbody = document.createElement('tbody');
  createRows(tbody, rowData, featureParam, getColumnSpecMap(featureParam));
  const colgroup = document.createElement('colgroup');
  const totalColumns = columnOrder.length + (featureParam.table?.actions !== false && featureParam.table?.edit !== true && (featureParam.table?.onchange || featureParam.table?.ondelete) ? 1 : 0);
  for (let index = 0; index < totalColumns; index += 1) {
    const col = document.createElement('col');
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);
  table.appendChild(thead);
  table.appendChild(tbody);

  const sortState = { columnIndex: -1, direction: 'asc' };
  const headerCells = Array.from(thead.querySelectorAll('th'));

  const updateSortIndicators = () => {
    headerCells.forEach((th, index) => {
      if (!th.classList.contains('sortable')) return;
      th.dataset.sortDirection = index === sortState.columnIndex ? sortState.direction : 'none';
    });
  };

  const sortByColumn = (columnIndex) => {
    if (columnIndex < 0 || columnIndex >= columnOrder.length) return;
    const currentDirection = sortState.columnIndex === columnIndex && sortState.direction === 'asc' ? 'desc' : 'asc';
    sortState.columnIndex = columnIndex;
    sortState.direction = currentDirection;

    const sortKey = columnOrder[columnIndex];
    const columnSpec = getColumnSpecMap(featureParam).get(sortKey);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((leftRow, rightRow) => {
      const leftValue = getColumnSortValue(leftRow, leftRow.cells[columnIndex], sortKey, columnSpec);
      const rightValue = getColumnSortValue(rightRow, rightRow.cells[columnIndex], sortKey, columnSpec);
      if (sortKey === 'category') {
        const leftUncategorized = isUncategorizedValue(leftValue);
        const rightUncategorized = isUncategorizedValue(rightValue);
        if (leftUncategorized !== rightUncategorized) {
          return leftUncategorized ? -1 : 1;
        }
      }
      const leftEmpty = String(leftValue ?? '').trim() === '';
      const rightEmpty = String(rightValue ?? '').trim() === '';
      if (leftEmpty !== rightEmpty) {
        return leftEmpty ? 1 : -1;
      }

      const result = compareSortValues(leftValue, rightValue);
      if (result !== 0) {
        return currentDirection === 'asc' ? result : -result;
      }

      return Number(leftRow.dataset.sortIndex ?? 0) - Number(rightRow.dataset.sortIndex ?? 0);
    });

    tbody.replaceChildren(...rows);
    updateSortIndicators();
  };

  headerCells.forEach((th, index) => {
    if (featureParam.table?.sort === false || !th.classList.contains('sortable')) return;
    th.addEventListener('click', () => sortByColumn(index));
  });

  if (featureParam.table?.resize !== false) {
    const minWidth = Number(featureParam.table?.minColumnWidth ?? 60);
    const resizeState = {
      active: false,
      columnIndex: -1,
      startX: 0,
      startWidth: 0,
    };

    const cols = Array.from(colgroup.children);

    const setColumnWidth = (columnIndex, width) => {
      const px = `${Math.max(minWidth, Math.round(width))}px`;
      if (cols[columnIndex]) {
        cols[columnIndex].style.width = px;
      }
      if (headerCells[columnIndex]) {
        headerCells[columnIndex].style.width = px;
        headerCells[columnIndex].style.minWidth = px;
        headerCells[columnIndex].style.maxWidth = px;
      }
      Array.from(tbody.rows).forEach((row) => {
        const cell = row.cells[columnIndex];
        if (cell) {
          cell.style.width = px;
          cell.style.minWidth = px;
          cell.style.maxWidth = px;
        }
      });
    };

    const stopResize = () => {
      if (!resizeState.active) return;
      resizeState.active = false;
      document.body.classList.remove('is-resizing-table-column');
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', stopResize);
    };

    const handleMove = (event) => {
      if (!resizeState.active) return;
      const delta = event.clientX - resizeState.startX;
      setColumnWidth(resizeState.columnIndex, resizeState.startWidth + delta);
    };

    headerCells.forEach((th, index) => {
      const handle = th.querySelector('.data-table-resize-handle');
      if (!handle) return;
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        resizeState.active = true;
        resizeState.columnIndex = index;
        resizeState.startX = event.clientX;
        resizeState.startWidth = th.getBoundingClientRect().width;
        document.body.classList.add('is-resizing-table-column');
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', stopResize, { once: true });
      });
    });
  }

  return table;
}
