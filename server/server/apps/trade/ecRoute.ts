import { Router } from 'express';
import {
  addAccount,
  addInstitution,
  addSymbol,
  addTradeType,
  addTable,
  addTrade,
  addTradeMatch,
  deleteTable,
  getAccount,
  getAccountBalanceByDate,
  getAvailableBuyLots,
  fetchAllPrices,
  getQuote,
  getSellMatchSummary,
  getTable,
  getTrade,
  updatePrice,
  updateTable,
  stageTrades,
  preloadTradeSymbols,
  mergeStagedTrades,
  purgeStagedTrades,
  tradeUpload,
} from './ecController';
import { asyncHandler } from '../../../utils/http';

export const tradeRouter = Router();

tradeRouter.get('/trade', asyncHandler(getTrade));
tradeRouter.get('/quote/:symbol', asyncHandler(getQuote));
tradeRouter.put('/fetchallprices', asyncHandler(fetchAllPrices));
tradeRouter.post('/trade/staging', tradeUpload.array('files'), asyncHandler(stageTrades));
tradeRouter.post('/trade/symbols/preload', tradeUpload.array('files'), asyncHandler(preloadTradeSymbols));
tradeRouter.post('/trade/merge', asyncHandler(mergeStagedTrades));
tradeRouter.post('/trade/staging/purge', asyncHandler(purgeStagedTrades));
tradeRouter.get('/trade/buyLots', asyncHandler(getAvailableBuyLots));
tradeRouter.get('/trade/sellMatch/:id', asyncHandler(getSellMatchSummary));
tradeRouter.post('/trade/match', asyncHandler(addTradeMatch));
tradeRouter.post('/symbol', asyncHandler(addSymbol));
tradeRouter.post('/tradeType', asyncHandler(addTradeType));
tradeRouter.post('/trade', asyncHandler(addTrade));
tradeRouter.put('/price', asyncHandler(updatePrice));
tradeRouter.post('/account', asyncHandler(addAccount));
tradeRouter.get('/account', asyncHandler(getAccount));
tradeRouter.post('/institution', asyncHandler(addInstitution));
tradeRouter.get('/acctBalance/:date', asyncHandler(getAccountBalanceByDate));
tradeRouter.get('/table/:table', asyncHandler(getTable));
tradeRouter.post('/table/:table', asyncHandler(addTable));
tradeRouter.put('/table', asyncHandler(updateTable));
tradeRouter.delete('/table/:id/:table', asyncHandler(deleteTable));
