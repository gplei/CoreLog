import * as CommonTable from './appCommon/commonTable.js';
import { showAlert } from './appCommon/appAlert.js';
import {
  buildCsvUploadFormData,
  chooseCsvFiles,
  populateSelect,
  renderCsvAssignmentQueue,
  requestJson,
  setStatus,
  show,
  today,
} from './appCommon/moduleCommon.js';

const TRADE_VIEW_STORAGE_KEY = 'corelog.tradeViewMode';

const state = {
  institutions: [],
  accounts: [],
  symbols: [],
  tradeTypes: [],
  trades: [],
  tradeUploadEntries: [],
  tradeStaging: [],
  tradeStagingViewMode: 'matched',
  tradeSummaryMethod: 'fifo',
  tradeMatches: [],
  buyLots: [],
  sellMatchSummary: [],
  assetTypes: [],
  institutionTypes: [],
};

const institutionTypeOptionsList = [
  { value: 'bank', label: 'bank' },
  { value: 'brokerage', label: 'brokerage' },
  { value: 'credit_card', label: 'credit_card' },
  { value: 'crypto', label: 'crypto' },
  { value: 'other', label: 'other' },
];

function restoreTradeViewMode() {
  let viewMode = 'summary';
  try {
    const savedViewMode = window.localStorage.getItem(TRADE_VIEW_STORAGE_KEY);
    if (savedViewMode === 'detail' || savedViewMode === 'summary') viewMode = savedViewMode;
  } catch {
    // Summary remains the default when browser storage is unavailable.
  }

  const input = elements.divTradeViewMode?.querySelector(`input[value="${viewMode}"]`);
  if (input) input.checked = true;
}

function saveTradeViewMode(viewMode) {
  if (viewMode !== 'detail' && viewMode !== 'summary') return;
  try {
    window.localStorage.setItem(TRADE_VIEW_STORAGE_KEY, viewMode);
  } catch {
    // The selected view still works for this page session.
  }
}

const assetTypeOptionsList = [
  { value: 'Stock', label: 'Stock' },
  { value: 'fund', label: 'fund' },
  { value: 'etf', label: 'etf' },
  { value: 'bond', label: 'bond' },
  { value: 'crypto', label: 'crypto' },
  { value: 'cash', label: 'cash' },
  { value: 'other', label: 'other' },
];

const elements = {
  dataStatus: document.querySelector('#dataStatus'),
  selManageType: document.querySelector('#selManageType'),
  divInstitutionMgr: document.querySelector('#divInstitutionMgr'),
  divAccountManager: document.querySelector('#divAccountManager'),
  divTradeCsvMappingMgr: document.querySelector('#divTradeCsvMappingMgr'),
  divSymbolMgr: document.querySelector('#divSymbolMgr'),
  divTradeTypeMgr: document.querySelector('#divTradeTypeMgr'),
  divTradeMgr: document.querySelector('#divTradeMgr'),
  btnAddTradeStagingColumn: document.querySelector('#btnAddTradeStagingColumn'),
  btnRemoveTradeStagingColumn: document.querySelector('#btnRemoveTradeStagingColumn'),
  btnSaveTradeStagingColumns: document.querySelector('#btnSaveTradeStagingColumns'),
  tradeStagingColumnStatus: document.querySelector('#tradeStagingColumnStatus'),
  tradeStagingColumnRows: document.querySelector('#tradeStagingColumnRows'),
  selTradeCsvAccount: document.querySelector('#selTradeCsvAccount'),
  btnChooseTradeMappingFile: document.querySelector('#btnChooseTradeMappingFile'),
  tradeMappingFileName: document.querySelector('#tradeMappingFileName'),
  tradeMappingStatus: document.querySelector('#tradeMappingStatus'),
  tradeMappingRows: document.querySelector('#tradeMappingRows'),
  btnPreviewTradeMapping: document.querySelector('#btnPreviewTradeMapping'),
  btnSaveTradeMapping: document.querySelector('#btnSaveTradeMapping'),
  tradeMappingSaveStatus: document.querySelector('#tradeMappingSaveStatus'),
  tradeMappingPreview: document.querySelector('#tradeMappingPreview'),
  txtInstitutionName: document.querySelector('#txtInstitutionName'),
  selInstitutionType: document.querySelector('#selInstitutionType'),
  btnSaveInstitution: document.querySelector('#btnSaveInstitution'),
  institutionMgrMessage: document.querySelector('#institutionMgrMessage'),
  divInstitutionList: document.querySelector('#divInstitutionList'),
  selInstituteMgr: document.querySelector('#selInstituteMgr'),
  txtAccountMgr: document.querySelector('#txtAccountMgr'),
  btnSaveAccount: document.querySelector('#btnSaveAccount'),
  accountMgrMessage: document.querySelector('#accountMgrMessage'),
  divAccount: document.querySelector('#divAccount'),
  btnAddBalance: document.querySelector('#btnAddBalance'),
  dtBalence: document.querySelector('#dtBalence'),
  divAccountBalance: document.querySelector('#divAccountBalance'),
  txtSymbolCode: document.querySelector('#txtSymbolCode'),
  txtCompanyName: document.querySelector('#txtCompanyName'),
  selAssetTypeMgr: document.querySelector('#selAssetTypeMgr'),
  btnAddSymbol: document.querySelector('#btnAddSymbol'),
  txtSymbolCount: document.querySelector('#txtSymbolCount'),
  divSymbol: document.querySelector('#divSymbol'),
  txtTradeTypeName: document.querySelector('#txtTradeTypeName'),
  txtTradeTypeDisplayName: document.querySelector('#txtTradeTypeDisplayName'),
  txtTradeTypeSortOrder: document.querySelector('#txtTradeTypeSortOrder'),
  selTradeTypeActive: document.querySelector('#selTradeTypeActive'),
  btnAddTradeType: document.querySelector('#btnAddTradeType'),
  tradeTypeMgrMessage: document.querySelector('#tradeTypeMgrMessage'),
  divTradeType: document.querySelector('#divTradeType'),
  selTradeInstitute: document.querySelector('#selTradeInstitute'),
  selTradeAccount: document.querySelector('#selTradeAccount'),
  selTradeSymbol: document.querySelector('#selTradeSymbol'),
  divAddTradeForm: document.querySelector('#divAddTradeForm'),
  btnChooseTradeFiles: document.querySelector('#btnChooseTradeFiles'),
  btnPreloadTradeSymbols: document.querySelector('#btnPreloadTradeSymbols'),
  btnStageTrades: document.querySelector('#btnStageTrades'),
  btnPurgeStagedTrades: document.querySelector('#btnPurgeStagedTrades'),
  btnMergeStagedTrades: document.querySelector('#btnMergeStagedTrades'),
  tradeImportStatus: document.querySelector('#tradeImportStatus'),
  divTradeUploadQueue: document.querySelector('#divTradeUploadQueue'),
  txtTradeStagingTotal: document.querySelector('#txtTradeStagingTotal'),
  divTradeStaging: document.querySelector('#divTradeStaging'),
  dtTrade: document.querySelector('#dtTrade'),
  selTradeType: document.querySelector('#selTradeType'),
  txtShare: document.querySelector('#txtShare'),
  txtPrice: document.querySelector('#txtPrice'),
  btnAddTrade: document.querySelector('#btnAddTrade'),
  divTradeMatch: document.querySelector('#divTradeMatch'),
  selSellTrade: document.querySelector('#selSellTrade'),
  spanSellRemaining: document.querySelector('#spanSellRemaining'),
  divBuyLots: document.querySelector('#divBuyLots'),
  allTrade: document.querySelector('#allTrade'),
  selInstitute: document.querySelector('#selInstitute'),
  selAccount: document.querySelector('#selAccount'),
  selAssetType: document.querySelector('#selAssetType'),
  selSymbol: document.querySelector('#selSymbol'),
  divSymbolUpdateControls: document.querySelector('#divSymbolUpdateControls'),
  txtTradeFilterDesc: document.querySelector('#txtTradeFilterDesc'),
  btnClearTradeFilters: document.querySelector('#btnClearTradeFilters'),
  divTradeViewMode: document.querySelector('#divTradeViewMode'),
  divTradeSummaryMethod: document.querySelector('#divTradeSummaryMethod'),
  yLink: document.querySelector('#yLink'),
  txtCurrPrice: document.querySelector('#txtCurrPrice'),
  btnUsePrice: document.querySelector('#btnUsePrice'),
  txtSplitRatio: document.querySelector('#txtSplitRatio'),
  btnSplit: document.querySelector('#btnSplit'),
  btnUpdPrices: document.querySelector('#btnUpdPrices'),
  divStockSummary: document.querySelector('#divStockSummary'),
};

function setMessage(message, isError = false) {
  setStatus(elements.dataStatus, message, isError);
}

function showMessage(message, isError = false) {
  setMessage(message, isError);
}


function getInstitutionName(inst) {
  return String(inst?.name ?? inst?.institute ?? '');
}

function getSymbolLabel(symbolId) {
  const symbol = state.symbols.find((item) => String(item.id) === String(symbolId));
  return symbol ? String(symbol.symbol ?? '') : '';
}

function getAccountLabel(accountId) {
  const account = state.accounts.find((item) => String(item.id) === String(accountId));
  return account ? String(account.account_name ?? '') : '';
}

function getInstitutionLabel(institutionId) {
  const institution = state.institutions.find((item) => String(item.id) === String(institutionId));
  return institution ? getInstitutionName(institution) : '';
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => String(item?.[key] ?? '').trim()).filter(Boolean))].sort();
}

function optionsFrom(items, valueKey, labelKey = valueKey) {
  return items.map((item) => ({
    value: item[valueKey],
    label: item[labelKey],
  }));
}

function symbolOptions() {
  return state.symbols
    .filter((item) => Number(item.active ?? 1) !== 0)
    .slice()
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)))
    .map((item) => ({
      value: item.id,
      label: item.symbol,
    }));
}

function summarySymbolOptions() {
  const selectedInstitute = elements.selInstitute?.value ?? '';
  const selectedAccount = elements.selAccount?.value ?? '';
  const selectedAssetType = (elements.selAssetType?.value ?? '').toLowerCase();
  const hasPreviousFilter = Boolean(selectedInstitute || selectedAccount || selectedAssetType);
  const filteredSymbolIds = new Set(
    state.trades
      .filter((trade) => !selectedInstitute || String(trade.institution_id ?? '') === selectedInstitute)
      .filter((trade) => !selectedAccount || String(trade.account_id ?? '') === selectedAccount)
      .filter((trade) => !selectedAssetType || String(trade.asset_type ?? '').toLowerCase() === selectedAssetType)
      .map((trade) => String(trade.symbol_id ?? ''))
      .filter(Boolean),
  );

  return state.symbols
    .filter((item) => !hasPreviousFilter || filteredSymbolIds.has(String(item.id)))
    .slice()
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)))
    .map((item) => ({
      value: item.id,
      label: item.symbol,
    }));
}

function accountOptions(accounts = state.accounts) {
  return accounts.map((item) => ({
    value: item.id,
    label: item.account_name,
  }));
}

function tradeTypeOptions() {
  return state.tradeTypes
    .filter((item) => Number(item.active ?? 1) !== 0)
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100) || String(a.display_name ?? a.name).localeCompare(String(b.display_name ?? b.name)))
    .map((item) => ({ value: item.name, label: item.display_name ?? item.name }));
}

function accountsForInstitution(institutionId) {
  if (!institutionId) {
    return state.accounts;
  }

  return state.accounts.filter((account) => String(account.institution_id ?? '') === String(institutionId));
}

function institutionOptions() {
  return state.institutions.map((item) => ({
    value: item.id,
    label: getInstitutionName(item),
  }));
}

