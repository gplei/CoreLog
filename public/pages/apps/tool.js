import * as CommonTable from './appCommon/commonTable.js';

const state = {
  backupDirectory: null,
  databases: [],
  selectedDatabase: '',
  selectedTable: '',
};

const elements = {
  choose: document.querySelector('#btnChooseBackupPath'),
  backupData: document.querySelector('#btnBackupData'),
  backup: document.querySelector('#btnBackupDatabases'),
  purge: document.querySelector('#btnPurgeBackups'),
  pathStatus: document.querySelector('#backupPathStatus'),
  dataBackupStatus: document.querySelector('#dataBackupStatus'),
  status: document.querySelector('#backupStatus'),
  database: document.querySelector('#selToolDatabase'),
  table: document.querySelector('#selToolTable'),
  tableStatus: document.querySelector('#toolTableStatus'),
  tableData: document.querySelector('#divToolTable'),
  enableTrade: document.querySelector('#enableTrade'),
  enableTransaction: document.querySelector('#enableTransaction'),
  enableHayday: document.querySelector('#enableHayday'),
  moduleSettingsStatus: document.querySelector('#moduleSettingsStatus'),
  seedQuickLinkIcons: document.querySelector('#btnSeedQuickLinkIcons'),
  quickLinkIconSeedStatus: document.querySelector('#quickLinkIconSeedStatus'),
  seedHaydayIcons: document.querySelector('#btnSeedHaydayIcons'),
  haydayIconSeedStatus: document.querySelector('#haydayIconSeedStatus'),
  haydayIconSeedFailures: document.querySelector('#haydayIconSeedFailures'),
};

function setDataBackupStatus(message, isError = false) {
  elements.dataBackupStatus.textContent = message;
  elements.dataBackupStatus.classList.toggle('error', isError);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function setModuleSettingsStatus(message, isError = false) {
  elements.moduleSettingsStatus.textContent = message;
  elements.moduleSettingsStatus.classList.toggle('error', isError);
}

async function seedQuickLinkIcons() {
  elements.seedQuickLinkIcons.disabled = true;
  elements.quickLinkIconSeedStatus.textContent = 'Seeding...';
  elements.quickLinkIconSeedStatus.classList.remove('error');
  try {
    const response = await fetch('/api/quick-links/icons/seed', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to seed qLink icons.');
    const failed = Array.isArray(result.failed) ? result.failed.length : 0;
    elements.quickLinkIconSeedStatus.textContent = `${result.seeded} seeded, ${result.skipped} already available${failed ? `, ${failed} failed` : ''}.`;
    elements.quickLinkIconSeedStatus.classList.toggle('error', failed > 0);
  } catch (error) {
    elements.quickLinkIconSeedStatus.textContent = error instanceof Error ? error.message : String(error);
    elements.quickLinkIconSeedStatus.classList.add('error');
  } finally {
    elements.seedQuickLinkIcons.disabled = false;
  }
}

async function seedHaydayIcons() {
  elements.seedHaydayIcons.disabled = true;
  elements.haydayIconSeedStatus.textContent = 'Seeding...';
  elements.haydayIconSeedFailures.textContent = '';
  elements.haydayIconSeedStatus.classList.remove('error');
  try {
    const response = await fetch('/api/tool/seed-hayday-icons', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to seed Hay Day icons.');
    const failed = Array.isArray(result.failed) ? result.failed.length : 0;
    elements.haydayIconSeedStatus.textContent = `${result.seeded} seeded, ${result.skipped} already available${failed ? `, ${failed} failed` : ''}.`;
    elements.haydayIconSeedStatus.classList.toggle('error', failed > 0);
    elements.haydayIconSeedFailures.textContent = failed
      ? result.failed.map((item) => `${item.name}: ${item.error}`).join(' · ')
      : '';
  } catch (error) {
    elements.haydayIconSeedStatus.textContent = error instanceof Error ? error.message : String(error);
    elements.haydayIconSeedStatus.classList.add('error');
  } finally {
    elements.seedHaydayIcons.disabled = false;
  }
}

async function loadModuleSettings() {
  const response = await fetch('/api/tool/module-settings');
  if (!response.ok) throw new Error('Unable to load module settings.');
  const settings = await response.json();
  elements.enableTrade.checked = settings.trade;
  elements.enableTransaction.checked = settings.transaction;
  elements.enableHayday.checked = settings.hayday;
}

async function saveModuleSettings() {
  elements.enableTrade.disabled = true;
  elements.enableTransaction.disabled = true;
  elements.enableHayday.disabled = true;
  setModuleSettingsStatus('Saving...');
  try {
    const response = await fetch('/api/tool/module-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trade: elements.enableTrade.checked,
        transaction: elements.enableTransaction.checked,
        hayday: elements.enableHayday.checked,
      }),
    });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || 'Unable to save module settings.');
    setModuleSettingsStatus('Saved. Refresh other pages to update their tabs.');
    window.dispatchEvent(new CustomEvent('corelog:module-settings-changed', { detail: settings }));
  } catch (error) {
    setModuleSettingsStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.enableTrade.disabled = false;
    elements.enableTransaction.disabled = false;
    elements.enableHayday.disabled = false;
  }
}

