export class ApiError extends Error {
  constructor(status, code, message = code, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