function currentAssetTypes() {
  return uniqueValues(state.symbols, 'asset_type');
}

function currentInstitutionTypes() {
  return uniqueValues(state.institutions, 'type');
}

function institutionTypeOptions() {
  return institutionTypeOptionsList;
}

function tradeRowTotal(trade) {
  const share = Number(trade.share ?? 0);
  const price = Number(trade.price ?? 0);
  const tradeType = String(trade.trade_type ?? '').toUpperCase();
  return Number(trade.total ?? (tradeType === 'BUY' ? -share * price : share * price));
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function convertPercent(base, gainLoss) {
  const baseValue = Number(base ?? 0);
  const gainLossValue = Number(gainLoss ?? 0);
  return `${baseValue === 0 ? 0 : (100 * gainLossValue / baseValue).toFixed(2)}%`;
}

function convertGainLossSummary(gainLoss) {
  const costBasis = Number(gainLoss?.cost_basis ?? 0);
  const value = Number(gainLoss?.gain_loss ?? 0);
  const pct = costBasis === 0 ? 0 : (100 * value / costBasis).toFixed(2);
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
}

function createH3(title) {
  const h3 = document.createElement('h3');
  h3.textContent = title;
  return h3;
}

function createTradeSummaryHeading(title, includeFetchAll = false) {
  const heading = document.createElement('div');
  heading.className = 'module-table-heading';
  const titleLabel = document.createElement('span');
  titleLabel.className = 'module-section-title';
  titleLabel.textContent = title;
  heading.append(titleLabel, elements.divTradeSummaryMethod);
  if (includeFetchAll) {
    elements.btnUpdPrices.classList.remove('hidden');
    heading.appendChild(elements.btnUpdPrices);
  }
  return heading;
}

function getYahooLink(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;
}

function getCurrentSummaryPrice(symbol) {
  const typedPrice = Number(elements.txtCurrPrice?.value ?? '');
  if (Number.isFinite(typedPrice) && typedPrice > 0) {
    return typedPrice;
  }

  return Number(symbol?.price ?? 0);
}

function compareTradeOrder(left, right) {
  const leftTime = left?.trade_date ? new Date(left.trade_date).getTime() : 0;
  const rightTime = right?.trade_date ? new Date(right.trade_date).getTime() : 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return Number(left?.id ?? 0) - Number(right?.id ?? 0);
}

function closeSellLotPopup() {
  document.getElementById('sellLotPopup')?.remove();
}

function currentTradeMatches() {
  return Array.isArray(state.tradeMatches) ? state.tradeMatches : [];
}

async function openSellAllocationPopup(trade, anchorCell) {
  if (!trade || String(trade.trade_type ?? '').toUpperCase() !== 'SELL') return;

  closeSellLotPopup();

  const sellId = Number(trade.id);
  const accountId = Number(trade.account_id);
  const symbolId = Number(trade.symbol_id);
  const sellShare = Number(trade.share ?? 0);
  const selectedSell = state.trades.find((item) => Number(item.id) === sellId) ?? trade;
  const sellById = new Map(
    state.trades
      .filter((item) => String(item.trade_type ?? '').toUpperCase() === 'SELL')
      .map((item) => [Number(item.id), item]),
  );
  const matches = currentTradeMatches().filter((match) => Number(match.sell_trade_id) === sellId);
  const currentAllocatedShare = matches.reduce((sum, match) => sum + Number(match.matched_share ?? 0), 0);
  const remainingShare = sellShare - currentAllocatedShare;

  const allocationRows = state.trades
    .filter((item) => String(item.trade_type ?? '').toUpperCase() === 'BUY'
      && Number(item.account_id) === accountId
      && Number(item.symbol_id) === symbolId
      && compareTradeOrder(item, selectedSell) <= 0)
    .map((buyTrade) => {
      const buyMatches = currentTradeMatches().filter((match) => Number(match.buy_trade_id) === Number(buyTrade.id));
      const matchedBeforeThisSell = buyMatches.reduce((sum, match) => {
        const matchSell = sellById.get(Number(match.sell_trade_id));
        if (Number(match.sell_trade_id) !== sellId && compareTradeOrder(matchSell, selectedSell) < 0) {
          return sum + Number(match.matched_share ?? 0);
        }
        return sum;
      }, 0);
      const currentAllocation = buyMatches.reduce((sum, match) => {
        if (Number(match.sell_trade_id) === sellId) {
          return sum + Number(match.matched_share ?? 0);
        }
        return sum;
      }, 0);
      const maxShare = Math.max(0, Number(buyTrade.share ?? 0) - matchedBeforeThisSell);
      return {
        buy_id: Number(buyTrade.id),
        trade_date: String(buyTrade.trade_date ?? ''),
        share: Number(buyTrade.share ?? 0),
        available_share: Math.max(0, maxShare - currentAllocation),
        allocated_share: currentAllocation,
        price: Number(buyTrade.price ?? 0),
        allocate: '',
      };
    })
    .filter((lot) => lot.available_share > 1e-6 || lot.allocated_share > 1e-6)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date) || a.buy_id - b.buy_id);

  const popup = document.createElement('div');
  popup.id = 'sellLotPopup';
  popup.style.position = 'fixed';
  popup.style.zIndex = '9999';
  popup.style.background = '#ffffff';
  popup.style.border = '1px solid #dbe4ee';
  popup.style.borderRadius = '14px';
  popup.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.18)';
  popup.style.padding = '12px';
  popup.style.minWidth = '640px';
  popup.style.maxWidth = '760px';
  popup.style.maxHeight = '70vh';
  popup.style.overflow = 'auto';

  if (anchorCell?.getBoundingClientRect) {
    const rect = anchorCell.getBoundingClientRect();
    popup.style.left = `${Math.max(16, Math.min(window.innerWidth - 700, rect.right + 12))}px`;
    popup.style.top = `${Math.max(16, Math.min(window.innerHeight - 500, rect.top))}px`;
  } else {
    popup.style.left = '50%';
    popup.style.top = '12%';
    popup.style.transform = 'translateX(-50%)';
  }

  const title = document.createElement('div');
  title.style.marginBottom = '8px';
  title.style.fontSize = '12px';
  title.style.lineHeight = '1.35';
  title.style.color = '#334155';
  title.innerHTML = `<strong>Allocate SELL shares</strong><br/>Sell total: ${sellShare} | Allocated: ${currentAllocatedShare} | Unallocated: ${remainingShare}`;
  popup.appendChild(title);

  if (matches.length > 0) {
    const allocatedDetail = document.createElement('div');
    allocatedDetail.style.marginBottom = '8px';
    allocatedDetail.style.fontSize = '12px';
    allocatedDetail.style.lineHeight = '1.35';
    allocatedDetail.style.color = '#334155';
    allocatedDetail.innerHTML = `<strong>Allocated lots:</strong> ${matches.map((match) => `Buy ${match.buy_trade_id}: ${Number(match.matched_share)}`).join(' | ')}`;
    popup.appendChild(allocatedDetail);
  }

  const notice = document.createElement('div');
  notice.style.color = '#b91c1c';
  notice.style.fontSize = '12px';
  notice.style.lineHeight = '1.35';
  notice.style.marginBottom = '8px';
  popup.appendChild(notice);

  const table = CommonTable.createTable(allocationRows, {
    table: {
      header: ['Buy ID', 'Date', 'Share', 'Available', 'Allocated', 'Price', 'Allocate'],
      sort: false,
      resize: false,
      showEmptyTable: true,
    },
    column: [
      { columnName: 'available_share', enableColor: true },
      { columnName: 'allocated_share', enableColor: true },
      {
        columnName: 'trade_date',
        onValue: {
          render: (td, row) => {
            td.textContent = String(row.trade_date ?? '').slice(0, 10);
          },
        },
      },
      {
        columnName: 'allocate',
        onValue: {
          render: (td, row) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '0.000001';
            input.value = String(row.allocated_share ?? 0);
            input.dataset.buyId = String(row.buy_id ?? '');
            input.style.width = '100px';
            td.appendChild(input);
          },
        },
      },
    ],
  });
  popup.appendChild(table);

  const summary = document.createElement('div');
  summary.style.marginTop = '8px';
  summary.style.fontSize = '12px';
  summary.style.lineHeight = '1.35';
  summary.style.color = '#334155';
  summary.innerHTML = `Total allocated: <span id="sellLotPopupTotal">${currentAllocatedShare}</span> / ${sellShare}`;
  popup.appendChild(summary);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'space-between';
  actions.style.gap = '8px';
  actions.style.marginTop = '12px';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'module-action-button';
  closeBtn.textContent = 'Close';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'module-action-button';
  submitBtn.textContent = 'Submit Allocation';
  submitBtn.disabled = true;

  actions.appendChild(closeBtn);
  actions.appendChild(submitBtn);
  popup.appendChild(actions);

  const allocationInputs = Array.from(popup.querySelectorAll('input[data-buy-id]')).map((input) => {
    const row = input.closest('tr');
    const available = Number(row?.children[3]?.textContent ?? 0);
    const allocated = Number(row?.children[4]?.textContent ?? 0);
    return {
      input,
      buyId: Number(input.getAttribute('data-buy-id') ?? 0),
      maxShare: available + allocated,
    };
  });

  const updateAllocation = () => {
    const total = allocationInputs.reduce((sum, item) => sum + (Number(item.input.value) || 0), 0);
    const totalElem = popup.querySelector('#sellLotPopupTotal');
    if (totalElem) {
      totalElem.textContent = total.toFixed(6);
    }

    let error = '';
    if (total <= 0) {
      error = 'Enter allocation shares before submitting.';
    } else if (Math.abs(total - sellShare) > 1e-6) {
      error = `Allocated total must equal sell share (${sellShare}).`;
    }
    for (const item of allocationInputs) {
      if ((Number(item.input.value) || 0) > item.maxShare + 1e-6) {
        error = 'One or more allocation values exceed available buy lot share.';
        break;
      }
    }
    notice.textContent = error;
    submitBtn.disabled = Boolean(error);
  };

  allocationInputs.forEach((item) => item.input.addEventListener('input', updateAllocation));

  const trimLaterMatches = async (allocations) => {
    for (const allocation of allocations) {
      const buyTrade = state.trades.find((item) => Number(item.id) === Number(allocation.buyId));
      if (!buyTrade) continue;

      const matchedBeforeThisSell = currentTradeMatches().reduce((sum, match) => {
        if (Number(match.buy_trade_id) !== Number(allocation.buyId)) return sum;
        const matchSell = sellById.get(Number(match.sell_trade_id));
        if (compareTradeOrder(matchSell, selectedSell) < 0) {
          return sum + Number(match.matched_share ?? 0);
        }
        return sum;
      }, 0);

      const laterMatches = currentTradeMatches()
        .filter((match) => {
          const matchSell = sellById.get(Number(match.sell_trade_id));
          return Number(match.buy_trade_id) === Number(allocation.buyId)
            && Number(match.sell_trade_id) !== sellId
            && compareTradeOrder(matchSell, selectedSell) > 0;
        })
        .sort((a, b) => compareTradeOrder(
          sellById.get(Number(b.sell_trade_id)),
          sellById.get(Number(a.sell_trade_id)),
        ));

      const laterMatchedShare = laterMatches.reduce((sum, match) => sum + Number(match.matched_share ?? 0), 0);
      const remainingForLaterSells = Math.max(0, Number(buyTrade.share ?? 0) - matchedBeforeThisSell - allocation.matchedShare);
      let excessLaterShare = Math.max(0, laterMatchedShare - remainingForLaterSells);
      if (excessLaterShare <= 1e-6) continue;

      for (const laterMatch of laterMatches) {
        if (excessLaterShare <= 1e-6) break;

        const laterShare = Number(laterMatch.matched_share ?? 0);
        if (laterShare <= excessLaterShare + 1e-6) {
          await deleteTableRow('trd_lot_match', laterMatch.id);
          excessLaterShare -= laterShare;
        } else {
          await updateTable('trd_lot_match', laterMatch.id, 'matched_share', laterShare - excessLaterShare);
          excessLaterShare = 0;
        }
      }
    }
  };

  submitBtn.addEventListener('click', async () => {
    const allocations = allocationInputs
      .map((item) => ({
        buyId: item.buyId,
        matchedShare: Number(item.input.value) || 0,
      }))
      .filter((item) => item.matchedShare > 0);
    const total = allocations.reduce((sum, item) => sum + item.matchedShare, 0);
    if (Math.abs(total - sellShare) > 1e-6) {
      notice.textContent = `Please allocate exactly ${sellShare} shares.`;
      return;
    }

    try {
      await Promise.all(matches.map((match) => deleteTableRow('trd_lot_match', match.id)));
      await trimLaterMatches(allocations);
      await Promise.all(allocations.map((item) => requestJson('/api/trade/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyId: item.buyId,
          sellId,
          matchedShare: item.matchedShare,
        }),
      })));
      await refreshAllData();
      closeSellLotPopup();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      notice.textContent = `Failed to save allocation: ${err.message}`;
    }
  });

  closeBtn.addEventListener('click', () => closeSellLotPopup());

  document.body.appendChild(popup);
  updateAllocation();
}

