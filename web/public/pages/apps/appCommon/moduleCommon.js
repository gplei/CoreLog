export function show(element, visible) {
  if (!element) return;
  element.classList.toggle('hidden', !visible);
}

export function setStatus(element, message = '', isError = false, errorClass = 'error') {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle(errorClass, isError);
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export async function requestJson(url, options) {
  return parseResponse(await fetch(url, options));
}

export async function requestMultipart(url, formData) {
  return parseResponse(await fetch(url, {
    method: 'POST',
    body: formData,
  }));
}

export async function chooseCsvFiles() {
  const pickerOptions = {
    multiple: true,
    types: [{
      description: 'CSV files',
      accept: {
        'text/csv': ['.csv'],
        'application/vnd.ms-excel': ['.csv'],
      },
    }],
  };

  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker(pickerOptions);
      return Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      throw error;
    }
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.csv,text/csv,application/vnd.ms-excel';
  return new Promise((resolve) => {
    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      resolve(Array.from(files ?? []));
    };
    const onFocus = () => window.setTimeout(() => finish(input.files), 0);
    input.addEventListener('change', () => finish(input.files), { once: true });
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

export function buildCsvUploadFormData(entries, assignmentKey, assignmentField) {
  const formData = new FormData();
  for (const entry of entries) {
    formData.append('files', entry.file, entry.file.name);
  }
  formData.append(assignmentField, JSON.stringify(entries.map((entry) => Number(entry[assignmentKey]))));
  return formData;
}

export function renderCsvAssignmentQueue(container, entries, config) {
  if (!container) return;
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = config.emptyText ?? 'No CSV files selected.';
    container.replaceChildren(empty);
    return;
  }

  const rows = entries.map((entry) => {
    const row = document.createElement('div');
    row.className = 'form-row staging-queue-row';

    const fileLabel = document.createElement('span');
    fileLabel.className = 'staging-file-name';
    fileLabel.textContent = entry.file.name;

    const assignment = document.createElement('select');
    assignment.className = 'module-control';
    populateSelect(assignment, config.assignmentOptions, config.assignmentPlaceholder);
    assignment.value = String(entry[config.assignmentKey] ?? '');
    assignment.addEventListener('change', () => {
      entry[config.assignmentKey] = assignment.value;
      config.onAssignmentChange?.(entry, assignment.value);
    });

    const status = document.createElement('span');
    status.className = 'staging-row-status';
    const statusResult = config.formatStatus(entry);
    const statusText = typeof statusResult === 'string' ? statusResult : statusResult?.text;
    if (statusText) {
      status.textContent = statusText;
      status.classList.toggle('is-error', typeof statusResult !== 'string' && Boolean(statusResult.isError));
    }

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'module-control';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => config.onRemove(entry));

    row.append(fileLabel, assignment);
    if (statusText) row.appendChild(status);
    row.appendChild(removeButton);
    return row;
  });
  container.replaceChildren(...rows);
}

export function populateSelect(select, options = [], placeholder = '-- Select --') {
  if (!select) return;
  const currentValue = select.value;
  select.replaceChildren();

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);

  for (const option of options) {
    const item = document.createElement('option');
    item.value = String(option.value ?? '');
    item.textContent = String(option.label ?? option.text ?? option.value ?? '');
    select.appendChild(item);
  }

  if (options.some((option) => String(option.value ?? '') === currentValue)) {
    select.value = currentValue;
  }
}

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
