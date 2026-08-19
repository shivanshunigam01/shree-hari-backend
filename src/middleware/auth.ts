import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { usersRepo } from "../repos/users.js";
import type { AppRole } from "../lib/roles.js";
import { hasPermission, type Permission } from "../constants/permissions.js";
import { fail, HttpError } from "../lib/http.js";
import { resolvePermissions } from "../constants/permissions.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  countries: string[];
  permissions: string[];
  department?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function authJwt(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(res, 401, "Sign in required", "UNAUTHORIZED");

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = await usersRepo.findById(payload.sub);
    if (!user || user.active === false) return fail(res, 401, "Account is inactive or missing", "UNAUTHORIZED");
    const pub = usersRepo.public(user);
    req.user = {
      id: pub.id,
      name: pub.name,
      email: pub.email,
      role: pub.role,
      countries: pub.countries ?? [],
      permissions: pub.permissions ?? [],
      department: pub.department,
    };
    next();
  } catch {
    return fail(res, 401, "Invalid or expired token", "UNAUTHORIZED");
  }
}

export function requirePermission(...needed: Permission[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return fail(res, 401, "Sign in required", "UNAUTHORIZED");
    if (hasPermission(user.role, user.permissions, needed)) return next();
    return fail(res, 403, "You do not have permission for this action", "FORBIDDEN");
  };
}

export function requireRole(...roles: AppRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) return fail(res, 401, "Sign in required", "UNAUTHORIZED");
    if (role === "super_admin" || role === "admin") return next();
    if (roles.includes(role)) return next();
    return fail(res, 403, "You do not have permission for this action", "FORBIDDEN");
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role === "super_admin" || role === "admin") return next();
  return fail(res, 403, "Admin access required", "FORBIDDEN");
}

export function requireAdminOrCeo(req: AuthedRequest, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role === "super_admin" || role === "admin" || role === "ceo") return next();
  return fail(res, 403, "Admin or CEO access required", "FORBIDDEN");
}

export function forbidViewerWrite(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "viewer" && req.method !== "GET") {
    return fail(res, 403, "Viewer accounts are read-only", "FORBIDDEN");
  }
  next();
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return fail(res, err.status, err.message, err.code, err.errors);
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return fail(res, 400, "File is too large", "BAD_REQUEST");
  }
  console.error(err);
  const message = env.nodeEnv === "production" ? "Server error" : err?.message || "Server error";
  return fail(res, 500, message, "SERVER_ERROR");
}

export function notFound(_req: Request, res: Response) {
  return fail(res, 404, "Not found", "NOT_FOUND");
}

export { resolvePermissions };