function decorateSellTradeCells(container, tradeRows) {
  if (!container || !Array.isArray(tradeRows)) return;
  const table = container.querySelector('table');
  if (!table) return;
  const headerCells = Array.from(table.querySelectorAll('thead th'));
  const tradeTypeIndex = headerCells.findIndex((th) => th.textContent?.trim().toLowerCase() === 'trade type');
  if (tradeTypeIndex < 0) return;

  const rows = Array.from(table.querySelectorAll('tbody tr'));
  rows.forEach((row, index) => {
    const trade = tradeRows[index];
    if (!trade || String(trade.trade_type ?? '').toUpperCase() !== 'SELL') return;
    const cell = row.cells[tradeTypeIndex];
    if (!cell) return;
    if (cell.querySelector('button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'module-action-button';
    button.textContent = 'SELL';
    button.style.textDecoration = 'underline';
    button.style.cursor = 'pointer';
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await openSellAllocationPopup(trade, cell);
    });

    cell.innerHTML = '';
    cell.appendChild(button);
  });
}

async function loadMetadata() {
  const [institutions, accounts, symbols, balances, tradeTypes] = await Promise.all([
    requestJson('/api/table/trd_institution'),
    requestJson('/api/table/trd_account'),
    requestJson('/api/table/trd_symbol'),
    requestJson('/api/table/trd_account_balance'),
    requestJson('/api/table/trd_trade_type'),
  ]);

  state.institutions = institutions;
  state.accounts = accounts;
  state.symbols = symbols;
  state.assetTypes = assetTypeOptionsList.map((item) => item.value);
  state.institutionTypes = institutionTypeOptionsList.map((item) => item.value);
  state.accountBalances = balances;
  state.tradeTypes = tradeTypes;
}

async function loadTrades() {
  state.trades = await requestJson('/api/trade');
}

async function loadTradeMatches() {
  state.tradeMatches = await requestJson('/api/table/trd_lot_match');
}

async function refreshAllData() {
  setMessage('Loading trade data...');
  await Promise.all([loadMetadata(), loadTrades(), loadTradeMatches(), loadTradeStaging()]);
  renderAll();
}

async function updateTable(table, id, column, newValue) {
  await requestJson('/api/table', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, id: Number(id), column, newValue }),
  });
}

function updateLocalTableRow(table, id, column, newValue) {
  const tableRows = {
    trd_institution: state.institutions,
    trd_account: state.accounts,
    trd_account_balance: state.accountBalances,
    trd_symbol: state.symbols,
    trd_trade_type: state.tradeTypes,
    trd_log: state.trades,
    trd_log_stg: state.tradeStaging,
  }[table];
  const row = tableRows?.find((item) => String(item.id) === String(id));
  if (row) row[column] = newValue;
}

async function deleteTableRow(table, id) {
  await requestJson(`/api/table/${Number(id)}/${table}`, { method: 'DELETE' });
}

function renderCrudTable(container, rows, tableName, columns, options = {}) {
  if (!container) return;
  const normalizedRows = rows.map((row) => {
    const normalized = { id: row.id };
    for (const column of columns) {
      normalized[column.key] = row[column.key];
    }
    return normalized;
  });

  const table = CommonTable.createTable(normalizedRows, {
    table: {
      keyName: 'id',
      columnListToHide: ['id', 'created_at', 'updated_at', ...(options.hiddenColumns ?? [])],
      header: columns.filter((column) => column.key !== 'id' && !(options.hiddenColumns ?? []).includes(column.key)).map((column) => column.label ?? column.key),
      onchange: async (id, newValue, columnName) => {
        await updateTable(tableName, id, columnName, newValue);
        updateLocalTableRow(tableName, id, columnName, newValue);
      },
      onselect: async (id, newValue, columnName) => {
        await updateTable(tableName, id, columnName, newValue);
        updateLocalTableRow(tableName, id, columnName, newValue);
      },
      ondelete: options.deletable === false ? undefined : async (id) => {
        await deleteTableRow(tableName, id);
        await refreshAllData();
      },
      // Keep rows read-only until the row's Action > edit button is clicked.
      // This makes the Action column the single entry point for inline edits.
      edit: options.tableEdit ?? false,
      sort: options.sort,
      resize: options.resize ?? false,
    },
    column: columns.map((column) => ({
      columnName: column.key,
      type: column.type === 'select' ? 'SELECT' : column.type === 'date' ? 'DATE' : column.type === 'number' ? 'NUMBER' : 'STRING',
      readOnly: column.type === 'readonly',
      hideInReadMode: column.hideInReadMode === true,
      optionData: column.options?.map((option) => ({
        value: option.value,
        text: option.label,
      })),
    })),
  });

  if (options.tableClass) table.classList.add(options.tableClass);
  container.innerHTML = '';
  container.appendChild(table);
}

function renderInstitutionManager() {
  populateSelect(elements.selInstitutionType, institutionTypeOptions(), '-- Select Type --');
  renderCrudTable(elements.divInstitutionList, state.institutions, 'trd_institution', [
    { key: 'id', label: 'ID', type: 'readonly' },
    { key: 'name', label: 'Name' },
    { key: 'short_name', label: 'Short Name' },
    { key: 'type', label: 'Type', type: 'select', options: institutionTypeOptions() },
    { key: 'website', label: 'Website' },
    { key: 'note', label: 'Note' },
  ], {
    deletable: true,
      hiddenColumns: ['id'],
  });
}

function renderAccountManager() {
  populateSelect(elements.selInstituteMgr, institutionOptions(), '-- Select Institution --');
  const selectedInstituteId = elements.selInstituteMgr.value;
  const filteredAccounts = accountsForInstitution(selectedInstituteId);
  const accountRows = filteredAccounts.map((account) => ({
    ...account,
    last_txn_date: String(account.last_txn_date ?? '').slice(0, 10),
  }));
  renderCrudTable(elements.divAccount, accountRows, 'trd_account', [
    { key: 'account_name', label: 'Account Name' },
    { key: 'institution_id', label: 'Institution', type: 'select', options: institutionOptions() },
    { key: 'url', label: 'URL', hideInReadMode: true },
    { key: 'staging_params', label: 'Stage Param', hideInReadMode: true },
    { key: 'last_txn_date', label: 'Last Trade Date', type: 'date' },
    { key: 'last_merge_date', label: 'Last Merge Date', type: 'date' },
  ], {
    deletable: true,
    hiddenColumns: ['id'],
  });

  const selectedDate = elements.dtBalence.value || today();
  const balancesForDate = (state.accountBalances ?? []).filter((row) => String(row.date ?? '') <= selectedDate);
  const latestByAccount = new Map();
  for (const row of balancesForDate) {
    const key = String(row.account_id ?? '');
    const current = latestByAccount.get(key);
    if (!current || String(row.date) > String(current.date)) {
      latestByAccount.set(key, row);
    }
  }

  renderCrudTable(elements.divAccountBalance, [...latestByAccount.values()], 'trd_account_balance', [
    { key: 'id', label: 'ID', type: 'readonly' },
    { key: 'account_id', label: 'Account', type: 'select', options: accountOptions() },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'total_balance', label: 'Total Balance', type: 'number', step: '0.01' },
    { key: 'market_value', label: 'Market Value', type: 'number', step: '0.01' },
    { key: 'cash_balance', label: 'Cash Balance', type: 'number', step: '0.01' },
    { key: 'cost_basis', label: 'Cost Basis', type: 'number', step: '0.01' },
    { key: 'notes', label: 'Notes' },
  ], {
    deletable: true,
    hiddenColumns: ['id'],
  });
  renderTradeStaging();
  renderTradeUploadQueue();
}

function renderSymbolManager() {
  populateSelect(elements.selAssetTypeMgr, assetTypeOptionsList, '-- Select Asset Type --');
  if (elements.txtSymbolCount) {
    elements.txtSymbolCount.textContent = `${state.symbols.length} symbol${state.symbols.length === 1 ? '' : 's'}`;
  }
  renderCrudTable(elements.divSymbol, state.symbols, 'trd_symbol', [
    { key: 'id', label: 'ID', type: 'readonly' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'price', label: 'Price', type: 'number', step: '0.0001' },
    { key: 'previous_price', label: 'Previous Price', type: 'number', step: '0.0001' },
    { key: 'asset_type', label: 'Asset Type', type: 'select', options: assetTypeOptionsList },
    {
      key: 'active',
      label: 'Active',
      type: 'select',
      options: [{ value: 1, label: 'Active' }, { value: 0, label: 'Inactive' }],
    },
  ], {
    deletable: true,
    sort: true,
    hiddenColumns: ['id'],
  });
}

function renderTradeTypeManager() {
  renderCrudTable(elements.divTradeType, state.tradeTypes, 'trd_trade_type', [
    { key: 'id', label: 'ID', type: 'readonly' },
    { key: 'name', label: 'Name' },
    { key: 'display_name', label: 'Display Name' },
    { key: 'sort_order', label: 'Sort Order', type: 'number' },
    {
      key: 'active',
      label: 'Active',
      type: 'select',
      options: [{ value: 1, label: 'Active' }, { value: 0, label: 'Inactive' }],
    },
  ], { deletable: true, resize: true, sort: true, hiddenColumns: ['id'] });
}

