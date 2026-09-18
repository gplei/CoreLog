import { showAlert } from './pages/apps/appCommon/appAlert.js';

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const state = {
  entries: [],
  entryDates: [],
  currentEntry: null,
  currentGallery: null,
  entryFormMode: 'create',
  entryFormEntryId: null,
  entryFormDirty: false,
  entrySubmitting: false,
  entryPageSize: 20,
  entryOffset: 0,
  entryLoading: false,
  entryHasMore: true,
  entryTotal: 0,
  selectedDate: null,
  selectedMonth: null,
  historyMonthDay: null,
  tagFilter: '',
  descriptionFilter: '',
  trashMode: false,
  pinFilter: false,
  untaggedFilter: false,
  groupsExpanded: window.localStorage.getItem('corelog.groupsExpanded') === '1',
  calendarDate: new Date(),
  uploadCatalogByKey: new Map(),
  entrySelectedMediaItems: [],
  detailDraggedPhotoId: null,
  detailPhotoOrderDirty: false,
  quickLinks: [],
  quickLinkGroupExpanded: {},
  quickLinkGroupSettingsLoaded: false,
  quickLinkGroupOrder: [],
  quickLinkGroupVisibility: {},
  editingQuickLinkIndex: null,
  editingQuickLinkGroup: '',
  draggingQuickLinkIndex: null,
  activeQuickLinkTooltip: null,
  detailDeletingPhotoId: null,
  tagSuggestionRequestId: 0,
};