function setDatabaseStatuses(databases, statuses, isError = false) {
  elements.status.replaceChildren(...databases.map((database) => {
    const line = document.createElement('div');
    line.textContent = `${database.directory}: ${statuses.get(database.key) ?? 'waiting'}`;
    return line;
  }));
  elements.status.classList.toggle('error', isError);
}

function backupDate() {
  const now = new Date();
  return `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

async function chooseBackupPath() {
  if (!window.showDirectoryPicker) {
    setStatus('This browser does not support folder selection. Use a current Chrome or Edge browser.', true);
    return;
  }

  state.backupDirectory = await window.showDirectoryPicker({ mode: 'readwrite' });
  elements.pathStatus.textContent = `Selected: ${state.backupDirectory.name}`;
  setStatus('Backup path selected.');
  await loadDatabases();
}

function populateSelect(select, options, placeholder) {
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = placeholder;
  select.appendChild(empty);
  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  });
}

async function loadDatabases() {
  const response = await fetch('/api/tool/databases');
  if (!response.ok) throw new Error('Unable to list databases.');
  state.databases = await response.json();
  if (!state.backupDirectory && state.databases[0]?.defaultPath) {
    elements.pathStatus.textContent = `Default DB path: ${state.databases[0].defaultPath}. Choose it to enable backups.`;
  }
  populateSelect(elements.database, state.databases.map((database) => ({ value: database.key, label: database.directory })), '-- Select database --');
  elements.table.disabled = true;
  populateSelect(elements.table, [], '-- Select table --');
  elements.tableData.replaceChildren();
  elements.tableStatus.textContent = '';
}

async function loadBackupPaths() {
  const response = await fetch('/api/tool/backup-paths');
  if (!response.ok) throw new Error('Unable to resolve backup paths.');
  const paths = await response.json();
  setDataBackupStatus(`Full data backup: ${paths.backupRoot}`);
}

async function backupData() {
  elements.backupData.disabled = true;
  setDataBackupStatus('Backing up data...');
  try {
    const response = await fetch('/api/tool/backup-data', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to back up data.');
    setDataBackupStatus(result.message);
  } catch (error) {
    setDataBackupStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.backupData.disabled = false;
  }
}

async function loadTables(databaseKey) {
  state.selectedDatabase = databaseKey;
  state.selectedTable = '';
  elements.tableData.replaceChildren();
  elements.tableStatus.textContent = '';
  if (!databaseKey) {
    elements.table.disabled = true;
    populateSelect(elements.table, [], '-- Select table --');
    return;
  }
  const response = await fetch(`/api/tool/database/${encodeURIComponent(databaseKey)}/tables`);
  if (!response.ok) throw new Error('Unable to list database tables.');
  const tables = await response.json();
  populateSelect(elements.table, tables.map((table) => ({ value: table.name, label: table.name })), '-- Select table --');
  elements.table.disabled = false;
}

async function loadTable(tableName) {
  state.selectedTable = tableName;
  elements.tableData.replaceChildren();
  elements.tableStatus.textContent = '';
  if (!tableName) return;
  const response = await fetch(`/api/tool/database/${encodeURIComponent(state.selectedDatabase)}/table/${encodeURIComponent(tableName)}`);
  if (!response.ok) throw new Error('Unable to load database table.');
  const result = await response.json();
  const rows = result.rows ?? [];
  const columns = (result.columns ?? [])
    .filter((column) => column !== 'created_at' && column !== 'updated_at')
    .map((column) => ({
    key: column,
    label: column,
    type: column === result.primaryKey ? 'readonly' : undefined,
    }));
  let table;
  if (rows.length > 0) {
    table = CommonTable.createTable(rows, {
      table: {
        keyName: result.primaryKey || 'id',
        header: columns.map((column) => column.label),
        edit: false,
        sort: true,
        resize: true,
        onchange: async (id, newValue, column) => {
          const response = await fetch(`/api/tool/database/${encodeURIComponent(state.selectedDatabase)}/table/${encodeURIComponent(state.selectedTable)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id), column, newValue }),
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Unable to update table row.');
          }
        },
        ondelete: async (id) => {
          const response = await fetch(`/api/tool/database/${encodeURIComponent(state.selectedDatabase)}/table/${encodeURIComponent(state.selectedTable)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Unable to delete table row.');
          }
          await loadTable(state.selectedTable);
        },
      },
      column: columns.map((column) => ({ columnName: column.key, type: 'STRING', readOnly: column.type === 'readonly' })),
    });
  } else {
    table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach((column) => {
      const header = document.createElement('th');
      header.textContent = column.label;
      headerRow.appendChild(header);
    });
    const actionHeader = document.createElement('th');
    actionHeader.textContent = 'Action';
    headerRow.appendChild(actionHeader);
    thead.appendChild(headerRow);
    table.append(thead, document.createElement('tbody'));
  }
  elements.tableData.appendChild(table);
  elements.tableStatus.textContent = `${rows.length} row(s)`;
}

async function backupDatabases() {
  if (!state.backupDirectory) {
    setStatus('Choose a backup path first.', true);
    return;
  }

  elements.backup.disabled = true;
  try {
    const databaseResponse = await fetch('/api/tool/databases');
    if (!databaseResponse.ok) throw new Error('Unable to list databases.');
    const databases = await databaseResponse.json();
    const dateFolder = backupDate();
    const statuses = new Map(databases.map((database) => [database.key, 'waiting']));
    setDatabaseStatuses(databases, statuses);

    // Rebuild every database's dated folder so today's backup is always fresh.
    const pending = databases;

    let completed = 0;

    for (const database of pending) {
      statuses.set(database.key, 'backing up');
      setDatabaseStatuses(databases, statuses);
      try {
        const databaseDirectory = await state.backupDirectory.getDirectoryHandle(database.directory, { create: true });
        const backupDirectory = await databaseDirectory.getDirectoryHandle('backup', { create: true });
        try {
          await backupDirectory.removeEntry(dateFolder, { recursive: true });
        } catch (error) {
          if (error?.name !== 'NotFoundError') throw error;
        }
        const datedDirectory = await backupDirectory.getDirectoryHandle(dateFolder, { create: true });
        const response = await fetch(`/api/tool/database/${encodeURIComponent(database.key)}`);
        if (!response.ok) throw new Error(`Unable to back up ${database.fileName}.`);
        const file = await datedDirectory.getFileHandle(database.fileName, { create: true });
        const writable = await file.createWritable();
        await writable.write(await response.arrayBuffer());
        await writable.close();
        completed += 1;
        statuses.set(database.key, 'backed up');
      } catch (error) {
        statuses.set(database.key, `error — ${error instanceof Error ? error.message : String(error)}`);
      }
      setDatabaseStatuses(databases, statuses);
    }

    setDatabaseStatuses(databases, statuses, completed === 0 && pending.length > 0);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.backup.disabled = false;
  }
}

async function purgeBackups() {
  if (!state.backupDirectory) {
    setStatus('Choose a backup path first.', true);
    return;
  }

  elements.purge.disabled = true;
  try {
    const databaseResponse = await fetch('/api/tool/databases');
    if (!databaseResponse.ok) throw new Error('Unable to list databases.');
    const databases = await databaseResponse.json();
    const todayFolder = backupDate();
    const statuses = new Map(databases.map((database) => [database.key, 'waiting']));
    setDatabaseStatuses(databases, statuses);

    for (const database of databases) {
      try {
        const databaseDirectory = await state.backupDirectory.getDirectoryHandle(database.directory);
        const backupDirectory = await databaseDirectory.getDirectoryHandle('backup');
        let removed = 0;
        for await (const [name, handle] of backupDirectory.entries()) {
          if (handle.kind !== 'directory' || name === todayFolder || !/^\d{6}$/.test(name)) continue;
          await backupDirectory.removeEntry(name, { recursive: true });
          removed += 1;
        }
        statuses.set(database.key, removed > 0
          ? `removed ${removed} previous backup folder(s); kept backup/${todayFolder}`
          : `nothing to purge; kept backup/${todayFolder}`);
      } catch (error) {
        if (error?.name === 'NotFoundError') {
          statuses.set(database.key, 'no backup folder');
        } else {
          statuses.set(database.key, `error — ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      setDatabaseStatuses(databases, statuses);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.purge.disabled = false;
  }
}

elements.choose?.addEventListener('click', () => chooseBackupPath().catch((error) => setStatus(error.message, true)));
elements.backupData?.addEventListener('click', () => backupData());
elements.backup?.addEventListener('click', () => backupDatabases());
elements.purge?.addEventListener('click', () => purgeBackups());
elements.database?.addEventListener('change', () => loadTables(elements.database.value).catch((error) => setStatus(error.message, true)));
elements.table?.addEventListener('change', () => loadTable(elements.table.value).catch((error) => setStatus(error.message, true)));
elements.enableTrade?.addEventListener('change', () => saveModuleSettings());
elements.enableTransaction?.addEventListener('change', () => saveModuleSettings());
elements.enableHayday?.addEventListener('change', () => saveModuleSettings());
elements.seedQuickLinkIcons?.addEventListener('click', () => seedQuickLinkIcons());
elements.seedHaydayIcons?.addEventListener('click', () => seedHaydayIcons());
loadDatabases().catch((error) => setStatus(error.message, true));
loadBackupPaths().catch((error) => setDataBackupStatus(error.message, true));
loadModuleSettings().catch((error) => setModuleSettingsStatus(error.message, true));