function renderTradeManager() {
  const selectedInstitutionId = elements.selTradeInstitute.value;
  const selectedAccountId = elements.selTradeAccount.value;
  const selectedSymbolId = elements.selTradeSymbol.value;

  populateSelect(elements.selTradeInstitute, institutionOptions(), '-- Select institution --');
  elements.selTradeInstitute.value = selectedInstitutionId;

  const filteredAccounts = accountsForInstitution(selectedInstitutionId);
  populateSelect(elements.selTradeAccount, accountOptions(filteredAccounts), '-- Select account --');
  populateSelect(elements.selTradeSymbol, symbolOptions(), '-- Select symbol --');
  const selectedTradeType = elements.selTradeType.value;
  populateSelect(elements.selTradeType, tradeTypeOptions(), '');
  elements.selTradeType.value = selectedTradeType || 'BUY';
  if (filteredAccounts.some((account) => String(account.id) === selectedAccountId)) {
    elements.selTradeAccount.value = selectedAccountId;
  }
  if (state.symbols.some((symbol) => String(symbol.id) === selectedSymbolId)) {
    elements.selTradeSymbol.value = selectedSymbolId;
  }
  show(elements.divAddTradeForm, Boolean(elements.selTradeInstitute.value && elements.selTradeAccount.value && elements.selTradeSymbol.value));

  const tradeRows = state.trades
    .filter((trade) => !selectedAccountId || String(trade.account_id ?? '') === selectedAccountId)
    .filter((trade) => !selectedSymbolId || String(trade.symbol_id ?? '') === selectedSymbolId)
    .map((trade) => ({
      ...trade,
      symbol_id: trade.symbol_id,
      account_id: trade.account_id,
      total: trade.total ?? tradeRowTotal(trade),
    }));
  renderCrudTable(elements.allTrade, tradeRows, 'trd_log', [
    { key: 'id', label: 'ID', type: 'readonly' },
    { key: 'trade_date', label: 'Date', type: 'date' },
    { key: 'symbol_id', label: 'Symbol', type: 'select', options: symbolOptions() },
    {
      key: 'trade_type',
      label: 'Trade Type',
      type: 'select',
      options: tradeTypeOptions(),
      onValue: {
        value: 'SELL',
        render: (td, row) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'module-action-button';
          button.textContent = 'SELL';
          button.style.textDecoration = 'underline';
          button.style.cursor = 'pointer';
          button.addEventListener('click', async (event) => {
            event.stopPropagation();
            await openSellAllocationPopup(row, td);
          });
          td.innerHTML = '';
          td.appendChild(button);
        },
      },
    },
    { key: 'share', label: 'Share', type: 'number', step: '1' },
    { key: 'price', label: 'Price', type: 'number', step: '0.0001' },
    { key: 'total', label: 'Amount', type: 'number', step: '0.01' },
    { key: 'asset_type', label: 'Asset Type', type: 'readonly' },
    { key: 'account_id', label: 'Account', type: 'select', options: accountOptions(filteredAccounts) },
    { key: 'institution_id', label: 'Institute', type: 'readonly' },
    { key: 'note', label: 'Note' },
  ], {
    deletable: true,
    tableEdit: false,
    resize: true,
    hiddenColumns: ['id'],
  });
  decorateSellTradeCells(elements.allTrade, tradeRows);

  const sellTrades = state.trades.filter((trade) => String(trade.trade_type).toUpperCase() === 'SELL');
  populateSelect(elements.selSellTrade, sellTrades.map((trade) => ({
    value: trade.id,
    label: `${trade.trade_date} | ${trade.symbol ?? getSymbolLabel(trade.symbol_id)} | ${trade.share ?? 0} @ ${trade.price ?? 0} | lot ${trade.lot ?? ''}`,
  })), '-- Select existing SELL trade --');
  renderTradeStaging();
}

async function loadTradeStaging() {
  state.tradeStaging = await requestJson('/api/table/trd_log_stg');
}

function renderTradeStaging() {
  if (!elements.divTradeStaging) return;
  const sourcesByAccountId = new Map(state.accounts.map((account) => [String(account.id), account]));
  const getDate = (value) => String(value ?? '').trim().slice(0, 10);
  const allStagingRows = state.tradeStaging ?? [];
  const visibleStagingRows = state.tradeStagingViewMode === 'all'
    ? allStagingRows
    : allStagingRows.filter((row) => {
      const lastTradeDate = getDate(sourcesByAccountId.get(String(row.account_id))?.last_txn_date);
      return Boolean(lastTradeDate) && getDate(row.trade_date) === lastTradeDate;
    });
  if (elements.txtTradeStagingTotal) {
    const dividendTotal = visibleStagingRows
      .filter((row) => String(row.trade_type ?? '').toUpperCase() === 'DIVIDEND')
      .reduce((sum, row) => sum + Number(row.total ?? 0), 0);
    elements.txtTradeStagingTotal.textContent = `${visibleStagingRows.length} shown / ${allStagingRows.length} total · Dividend total: ${formatNumber(dividendTotal)}`;
  }
  const rows = visibleStagingRows.map((row) => ({
    id: row.id,
    date: row.trade_date ?? '',
    symbol: getSymbolLabel(row.symbol_id),
    trade_type: row.trade_type ?? '',
    share: row.share ?? '',
    price: row.price ?? '',
    total: row.total ?? '',
    asset_type: state.symbols.find((symbol) => String(symbol.id) === String(row.symbol_id))?.asset_type ?? '',
    account: getAccountLabel(row.account_id),
    institute: getInstitutionLabel(row.institution_id ?? state.accounts.find((account) => String(account.id) === String(row.account_id))?.institution_id),
    note: row.note ?? '',
    import_flag: row.import_flag ?? 1,
  }));
  elements.divTradeStaging.innerHTML = '';
  elements.divTradeStaging.appendChild(CommonTable.createTable(
      rows.length > 0 ? rows : [{ id: '', date: 'No matching staged trades.', symbol: '', trade_type: '', share: '', price: '', total: '', asset_type: '', account: '', institute: '', note: '', import_flag: '' }],
    {
      table: {
        edit: true,
        keyName: 'id',
        columnListToHide: ['id'],
        header: ['Date', 'Symbol', 'Trade Type', 'Share', 'Price', 'Amount', 'Asset Type', 'Account', 'Institute', 'Note', 'Import Flag'],
        sort: true,
        resize: true,
        onchange: async (id, newValue, column) => {
          if (column !== 'import_flag' && column !== 'note') return;
          await requestJson('/api/table', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id), table: 'trd_log_stg', column, newValue }),
          });
          await loadTradeStaging();
          renderTradeStaging();
        },
        onselect: async (id, newValue, column) => {
          if (column !== 'import_flag') return;
          await requestJson('/api/table', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id), table: 'trd_log_stg', column, newValue }),
          });
          updateLocalTableRow('trd_log_stg', id, column, newValue);
        },
      },
      column: [
        { columnName: 'id', readOnly: true },
        { columnName: 'date', readOnly: true },
        { columnName: 'symbol', readOnly: true },
        { columnName: 'trade_type', readOnly: true },
        { columnName: 'share', readOnly: true },
        { columnName: 'price', readOnly: true },
        { columnName: 'total', readOnly: true },
        { columnName: 'asset_type', readOnly: true },
        { columnName: 'account', readOnly: true },
        { columnName: 'institute', readOnly: true },
        { columnName: 'note' },
        {
          columnName: 'import_flag',
          type: 'SELECT',
          optionData: [{ value: '1', label: '1' }, { value: '0', label: '0' }],
        },
      ],
    },
  ));
}

function computeSummaryRows() {
  const selectedInstitute = elements.selInstitute.value;
  const selectedAccount = elements.selAccount.value;
  const selectedAssetType = elements.selAssetType.value.toLowerCase();
  const selectedSymbol = elements.selSymbol.value;

  return state.trades.filter((trade) => {
    if (selectedInstitute && String(trade.institution_id ?? '') !== selectedInstitute) return false;
    if (selectedAccount && String(trade.account_id ?? '') !== selectedAccount) return false;
    if (selectedAssetType && String(trade.asset_type ?? '').toLowerCase() !== selectedAssetType) return false;
    if (selectedSymbol && String(trade.symbol_id ?? '') !== selectedSymbol) return false;
    return true;
  });
}

function updateTradeFilterDescription() {
  if (!elements.txtTradeFilterDesc) return;
  const filters = [
    ['institution', elements.selInstitute],
    ['account', elements.selAccount],
    ['asset type', elements.selAssetType],
    ['symbol', elements.selSymbol],
  ]
    .filter(([, select]) => select?.value)
    .map(([label, select]) => `${label}: ${select.selectedOptions[0]?.textContent?.trim() ?? select.value}`);
  elements.txtTradeFilterDesc.textContent = filters.length > 0 ? filters.join(' · ') : 'No filter';
}

function renderTradeDetail(filteredTrades) {
  const rows = filteredTrades.map((trade) => ({
    id: trade.id,
    trade_date: trade.trade_date ?? '',
    symbol_id: trade.symbol_id,
    trade_type: trade.trade_type ?? '',
    share: trade.share ?? '',
    price: trade.price ?? '',
    total: trade.total ?? tradeRowTotal(trade),
    asset_type: trade.asset_type ?? '',
    account_id: trade.account_id,
    institution_id: trade.institution_id,
    note: trade.note ?? '',
  }));

  elements.divStockSummary.classList.add('trade-detail-scroll');
  elements.divStockSummary.innerHTML = '';
  elements.divStockSummary.appendChild(createH3('Trade detail'));
  renderCrudTable(elements.divStockSummary, rows, 'trd_log', [
    { key: 'trade_date', label: 'Date', type: 'date' },
    { key: 'symbol_id', label: 'Symbol', type: 'select', options: symbolOptions().map((item) => ({ value: item.value, label: item.label })) },
    { key: 'trade_type', label: 'Trade Type', type: 'select', options: tradeTypeOptions() },
    { key: 'share', label: 'Share', type: 'number' },
    { key: 'price', label: 'Price', type: 'number' },
    { key: 'total', label: 'Amount', type: 'readonly' },
    { key: 'asset_type', label: 'Asset Type', type: 'readonly' },
    { key: 'account_id', label: 'Account', type: 'select', options: accountOptions() },
    { key: 'institution_id', label: 'Institute', type: 'readonly' },
    { key: 'note', label: 'Note' },
  ], { deletable: true, resize: true, sort: true, tableClass: 'trade-data-table', hiddenColumns: ['id'] });
}

function renderSummary() {
  const filtered = computeSummaryRows();
  elements.divStockSummary.classList.remove('trade-detail-scroll');
  updateTradeFilterDescription();
  const dividendTotal = filtered
    .filter((trade) => String(trade.trade_type ?? '').toUpperCase() === 'DIVIDEND')
    .reduce((sum, trade) => sum + tradeRowTotal(trade), 0);
  setMessage(`Trade data loaded: ${filtered.length} trade${filtered.length === 1 ? '' : 's'} · Dividend total: ${formatNumber(dividendTotal)}.`);
  const selectedSymbolId = elements.selSymbol.value;
  show(elements.divSymbolUpdateControls, Boolean(selectedSymbolId));

  const selectedView = elements.divTradeViewMode?.querySelector('input:checked')?.value ?? 'detail';
  elements.divTradeSummaryMethod?.classList.toggle('hidden', selectedView !== 'summary');
  if (selectedView === 'detail') {
    renderTradeDetail(filtered);
    return;
  }

  if (!selectedSymbolId) {
    renderAllRemainingGainLoss(filtered);
    return;
  }

  const symbol = state.symbols.find((item) => String(item.id) === String(selectedSymbolId));
  if (!symbol) {
    elements.divStockSummary.innerHTML = '<div class="muted">No symbol selected.</div>';
    return;
  }

  const summary = calculateSingleSummary(symbol, filtered, getCurrentSummaryPrice(symbol));
  renderSelectedSymbolSummary(symbol, summary);
}

