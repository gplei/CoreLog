import multer from 'multer';
import { env } from '../config/env';
import { HttpError } from '../utils/http';

export const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new HttpError(400, 'Only image uploads are allowed'));
      return;
    }

    callback(null, true);
  },
}).array('photos');
