import { Router } from 'express';
import multer from 'multer';
import { addTable, applyCategoryRules, deleteTable, generateAndSaveCategoryRules, generateCategoryRuleSuggestions, getTable, getTripCost, mappedStagingTransaction, mergeStagedTransactions, purgeStagedTransactions, stagingTransaction, updateTable } from './ecController';
import { asyncHandler } from '../../../utils/http';

export const transactionRouter = Router();
const stagingUpload = multer({ storage: multer.memoryStorage() });

transactionRouter.get('/transaction/table/:table', asyncHandler(getTable));
transactionRouter.get('/transaction/tripCost/:id', asyncHandler(getTripCost));
transactionRouter.post('/transaction/staging', stagingUpload.array('files'), asyncHandler(stagingTransaction));
transactionRouter.post('/transaction/staging/mapped', stagingUpload.array('files'), asyncHandler(mappedStagingTransaction));
transactionRouter.post('/transaction/staging/apply-rules', asyncHandler(applyCategoryRules));
transactionRouter.get('/transaction/category-rules/suggestions', asyncHandler(generateCategoryRuleSuggestions));
transactionRouter.post('/transaction/category-rules/generate', asyncHandler(generateAndSaveCategoryRules));
transactionRouter.post('/transaction/merge', asyncHandler(mergeStagedTransactions));
transactionRouter.post('/transaction/staging/purge', asyncHandler(purgeStagedTransactions));
transactionRouter.post('/transaction/table/:table', asyncHandler(addTable));
transactionRouter.put('/transaction/table', asyncHandler(updateTable));
transactionRouter.delete('/transaction/table/:id/:table', asyncHandler(deleteTable));