function renderSelectedSymbolSummary(symbol, summary) {
  const stockSummaryDiv = elements.divStockSummary;
  stockSummaryDiv.innerHTML = '';

  if (!summary) {
    stockSummaryDiv.appendChild(createTradeSummaryHeading('Summary'));
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No trades found for this symbol.';
    stockSummaryDiv.appendChild(empty);
    return;
  }

  stockSummaryDiv.appendChild(createTradeSummaryHeading('Summary'));
  stockSummaryDiv.appendChild(CommonTable.createTable([
    { item: 'Remaining Share', value: formatNumber(summary.remaining_share) },
    { item: 'Current Value', value: formatNumber(summary.current_value) },
    { item: 'Unrealized Cost Basis', value: formatNumber(summary.unrealized.cost_basis) },
    { item: 'Unrealized Gain/Loss', value: convertGainLossSummary(summary.unrealized) },
    { item: 'Realized Cost Basis', value: formatNumber(summary.realized.cost_basis) },
    { item: 'Realized Gain/Loss', value: convertGainLossSummary(summary.realized) },
    { item: 'Total Cost Basis', value: formatNumber(summary.total.cost_basis) },
    { item: 'Total Gain/Loss', value: convertGainLossSummary(summary.total) },
  ], {
    table: {
      header: ['Item', 'Value'],
      sort: false,
      resize: false,
      showEmptyTable: true,
    },
  }));

  const currentPrice = getCurrentSummaryPrice(symbol);

  stockSummaryDiv.appendChild(createH3('Remaining share (FIFO)'));
  stockSummaryDiv.appendChild(CommonTable.createTable(
    summary.remainingLots.length > 0
      ? summary.remainingLots.map((lot) => {
          const share = Number(lot.share ?? 0);
          const price = Number(lot.price ?? 0);
          const costBasis = share * price;
          const gainLoss = share * currentPrice - costBasis;
          return {
            share: formatNumber(share),
            purchase_price: formatNumber(price),
            current_price: formatNumber(currentPrice),
            unrealized_gain_loss: `${gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${convertPercent(costBasis, gainLoss)})`,
          };
        })
      : [{ share: 'No remaining shares.', purchase_price: '', current_price: '', unrealized_gain_loss: '' }],
    {
      table: {
        header: ['Share', 'Purchase Price', 'Current Price', 'Unrealized Gain/Loss'],
        sort: false,
        resize: false,
        showEmptyTable: true,
      },
    }
  ));

  stockSummaryDiv.appendChild(createH3('Trading history'));
  stockSummaryDiv.appendChild(CommonTable.createTable(
    summary.trades.length > 0
      ? summary.trades.map((trade) => ({
          date: trade.trade_date ?? '',
          type: trade.trade_type ?? '',
          share: trade.share ?? '',
          price: trade.price ?? '',
          lot: trade.lot ?? '',
          comment: trade.comment ?? '',
        }))
      : [{ date: 'No trades found.', type: '', share: '', price: '', lot: '', comment: '' }],
    {
      table: {
        header: ['Date', 'Type', 'Share', 'Price', 'Lot', 'Comment'],
        sort: false,
        resize: false,
        showEmptyTable: true,
      },
    }
  ));

  elements.dataStatus.textContent = `Showing symbol ${symbol.symbol}`;
  elements.dataStatus.classList.remove('error');
}

function calculateSingleSummary(symbol, filteredTrades, currentPrice = Number(symbol?.price ?? 0)) {
  const sum = {
    remaining_share: 0,
    current_value: 0,
    unrealized: { cost_basis: 0, gain_loss: 0, summary: '' },
    realized: { cost_basis: 0, gain_loss: 0, summary: '' },
    total: { cost_basis: 0, gain_loss: 0, summary: '' },
  };

  const trades = filteredTrades
    // Only BUY and SELL rows change a position.  Other trade events (for
    // example DIVIDEND, interest, transfer, and corporate_action) must not
    // be interpreted as sells by the FIFO calculation.
    .filter((item) => Number(item.symbol_id) === Number(symbol.id))
    .filter((item) => ['BUY', 'SELL'].includes(String(item.trade_type ?? '').toUpperCase()))
    .slice()
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)) || Number(a.id ?? 0) - Number(b.id ?? 0));

  if (trades.length === 0) {
    return null;
  }

  const remainingLots = [];

  const buy = (trade) => {
    remainingLots.push({ ...trade, share: Number(trade.share ?? 0) });
  };

  const sellByFIFO = (trade) => {
    let remainingToSell = Number(trade.share ?? 0);
    let realizedCostBasis = 0;
    let realizedGainLoss = 0;

    while (remainingToSell > 0 && remainingLots.length > 0) {
      const lot = remainingLots[0];
      const matched = Math.min(remainingToSell, Number(lot.share ?? 0));
      const costBasis = matched * Number(lot.price ?? 0);
      const gainLoss = matched * Number(trade.price ?? 0) - costBasis;

      realizedCostBasis += costBasis;
      realizedGainLoss += gainLoss;

      lot.share -= matched;
      remainingToSell -= matched;

      if (lot.share === 0) {
        remainingLots.shift();
      }
    }

    sum.realized.cost_basis += realizedCostBasis;
    sum.realized.gain_loss += realizedGainLoss;
  };

  for (const trade of trades) {
    if (String(trade.trade_type ?? '').toUpperCase() === 'BUY') {
      buy(trade);
    }
  }

  if (state.tradeSummaryMethod === 'allocated') {
    const tradesById = new Map(trades.map((trade) => [Number(trade.id), trade]));
    const lotsByBuyId = new Map(remainingLots.map((lot) => [Number(lot.id), lot]));
    const allocatedMatches = currentTradeMatches()
      .filter((match) => tradesById.has(Number(match.buy_trade_id)) && tradesById.has(Number(match.sell_trade_id)))
      .slice()
      .sort((a, b) => {
        const sellA = tradesById.get(Number(a.sell_trade_id));
        const sellB = tradesById.get(Number(b.sell_trade_id));
        return String(sellA?.trade_date ?? '').localeCompare(String(sellB?.trade_date ?? ''))
          || Number(sellA?.id ?? 0) - Number(sellB?.id ?? 0)
          || Number(a.id ?? 0) - Number(b.id ?? 0);
      });

    for (const match of allocatedMatches) {
      const buyTrade = tradesById.get(Number(match.buy_trade_id));
      const sellTrade = tradesById.get(Number(match.sell_trade_id));
      const lot = lotsByBuyId.get(Number(match.buy_trade_id));
      if (!buyTrade || !sellTrade || !lot) continue;

      // Use the persisted allocation, limited to the buy lot's available
      // shares so an invalid allocation cannot create negative holdings.
      const matched = Math.min(Math.max(0, Number(match.matched_share ?? 0)), Math.max(0, Number(lot.share ?? 0)));
      if (matched <= 0) continue;
      const costBasis = matched * Number(buyTrade.price ?? 0);
      sum.realized.cost_basis += costBasis;
      sum.realized.gain_loss += matched * Number(sellTrade.price ?? 0) - costBasis;
      lot.share -= matched;
    }
  } else {
    // FIFO remains available as an alternate view when no lot allocation is
    // selected or when the user explicitly chooses FIFO.
    remainingLots.length = 0;
    for (const trade of trades) {
      if (String(trade.trade_type ?? '').toUpperCase() === 'BUY') {
        buy(trade);
      } else if (String(trade.trade_type ?? '').toUpperCase() === 'SELL') {
        sellByFIFO(trade);
      }
    }
  }

  for (const lot of remainingLots) {
    const share = Number(lot.share ?? 0);
    const price = Number(lot.price ?? 0);
    sum.remaining_share += share;
    sum.current_value += share * currentPrice;
    sum.unrealized.cost_basis += share * price;
  }

  sum.unrealized.gain_loss = sum.current_value - sum.unrealized.cost_basis;
  sum.total.cost_basis = sum.realized.cost_basis + sum.unrealized.cost_basis;
  sum.total.gain_loss = sum.realized.gain_loss + sum.unrealized.gain_loss;

  convertGainLossSummary(sum.unrealized);
  convertGainLossSummary(sum.realized);
  convertGainLossSummary(sum.total);

  return { ...sum, remainingLots, trades };
}

function renderAllRemainingGainLoss(filteredTrades) {
  const stockSummaryDiv = elements.divStockSummary;
  stockSummaryDiv.innerHTML = '';
  stockSummaryDiv.appendChild(createTradeSummaryHeading('All Remaining Gain/Loss', true));

  const rows = [];
  let totalCostBasis = 0;
  let totalGainLoss = 0;
  let unrealizedCostBasis = 0;
  let unrealizedGainLoss = 0;
  let realizedCostBasis = 0;
  let realizedGainLoss = 0;
  let totalValue = 0;

  for (const symbol of state.symbols) {
    if (!filteredTrades.some((trade) => Number(trade.symbol_id) === Number(symbol.id))) {
      continue;
    }

    const single = calculateSingleSummary(symbol, filteredTrades, Number(symbol.price ?? 0));
    if (!single) {
      continue;
    }

    const diff = Number(((Number(symbol.price ?? 0)) - Number(symbol.previous_price ?? 0)).toFixed(2));
    const pct = convertPercent(symbol.previous_price ?? 0, diff);

    rows.push({
      symbol: symbol.symbol,
      share: single.remaining_share,
      price: Number(symbol.price ?? 0),
      diff,
      pct,
      value: single.current_value,
      total_gain_loss: convertGainLossSummary(single.total),
      unrealized_gain_loss: convertGainLossSummary(single.unrealized),
      realized_gain_loss: convertGainLossSummary(single.realized),
      unrealized_cost_basis: single.unrealized.cost_basis,
      realized_cost_basis: single.realized.cost_basis,
      total_cost_basis: single.total.cost_basis,
    });

    totalValue += single.current_value;
    unrealizedCostBasis += single.unrealized.cost_basis;
    unrealizedGainLoss += single.unrealized.gain_loss;
    realizedCostBasis += single.realized.cost_basis;
    realizedGainLoss += single.realized.gain_loss;
    totalCostBasis += single.total.cost_basis;
    totalGainLoss += single.total.gain_loss;
  }

  const totalLine = {
    symbol: 'Total',
    share: undefined,
    price: undefined,
    diff: undefined,
    pct: undefined,
    value: totalValue,
    total_gain_loss: convertGainLossSummary({ cost_basis: totalCostBasis, gain_loss: totalGainLoss }),
    unrealized_gain_loss: convertGainLossSummary({ cost_basis: unrealizedCostBasis, gain_loss: unrealizedGainLoss }),
    realized_gain_loss: convertGainLossSummary({ cost_basis: realizedCostBasis, gain_loss: realizedGainLoss }),
    unrealized_cost_basis: unrealizedCostBasis,
    realized_cost_basis: realizedCostBasis,
    total_cost_basis: totalCostBasis,
  };

  const sortedRows = rows
    .sort((a, b) => {
      if ((Number(a.share ?? 0) === 0) !== (Number(b.share ?? 0) === 0)) {
        return Number(a.share ?? 0) === 0 ? 1 : -1;
      }

      const aSymbol = String(a.symbol).replace(/<[^>]*>/g, '');
      const bSymbol = String(b.symbol).replace(/<[^>]*>/g, '');
      return aSymbol.localeCompare(bSymbol);
    });

  sortedRows.unshift(totalLine);

  stockSummaryDiv.appendChild(CommonTable.createTable(sortedRows.map((row) => ({
    symbol: row.symbol,
    share: row.share ?? '',
    price: row.price ?? '',
    diff: row.diff ?? '',
    pct: row.pct ?? '',
    value: row.value ?? '',
    total_gain_loss: row.total_gain_loss ?? '',
    unrealized_gain_loss: row.unrealized_gain_loss ?? '',
    realized_gain_loss: row.realized_gain_loss ?? '',
    unrealized_cost_basis: row.unrealized_cost_basis ?? '',
    realized_cost_basis: row.realized_cost_basis ?? '',
    total_cost_basis: row.total_cost_basis ?? '',
  })), {
    table: {
      header: ['Symbol', 'Share', 'Price', 'Diff', 'Pct', 'Value', 'Total Gain/Loss', 'Unrealized Gain/Loss', 'Realized Gain/Loss', 'Unrealized Cost Basis', 'Realized Cost Basis', 'Total Cost Basis'],
      sort: false,
      resize: false,
      showEmptyTable: true,
    },
    column: [
      {
        columnName: 'symbol',
        onValue: {
          render: (td, row) => {
            if (row.symbol === 'Total') {
              td.textContent = 'Total';
              return;
            }
            const link = document.createElement('a');
            link.className = 'inlineButton';
            link.href = getYahooLink(row.symbol);
            link.target = '_blank';
            link.rel = 'noreferrer';
            link.textContent = row.symbol;
            td.appendChild(link);
          },
        },
      },
      { columnName: 'diff', enableColor: true },
      { columnName: 'pct', enableColor: true },
      { columnName: 'total_gain_loss', enableColor: true },
      { columnName: 'unrealized_gain_loss', enableColor: true },
      { columnName: 'realized_gain_loss', enableColor: true },
    ],
  }));
}

