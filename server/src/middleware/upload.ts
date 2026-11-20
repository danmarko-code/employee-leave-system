import type { RequestHandler } from 'express';
import multer from 'multer';
import { LIMITS } from '@leave/shared';
import { AppError, invalidInput, payloadTooLarge } from '../lib/errors';
import { MAX_PHOTO_BYTES } from '../lib/files';

const MAX_FILE_BYTES = LIMITS.uploadBytes;

/**
 * One optional supporting document held in memory. The byte limit applies
 * during parsing, so an oversized upload never reaches the application logic.
 * The file type is decided from the bytes in the controller, not from the
 * browser-supplied Content-Type.
 */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
    fields: 8,
    fieldSize: 2048,
    parts: 12,
  },
});

export function singleDocument(): RequestHandler {
  const middleware = parser.single('document');
  return (req, res, next) => {
    middleware(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(payloadTooLarge());
          return;
        }
        next(invalidInput({ document: 'Attach one PDF, JPEG or PNG up to 1 MB.' }));
        return;
      }
      next(error);
    });
  };
}

const photoParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
    fields: 4,
    fieldSize: 2048,
    parts: 8,
  },
});

/** One profile photo held in memory; the byte limit applies during parsing. */
export function singlePhoto(): RequestHandler {
  const middleware = photoParser.single('photo');
  return (req, res, next) => {
    middleware(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(payloadTooLarge());
          return;
        }
        next(invalidInput({ photo: 'Choose one JPEG, PNG or WebP image up to 2 MB.' }));
        return;
      }
      next(error);
    });
  };
}

/** Rejects anything that is not a parseable multipart request. */
export function requireMultipart(expectation = 'the application fields'): RequestHandler {
  return (req, _res, next) => {
    if (!req.is('multipart/form-data')) {
      next(
        new AppError(
          415,
          'unsupported_media_type',
          `Send a multipart form with ${expectation}.`
        )
      );
      return;
    }
    next();
  };
}

export { MAX_FILE_BYTES };
