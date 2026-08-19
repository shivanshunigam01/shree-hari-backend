import { Router } from "express";
import { z } from "zod";
import { ROLES } from "../lib/roles.js";
import { authJwt, requireAdmin, requireAdminOrCeo, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { usersRepo, hashPassword } from "../repos/users.js";
import { fail, ok, zodErrors } from "../lib/http.js";
import { writeAudit } from "../services/audit.js";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES),
  department: z.string().optional(),
  countries: z.array(z.string()).optional().default([]),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(ROLES).optional(),
  department: z.string().optional(),
  countries: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const usersRouter = Router();
usersRouter.use(authJwt);

usersRouter.get("/", requirePermission("users.view"), async (_req, res) => {
  const users = await usersRepo.list();
  return ok(res, users.map((u) => usersRepo.public(u)));
});

usersRouter.get("/:id", requirePermission("users.view"), async (req, res) => {
  const user = await usersRepo.findById(req.params.id);
  if (!user) return fail(res, 404, "Staff not found", "NOT_FOUND");
  return ok(res, usersRepo.public(user));
});

usersRouter.post("/", requirePermission("users.create"), requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Invalid staff data", "VALIDATION_ERROR", zodErrors(parsed.error.issues));

  const email = parsed.data.email.toLowerCase().trim();
  const exists = await usersRepo.findByEmail(email);
  if (exists) return fail(res, 409, "A staff member with this email already exists", "CONFLICT");

  if (parsed.data.role === "super_admin" && req.user?.role !== "super_admin") {
    return fail(res, 403, "Only Super Admin can create another Super Admin", "FORBIDDEN");
  }

  const user = await usersRepo.create({
    name: parsed.data.name,
    email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
    countries: parsed.data.countries ?? [],
    permissions: parsed.data.permissions,
    department: parsed.data.department,
    active: parsed.data.active ?? true,
  });
  await writeAudit({
    user: req.user,
    action: "USER_CREATED",
    entityType: "user",
    entityId: (user as any)?.id,
    description: `Created staff ${email} (${parsed.data.role})`,
    ip: req.ip,
  });
  return ok(res, usersRepo.public(user), "Staff created", 201);
});

usersRouter.patch("/:id", requirePermission("users.edit"), requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Invalid data", "VALIDATION_ERROR", zodErrors(parsed.error.issues));

  const user = await usersRepo.findById(req.params.id);
  if (!user) return fail(res, 404, "Staff not found", "NOT_FOUND");

  const patch: Record<string, unknown> = {};
  if (parsed.data.email) patch.email = parsed.data.email.toLowerCase().trim();
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.department !== undefined) patch.department = parsed.data.department;
  if (parsed.data.role) {
    if (parsed.data.role === "super_admin" && req.user?.role !== "super_admin") {
      return fail(res, 403, "Only Super Admin can assign Super Admin", "FORBIDDEN");
    }
    patch.role = parsed.data.role;
  }
  if (parsed.data.countries) patch.countries = parsed.data.countries;
  if (parsed.data.permissions) patch.permissions = parsed.data.permissions;
  if (typeof parsed.data.active === "boolean") patch.active = parsed.data.active;
  if (parsed.data.password) patch.passwordHash = await hashPassword(parsed.data.password);

  const saved = await usersRepo.save(user, patch);
  await writeAudit({
    user: req.user,
    action: parsed.data.active === false ? "USER_DEACTIVATED" : "USER_UPDATED",
    entityType: "user",
    entityId: req.params.id,
    description: `Updated staff ${(saved as any)?.email}`,
    ip: req.ip,
  });
  return ok(res, usersRepo.public(saved), "Staff updated");
});

usersRouter.patch("/:id/status", requirePermission("users.deactivate"), requireAdmin, async (req: AuthedRequest, res) => {
  if (req.params.id === req.user?.id) return fail(res, 400, "You cannot deactivate your own account", "BAD_REQUEST");
  const user = await usersRepo.findById(req.params.id);
  if (!user) return fail(res, 404, "Staff not found", "NOT_FOUND");
  const active = Boolean(req.body?.active);
  const saved = await usersRepo.save(user, { active });
  await writeAudit({
    user: req.user,
    action: active ? "USER_UPDATED" : "USER_DEACTIVATED",
    entityType: "user",
    entityId: req.params.id,
    description: `${(saved as any)?.email} set active=${active}`,
    ip: req.ip,
  });
  return ok(res, usersRepo.public(saved), active ? "Staff activated" : "Staff deactivated");
});

usersRouter.patch("/:id/password", requirePermission("users.edit"), requireAdmin, async (req: AuthedRequest, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters", "VALIDATION_ERROR");
  const user = await usersRepo.findById(req.params.id);
  if (!user) return fail(res, 404, "Staff not found", "NOT_FOUND");
  const saved = await usersRepo.save(user, { passwordHash: await hashPassword(password) });
  return ok(res, usersRepo.public(saved), "Password reset");
});

usersRouter.delete("/:id", requirePermission("users.deactivate"), requireAdmin, async (req: AuthedRequest, res) => {
  if (req.params.id === req.user?.id) return fail(res, 400, "You cannot deactivate your own account", "BAD_REQUEST");
  const user = await usersRepo.findById(req.params.id);
  if (!user) return fail(res, 404, "Staff not found", "NOT_FOUND");
  const saved = await usersRepo.save(user, { active: false });
  await writeAudit({
    user: req.user,
    action: "USER_DEACTIVATED",
    entityType: "user",
    entityId: req.params.id,
    description: `Deactivated ${(saved as any)?.email}`,
    ip: req.ip,
  });
  return ok(res, { ok: true, user: usersRepo.public(saved) }, "Staff deactivated");
});