async function loadSellMatchPanel() {
  const sellId = elements.selSellTrade.value;
  if (!sellId || !elements.selTradeAccount.value || !elements.selTradeSymbol.value) {
    show(elements.divTradeMatch, false);
    elements.divBuyLots.innerHTML = '';
    elements.spanSellRemaining.textContent = '';
    return;
  }

  show(elements.divTradeMatch, true);
  const [summary, buyLots] = await Promise.all([
    requestJson(`/api/trade/sellMatch/${encodeURIComponent(sellId)}`),
    requestJson(`/api/trade/buyLots?accountId=${encodeURIComponent(elements.selTradeAccount.value)}&symbolId=${encodeURIComponent(elements.selTradeSymbol.value)}`),
  ]);

  state.sellMatchSummary = summary;
  state.buyLots = buyLots;
  const remaining = Number(summary?.[0]?.remaining_share ?? 0);
  elements.spanSellRemaining.textContent = `SELL remaining share: ${remaining}`;

  if (!buyLots.length) {
    elements.divBuyLots.innerHTML = '<div class="muted">No available buy lots for this account and symbol.</div>';
    return;
  }

  const table = CommonTable.createTable(buyLots.map((lot) => ({
    buy_id: lot.buy_id,
    trade_date: lot.trade_date,
    share: lot.share,
    remaining_share: lot.remaining_share,
    price: lot.price,
    match_share: lot.remaining_share,
    action: 'Match',
  })), {
    table: {
      header: ['Buy Lot', 'Date', 'Share', 'Remaining', 'Price', 'Match Share', ''],
      sort: false,
      resize: false,
      showEmptyTable: true,
    },
    column: [
      {
        columnName: 'match_share',
        onValue: {
          render: (td, row) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '0.000001';
            input.value = String(row.remaining_share ?? 0);
            input.dataset.buyId = String(row.buy_id ?? '');
            td.appendChild(input);
          },
        },
      },
      {
        columnName: 'action',
        onValue: {
          render: (td, row) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'module-control';
            button.textContent = 'Match';
            button.addEventListener('click', async () => {
              const input = td.parentElement?.querySelector(`input[data-buy-id="${row.buy_id}"]`);
              const matchedShare = Number(input?.value ?? 0);
              if (!matchedShare || matchedShare <= 0) {
                showMessage('Enter a valid matched share', true);
                return;
              }

              try {
                await requestJson('/api/trade/match', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    buyId: Number(row.buy_id),
                    sellId: Number(sellId),
                    matchedShare,
                  }),
                });
                await refreshAllData();
              } catch (error) {
                showMessage(error.message, true);
              }
            });
            td.appendChild(button);
          },
        },
      },
    ],
  });

  elements.divBuyLots.innerHTML = '';
  elements.divBuyLots.appendChild(table);
}

function renderAll() {
  const selectedAssetType = elements.selAssetType.value || 'Stock';
  populateSelect(elements.selInstitute, institutionOptions(), '-- Select institution --');
  populateSelect(elements.selAccount, accountOptions(), '-- Select account --');
  populateSelect(elements.selAssetType, assetTypeOptionsList, '-- Select type --');
  elements.selAssetType.value = selectedAssetType;
  populateSelect(elements.selSymbol, summarySymbolOptions(), '-- Select symbol --');

  renderInstitutionManager();
  renderAccountManager();
  renderSymbolManager();
  renderTradeTypeManager();
  renderTradeManager();
  renderSummary();
}

async function addInstitution() {
  const name = elements.txtInstitutionName.value.trim();
  const type = elements.selInstitutionType.value.trim();
  if (!name || !type) {
    elements.institutionMgrMessage.textContent = 'Please enter institution name and type';
    return;
  }
  await requestJson('/api/institution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type }),
  });
  elements.txtInstitutionName.value = '';
  await refreshAllData();
  elements.institutionMgrMessage.textContent = 'Saved';
}

async function addAccount() {
  const accountName = elements.txtAccountMgr.value.trim();
  const institutionId = elements.selInstituteMgr.value;
  if (!accountName || !institutionId) {
    elements.accountMgrMessage.textContent = 'Please enter account name and institution';
    return;
  }
  await requestJson('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institutionId: Number(institutionId), account_name: accountName }),
  });
  elements.txtAccountMgr.value = '';
  await refreshAllData();
  elements.accountMgrMessage.textContent = 'Saved';
}

async function addSymbol() {
  const symbol = elements.txtSymbolCode.value.trim().toUpperCase();
  const company_name = elements.txtCompanyName.value.trim() || symbol;
  const asset_type = elements.selAssetTypeMgr.value.trim() || 'Stock';
  if (!symbol) {
    showMessage('Symbol code is required', true);
    return;
  }
  await requestJson('/api/symbol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, company_name, asset_type }),
  });
  elements.txtSymbolCode.value = '';
  elements.txtCompanyName.value = '';
  await refreshAllData();
}

async function addTradeType() {
  const name = elements.txtTradeTypeName.value.trim();
  const displayName = elements.txtTradeTypeDisplayName.value.trim() || name;
  const sortOrder = Number(elements.txtTradeTypeSortOrder.value || 100);
  const active = Number(elements.selTradeTypeActive.value || 0);
  if (!name) {
    elements.tradeTypeMgrMessage.textContent = 'Type name is required';
    return;
  }
  await requestJson('/api/tradeType', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, display_name: displayName, sort_order: sortOrder, active }),
  });
  elements.txtTradeTypeName.value = '';
  elements.txtTradeTypeDisplayName.value = '';
  await refreshAllData();
  elements.tradeTypeMgrMessage.textContent = 'Saved';
}

async function addTrade() {
  if (!elements.selTradeInstitute.value || !elements.selTradeAccount.value || !elements.selTradeSymbol.value) {
    showMessage('Please select institution, account, and symbol', true);
    return;
  }
  const share = Number(elements.txtShare.value);
  const price = Number(elements.txtPrice.value);
  if (!share || !price || share <= 0 || price <= 0) {
    showMessage('Please enter valid share and price values', true);
    return;
  }

  await requestJson('/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradeDate: elements.dtTrade.value || today(),
      accountId: Number(elements.selTradeAccount.value),
      symbolId: Number(elements.selTradeSymbol.value),
      tradeType: elements.selTradeType.value,
      share,
      price,
    }),
  });

  elements.txtShare.value = '';
  elements.txtPrice.value = '';
  elements.dtTrade.value = today();
  elements.selTradeType.value = 'BUY';
  await refreshAllData();
}

async function stageTradeCsv() {
  if (state.tradeUploadEntries.length === 0) {
    showMessage('Choose CSV files and assign an account to each file first.', true);
    return;
  }
  if (state.tradeUploadEntries.some((entry) => !entry.accountId)) {
    showAlert('Account required', 'Please select an account for each CSV file before staging.');
    return;
  }
  const formData = buildCsvUploadFormData(state.tradeUploadEntries, 'accountId', 'accountIds');
  const result = await requestJson('/api/trade/staging', { method: 'POST', body: formData });
  (result.results ?? []).forEach((item, index) => {
    const entry = state.tradeUploadEntries[index];
    if (!entry) return;
    entry.status = item.error ? 'error' : 'staged';
    entry.records = item.staged ?? 0;
    entry.skipped = item.skipped ?? 0;
    entry.message = item.error ?? '';
  });
  renderTradeUploadQueue();
  await loadMetadata();
  await loadTradeStaging();
  renderTradeStaging();
}

function renderTradeUploadQueue() {
  renderCsvAssignmentQueue(elements.divTradeUploadQueue, state.tradeUploadEntries, {
    assignmentKey: 'accountId',
    assignmentOptions: accountOptions(),
    assignmentPlaceholder: '-- Select account --',
    formatStatus: (entry) => {
      if (entry.status === 'error') return { text: `error: ${entry.message || 'staging failed'}`, isError: true };
      if (entry.status === 'matched') return null;
      if (entry.status === 'staged') return `staged (${Number(entry.records ?? 0)} rows${entry.skipped ? `, skipped ${Number(entry.skipped)} without symbol` : ''})`;
      if (entry.status === 'preloaded') return `symbols preloaded (${Number(entry.records ?? 0)} new)`;
      return 'queued';
    },
    onRemove: (entry) => {
      state.tradeUploadEntries = state.tradeUploadEntries.filter((item) => item !== entry);
      renderTradeUploadQueue();
    },
    onAssignmentChange: (entry, accountId) => {
      if (!accountId) return;
      if (entry.status === 'error') {
        entry.status = 'queued';
        entry.message = '';
        renderTradeUploadQueue();
      }
    },
  });
}

async function preloadTradeSymbols() {
  if (state.tradeUploadEntries.length === 0) {
    showMessage('Choose CSV files and assign an account to each file first.', true);
    return;
  }
  if (state.tradeUploadEntries.some((entry) => !entry.accountId)) {
    showAlert('Account required', 'Please select an account for each CSV file before preloading symbols.');
    return;
  }
  const formData = buildCsvUploadFormData(state.tradeUploadEntries, 'accountId', 'accountIds');
  const result = await requestJson('/api/trade/symbols/preload', { method: 'POST', body: formData });
  (result.results ?? []).forEach((item, index) => {
    const entry = state.tradeUploadEntries[index];
    if (!entry) return;
    entry.status = item.error ? 'error' : 'preloaded';
    entry.records = item.preloaded ?? 0;
    entry.message = item.error ?? '';
  });
  renderTradeUploadQueue();
  await loadMetadata();
  renderSymbolManager();
  elements.tradeImportStatus.textContent = `Preloaded ${result.preloaded ?? 0} new symbol(s).`;
}

async function mergeTradeStaging() {
  await requestJson('/api/trade/merge', { method: 'POST' });
  await refreshAllData();
}

async function purgeTradeStaging() {
  await requestJson('/api/trade/staging/purge', { method: 'POST' });
  await loadTradeStaging();
  renderTradeStaging();
}

async function updateCurrentSymbolPrice() {
  const symbolId = elements.selSymbol.value;
  if (!symbolId) return;

  const symbol = getSymbolLabel(symbolId);
  if (!symbol) return;

  setMessage(`Fetching price for ${symbol}...`);
  const quote = await requestJson('/api/price', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });

  const selectedSymbol = state.symbols.find((item) => String(item.id) === String(symbolId));
  if (selectedSymbol) {
    selectedSymbol.price = quote.price;
    selectedSymbol.previous_price = quote.previousClose;
  }
  elements.txtCurrPrice.value = String(quote.price ?? '');
  renderSummary();
  setMessage(`Price updated for ${symbol}.`);
}

async function updateAllPrices() {
  setMessage('Updating prices...');
  const result = await requestJson('/api/fetchallprices', { method: 'PUT' });
  await refreshAllData();
  if (Array.isArray(result?.failed) && result.failed.length > 0) {
    const failed = result.failed.map((item) => `${item.symbol}: ${item.error}`).join(', ');
    showMessage(`Updated with failures: ${failed}`, true);
  } else {
    setMessage(result?.message || 'All quotes are updated.');
  }
}

