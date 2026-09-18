import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { entryRouter } from './routes/entryRoutes';
import { tagRouter } from './routes/tagRoutes';
import { transactionRouter } from './server/apps/transaction/ecRoute';
import { tradeRouter } from './server/apps/trade/ecRoute';
import { toolRouter } from './server/apps/tool/ecRoute';
import { ensurePhotoThumbnail } from './services/photoStorage';
import { FAVORITE_DIRECTORY, THUMBNAIL_DIRECTORY } from './utils/uploads';
import { errorHandler, notFoundHandler } from './utils/http';

const publicDirectory = path.join(process.cwd(), 'web', 'public');

export function createApp() {
  const app = express();
  fs.mkdirSync(path.join(env.uploadDirectory, FAVORITE_DIRECTORY), { recursive: true });

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDirectory, { index: false }));
  app.use(env.faviconPublicPath, express.static(env.faviconDirectory));
  app.use('/api/hayday/images', express.static(path.join(env.dataRoot, 'hayday', 'images')));
  const thumbnailPublicPath = path.posix.join(env.uploadPublicPath, THUMBNAIL_DIRECTORY);
  const thumbnailLocalPath = path.join(env.uploadDirectory, THUMBNAIL_DIRECTORY);
  app.use(thumbnailPublicPath, express.static(thumbnailLocalPath));
  app.get(`${thumbnailPublicPath}/*filePath`, async (request, response, next) => {
    const routePath = request.params.filePath;
    const fileName = Array.isArray(routePath) ? routePath.join('/') : routePath;
    try {
      const thumbnailPath = await ensurePhotoThumbnail(fileName);
      response.sendFile(thumbnailPath, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });
  app.use(env.uploadPublicPath, express.static(env.uploadDirectory));

  app.get('/', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'pages', 'apps', 'log.html'));
  });

  app.get('/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.use('/api', entryRouter);
  app.use('/api', tagRouter);
  app.use('/api', transactionRouter);
  app.use('/api', tradeRouter);
  app.use('/api', toolRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