const elements = {
  activeFilter: document.querySelector('#active-filter'),
  calendarDays: document.querySelector('#calendar-days'),
  calendarMonth: document.querySelector('#calendar-month'),
  calendarPanel: document.querySelector('#calendar-panel'),
  calendarYear: document.querySelector('#calendar-year'),
  entryBackdrop: document.querySelector('#entry-backdrop'),
  entryForm: document.querySelector('#entry-form'),
  entryTitle: document.querySelector('#entry-modal-title'),
  entryText: document.querySelector('#entry-raw-text'),
  entryDateInput: document.querySelector('#entry-date'),
  entryTagInput: document.querySelector('#entry-tags'),
  entryTagSuggestions: document.querySelector('#entry-tag-suggestions'),
  imageBackdrop: document.querySelector('#image-backdrop'),
  imageCancel: document.querySelector('#image-cancel'),
  imagePick: document.querySelector('#image-pick'),
  imageUpload: document.querySelector('#image-upload'),
  entryMediaFiles: document.querySelector('#entry-media-files'),
  entryMediaItems: document.querySelector('#entry-media-items'),
  entryPhotoSelection: document.querySelector('#entry-photo-selection'),
  entrySubmit: document.querySelector('#entry-submit'),
  accountGroups: document.querySelector('#account-groups'),
  accountGroupsPanel: document.querySelector('#account-groups-panel'),
  quickLinkBackdrop: document.querySelector('#quick-link-backdrop'),
  quickLinkDialogTitle: document.querySelector('#quick-link-dialog-title'),
  quickLinkForm: document.querySelector('#quick-link-form'),
  quickLinkName: document.querySelector('#quick-link-name'),
  quickLinkUrl: document.querySelector('#quick-link-url'),
  quickLinkTip: document.querySelector('#quick-link-tip'),
  quickLinkGroup: document.querySelector('#quick-link-group'),
  quickLinkNewGroup: document.querySelector('#quick-link-new-group'),
  deleteQuickLink: document.querySelector('#delete-quick-link'),
  closeQuickLink: document.querySelector('#close-quick-link'),
  toggleAccountGroups: document.querySelector('#toggle-account-groups'),
  detailBackdrop: document.querySelector('#detail-backdrop'),
  detailContent: document.querySelector('#detail-content'),
  detailDate: document.querySelector('#detail-date'),
  togglePin: document.querySelector('#toggle-pin'),
  galleryBackdrop: document.querySelector('#gallery-backdrop'),
  galleryCounter: document.querySelector('#gallery-counter'),
  galleryDate: document.querySelector('#gallery-date'),
  galleryImage: document.querySelector('#gallery-image'),
  galleryNext: document.querySelector('#gallery-next'),
  galleryNextImage: document.querySelector('#gallery-next-image'),
  galleryPrev: document.querySelector('#gallery-prev'),
  galleryPrevImage: document.querySelector('#gallery-prev-image'),
  galleryThumbs: document.querySelector('#gallery-thumbs'),
  galleryTitle: document.querySelector('#gallery-title'),
  closeGallery: document.querySelector('#close-gallery'),
  entries: document.querySelector('#entries'),
  entriesSentinel: document.querySelector('#entries-sentinel'),
  nextMonth: document.querySelector('#next-month'),
  previousMonth: document.querySelector('#previous-month'),
  status: document.querySelector('#status'),
  tagFilter: document.querySelector('#tag-filter'),
  tagSuggestions: document.querySelector('#tag-suggestions'),
  togglePinFilter: document.querySelector('#toggle-pin-filter'),
  toggleUntaggedFilter: document.querySelector('#toggle-untagged-filter'),
  toggleTrash: document.querySelector('#toggle-trash'),
  newEntry: document.querySelector('#new-entry'),
  emptyTrash: document.querySelector('#empty-trash'),
  toggleCalendar: document.querySelector('#toggle-calendar'),
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(value) {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function buildEntryUrl() {
  const params = new URLSearchParams();

  if (state.tagFilter) params.set('tag', state.tagFilter);
  if (state.descriptionFilter) params.set('description', state.descriptionFilter);
  if (state.trashMode) params.set('trash', '1');
  if (state.historyMonthDay) params.set('month_day', state.historyMonthDay);
  else if (state.selectedDate) params.set('date', state.selectedDate);
  else if (state.selectedMonth) params.set('month', state.selectedMonth);
  if (state.pinFilter) params.set('pin', '1');
  if (state.untaggedFilter) params.set('untagged', '1');

  return `/api/entries${params.toString() ? `?${params.toString()}` : ''}`;
}

function renderTags(tags, asButtons = false) {
  if (!tags || tags.length === 0) return '';

  const tagMarkup = tags
    .map((tag) => {
      const name = typeof tag === 'string' ? tag : tag.name;
      const safeName = escapeHtml(name);
      return asButtons
        ? `<button class="tag" type="button" data-tag="${safeName}">${safeName}</button>`
        : `<span class="tag">${safeName}</span>`;
    })
    .join('');

  return `<div class="tags">${tagMarkup}</div>`;
}

function previewText(text) {
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

function renderTextWithLinks(text) {
  const escaped = escapeHtml(String(text ?? ''));
  return escaped.replace(/https?:\/\/[^\s<]+/gi, (matchedUrl) => {
    let url = matchedUrl;
    let trailing = '';
    while (/[.,!?;:]$/.test(url) || (/[)\]}]$/.test(url) && !url.includes('('))) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

function previewImageAttributes(fullPath, thumbnailPath) {
  const safeFullPath = escapeHtml(fullPath);
  const safeThumbnailPath = escapeHtml(thumbnailPath || fullPath);
  return thumbnailPath && thumbnailPath !== fullPath
    ? `src="${safeThumbnailPath}" data-full-image-src="${safeFullPath}"`
    : `src="${safeFullPath}"`;
}

function renderPhotoTiles(photos) {
  return photos
    .map(
      (photo, index) => `
        <button class="photo-frame" type="button" data-photo-index="${index}">
          <img ${previewImageAttributes(photo.file_path, photo.thumbnail_path)} alt="" loading="lazy" decoding="async">
        </button>
      `,
    )
    .join('');
}

function buildAccountGroups(accounts) {
  const groups = [];
  let currentGroup = null;

  accounts.forEach((item, index) => {
    if (item.name === '--') {
      currentGroup = {
        name: item.groupName || 'Other',
        label: item.groupName || '',
        items: [],
      };
      groups.push(currentGroup);
      return;
    }

    if (!currentGroup) {
      currentGroup = { name: 'Other', label: '', items: [] };
      groups.push(currentGroup);
    }

    if (!item.groupName && currentGroup.name !== 'Other') {
      currentGroup = groups.find((group) => group.name === 'Other');
      if (!currentGroup) {
        currentGroup = { name: 'Other', label: '', items: [] };
        groups.push(currentGroup);
      }
    }

    currentGroup.items.push({ ...item, _index: index, _id: item.id });
  });

  return groups;
}

function renderAccountItem(item, isTextGroup = false) {
  if (item.name === '-') {
    return '';
  }

  if (item.name === '|') {
    return '<div class="account-separator"></div>';
  }

  const href = item.url || `http://www.${item.name}.com`;
  const safeHref = escapeHtml(href);
  const safeName = escapeHtml(item.name);
  const safeTip = escapeHtml(item.tip ? `${item.name} — ${item.tip}` : item.name);
  const tooltipTip = item.tip ? `<span class="qlink-tooltip-tip">${escapeHtml(item.tip)}</span>` : '';
  const editTooltip = `<div class="qlink-tooltip" role="tooltip"><button class="qlink-edit-button" type="button" data-edit-qlink="${item._id}" aria-label="Edit ${safeName}" title="Edit qLink">✎</button><span class="qlink-tooltip-copy"><span class="qlink-tooltip-name">${safeName}</span>${tooltipTip}</span></div>`;

  if (isTextGroup) {
    return `
      <span class="qlink-item" draggable="true" data-qlink-index="${item._index}">
        <a class="account-link text-link" draggable="false" href="${safeHref}" target="_blank" rel="noreferrer" aria-label="${safeTip}">
          <span>${safeName}</span>
        </a>
        ${editTooltip}
      </span>
    `;
  }

  const resolvedIconPath = resolveAccountIconPath(item);
  const safeImg = escapeHtml(resolvedIconPath);

  return `
    <span class="qlink-item" draggable="true" data-qlink-index="${item._index}">
      <a class="account-link" draggable="false" href="${safeHref}" target="_blank" rel="noreferrer" aria-label="${safeTip}">
        <img src="${safeImg}" draggable="false" alt="${safeName}">
      </a>
      ${editTooltip}
    </span>
  `;
}

function resolveAccountIconPath(item) {
  const itemName = String(item?.name || '').trim();

  if (itemName.toLowerCase() === 'gcalendar') {
    const dayOfMonth = new Date().getDate();
    return `/favicons/gcalendar/calendar_${dayOfMonth}.ico`;
  }

  const iconPath = String(item?.imgUrl || 'ec.ico').trim();

  if (!iconPath) {
    return '/favicons/ec.ico';
  }

  if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
    return iconPath;
  }

  const normalizedPath = iconPath.replace(/^\/+/, '');
  const resolvedPath = normalizedPath
    .replace(/^images\/favicons\//, '')
    .replace(/^favicons\//, '')
    .replace(/^favicon\//, '')
    .replace(/^image\//, '')
    .replace(/^images\//, '');

  return `/favicons/${resolvedPath}`;
}

function renderAccountGroups(accounts) {
  const groupOrder = new Map(state.quickLinkGroupOrder.map((name, index) => [name, index]));
  const grouped = buildAccountGroups(accounts)
    .filter((group) => state.quickLinkGroupVisibility[group.name] !== false)
    .sort((left, right) => {
      const leftIndex = groupOrder.has(left.name) ? groupOrder.get(left.name) : Number.MAX_SAFE_INTEGER;
      const rightIndex = groupOrder.has(right.name) ? groupOrder.get(right.name) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.name.localeCompare(right.name);
    });
  elements.accountGroups.innerHTML = grouped
    .map((group) => {
      const isTextGroup = false;
      const isExpanded = state.quickLinkGroupSettingsLoaded
        ? state.quickLinkGroupExpanded[group.name] === true
        : state.quickLinkGroupExpanded[group.name] !== false;
      const groupHeading = group.label
        ? `
          <div class="account-group-heading">
            <button class="qlink-group-toggle" type="button" data-qlink-group="${escapeHtml(group.name)}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${escapeHtml(group.label)}" title="${isExpanded ? 'Collapse' : 'Expand'} ${escapeHtml(group.label)}">${isExpanded ? '<' : '>'}</button>
            <span class="account-group-label">${escapeHtml(group.label)}</span>
            <span class="account-group-rule" aria-hidden="true"></span>
          </div>
        `
        : '';
      if (!group.label) {
        return `<div class="account-row">${group.items.map((item) => renderAccountItem(item, false)).join('')}</div>`;
      }
      return `
        <section class="account-group${isExpanded ? '' : ' collapsed'}" data-qlink-group="${escapeHtml(group.name)}">
          ${groupHeading}
          <div class="account-row${isTextGroup ? ' account-row-text' : ''}">
            ${group.items.map((item) => renderAccountItem(item, isTextGroup)).join('')}
          </div>
        </section>
      `;
    })
    .join('');
  syncAccountGroupScroll();
}

function syncAccountGroupScroll() {
  const container = elements.accountGroups;
  if (!container) return;
  const lastGroup = container.querySelector('.account-group:last-child');
  const containerBottom = container.getBoundingClientRect().bottom;
  const contentBottom = lastGroup?.getBoundingClientRect().bottom ?? containerBottom;
  container.classList.toggle('is-scrollable', contentBottom > containerBottom + 1);
}

function positionQuickLinkTooltip(item) {
  const tooltip = state.activeQuickLinkTooltip?.item === item
    ? state.activeQuickLinkTooltip.tooltip
    : item.querySelector('.qlink-tooltip');
  if (!tooltip) return;

  tooltip.classList.add('qlink-tooltip-floating');
  const itemRect = item.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const edgePadding = 8;
  const left = Math.max(
    edgePadding,
    Math.min(itemRect.left, window.innerWidth - tooltipRect.width - edgePadding),
  );
  const belowTop = itemRect.bottom - 1;
  const top = belowTop + tooltipRect.height <= window.innerHeight - edgePadding
    ? belowTop
    : Math.max(edgePadding, itemRect.top - tooltipRect.height - 4);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function clearQuickLinkTooltip(item) {
  const active = state.activeQuickLinkTooltip;
  const tooltip = active?.item === item ? active.tooltip : item.querySelector('.qlink-tooltip');
  if (!tooltip) return;
  if (active?.item === item && tooltip.parentElement !== item) item.append(tooltip);
  tooltip.classList.remove('qlink-tooltip-floating');
  tooltip.style.left = '';
  tooltip.style.top = '';
  if (active?.item === item) state.activeQuickLinkTooltip = null;
}

async function moveQuickLink(draggedIndex, targetIndex, append = false) {
  const order = state.quickLinks.map((_item, index) => index);
  const draggedPosition = order.indexOf(draggedIndex);
  order.splice(draggedPosition, 1);
  let targetPosition = order.indexOf(targetIndex);
  if (targetPosition < 0) return;
  if (append) targetPosition += 1;
  order.splice(targetPosition, 0, draggedIndex);

  const nextLinks = order.map((index) => ({ ...state.quickLinks[index] }));
  state.quickLinks = nextLinks;
  renderAccountGroups(state.quickLinks);
  try {
    await requestJson('/api/quick-links/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: order
          .filter((index) => state.quickLinks[index].id)
          .map((index) => ({ id: state.quickLinks[index].id, groupName: state.quickLinks[index].groupName || '' })),
      }),
    });
  } catch (error) {
    setStatus(error.message, true);
    await loadAccountGroups();
  }
}

function syncAccountGroupVisibility() {
  const isExpanded = state.groupsExpanded;
  const panel = elements.accountGroups.closest('.calendar-links-card');
  const hasLinks = elements.accountGroups.children.length > 0;
  panel?.classList.toggle('empty', !hasLinks);
  panel?.classList.toggle('collapsed', !isExpanded);
  elements.toggleAccountGroups.setAttribute('aria-expanded', String(isExpanded));
  const label = isExpanded ? 'Collapse qLinks' : 'Expand qLinks';
  elements.toggleAccountGroups.textContent = isExpanded ? '<' : '>';
  elements.toggleAccountGroups.setAttribute('aria-label', label);
  elements.toggleAccountGroups.setAttribute('title', label);
}

function toggleAccountGroups() {
  state.groupsExpanded = !state.groupsExpanded;
  syncAccountGroupVisibility();
  void requestJson('/api/tool/quick-link-groups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qLink: state.groupsExpanded }),
  }).catch((error) => setStatus(error.message, true));
}

function renderEntryCard(entry) {
  const entryId = Number(entry.id);
  const trashAction = state.trashMode ? 'restore' : 'trash';
  const trashActionLabel = state.trashMode ? 'Restore entry' : 'Move entry to Trash';
  const pinActionLabel = entry.pin ? 'Unpin entry' : 'Pin entry';
  const pinAction = state.trashMode
    ? ''
    : `<button class="entry-pin-action${entry.pin ? ' is-pinned' : ''}" type="button" data-entry-pin-action="${entryId}" aria-label="${pinActionLabel}" title="${pinActionLabel}">${entry.pin ? '★' : '☆'}</button>`;
  const permanentDeleteAction = state.trashMode
    ? `<button class="entry-trash-action entry-permanent-delete-action" type="button" data-entry-permanent-delete="${entryId}" aria-label="Permanently delete entry" title="Permanently delete entry">×</button>`
    : '';
  return `
    <article class="entry-card" data-entry-id="${entry.id}">
      ${
        entry.cover_photo_path
          ? `<div class="entry-cover-wrap"><img class="entry-cover-photo" ${previewImageAttributes(entry.cover_photo_path, entry.cover_thumbnail_path)} alt="" loading="lazy" decoding="async">${Number(entry.photo_count ?? 0) > 0 ? `<span class="entry-photo-count" aria-label="${Number(entry.photo_count)} images">${Number(entry.photo_count)}</span>` : ''}</div>`
          : ''
      }
      <div class="entry-body">
        <div class="entry-date-row">
          <button class="entry-date entry-date-link" type="button" data-entry-month="${escapeHtml(String(entry.entry_date ?? '').slice(0, 7))}" aria-label="Show all entries from ${escapeHtml(String(entry.entry_date ?? '').slice(0, 7))}">${escapeHtml(entry.entry_date)}</button>
          ${pinAction}
          <button class="entry-trash-action" type="button" data-entry-trash-action="${trashAction}" data-entry-id="${entryId}" aria-label="${trashActionLabel}" title="${trashActionLabel}">${state.trashMode ? '↩' : '×'}</button>
          ${permanentDeleteAction}
        </div>
        <p class="entry-text">${renderTextWithLinks(previewText(entry.raw_text))}</p>
        ${renderTags(entry.tags, true)}
      </div>
    </article>
  `;
}

function layoutMobileEntries() {
  const container = elements.entries;
  if (window.innerWidth > 640) {
    container.style.height = '';
    container.querySelectorAll('.entry-card').forEach((card) => {
      card.style.top = '';
      card.style.left = '';
      card.style.width = '';
    });
    return;
  }

  const cards = [...container.querySelectorAll('.entry-card')];
  if (!cards.length) return;
  const columnCount = window.innerWidth >= 480 ? 3 : 2;
  const gap = 8;
  const columnWidth = (container.clientWidth - gap * (columnCount - 1)) / columnCount;
  const columnHeights = Array(columnCount).fill(0);

  cards.forEach((card, index) => {
    card.style.width = `${columnWidth}px`;
    const column = index < columnCount
      ? index
      : columnHeights.indexOf(Math.min(...columnHeights));
    card.style.left = `${column * (columnWidth + gap)}px`;
    card.style.top = `${columnHeights[column]}px`;
    columnHeights[column] += card.offsetHeight + gap;
  });

  container.style.height = `${Math.max(...columnHeights) - gap}px`;
}

function renderEntries(entries, { append = false } = {}) {
  if (!append) {
    elements.entries.innerHTML = '';
  }

  if (entries.length === 0 && !append) {
    elements.entries.innerHTML = '<p class="empty-state">No entries yet.</p>';
    return;
  }

  const fragment = entries.map(renderEntryCard).join('');

  if (append) {
    elements.entries.insertAdjacentHTML('beforeend', fragment);
  } else {
    elements.entries.innerHTML = fragment;
  }
  window.requestAnimationFrame(layoutMobileEntries);
}

async function toggleEntryTrash(entryId, action) {
  const isRestore = action === 'restore';

  try {
    await requestJson(isRestore ? '/api/entries/restore' : '/api/entries/trash', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [entryId] }),
    });
    await loadEntryDates();
    await refreshEntries();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function toggleEntryPinFromList(entryId) {
  const cardBeforeUpdate = elements.entries.querySelector(`[data-entry-id="${entryId}"]`);
  const originalIndex = cardBeforeUpdate
    ? Array.from(elements.entries.children).indexOf(cardBeforeUpdate)
    : -1;

  try {
    const updatedEntry = await requestJson(`/api/entries/${entryId}/pin`, { method: 'PATCH' });
    const pinAction = elements.entries.querySelector(
      `[data-entry-id="${entryId}"] [data-entry-pin-action]`,
    );

    if (pinAction && typeof updatedEntry.pin === 'boolean') {
      const label = updatedEntry.pin ? 'Unpin entry' : 'Pin entry';
      pinAction.textContent = updatedEntry.pin ? '★' : '☆';
      pinAction.classList.toggle('is-pinned', updatedEntry.pin);
      pinAction.setAttribute('aria-label', label);
      pinAction.setAttribute('title', label);
    }

    const entry = state.entries.find((item) => Number(item.id) === entryId);
    if (entry && typeof updatedEntry.pin === 'boolean') entry.pin = updatedEntry.pin;

    if (!state.pinFilter && originalIndex >= 0) {
      const card = elements.entries.querySelector(`[data-entry-id="${entryId}"]`);
      const cardAtOriginalPosition = elements.entries.children[originalIndex];
      if (card && cardAtOriginalPosition && card !== cardAtOriginalPosition) {
        elements.entries.insertBefore(card, cardAtOriginalPosition);
      }
    }

    if (state.pinFilter && updatedEntry.pin === false) {
      state.entries = state.entries.filter((item) => Number(item.id) !== entryId);
      state.entryTotal = Math.max(0, state.entryTotal - 1);
      elements.entries.querySelector(`[data-entry-id="${entryId}"]`)?.remove();

      if (state.entries.length === 0) {
        elements.entries.innerHTML = '<p class="empty-state">No pinned entries yet.</p>';
      }

      const rangeLabel = state.entries.length > 0 ? `1-${state.entries.length}` : '0';
      setStatus(`${rangeLabel} of ${state.entryTotal}`);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function permanentlyDeleteEntry(entryId) {
  if (!window.confirm('Permanently delete this entry? This cannot be undone.')) return;

  try {
    await requestJson('/api/entries/trash', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [entryId] }),
    });
    await loadEntryDates();
    await refreshEntries();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function replaceEntryCard(entry) {
  const entryIndex = state.entries.findIndex((item) => Number(item.id) === Number(entry.id));
  if (entryIndex < 0) return;

  const updatedEntry = { ...state.entries[entryIndex], ...entry };
  state.entries[entryIndex] = updatedEntry;

  const currentCard = elements.entries.querySelector(`[data-entry-id="${Number(entry.id)}"]`);
  if (!currentCard) return;

  const template = document.createElement('template');
  template.innerHTML = renderEntryCard(updatedEntry).trim();
  const updatedCard = template.content.firstElementChild;
  if (updatedCard) currentCard.replaceWith(updatedCard);
}

function renderActiveFilter() {
  const parts = [];
  if (state.tagFilter) parts.push(`Filtered by tag: <strong>${escapeHtml(state.tagFilter)}</strong>`);
  if (state.descriptionFilter) parts.push(`Description contains: <strong>${escapeHtml(state.descriptionFilter)}</strong>`);
  if (state.historyMonthDay) parts.push(`History of date: <strong>${escapeHtml(state.historyMonthDay)}</strong>`);
  else if (state.selectedDate) parts.push(`Filtered by date: <strong>${escapeHtml(state.selectedDate)}</strong>`);
  else if (state.selectedMonth) parts.push(`Filtered by month: <strong>${escapeHtml(state.selectedMonth)}</strong>`);
  if (state.pinFilter) parts.push('Filtered by pinned entries');
  if (state.untaggedFilter) parts.push('Filtered by untagged entries');

  if (parts.length === 0) {
    elements.activeFilter.hidden = false;
    elements.activeFilter.innerHTML = 'No filter';
    return;
  }

  elements.activeFilter.hidden = false;
  elements.activeFilter.innerHTML = `${parts.join(' &middot; ')} <button type="button" id="clear-filters">Clear</button>`;
  document.querySelector('#clear-filters').addEventListener('click', clearAllFilters);
}

function resetEntryList() {
  state.entries = [];
  state.entryOffset = 0;
  state.entryHasMore = true;
  elements.entries.innerHTML = '';
}

function refreshEntries() {
  resetEntryList();
  return loadEntries();
}

function fillCalendarControls() {
  const currentYear = new Date().getFullYear();
  const entryYears = state.entryDates
    .map((date) => Number(String(date).slice(0, 4)))
    .filter((year) => Number.isInteger(year) && year > 0);
  const firstYear = Math.min(currentYear - 5, ...(entryYears.length > 0 ? entryYears : [currentYear - 5]));
  const lastYear = Math.max(currentYear + 5, ...(entryYears.length > 0 ? entryYears : [currentYear + 5]));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);

  elements.calendarYear.innerHTML = years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join('');

  elements.calendarMonth.innerHTML = monthNames
    .map((name, index) => `<option value="${index}">${name.slice(0, 3)}</option>`)
    .join('');
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startingWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let index = 0; index < startingWeekday; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const today = formatDate(new Date());
  const entryDateSet = new Set(state.entryDates);

  elements.calendarYear.value = String(year);
  elements.calendarMonth.value = String(month);

  elements.calendarDays.innerHTML = buildCalendarDays(year, month)
    .map((date, index) => {
      if (!date) return `<div class="day-empty" aria-hidden="true" data-empty="${index}"></div>`;

      const value = formatDate(date);
      const classes = [
        'day-cell',
        value === today ? 'today' : '',
        value === state.selectedDate || value.slice(5) === state.historyMonthDay ? 'selected' : '',
        entryDateSet.has(value) ? 'has-entry' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `<button class="${classes}" type="button" data-date="${value}">${date.getDate()}</button>`;
    })
    .join('');
}

function syncFiltersFromCalendarDate() {
  state.selectedMonth = formatMonth(state.calendarDate);
}

async function loadEntries({ append = false } = {}) {
  if (state.entryLoading || !state.entryHasMore) return;

  state.entryLoading = true;
  setStatus(append ? 'Loading more...' : 'Loading...');

  try {
    const params = new URLSearchParams();
    const url = new URL(buildEntryUrl(), window.location.origin);
    url.searchParams.forEach((value, key) => params.set(key, value));
    params.set('limit', String(state.entryPageSize));
    params.set('offset', String(state.entryOffset));

    const data = await requestJson(`/api/entries?${params.toString()}`);
    const entries = data.entries || [];
    state.entryTotal = Number(data.total ?? 0);

    if (append) {
      state.entries.push(...entries);
      renderEntries(entries, { append: true });
    } else {
      state.entries = entries;
      renderEntries(entries);
    }

    state.entryOffset += entries.length;
    state.entryHasMore = entries.length === state.entryPageSize;
    renderActiveFilter();
    const rangeLabel = state.entries.length > 0
      ? `1-${state.entries.length}`
      : '0';
    setStatus(`${rangeLabel} of ${state.entryTotal}`);
    window.requestAnimationFrame(loadMoreEntriesIfNeeded);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.entryLoading = false;
  }
}

function loadMoreEntriesIfNeeded() {
  if (state.entryLoading || !state.entryHasMore) return;
  const distanceFromBottom = elements.entries.scrollHeight
    - elements.entries.scrollTop
    - elements.entries.clientHeight;
  if (distanceFromBottom < 240) {
    void loadEntries({ append: true });
  }
}

async function loadAccountGroups() {
  try {
    const data = await requestJson('/api/quick-links');
    state.quickLinks = Array.isArray(data) ? data : [];
    try {
      const settings = await requestJson('/api/tool/quick-link-groups');
      state.quickLinkGroupExpanded = settings.group && typeof settings.group === 'object'
        ? settings.group
        : {};
      state.quickLinkGroupSettingsLoaded = true;
      state.quickLinkGroupOrder = settings.group && typeof settings.group === 'object'
        ? Object.keys(settings.group)
        : [];
      state.quickLinkGroupVisibility = {};
      if (typeof settings.qLink === 'boolean') state.groupsExpanded = settings.qLink;
    } catch {
      state.quickLinkGroupExpanded = {};
      state.quickLinkGroupSettingsLoaded = false;
      state.quickLinkGroupOrder = [];
      state.quickLinkGroupVisibility = {};
    }
    renderAccountGroups(state.quickLinks);
    if (elements.accountGroupsPanel) elements.accountGroupsPanel.hidden = false;
    syncAccountGroupVisibility();
  } catch {
    state.quickLinks = [];
    renderAccountGroups([]);
    if (elements.accountGroupsPanel) elements.accountGroupsPanel.hidden = false;
    syncAccountGroupVisibility();
  }
}

async function toggleQuickLinkGroup(group) {
  const expanded = state.quickLinkGroupExpanded[group] === false;
  state.quickLinkGroupExpanded[group] = expanded;
  renderAccountGroups(state.quickLinks);
  try {
    await requestJson('/api/tool/quick-link-groups', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, expanded }),
    });
  } catch (error) {
    setStatus(error.message, true);
  }
}

function openQuickLinkDialog() {
  elements.quickLinkForm.reset();
  populateQuickLinkGroups();
  state.editingQuickLinkIndex = null;
  state.editingQuickLinkGroup = '';
  elements.quickLinkDialogTitle.textContent = 'Add qLink';
  elements.deleteQuickLink.hidden = true;
  openDialog(elements.quickLinkBackdrop);
  elements.quickLinkName.focus();
}

function openEditQuickLink(index) {
  const link = state.quickLinks[index];
  if (!link || link.name === '--' || link.name === '-' || link.name === '|') return;
  elements.quickLinkName.value = link.name || '';
  elements.quickLinkUrl.value = link.url || '';
  elements.quickLinkTip.value = link.tip || '';
  populateQuickLinkGroups();
  let groupName = '';
  for (let itemIndex = 0; itemIndex <= index; itemIndex += 1) {
    if (state.quickLinks[itemIndex].name === '--') groupName = state.quickLinks[itemIndex].groupName || '';
  }
  state.editingQuickLinkGroup = link.groupName || groupName;
  elements.quickLinkGroup.value = state.editingQuickLinkGroup;
  elements.quickLinkNewGroup.value = '';
  state.editingQuickLinkIndex = index;
  elements.quickLinkDialogTitle.textContent = 'Edit qLink';
  elements.deleteQuickLink.hidden = false;
  openDialog(elements.quickLinkBackdrop);
  elements.quickLinkName.focus();
}

async function deleteCurrentQuickLink() {
  const index = state.editingQuickLinkIndex;
  const id = index === null ? null : state.quickLinks[index]?.id;
  if (!id || !window.confirm('Delete this qLink?')) return;

  try {
    await requestJson(`/api/quick-links/${id}`, { method: 'DELETE' });
    closeDialog(elements.quickLinkBackdrop);
    state.editingQuickLinkIndex = null;
    await loadAccountGroups();
  } catch (error) {
    showAlert('Unable to delete qLink', error instanceof Error ? error.message : String(error));
  }
}

function populateQuickLinkGroups() {
  const groups = [...new Set(
    state.quickLinks
      .filter((item) => item.name === '--' && item.groupName)
      .map((item) => String(item.groupName).trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
  elements.quickLinkGroup.innerHTML = [
    '<option value="">-- select group --</option>',
    ...groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`),
  ].join('');
}

async function saveQuickLink(event) {
  event.preventDefault();
  const button = document.querySelector('#save-quick-link');
  const groupName = elements.quickLinkNewGroup.value.trim() || elements.quickLinkGroup.value.trim();
  button.disabled = true;
  try {
    const editingIndex = state.editingQuickLinkIndex;
    const editingId = editingIndex === null ? null : state.quickLinks[editingIndex]?.id;
    await requestJson(editingId === null ? '/api/quick-links' : `/api/quick-links/${editingId}`, {
      method: editingIndex === null ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: elements.quickLinkName.value,
        url: elements.quickLinkUrl.value,
        tip: elements.quickLinkTip.value,
        groupName,
      }),
    });
    closeDialog(elements.quickLinkBackdrop);
    state.editingQuickLinkIndex = null;
    await loadAccountGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showAlert(message.includes('same name or URL') ? 'Duplicate qLink' : 'Unable to add qLink', message);
  } finally {
    button.disabled = false;
  }
}

async function loadEntry(entryId) {
  const data = await requestJson(`/api/entries/${entryId}`);
  return data.entry;
}

async function loadEntryDates() {
  try {
    const data = await requestJson('/api/entries/dates');
    state.entryDates = data.dates || [];
    fillCalendarControls();
    renderCalendar();
  } catch {
    state.entryDates = [];
  }
}

function openDialog(backdrop) {
  backdrop.classList.add('open');
}

function closeDialog(backdrop) {
  backdrop.classList.remove('open');
}

function renderEntryDetail(entry) {
  state.currentEntry = entry;
  state.detailPhotoOrderDirty = false;
  elements.detailDate.textContent = entry.entry_date;
  elements.togglePin.textContent = entry.pin ? 'Unpin' : 'Pin';
  elements.togglePin.setAttribute('aria-pressed', String(Boolean(entry.pin)));
  elements.detailContent.innerHTML = `
    <div class="detail-stack">
      <p class="detail-text">${renderTextWithLinks(entry.raw_text)}</p>
      ${renderTags(entry.tags, true)}
      <div class="detail-image-actions">
        <button class="button detail-image-button" type="button" data-open-image-dialog>Upload/Pick Images</button>
      </div>
      ${
        entry.photos.length
          ? `
            <section class="detail-photo-order-section">
              <div class="detail-photo-order-grid">${renderDetailPhotoCards(entry.photos)}</div>
            </section>
          `
          : ''
      }
    </div>
  `;

  if (entry.photos.length > 0) {
    ensureDetailCoverSelection();
  }

  openDialog(elements.detailBackdrop);
}

async function refreshEntry(entryId) {
  const entry = await loadEntry(entryId);
  replaceEntryCard(entry);
  renderEntryDetail(entry);
  return entry;
}

async function showEntry(entryId) {
  setStatus('Loading entry...');
  elements.detailDate.textContent = '';
  elements.detailContent.innerHTML = '<p class="muted">Loading entry...</p>';
  openDialog(elements.detailBackdrop);

  try {
    const entry = await loadEntry(entryId);
    renderEntryDetail(entry);
    setStatus('');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function toggleCurrentEntryPin() {
  const entry = state.currentEntry;
  if (!entry) return;

  try {
    setStatus(entry.pin ? 'Unpinning...' : 'Pinning...');
    await requestJson(`/api/entries/${entry.id}/pin`, { method: 'PATCH' });
    await refreshEntry(entry.id);
    setStatus('');
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderPhotoGallery(entry, index = 0) {
  const photos = entry.photos || [];
  if (photos.length === 0) return;

  const currentIndex = ((index % photos.length) + photos.length) % photos.length;
  const currentPhoto = photos[currentIndex];

  state.currentGallery = {
    entry,
    index: currentIndex,
  };

  elements.galleryTitle.textContent = 'Photos';
  elements.galleryDate.textContent = entry.entry_date;
  elements.galleryCounter.textContent = `${currentIndex + 1} / ${photos.length}`;
  elements.galleryImage.src = currentPhoto.file_path;
  elements.galleryImage.alt = `Photo ${currentIndex + 1} of ${photos.length}`;
  elements.galleryThumbs.innerHTML = photos
    .map(
      (photo, photoIndex) => `
        <button class="photo-frame gallery-thumb${photoIndex === currentIndex ? ' active' : ''}" type="button" data-photo-index="${photoIndex}">
          <img ${previewImageAttributes(photo.file_path, photo.thumbnail_path)} alt="" loading="lazy" decoding="async">
        </button>
      `,
    )
    .join('');

  openDialog(elements.galleryBackdrop);
}

async function openPhotoGallery(entryId, startIndex = 0) {
  setStatus('Loading photos...');

  try {
    const entry = state.currentEntry && Number(state.currentEntry.id) === Number(entryId)
      ? state.currentEntry
      : await loadEntry(entryId);

    state.currentEntry = entry;
    if (!entry.photos || entry.photos.length === 0) {
      setStatus('');
      return;
    }

    renderPhotoGallery(entry, startIndex);
    setStatus('');
  } catch (error) {
    setStatus(error.message, true);
  }
}

function stepGallery(delta) {
  const gallery = state.currentGallery;
  if (!gallery || !gallery.entry.photos.length) return;

  renderPhotoGallery(gallery.entry, gallery.index + delta);
}

async function fetchTagSuggestions(query) {
  if (!query) return [];

  try {
    const data = await requestJson(`/api/tags?search=${encodeURIComponent(query)}`);
    return data.tags || [];
  } catch {
    return [];
  }
}

function currentTagQuery(value) {
  return value.split(',').pop().trim();
}

function replaceCurrentTag(value, suggestion, appendComma = false) {
  const parts = value.split(',');
  const prefix = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
  const nextTags = [...prefix, suggestion].join(', ');
  return appendComma ? `${nextTags}, ` : nextTags;
}

function formatEntryTags(tags) {
  const normalizedTags = tags.map((tag) => tag.trim()).filter(Boolean);
  return normalizedTags.length > 0 ? `${normalizedTags.join(', ')}, ` : '';
}

async function renderInlineTagSuggestions(input, container, appendComma = false) {
  const query = currentTagQuery(input.value);
  const requestId = ++state.tagSuggestionRequestId;

  if (!query) {
    container.innerHTML = '';
    return;
  }

  const suggestions = await fetchTagSuggestions(query);
  if (requestId !== state.tagSuggestionRequestId || currentTagQuery(input.value) !== query) return;

  container.innerHTML = suggestions
    .map((suggestion) => `<button class="chip" type="button" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`)
    .join('');

  container.querySelectorAll('[data-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = input === elements.entryTagInput
        ? replaceCurrentTag(input.value, button.dataset.suggestion, true)
        : replaceCurrentTag(input.value, button.dataset.suggestion, appendComma);
      container.innerHTML = '';
      input.focus();
    });
  });
}

async function renderFilterSuggestions() {
  const query = currentTagQuery(elements.tagFilter.value);
  const suggestions = await fetchTagSuggestions(query);

  if (suggestions.length === 0) {
    elements.tagSuggestions.hidden = true;
    elements.tagSuggestions.innerHTML = '';
    return;
  }

  elements.tagSuggestions.hidden = false;
  elements.tagSuggestions.innerHTML = suggestions
    .map((suggestion) => `<button class="suggestion" type="button" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`)
    .join('');
}

function applyTagFilter(tag) {
  state.tagFilter = tag.trim();
  state.descriptionFilter = '';
  elements.tagFilter.value = state.tagFilter;
  elements.tagSuggestions.hidden = true;
  elements.tagSuggestions.innerHTML = '';
  refreshEntries();
}

function applyMonthFilter(month) {
  const normalizedMonth = String(month ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return;
  state.selectedMonth = normalizedMonth;
  state.selectedDate = null;
  state.historyMonthDay = null;
  state.calendarDate = parseMonth(normalizedMonth) || state.calendarDate;
  state.tagFilter = '';
  state.descriptionFilter = '';
  elements.tagFilter.value = '';
  elements.tagSuggestions.hidden = true;
  elements.tagSuggestions.innerHTML = '';
  renderCalendar();
  refreshEntries();
}

function applyDescriptionFilter(description) {
  state.descriptionFilter = description.trim();
  state.tagFilter = '';
  elements.tagFilter.value = state.descriptionFilter;
  elements.tagSuggestions.hidden = true;
  elements.tagSuggestions.innerHTML = '';
  refreshEntries();
}

function clearAllFilters() {
  state.tagFilter = '';
  state.descriptionFilter = '';
  state.pinFilter = false;
  state.untaggedFilter = false;
  state.selectedDate = null;
  state.selectedMonth = null;
  state.historyMonthDay = null;
  elements.tagFilter.value = '';
  syncPinFilterButton();
  syncUntaggedFilterButton();
  renderCalendar();
  refreshEntries();
}

function toggleTrashView() {
  state.trashMode = !state.trashMode;
  document.body.classList.toggle('trash-mode', state.trashMode);
  state.tagFilter = '';
  state.descriptionFilter = '';
  elements.tagFilter.value = '';
  elements.tagSuggestions.hidden = true;
  elements.tagSuggestions.innerHTML = '';
  elements.toggleTrash.setAttribute('aria-pressed', String(state.trashMode));
  elements.toggleTrash.textContent = state.trashMode ? 'Back to entries' : 'Trash';
  elements.newEntry.hidden = state.trashMode;
  elements.emptyTrash.hidden = !state.trashMode;
  refreshEntries();
}

function getFileNameFromPath(filePath) {
  const parts = String(filePath).split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : String(filePath);
}

function syncEntryFormMode() {
  const isEdit = state.entryFormMode === 'edit';
  elements.entryTitle.textContent = isEdit ? 'Edit Entry' : 'New Entry';
  elements.entrySubmit.textContent = isEdit ? 'Save' : 'Submit';
}

function clearSelectedMediaItems() {
  for (const item of state.entrySelectedMediaItems) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  state.entrySelectedMediaItems = [];
}

function resetEntryForm(mode = 'create') {
  elements.entryForm.reset();
  state.entryFormMode = mode;
  state.entryFormEntryId = null;
  elements.entryTagSuggestions.innerHTML = '';
  clearSelectedMediaItems();
  elements.entryMediaItems.value = '[]';
  elements.entryMediaFiles.value = '';
  syncEntryFormMode();

  if (mode === 'create') {
    elements.entryDateInput.value = formatDate(new Date());
  }

  renderPhotoSelectionQueue();
  state.entryFormDirty = false;
}

function closeEntryDialogWithConfirmation() {
  if (state.entryFormMode === 'edit'
    && state.entryFormDirty
    && !window.confirm('Discard unsaved changes to this entry?')) {
    return false;
  }
  closeDialog(elements.entryBackdrop);
  resetEntryForm('create');
  return true;
}

function syncSelectedMediaItems() {
  elements.entryMediaItems.value = JSON.stringify(
    state.entrySelectedMediaItems.map((item) =>
      item.kind === 'existing'
        ? { type: 'existing', file_path: item.filePath }
        : { type: 'upload' },
    ),
  );
}

function getEntryPhotoSelection() {
  return {
    items: state.entrySelectedMediaItems,
    mediaInput: elements.entryMediaItems,
    selection: elements.entryPhotoSelection,
  };
}

function renderPhotoSelectionQueue() {
  const { items, selection } = getEntryPhotoSelection();
  if (!selection) return;

  if (items.length === 0) {
    selection.innerHTML = '';
    return;
  }

  selection.innerHTML = items
    .map((item, index) => {
      const safePath = escapeHtml(item.previewUrl || item.filePath);
      return `
        <article class="selected-photo-card" data-selection-index="${index}">
          <img class="selected-photo-thumb" src="${safePath}" alt="">
          <button class="selected-photo-remove" type="button" data-remove-selection-index="${index}" aria-label="Remove selected image">×</button>
        </article>
      `;
    })
    .join('');
}

function syncPhotoSelectionQueue() {
  syncSelectedMediaItems();
  renderPhotoSelectionQueue();
}

function createSelectedMediaItem(file) {
  return {
    kind: 'pending',
    file,
    previewUrl: URL.createObjectURL(file),
    label: file.name,
  };
}

function appendSelectedMediaFiles(files) {
  const existingKeys = new Set();
  const uploadKeys = new Set();

  for (const item of state.entrySelectedMediaItems) {
    if (item.kind === 'existing') {
      existingKeys.add(item.filePath);
    } else {
      uploadKeys.add(`${item.file.name}::${item.file.size}::${item.file.lastModified}`);
    }
  }

  for (const file of files) {
    const item = createSelectedMediaItem(file);
    if (item.kind === 'existing') {
      if (existingKeys.has(item.filePath)) continue;
      existingKeys.add(item.filePath);
    } else {
      const uploadKey = `${item.file.name}::${item.file.size}::${item.file.lastModified}`;
      if (uploadKeys.has(uploadKey)) {
        URL.revokeObjectURL(item.previewUrl);
        continue;
      }
      uploadKeys.add(uploadKey);
    }

    state.entrySelectedMediaItems.push(item);
    state.entryFormDirty = true;
  }

  syncPhotoSelectionQueue();
}

function removePhotoSelectionIndex(index) {
  const item = state.entrySelectedMediaItems[index];
  if (!item) return;
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
  state.entrySelectedMediaItems.splice(index, 1);
  state.entryFormDirty = true;
  syncPhotoSelectionQueue();
}

function setupPhotoSelectionQueue() {
  const { selection } = getEntryPhotoSelection();
  if (!selection) return;

  selection.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-selection-index]');
    if (!removeButton) return;

    removePhotoSelectionIndex(Number(removeButton.dataset.removeSelectionIndex));
  });
}

async function loadUploadCatalog(forceRefresh = false) {
  if (!forceRefresh && state.uploadCatalogByKey.size > 0) {
    return;
  }

  try {
    const data = await requestJson('/api/uploads');
    const files = Array.isArray(data.files) ? data.files : [];
    state.uploadCatalogByKey = new Map(
      files.map((file) => [
        file.file_path,
        file,
      ]),
    );
  } catch (error) {
    state.uploadCatalogByKey = new Map();
  }
}

async function resolveSelectedPhotoMode(mode = 'upload') {
  const selectedFileItems = state.entrySelectedMediaItems.filter((item) => item.kind !== 'existing' && item.file);
  if (selectedFileItems.length === 0) return true;

  if (mode === 'upload') {
    state.entrySelectedMediaItems = state.entrySelectedMediaItems.map((item) => (
      item.kind === 'existing' || !item.file ? item : { ...item, kind: 'upload' }
    ));
    syncSelectedMediaItems();
    return true;
  }

  await loadUploadCatalog(true);
  const uploads = Array.from(state.uploadCatalogByKey.values());
  const matchedByPath = new Map();
  const missingItems = [];

  for (const item of selectedFileItems) {
    const favoritePath = `favorite/${item.file.name}`;
    const matchedUpload = uploads.find((upload) => (
      String(upload.relative_path ?? '').replace(/\\/g, '/') === favoritePath
    ));
    if (matchedUpload) {
      matchedByPath.set(favoritePath, matchedUpload);
    } else {
      missingItems.push(item);
    }
  }

  for (const item of missingItems) {
    const formData = new FormData();
    formData.append('photos', item.file);
    const data = await requestJson('/api/uploads/favorite', { method: 'POST', body: formData });
    const favoriteFilePath = Array.isArray(data.file_paths) ? data.file_paths[0] : null;
    if (!favoriteFilePath) {
      throw new Error(`Unable to copy ${item.label} to favorite`);
    }
    matchedByPath.set(`favorite/${item.file.name}`, {
      file_path: favoriteFilePath,
      name: item.file.name,
    });
  }

  state.entrySelectedMediaItems = state.entrySelectedMediaItems.map((item) => {
    if (item.kind === 'existing' || !item.file) return item;
    const matchedUpload = matchedByPath.get(`favorite/${item.file.name}`);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    return {
      kind: 'existing',
      filePath: matchedUpload.file_path,
      label: matchedUpload.name,
    };
  });
  syncSelectedMediaItems();
  return true;
}

function renderDetailPhotoCards(photos) {
  if (!photos || photos.length === 0) return '';

  return photos
    .map((photo, index) => {
      const imageAttributes = previewImageAttributes(photo.file_path, photo.thumbnail_path);
      const isDeleting = state.detailDeletingPhotoId === photo.id;
      return `
        <article class="detail-photo-card${index === 0 ? ' is-cover' : ''}" draggable="true" data-media-id="${photo.id}">
          <button class="detail-photo-delete" type="button" data-delete-photo-id="${photo.id}" aria-label="Delete photo" ${isDeleting ? 'disabled' : ''}>
            &times;
          </button>
          <img class="detail-photo-image" ${imageAttributes} alt="" data-photo-index="${index}" loading="lazy" decoding="async">
        </article>
      `;
    })
    .join('');
}

function getDetailPhotoCards() {
  return Array.from(elements.detailContent.querySelectorAll('.detail-photo-card'));
}

function ensureDetailCoverSelection() {
  const cards = getDetailPhotoCards();
  if (cards.length === 0) {
    return;
  }

  cards.forEach((card, index) => {
    card.classList.toggle('is-cover', index === 0);
  });
}

function syncDetailPhotoOrderState() {
  const orderedIds = getDetailPhotoCards()
    .map((card) => Number(card.dataset.mediaId))
    .filter((id) => Number.isInteger(id) && id > 0);
  return { orderedIds };
}

function moveDetailPhotoCard(draggedCard, targetCard, clientY) {
  if (!draggedCard || !targetCard || draggedCard === targetCard) {
    return;
  }

  const targetRect = targetCard.getBoundingClientRect();
  const shouldInsertBefore = clientY < targetRect.top + targetRect.height / 2;
  const referenceNode = shouldInsertBefore ? targetCard : targetCard.nextElementSibling;
  elements.detailContent.querySelector('.detail-photo-order-grid')?.insertBefore(draggedCard, referenceNode);
  ensureDetailCoverSelection();
  state.detailPhotoOrderDirty = true;
}

function getDetailPhotoDropTarget(event) {
  return (
    event.target.closest('.detail-photo-card') ||
    document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.detail-photo-card') ||
    null
  );
}

async function saveDetailPhotoOrder() {
  const entry = state.currentEntry;
  if (!entry) return;

  const { orderedIds } = syncDetailPhotoOrderState();

  try {
    setStatus('Saving order...');
    await requestJson(`/api/entries/${entry.id}/media-order`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ordered_media_ids: orderedIds,
      }),
    });
    state.detailPhotoOrderDirty = false;
    await refreshEntry(entry.id);
    setStatus('');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteDetailPhoto(entryMediaId) {
  const entry = state.currentEntry;
  if (!entry) return;

  const confirmed = window.confirm('Delete this photo from the entry?');
  if (!confirmed) return;

  try {
    state.detailDeletingPhotoId = entryMediaId;
    setStatus('Deleting photo...');

    await requestJson(`/api/entries/${entry.id}/media/${entryMediaId}`, {
      method: 'DELETE',
    });

    await refreshEntry(entry.id);
    setStatus('');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.detailDeletingPhotoId = null;
  }
}

function syncPinFilterButton() {
  elements.togglePinFilter.setAttribute('aria-pressed', String(state.pinFilter));
  elements.togglePinFilter.textContent = state.pinFilter ? 'Pinned only' : 'Pinned';
}

function togglePinFilter() {
  state.pinFilter = !state.pinFilter;
  syncPinFilterButton();
  refreshEntries();
}

function syncUntaggedFilterButton() {
  elements.toggleUntaggedFilter.setAttribute('aria-pressed', String(state.untaggedFilter));
  elements.toggleUntaggedFilter.textContent = state.untaggedFilter ? 'Untagged only' : 'Untagged';
}

function toggleUntaggedFilter() {
  state.untaggedFilter = !state.untaggedFilter;
  syncUntaggedFilterButton();
  refreshEntries();
}

function openCreate() {
  resetEntryForm('create');
  openDialog(elements.entryBackdrop);
  void loadUploadCatalog();
}

function openEdit() {
  const entry = state.currentEntry;
  if (!entry) return;

  resetEntryForm('edit');
  state.entryFormEntryId = entry.id;
  elements.entryText.value = entry.raw_text;
  const entryTags = (entry.tags || []).map((tag) => tag.name);
  elements.entryTagInput.value = formatEntryTags(entryTags);
  elements.entryDateInput.value = entry.entry_date;
  closeDialog(elements.detailBackdrop);
  openDialog(elements.entryBackdrop);
  state.entryFormDirty = false;
}

function openImageDialog() {
  if (!state.currentEntry) return;
  clearSelectedMediaItems();
  elements.entryMediaItems.value = '[]';
  elements.entryMediaFiles.value = '';
  renderPhotoSelectionQueue();
  openDialog(elements.imageBackdrop);
}

async function submitDetailImages(mode) {
  const entry = state.currentEntry;
  if (!entry || state.entrySelectedMediaItems.length === 0) return;

  try {
    if (!await resolveSelectedPhotoMode(mode)) return;
    const formData = new FormData();
    formData.set('raw_text', entry.raw_text);
    formData.set('entry_date', entry.entry_date);
    formData.set('tags', (entry.tags || []).map((tag) => tag.name).join(', '));
    syncSelectedMediaItems();
    formData.set('media_items', elements.entryMediaItems.value);
    for (const item of state.entrySelectedMediaItems) {
      if (item.kind === 'upload') formData.append('photos', item.file);
    }
    await requestJson(`/api/entries/${entry.id}`, { method: 'PUT', body: formData });
    closeDialog(elements.imageBackdrop);
    clearSelectedMediaItems();
    await refreshEntry(entry.id);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function submitEntry(event) {
  event.preventDefault();
  if (state.entrySubmitting) return;

  const form = event.currentTarget;
  state.entrySubmitting = true;
  elements.entrySubmit.disabled = true;
  const entryId = state.entryFormEntryId;

  try {
    const isEdit = state.entryFormMode === 'edit';
    const formData = new FormData(form);

    setStatus(isEdit ? 'Saving...' : 'Submitting...');
    const url = isEdit && state.entryFormEntryId
      ? `/api/entries/${state.entryFormEntryId}`
      : '/api/entry';
    const method = isEdit ? 'PUT' : 'POST';
    await requestJson(url, { method, body: formData });
    closeDialog(elements.entryBackdrop);
    resetEntryForm('create');
    if (isEdit && entryId) {
      await refreshEntry(entryId);
    } else {
      await refreshEntries();
    }
    await loadEntryDates();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.entrySubmitting = false;
    elements.entrySubmit.disabled = false;
  }
}

function moveCalendar(delta) {
  state.calendarDate = new Date(
    state.calendarDate.getFullYear(),
    state.calendarDate.getMonth() + delta,
    1,
  );
  state.selectedDate = null;
  state.historyMonthDay = null;
  syncFiltersFromCalendarDate();
  renderCalendar();
  refreshEntries();
}

async function deleteCurrentEntry() {
  const entry = state.currentEntry;
  if (!entry) return;

  if (!window.confirm('Move this entry to Trash?')) return;

  try {
    await requestJson(`/api/entries/${entry.id}`, { method: 'DELETE' });
    state.currentEntry = null;
    closeDialog(elements.detailBackdrop);
    await loadEntryDates();
    await refreshEntries();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function initializeEvents() {
  setupPhotoSelectionQueue();
  window.addEventListener('resize', syncAccountGroupScroll);

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.fullImageSrc) return;
    image.src = image.dataset.fullImageSrc;
    delete image.dataset.fullImageSrc;
  }, true);

  elements.entries.addEventListener('click', (event) => {
    const pinAction = event.target.closest('[data-entry-pin-action]');
    if (pinAction) {
      event.stopPropagation();
      void toggleEntryPinFromList(Number(pinAction.dataset.entryPinAction));
      return;
    }

    const permanentDeleteAction = event.target.closest('[data-entry-permanent-delete]');
    if (permanentDeleteAction) {
      event.stopPropagation();
      void permanentlyDeleteEntry(Number(permanentDeleteAction.dataset.entryPermanentDelete));
      return;
    }

    const trashAction = event.target.closest('[data-entry-trash-action]');
    if (trashAction) {
      event.stopPropagation();
      void toggleEntryTrash(Number(trashAction.dataset.entryId), trashAction.dataset.entryTrashAction);
      return;
    }

    if (event.target.closest('a')) {
      event.stopPropagation();
      return;
    }

    const tag = event.target.closest('[data-tag]');
    if (tag) {
      event.stopPropagation();
      applyTagFilter(tag.dataset.tag);
      return;
    }

    const entryDate = event.target.closest('[data-entry-month]');
    if (entryDate) {
      event.stopPropagation();
      applyMonthFilter(entryDate.dataset.entryMonth);
      return;
    }

    const coverPhoto = event.target.closest('.entry-cover-photo');
    if (coverPhoto) {
      const card = coverPhoto.closest('[data-entry-id]');
      if (card) openPhotoGallery(card.dataset.entryId, 0);
      return;
    }

    const card = event.target.closest('[data-entry-id]');
    if (card) showEntry(card.dataset.entryId);
  });

  elements.detailContent.addEventListener('click', (event) => {
    const openImageButton = event.target.closest('[data-open-image-dialog]');
    if (openImageButton) {
      event.stopPropagation();
      openImageDialog();
      return;
    }

    const deleteButton = event.target.closest('[data-delete-photo-id]');
    if (deleteButton) {
      void deleteDetailPhoto(Number(deleteButton.dataset.deletePhotoId));
      return;
    }

    const photo = event.target.closest('[data-photo-index]');
    if (photo && state.currentEntry) {
      openPhotoGallery(state.currentEntry.id, Number(photo.dataset.photoIndex));
      return;
    }

    const tag = event.target.closest('[data-tag]');
    if (tag) applyTagFilter(tag.dataset.tag);
  });

  elements.detailContent.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.detail-photo-card');
    if (!card) return;

    state.detailDraggedPhotoId = Number(card.dataset.mediaId);
    card.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.mediaId);
    }
  });

  elements.detailContent.addEventListener('dragover', (event) => {
    const draggedCard = state.detailDraggedPhotoId
      ? elements.detailContent.querySelector(`.detail-photo-card[data-media-id="${state.detailDraggedPhotoId}"]`)
      : null;
    const targetCard = getDetailPhotoDropTarget(event);
    if (!draggedCard || !targetCard) return;
    if (draggedCard === targetCard) return;

    event.preventDefault();
    moveDetailPhotoCard(draggedCard, targetCard, event.clientY);
  });

  elements.detailContent.addEventListener('drop', (event) => {
    const draggedCard = state.detailDraggedPhotoId
      ? elements.detailContent.querySelector(`.detail-photo-card[data-media-id="${state.detailDraggedPhotoId}"]`)
      : null;
    const targetCard = getDetailPhotoDropTarget(event);
    if (!draggedCard || !targetCard) return;

    event.preventDefault();
    moveDetailPhotoCard(draggedCard, targetCard, event.clientY);
  });

  elements.detailContent.addEventListener('dragend', () => {
    const shouldSave = state.detailPhotoOrderDirty;
    state.detailDraggedPhotoId = null;
    elements.detailContent.querySelectorAll('.detail-photo-card.dragging').forEach((card) => {
      card.classList.remove('dragging');
    });
    if (shouldSave) {
      void saveDetailPhotoOrder();
    }
  });

  elements.calendarDays.addEventListener('click', (event) => {
    const day = event.target.closest('[data-date]');
    if (!day) return;

    state.selectedDate = null;
    state.selectedMonth = null;
    state.historyMonthDay = day.dataset.date.slice(5);
    state.calendarDate = parseMonth(day.dataset.date.slice(0, 7)) || state.calendarDate;
    renderCalendar();
    refreshEntries();
  });

  elements.previousMonth.addEventListener('click', () => moveCalendar(-1));
  elements.nextMonth.addEventListener('click', () => moveCalendar(1));
  elements.calendarYear.addEventListener('change', () => {
    state.calendarDate = new Date(Number(elements.calendarYear.value), state.calendarDate.getMonth(), 1);
    state.selectedDate = null;
    state.historyMonthDay = null;
    syncFiltersFromCalendarDate();
    renderCalendar();
    refreshEntries();
  });

  elements.calendarMonth.addEventListener('change', () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), Number(elements.calendarMonth.value), 1);
    state.selectedDate = null;
    state.historyMonthDay = null;
    syncFiltersFromCalendarDate();
    renderCalendar();
    refreshEntries();
  });

  elements.tagFilter.addEventListener('input', renderFilterSuggestions);
  elements.tagFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyDescriptionFilter(elements.tagFilter.value);
    }
  });
  elements.tagSuggestions.addEventListener('click', (event) => {
    const suggestion = event.target.closest('[data-suggestion]');
    if (suggestion) {
      elements.tagFilter.value = replaceCurrentTag(elements.tagFilter.value, suggestion.dataset.suggestion, true);
      applyTagFilter(elements.tagFilter.value.replace(/,\s*$/, ''));
    }
  });

  elements.entryTagInput.addEventListener('input', () => {
    renderInlineTagSuggestions(
      elements.entryTagInput,
      elements.entryTagSuggestions,
      state.entryFormMode === 'edit',
    );
  });
  elements.entryTagInput.addEventListener('keydown', (event) => {
    if (state.entryFormMode !== 'edit' || event.key !== ',') return;

    event.preventDefault();
    const value = elements.entryTagInput.value;
    elements.entryTagInput.value = /,\s*$/.test(value)
      ? `${value.replace(/,\s*$/, '')}, `
      : `${value.trimEnd()}, `;
    state.entryFormDirty = true;
  });
  elements.entryMediaFiles.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      try {
        appendSelectedMediaFiles(files);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), true);
      } finally {
        event.target.value = '';
      }
    }
  });

  elements.newEntry.addEventListener('click', openCreate);
  document.querySelector('#add-quick-link').addEventListener('click', openQuickLinkDialog);
  elements.quickLinkForm.addEventListener('submit', saveQuickLink);
  elements.closeQuickLink.addEventListener('click', () => closeDialog(elements.quickLinkBackdrop));
  document.querySelector('#close-detail').addEventListener('click', () => closeDialog(elements.detailBackdrop));
  document.querySelector('#open-edit').addEventListener('click', openEdit);
  elements.togglePin.addEventListener('click', toggleCurrentEntryPin);
  document.querySelector('#delete-entry').addEventListener('click', deleteCurrentEntry);
  document.querySelector('#close-entry').addEventListener('click', closeEntryDialogWithConfirmation);
  elements.closeGallery.addEventListener('click', () => closeDialog(elements.galleryBackdrop));
  elements.galleryPrev.addEventListener('click', () => stepGallery(-1));
  elements.galleryNext.addEventListener('click', () => stepGallery(1));
  elements.galleryPrevImage.addEventListener('click', () => stepGallery(-1));
  elements.galleryNextImage.addEventListener('click', () => stepGallery(1));
  elements.galleryThumbs.addEventListener('click', (event) => {
    const thumb = event.target.closest('[data-photo-index]');
    if (!thumb || !state.currentGallery) return;
    renderPhotoGallery(state.currentGallery.entry, Number(thumb.dataset.photoIndex));
  });
  elements.entryForm.addEventListener('submit', submitEntry);
  elements.entryForm.addEventListener('input', () => {
    if (state.entryFormMode === 'edit') state.entryFormDirty = true;
  });
  elements.entryForm.addEventListener('change', () => {
    if (state.entryFormMode === 'edit') state.entryFormDirty = true;
  });

  elements.toggleCalendar.addEventListener('click', () => {
    const isOpen = elements.calendarPanel.classList.toggle('open');
    elements.toggleCalendar.textContent = isOpen ? 'Hide calendar' : 'Show calendar';
  });
  elements.togglePinFilter.addEventListener('click', togglePinFilter);
  elements.toggleUntaggedFilter.addEventListener('click', toggleUntaggedFilter);
  elements.toggleTrash.addEventListener('click', toggleTrashView);
  elements.imageCancel.addEventListener('click', () => closeDialog(elements.imageBackdrop));
  elements.imagePick.addEventListener('click', () => void submitDetailImages('pick'));
  elements.imageUpload.addEventListener('click', () => void submitDetailImages('upload'));
  elements.emptyTrash.addEventListener('click', async () => {
    if (!window.confirm('Permanently delete every entry in Trash? This cannot be undone.')) return;
    try {
      await requestJson('/api/entries/trash/all', { method: 'DELETE' });
      await loadEntryDates();
      await refreshEntries();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  elements.toggleAccountGroups.addEventListener('click', toggleAccountGroups);
  document.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-qlink]');
    if (!editButton) return;
    event.stopPropagation();
    if (state.activeQuickLinkTooltip) clearQuickLinkTooltip(state.activeQuickLinkTooltip.item);
    const editId = Number(editButton.dataset.editQlink);
    const editIndex = state.quickLinks.findIndex((item) => item.id === editId);
    if (editIndex >= 0) openEditQuickLink(editIndex);
  });
  elements.accountGroups.addEventListener('mouseover', (event) => {
    const item = event.target.closest('.qlink-item');
    if (!item || !elements.accountGroups.contains(item)) return;
    if (state.activeQuickLinkTooltip?.item !== item) {
      if (state.activeQuickLinkTooltip) clearQuickLinkTooltip(state.activeQuickLinkTooltip.item);
      const tooltip = item.querySelector('.qlink-tooltip');
      if (!tooltip) return;
      state.activeQuickLinkTooltip = { item, tooltip };
      if (!tooltip.dataset.dismissBound) {
        tooltip.addEventListener('mouseleave', () => {
          if (state.activeQuickLinkTooltip?.tooltip === tooltip) clearQuickLinkTooltip(item);
        });
        tooltip.dataset.dismissBound = 'true';
      }
      document.body.append(tooltip);
      tooltip.classList.add('qlink-tooltip-floating');
    }
    window.requestAnimationFrame(() => positionQuickLinkTooltip(item));
  });
  elements.accountGroups.addEventListener('mouseout', (event) => {
    const item = event.target.closest('.qlink-item');
    if (!item || !elements.accountGroups.contains(item)) return;
    if (event.relatedTarget && item.contains(event.relatedTarget)) return;
    const tooltip = state.activeQuickLinkTooltip?.item === item
      ? state.activeQuickLinkTooltip.tooltip
      : null;
    if (event.relatedTarget && tooltip?.contains(event.relatedTarget)) return;
    clearQuickLinkTooltip(item);
  });
  elements.accountGroups.addEventListener('dragstart', (event) => {
    const item = event.target.closest('[data-qlink-index]');
    if (!item) return;
    state.draggingQuickLinkIndex = Number(item.dataset.qlinkIndex);
    item.classList.add('qlink-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(state.draggingQuickLinkIndex));
  });
  elements.accountGroups.addEventListener('dragover', (event) => {
    const target = event.target.closest('[data-qlink-index], .account-row');
    if (!target || state.draggingQuickLinkIndex === null) return;
    const draggedItem = elements.accountGroups.querySelector(`[data-qlink-index="${state.draggingQuickLinkIndex}"]`);
    if (!draggedItem || target.parentElement !== draggedItem.parentElement) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    elements.accountGroups.querySelectorAll('.qlink-drop-target').forEach((node) => node.classList.remove('qlink-drop-target'));
    target.classList.add('qlink-drop-target');
  });
  elements.accountGroups.addEventListener('drop', (event) => {
    const targetItem = event.target.closest('[data-qlink-index]');
    const row = event.target.closest('.account-row');
    if (state.draggingQuickLinkIndex === null || (!targetItem && !row)) return;
    event.preventDefault();
    const draggedIndex = state.draggingQuickLinkIndex;
    state.draggingQuickLinkIndex = null;
    const draggedItem = elements.accountGroups.querySelector(`[data-qlink-index="${draggedIndex}"]`);
    if (!draggedItem || (targetItem ? targetItem.parentElement : row) !== draggedItem.parentElement) return;
    const rowItems = row ? row.querySelectorAll('[data-qlink-index]') : [];
    const targetIndex = targetItem
      ? Number(targetItem.dataset.qlinkIndex)
      : Number(rowItems[rowItems.length - 1]?.dataset.qlinkIndex);
    if (!Number.isInteger(targetIndex) || targetIndex === draggedIndex) return;
    void moveQuickLink(draggedIndex, targetIndex, !targetItem);
  });
  elements.accountGroups.addEventListener('dragend', (event) => {
    event.target.closest('[data-qlink-index]')?.classList.remove('qlink-dragging');
    elements.accountGroups.querySelectorAll('.qlink-drop-target').forEach((node) => node.classList.remove('qlink-drop-target'));
    state.draggingQuickLinkIndex = null;
  });
  elements.accountGroups.addEventListener('click', (event) => {
    const groupToggle = event.target.closest('.qlink-group-toggle');
    if (!groupToggle) return;
    event.stopPropagation();
    void toggleQuickLinkGroup(groupToggle.dataset.qlinkGroup);
  });
  elements.deleteQuickLink.addEventListener('click', () => void deleteCurrentQuickLink());

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadEntries({ append: true });
      }
    }, { root: elements.entries, rootMargin: '240px' });

    observer.observe(elements.entriesSentinel);
  }
  elements.entries.addEventListener('scroll', loadMoreEntriesIfNeeded, { passive: true });
  window.addEventListener('resize', layoutMobileEntries);

  [elements.quickLinkBackdrop, elements.entryBackdrop, elements.detailBackdrop, elements.imageBackdrop, elements.galleryBackdrop].forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        if (backdrop === elements.entryBackdrop) {
          closeEntryDialogWithConfirmation();
        } else {
          closeDialog(backdrop);
        }
      }
    });
  });
}

function initialize() {
  fillCalendarControls();
  renderCalendar();
  initializeEvents();
  syncPinFilterButton();
  syncUntaggedFilterButton();
  syncAccountGroupVisibility();
  loadAccountGroups();
  loadEntryDates();
  refreshEntries();
}

initialize();