function syncSummarySymbol() {
  const symbolId = elements.selSymbol.value;
  if (!symbolId) {
    elements.yLink.textContent = '';
    elements.yLink.removeAttribute('href');
    elements.txtCurrPrice.value = '';
    return;
  }

  const symbol = state.symbols.find((item) => String(item.id) === String(symbolId));
  if (!symbol) return;
  elements.yLink.href = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.symbol)}`;
  elements.yLink.textContent = symbol.symbol;
  elements.txtCurrPrice.value = String(symbol.price ?? '');
}

let tradeStagingColumns = [];
let tradeStagingColumnOptions = [];
let tradeCsvFile = null;
let tradeCsvHeaders = [];

function splitTradeCsvHeader(line) {
  const headers = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { headers.push(value.trim()); value = ''; }
    else value += char;
  }
  headers.push(value.trim());
  return headers.filter(Boolean);
}

function tradeMappingEnvelope(account = selectedTradeMappingAccount()) {
  if (!account?.mapping_json) return {};
  try {
    const parsed = JSON.parse(String(account.mapping_json));
    if (!parsed || typeof parsed !== 'object') return {};
    if ((parsed.mapping || parsed.map) && typeof (parsed.mapping || parsed.map) === 'object') {
      return { ...parsed, mapping: parsed.mapping ?? parsed.map };
    }
    const { csv_header, stg_header: _stgHeader, ...mapping } = parsed;
    return { csv_header: Array.isArray(csv_header) ? csv_header : [], mapping };
  } catch { return {}; }
}

function selectedTradeMappingAccount() {
  return state.accounts.find((account) => String(account.id) === String(elements.selTradeCsvAccount?.value));
}

function renderTradeStagingColumnRows(columns = tradeStagingColumns) {
  if (!elements.tradeStagingColumnRows) return;
  elements.tradeStagingColumnRows.replaceChildren();
  columns.forEach((selected) => {
    const row = document.createElement('div');
    row.className = 'csv-staging-column-row';
    const select = document.createElement('select');
    select.className = 'module-control';
    populateSelect(select, tradeStagingColumnOptions.map((column) => ({ value: column, label: column })), '-- select staging column --');
    select.value = selected;
    row.appendChild(select);
    elements.tradeStagingColumnRows.appendChild(row);
  });
}

async function loadTradeMappingColumns() {
  const [saved, table] = await Promise.all([
    requestJson('/api/tool/module-staging-columns?module=trade'),
    requestJson('/api/tool/database/trade/table/trd_log_stg'),
  ]);
  tradeStagingColumnOptions = (table.columns ?? []).map(String).filter((column) => !['id', 'created_at', 'updated_at'].includes(column));
  tradeStagingColumns = Array.isArray(saved.columns) ? saved.columns : [];
  renderTradeStagingColumnRows();
}

function tradeHeaderMatches(left, right) {
  const a = new Set((left ?? []).map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  const b = new Set((right ?? []).map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  return a.size > 0 && a.size === b.size && [...a].every((item) => b.has(item));
}

function identifyTradeCsvAccounts(headers) {
  return state.accounts.filter((account) => {
    const savedHeaders = tradeMappingEnvelope(account).csv_header;
    return Array.isArray(savedHeaders) && tradeHeaderMatches(savedHeaders, headers);
  });
}

function mappedTradeCsvHeader(spec) {
  if (!spec || typeof spec !== 'object') return '';
  const rule = spec;
  const candidate = rule.column || rule.csvHeader || (Array.isArray(rule.csv_header) ? rule.csv_header[0] : rule.csv_header) || rule.condition?.column || '';
  const normalized = String(candidate).replace(/^\uFEFF/, '').trim().toLowerCase();
  return tradeCsvHeaders.find((header) => String(header).replace(/^\uFEFF/, '').trim().toLowerCase() === normalized) ?? '';
}

function createTradeMappingRow(column, existing) {
  const row = document.createElement('div');
  row.className = 'csv-mapping-row';
  const target = document.createElement('span');
  target.className = 'csv-mapping-target';
  target.textContent = column;
  row.appendChild(target);
  const source = document.createElement('select');
  source.className = 'module-control csv-mapping-source';
  populateSelect(source, tradeCsvHeaders.map((header) => ({ value: header, label: header })), '-- select CSV header --');
  source.value = mappedTradeCsvHeader(existing);
  row.appendChild(source);
  const rule = document.createElement('div');
  rule.className = 'csv-mapping-rule';
  const type = document.createElement('select');
  type.className = 'module-control csv-rule-type';
  populateSelect(type, [
    { value: 'direct', label: 'Direct map' },
    { value: 'parse', label: 'Parse with method' },
    { value: 'symbol_lookup', label: 'Symbol lookup' },
    { value: 'constant', label: 'Constant' },
    { value: 'math', label: 'Math expression' },
    { value: 'if_else', label: 'If / else' },
  ], '-- select rule type --');
  type.value = existing?.type || '';
  rule.appendChild(type);
  const fields = document.createElement('span');
  fields.className = 'csv-rule-fields';
  rule.appendChild(fields);
  row.appendChild(rule);
  const addInput = (placeholder, value = '') => {
    const input = document.createElement('input'); input.className = 'module-control'; input.placeholder = placeholder; input.value = value; fields.appendChild(input); return input;
  };
  const constantValue = (value) => (value && typeof value === 'object' ? value.value ?? '' : value ?? '');
  const flattenConditions = (spec) => {
    const conditions = [];
    let current = spec;
    while (current?.type === 'if_else' && current.condition) {
      conditions.push({
        column: current.condition.column ?? '',
        operator: current.condition.operator ?? '',
        value: current.condition.value ?? '',
        result: constantValue(current.then),
      });
      current = current.else;
    }
    return { conditions, defaultValue: constantValue(current) };
  };
  const renderFields = () => {
    fields.replaceChildren();
    if (type.value === 'parse') {
      const method = document.createElement('select');
      method.className = 'module-control';
      populateSelect(method, [{ value: 'parseTradeAction', label: 'parseTradeAction (action → trade type)' }], '-- select parser method --');
      method.value = existing?.method || '';
      fields.appendChild(method);
    }
    if (type.value === 'constant') addInput('value', existing?.value ?? '');
    if (type.value === 'math') addInput('-quantity or price * quantity', existing?.expression ?? '');
    if (type.value === 'if_else') {
      const flattened = flattenConditions(existing);
      const conditionList = document.createElement('span');
      conditionList.className = 'trade-if-condition-list';
      const addCondition = (condition = {}) => {
        const conditionRow = document.createElement('span');
        conditionRow.className = 'trade-if-condition';
        const conditionColumn = document.createElement('select'); conditionColumn.className = 'module-control';
        populateSelect(conditionColumn, tradeCsvHeaders.map((header) => ({ value: header, label: header })), 'condition column');
        conditionColumn.value = condition.column || '';
        const operator = document.createElement('select'); operator.className = 'module-control';
        populateSelect(operator, [{ value: 'not_empty', label: 'is not empty' }, { value: 'equals', label: 'equals' }, { value: 'contains', label: 'contains' }], 'operator');
        operator.value = condition.operator || '';
        const matchValue = document.createElement('input'); matchValue.className = 'module-control'; matchValue.placeholder = 'condition value'; matchValue.value = condition.value || '';
        const resultValue = document.createElement('input'); resultValue.className = 'module-control'; resultValue.placeholder = 'then value'; resultValue.value = condition.result || '';
        conditionRow.append(conditionColumn, operator, matchValue, resultValue);
        conditionList.appendChild(conditionRow);
      };
      flattened.conditions.forEach(addCondition);
      if (flattened.conditions.length === 0) addCondition();
      const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'module-control'; addButton.textContent = '+ condition'; addButton.addEventListener('click', () => addCondition());
      fields.append(conditionList, addButton);
      addInput('default value', flattened.defaultValue);
    }
  };
  type.addEventListener('change', renderFields);
  renderFields();
  return row;
}

function renderTradeMapping() {
  const account = selectedTradeMappingAccount();
  const saved = tradeMappingEnvelope(account);
  if (Array.isArray(saved.csv_header)) tradeCsvHeaders = saved.csv_header;
  const mapping = saved.mapping ?? {};
  elements.tradeMappingRows.replaceChildren(...tradeStagingColumns.map((column) => createTradeMappingRow(column, mapping[column])));
}

async function loadTradeMappingForAccount(accountId) {
  if (!accountId) {
    tradeCsvHeaders = [];
    renderTradeMapping();
    return;
  }
  const accounts = await requestJson('/api/table/trd_account');
  const freshAccount = Array.isArray(accounts)
    ? accounts.find((account) => String(account.id) === String(accountId))
    : null;
  if (freshAccount) {
    const accountIndex = state.accounts.findIndex((account) => String(account.id) === String(accountId));
    if (accountIndex >= 0) state.accounts[accountIndex] = freshAccount;
  }
  const account = freshAccount ?? selectedTradeMappingAccount();
  const envelope = tradeMappingEnvelope(account);
  tradeCsvHeaders = Array.isArray(envelope.csv_header) ? envelope.csv_header : [];
  tradeCsvFile = null;
  elements.tradeMappingFileName.textContent = 'No file selected';
  renderTradeMapping();
  elements.tradeMappingPreview.textContent = envelope.mapping ? JSON.stringify(envelope, null, 2) : '';
  setStatus(elements.tradeMappingStatus, tradeCsvHeaders.length ? 'Saved CSV headers loaded.' : 'No saved CSV headers for this account.', !tradeCsvHeaders.length, 'transaction-staging-status');
}

function collectTradeMapping() {
  const mapping = {};
  elements.tradeMappingRows.querySelectorAll('.csv-mapping-row').forEach((row) => {
    const column = row.querySelector('.csv-mapping-target')?.textContent;
    const type = row.querySelector('.csv-rule-type')?.value;
    if (!column || !type) return;
    const inputs = [...row.querySelectorAll('.csv-rule-fields input')];
    const selects = [...row.querySelectorAll('.csv-rule-fields select')];
    if (type === 'parse') mapping[column] = {
      type,
      method: selects[0]?.value ?? '',
      column: row.querySelector('.csv-mapping-source')?.value ?? '',
    };
    if (type === 'direct' || type === 'symbol_lookup') mapping[column] = { type, column: row.querySelector('.csv-mapping-source')?.value ?? '' };
    if (type === 'constant') mapping[column] = { type, value: inputs[0]?.value ?? '' };
    if (type === 'math') mapping[column] = { type, expression: inputs[0]?.value ?? '' };
    if (type === 'if_else') {
      const conditionRows = [...row.querySelectorAll('.trade-if-condition')];
      const defaultInput = row.querySelector('.trade-if-condition-list')?.parentElement?.querySelector('input[placeholder="default value"]');
      let fallback = { type: 'constant', value: defaultInput?.value ?? '' };
      for (let index = conditionRows.length - 1; index >= 0; index -= 1) {
        const conditionRow = conditionRows[index];
        const values = conditionRow.querySelectorAll('input');
        const conditionSelects = conditionRow.querySelectorAll('select');
        fallback = { type, condition: { column: conditionSelects[0]?.value ?? '', operator: conditionSelects[1]?.value ?? '', value: values[0]?.value ?? '' }, then: { type: 'constant', value: values[1]?.value ?? '' }, else: fallback };
      }
      mapping[column] = fallback;
    }
  });
  return mapping;
}

function setTradeMappingStatus(message, isError = false) {
  setStatus(elements.tradeMappingSaveStatus, message, isError, 'transaction-staging-status');
}

async function chooseTradeMappingFile() {
  const files = await chooseCsvFiles();
  if (files.length === 0) return;
  if (files.length > 1) throw new Error('Choose one trade CSV at a time for mapping.');
  tradeCsvFile = files[0];
  const text = await tradeCsvFile.text();
  tradeCsvHeaders = splitTradeCsvHeader(text.split(/\r?\n/).find((line) => line.trim()) ?? '');
  elements.tradeMappingFileName.textContent = tradeCsvFile.name;
  const matches = identifyTradeCsvAccounts(tradeCsvHeaders);
  if (matches.length === 1) {
    const account = matches[0];
    elements.selTradeCsvAccount.value = String(account.id);
    await loadTradeMappingForAccount(account.id);
    tradeCsvHeaders = tradeCsvHeaders.slice();
    renderTradeMapping();
    setStatus(elements.tradeMappingStatus, `matched account: ${account.account_name ?? account.name ?? account.id}`, false, 'transaction-staging-status');
    return;
  }

  elements.selTradeCsvAccount.value = '';
  renderTradeMapping();
  if (matches.length > 1) {
    setStatus(elements.tradeMappingStatus, `ambiguous header; matches: ${matches.map((account) => account.account_name ?? account.name ?? account.id).join(', ')}`, true, 'transaction-staging-status');
  } else {
    setStatus(elements.tradeMappingStatus, 'no account matched saved CSV header', true, 'transaction-staging-status');
  }
}

async function saveTradeMappingHeader(account, headers) {
  const envelope = tradeMappingEnvelope(account);
  const mappingJson = JSON.stringify({ csv_header: headers, mapping: envelope.mapping ?? {} });
  await requestJson('/api/table', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account.id, table: 'trd_account', column: 'mapping_json', newValue: mappingJson }) });
  account.mapping_json = mappingJson;
}

async function saveTradeMapping() {
  const account = selectedTradeMappingAccount();
  if (!account) throw new Error('Select a trade account first.');
  const envelope = tradeMappingEnvelope(account);
  const mappingJson = JSON.stringify({ csv_header: envelope.csv_header ?? [], mapping: collectTradeMapping() });
  await requestJson('/api/table', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account.id, table: 'trd_account', column: 'mapping_json', newValue: mappingJson }) });
  account.mapping_json = mappingJson;
  elements.tradeMappingPreview.textContent = JSON.stringify(JSON.parse(mappingJson), null, 2);
  setTradeMappingStatus('Mapping saved.');
}

function bindEvents() {
  elements.btnClearTradeFilters.addEventListener('click', () => {
    elements.selInstitute.value = '';
    elements.selAccount.value = '';
    elements.selAssetType.value = 'Stock';
    elements.selSymbol.value = '';
    populateSelect(elements.selAccount, accountOptions(), '-- Select account --');
    populateSelect(elements.selSymbol, summarySymbolOptions(), '-- Select symbol --');
    syncSummarySymbol();
    renderSummary();
  });

  elements.selManageType.addEventListener('change', () => {
    const mode = elements.selManageType.value;
    show(elements.divInstitutionMgr, mode === 'Institution');
    show(elements.divAccountManager, mode === 'Account');
    show(elements.divSymbolMgr, mode === 'Symbol');
    show(elements.divTradeTypeMgr, mode === 'TradeType');
    show(elements.divTradeMgr, mode === 'Trade');
    show(elements.divTradeCsvMappingMgr, mode === 'CSV Mapping');
    if (mode === 'CSV Mapping') {
      populateSelect(elements.selTradeCsvAccount, accountOptions(), '-- Select account --');
      if (!elements.selTradeCsvAccount.value && state.accounts[0]) {
        elements.selTradeCsvAccount.value = String(state.accounts[0].id);
      }
      renderTradeStagingColumnRows();
      loadTradeMappingForAccount(elements.selTradeCsvAccount.value).catch((error) => setStatus(elements.tradeMappingStatus, `Unable to load mapping: ${error.message}`, true, 'transaction-staging-status'));
    }
  });

  elements.selTradeCsvAccount.addEventListener('change', () => loadTradeMappingForAccount(elements.selTradeCsvAccount.value).catch((error) => setStatus(elements.tradeMappingStatus, `Unable to load mapping: ${error.message}`, true, 'transaction-staging-status')));
  elements.btnChooseTradeMappingFile.addEventListener('click', () => chooseTradeMappingFile().catch((error) => setStatus(elements.tradeMappingStatus, error.message, true, 'transaction-staging-status')));
  elements.btnPreviewTradeMapping.addEventListener('click', () => {
    try {
      const account = selectedTradeMappingAccount();
      if (!account) throw new Error('Select a trade account first.');
      elements.tradeMappingPreview.textContent = JSON.stringify({ csv_header: tradeCsvHeaders.length ? tradeCsvHeaders : (tradeMappingEnvelope(account).csv_header ?? []), mapping: collectTradeMapping() }, null, 2);
      setTradeMappingStatus('Mapping preview updated.');
    } catch (error) { setTradeMappingStatus(error.message, true); }
  });
  elements.btnSaveTradeMapping.addEventListener('click', () => saveTradeMapping().catch((error) => setTradeMappingStatus(error.message, true)));
  elements.btnAddTradeStagingColumn.addEventListener('click', () => {
    const columns = [...elements.tradeStagingColumnRows.querySelectorAll('select')].map((select) => select.value);
    renderTradeStagingColumnRows([...columns, '']);
  });
  elements.btnRemoveTradeStagingColumn.addEventListener('click', () => {
    const rows = [...elements.tradeStagingColumnRows.querySelectorAll('.csv-staging-column-row')];
    if (rows.length > 0) rows[rows.length - 1].remove();
  });
  elements.btnSaveTradeStagingColumns.addEventListener('click', async () => {
    const columns = [...elements.tradeStagingColumnRows.querySelectorAll('select')].map((select) => select.value).filter(Boolean);
    if (new Set(columns).size !== columns.length) throw new Error('Each staging column can only be selected once.');
    const result = await requestJson('/api/tool/module-staging-columns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: 'trade', columns }) });
    tradeStagingColumns = result.columns ?? columns;
    renderTradeStagingColumnRows();
    setStatus(elements.tradeStagingColumnStatus, 'Staging columns saved.', false, 'transaction-staging-status');
  });

  elements.btnSaveInstitution.addEventListener('click', () => addInstitution().catch((error) => showMessage(error.message, true)));
  elements.btnSaveAccount.addEventListener('click', () => addAccount().catch((error) => showMessage(error.message, true)));
  elements.btnAddSymbol.addEventListener('click', () => addSymbol().catch((error) => showMessage(error.message, true)));
  elements.btnAddTradeType.addEventListener('click', () => addTradeType().catch((error) => showMessage(error.message, true)));
  elements.btnAddTrade.addEventListener('click', () => addTrade().catch((error) => showMessage(error.message, true)));
  elements.btnStageTrades.addEventListener('click', () => stageTradeCsv().catch((error) => showMessage(error.message, true)));
  elements.btnPreloadTradeSymbols.addEventListener('click', () => preloadTradeSymbols().catch((error) => showMessage(error.message, true)));
  elements.btnPurgeStagedTrades.addEventListener('click', () => purgeTradeStaging().catch((error) => showMessage(error.message, true)));
  elements.btnMergeStagedTrades.addEventListener('click', () => mergeTradeStaging().catch((error) => showMessage(error.message, true)));
  elements.btnChooseTradeFiles.addEventListener('click', () => {
    chooseCsvFiles().then((files) => {
      if (files.length === 0) return;
      return Promise.all(files.map(async (file) => {
        const text = await file.text();
        const headers = splitTradeCsvHeader(text.split(/\r?\n/).find((line) => line.trim()) ?? '');
        const matches = identifyTradeCsvAccounts(headers);
        if (matches.length === 1) {
          const account = matches[0];
          return {
            file,
            accountId: String(account.id),
            status: 'matched',
            message: `matched account: ${account.account_name ?? account.name ?? account.id}`,
          };
        }
        if (matches.length > 1) {
          return {
            file,
            accountId: '',
            status: 'error',
            message: `ambiguous header; matches: ${matches.map((account) => account.account_name ?? account.name ?? account.id).join(', ')}`,
          };
        }
        return { file, accountId: '', status: 'error', message: 'no account matched saved CSV header' };
      })).then((entries) => {
        state.tradeUploadEntries = state.tradeUploadEntries.concat(entries);
        renderTradeUploadQueue();
        elements.tradeImportStatus.textContent = '';
      });
    }).catch((error) => showMessage(error.message, true));
  });
  document.querySelectorAll('input[name="tradeStagingViewMode"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const value = event.target?.value;
      if (value !== 'matched' && value !== 'all') return;
      state.tradeStagingViewMode = value;
      renderTradeStaging();
    });
  });

  elements.selTradeInstitute.addEventListener('change', () => {
    elements.selTradeAccount.value = '';
    elements.selTradeSymbol.value = '';
    renderTradeManager();
    show(elements.divAddTradeForm, Boolean(elements.selTradeInstitute.value && elements.selTradeAccount.value && elements.selTradeSymbol.value));
  });
  elements.selTradeAccount.addEventListener('change', () => {
    renderTradeManager();
    show(elements.divAddTradeForm, Boolean(elements.selTradeInstitute.value && elements.selTradeAccount.value && elements.selTradeSymbol.value));
  });
  elements.selTradeSymbol.addEventListener('change', () => {
    renderTradeManager();
    show(elements.divAddTradeForm, Boolean(elements.selTradeInstitute.value && elements.selTradeAccount.value && elements.selTradeSymbol.value));
  });

  elements.selInstitute.addEventListener('change', () => {
    populateSelect(elements.selAccount, accountOptions(accountsForInstitution(elements.selInstitute.value)), '-- Select account --');
    populateSelect(elements.selSymbol, summarySymbolOptions(), '-- Select symbol --');
    renderSummary();
  });
  elements.selAccount.addEventListener('change', () => {
    populateSelect(elements.selSymbol, summarySymbolOptions(), '-- Select symbol --');
    renderSummary();
  });
  elements.selAssetType.addEventListener('change', () => {
    populateSelect(elements.selSymbol, summarySymbolOptions(), '-- Select symbol --');
    renderSummary();
  });
  elements.divTradeViewMode?.addEventListener('change', (event) => {
    saveTradeViewMode(event.target?.value);
    renderSummary();
  });
  document.querySelectorAll('input[name="tradeSummaryMethod"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const value = event.target?.value;
      if (value !== 'allocated' && value !== 'fifo') return;
      state.tradeSummaryMethod = value;
      renderSummary();
    });
  });
  elements.selSymbol.addEventListener('change', async () => {
    renderSummary();
    syncSummarySymbol();
    try {
      await updateCurrentSymbolPrice();
    } catch (error) {
      showMessage(`Failed to fetch price: ${error.message}`, true);
    }
  });

  elements.btnUsePrice.addEventListener('click', () => {
    renderSummary();
  });
  elements.btnUpdPrices.addEventListener('click', () => updateAllPrices().catch((error) => showMessage(error.message, true)));
  elements.btnSplit.addEventListener('click', () => showMessage('Split is not wired yet on this page.', true));

  elements.selSellTrade.addEventListener('change', () => {
    loadSellMatchPanel().catch((error) => showMessage(error.message, true));
  });

  elements.selInstituteMgr.addEventListener('change', () => {
    renderAccountManager();
  });

  elements.dtBalence.addEventListener('change', () => renderAccountManager());
}

async function init() {
  elements.dtTrade.value = today();
  elements.dtBalence.value = today();
  arrangeTradeCsvManager();
  restoreTradeViewMode();
  bindEvents();
  await refreshAllData();
  await loadTradeMappingColumns();
}

function arrangeTradeCsvManager() {
  const workbench = elements.divTradeCsvMappingMgr?.querySelector('.transaction-import-panel');
  const accountManager = elements.divAccountManager;
  const uploadPanel = accountManager?.querySelector('.trade-import-section');
  if (workbench && uploadPanel) {
    uploadPanel.classList.add('transaction-import-upload-panel');
    workbench.appendChild(uploadPanel);
  }

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

init().catch((error) => showMessage(error.message, true));
