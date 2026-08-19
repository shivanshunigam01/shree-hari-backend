import type { Response } from "express";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT"
  | "SERVER_ERROR";

export class HttpError extends Error {
  status: number;
  code: ApiErrorCode;
  errors?: Record<string, string>;

  constructor(status: number, message: string, code: ApiErrorCode, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export function ok<T>(res: Response, data: T, message?: string, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    message: message ?? "OK",
  });
}

export function fail(
  res: Response,
  status: number,
  message: string,
  code: ApiErrorCode = "SERVER_ERROR",
  errors?: Record<string, string>,
) {
  const body: Record<string, unknown> = { success: false, message, code };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

export function zodErrors(issues: { path: (string | number)[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
