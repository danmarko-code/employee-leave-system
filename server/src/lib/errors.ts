export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message = 'Check the request and try again.'): AppError =>
  new AppError(400, 'invalid_request', message);

export const invalidInput = (fields: Record<string, string>): AppError =>
  new AppError(400, 'invalid_input', 'Check the form and try again.', fields);

export const unauthorized = (): AppError =>
  new AppError(401, 'unauthorized', 'Sign in again to continue.');

export const invalidCredentials = (): AppError =>
  new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');

export const forbidden = (): AppError =>
  new AppError(403, 'forbidden', 'You do not have access to that.');

export const notFound = (): AppError => new AppError(404, 'not_found', 'Not found.');

export const conflict = (message = 'That could not be completed.'): AppError =>
  new AppError(409, 'conflict', message);

export const payloadTooLarge = (): AppError =>
  new AppError(413, 'payload_too_large', 'That file or request is too large.');

export const unsupportedMedia = (): AppError =>
  new AppError(415, 'unsupported_media_type', 'Send a JSON request body.');
