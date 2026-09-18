import { Router } from 'express';
import {
  createEntry,
  deleteEntry,
  deleteEntryMedia,
  emptyTrash,
  permanentlyDeleteEntries,
  restoreEntries,
  trashEntries,
  getEntry,
  listEntries,
  listEntryDates,
  listUploads,
  reorderEntryMedia,
  updateEntry,
  toggleEntryPin,
  uploadFavoritePhotos,
  uploadEntryPhotos,
} from '../controllers/entryController';
import { uploadPhotos } from '../middleware/upload';
import { asyncHandler } from '../utils/http';
import { createQuickLink, deleteQuickLink, listQuickLinks, reorderQuickLinks, seedQuickLinkIcons, updateQuickLink } from '../controllers/quickLinkController';

export const entryRouter = Router();

entryRouter.get('/entries', asyncHandler(listEntries));
entryRouter.patch('/entries/trash', asyncHandler(trashEntries));
entryRouter.patch('/entries/restore', asyncHandler(restoreEntries));
entryRouter.delete('/entries/trash', asyncHandler(permanentlyDeleteEntries));
entryRouter.delete('/entries/trash/all', asyncHandler(emptyTrash));
entryRouter.get('/entries/dates', asyncHandler(listEntryDates));
entryRouter.get('/uploads', asyncHandler(listUploads));
entryRouter.post('/uploads', uploadPhotos, asyncHandler(uploadEntryPhotos));
entryRouter.post('/uploads/favorite', uploadPhotos, asyncHandler(uploadFavoritePhotos));
entryRouter.post('/quick-links', asyncHandler(createQuickLink));
entryRouter.get('/quick-links', asyncHandler(listQuickLinks));
entryRouter.post('/quick-links/icons/seed', asyncHandler(seedQuickLinkIcons));
entryRouter.put('/quick-links/order', asyncHandler(reorderQuickLinks));
entryRouter.put('/quick-links/:index', asyncHandler(updateQuickLink));
entryRouter.delete('/quick-links/:id', asyncHandler(deleteQuickLink));
entryRouter.post('/entry', uploadPhotos, asyncHandler(createEntry));
entryRouter.get('/entries/:id', asyncHandler(getEntry));
entryRouter.put('/entries/:id', uploadPhotos, asyncHandler(updateEntry));
entryRouter.patch('/entries/:id/media-order', asyncHandler(reorderEntryMedia));
entryRouter.delete('/entries/:id/media/:mediaId', asyncHandler(deleteEntryMedia));
entryRouter.patch('/entries/:id/pin', asyncHandler(toggleEntryPin));
entryRouter.delete('/entries/:id', asyncHandler(deleteEntry));
