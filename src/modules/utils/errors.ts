export class AppError extends Error { constructor(public httpCode: number, message: string) { super(message) }}
export class BadRequest extends AppError { constructor(message: string) { super(400, message) }}
export class NotFound extends AppError { constructor(message: string) { super(404, message) }}
