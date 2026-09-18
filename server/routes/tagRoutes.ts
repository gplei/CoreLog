import { Router } from 'express';
import { listTags } from '../controllers/tagController';
import { asyncHandler } from '../utils/http';

export const tagRouter = Router();

tagRouter.get('/tags', asyncHandler(listTags));
