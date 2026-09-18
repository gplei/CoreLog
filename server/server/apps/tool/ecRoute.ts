import { Router } from 'express';
import { addHaydayIngredient, backupDataRoot, deleteDatabaseTableRow, deleteHaydayEntity, downloadDatabaseBackup, getBackupPaths, getDatabaseTable, getModuleSettings, getModuleStagingColumns, getQuickLinkGroupSettings, listDatabaseTables, listDatabases, saveHaydayAccount, saveHaydayBuilding, saveHaydayProduct, seedHaydayIcons, updateDatabaseTable, updateModuleSettings, updateModuleStagingColumns, updateQuickLinkGroupSetting } from './ecController';

export const toolRouter = Router();

toolRouter.get('/tool/databases', listDatabases);
toolRouter.get('/tool/module-settings', getModuleSettings);
toolRouter.put('/tool/module-settings', updateModuleSettings);
toolRouter.get('/tool/module-staging-columns', getModuleStagingColumns);
toolRouter.put('/tool/module-staging-columns', updateModuleStagingColumns);
toolRouter.get('/tool/quick-link-groups', getQuickLinkGroupSettings);
toolRouter.put('/tool/quick-link-groups', updateQuickLinkGroupSetting);
toolRouter.get('/tool/backup-paths', getBackupPaths);
toolRouter.post('/tool/backup-data', backupDataRoot);
toolRouter.post('/tool/seed-hayday-icons', seedHaydayIcons);
toolRouter.get('/tool/database/:key', downloadDatabaseBackup);
toolRouter.get('/tool/database/:key/tables', listDatabaseTables);
toolRouter.get('/tool/database/:key/table/:table', getDatabaseTable);
toolRouter.put('/tool/database/:key/table/:table', updateDatabaseTable);
toolRouter.delete('/tool/database/:key/table/:table/:id', deleteDatabaseTableRow);
toolRouter.post('/tool/hayday/ingredient', addHaydayIngredient);
toolRouter.post('/tool/hayday/building', saveHaydayBuilding);
toolRouter.post('/tool/hayday/product', saveHaydayProduct);
toolRouter.post('/tool/hayday/accounts', saveHaydayAccount);
toolRouter.delete('/tool/hayday/:entity/:id', deleteHaydayEntity);
