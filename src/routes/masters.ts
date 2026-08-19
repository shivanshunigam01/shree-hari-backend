import { Router } from "express";
import { authJwt, forbidViewerWrite, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { mastersRepo, notificationsRepo } from "../repos/masters.js";
import { fail, ok } from "../lib/http.js";
import { writeAudit } from "../services/audit.js";
import { upload, assertImage } from "../middleware/upload.js";
import { storage } from "../services/storage.js";

export const mastersRouter = Router();
mastersRouter.use(authJwt);

function tableParam(req: { params: Record<string, string | string[] | undefined> }) {
  return mastersRepo.normalizeTable(String(req.params.table || ""));
}

mastersRouter.get("/:table", requirePermission("masters.view"), async (req, res) => {
  const table = tableParam(req);
  if (!mastersRepo.known(table)) return fail(res, 404, "Unknown master table", "NOT_FOUND");
  const rows = await mastersRepo.list(table);
  return ok(res, rows ?? []);
});

mastersRouter.post("/:table", requirePermission("masters.create"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const table = tableParam(req);
  if (!mastersRepo.known(table)) return fail(res, 404, "Unknown master table", "NOT_FOUND");
  const created = await mastersRepo.create(table, { ...req.body, created_by: req.user!.id });
  await writeAudit({
    user: req.user,
    action: "MASTER_CREATED",
    entityType: table,
    entityId: (created as any)?.id,
    description: `Created ${table} record`,
  });
  return ok(res, created, "Created", 201);
});

mastersRouter.post("/:table/:id/image", requirePermission("masters.edit"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (req.params.table !== "products") return fail(res, 400, "Images are only supported on products", "BAD_REQUEST");
  if (!req.file) return fail(res, 400, "File is required", "VALIDATION_ERROR");
  assertImage(req.file);
  const stored = await storage.save(req.file.buffer, {
    folder: "products",
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
  const updated = await mastersRepo.update("products", req.params.id, { image_url: stored.url });
  if (updated === false) return fail(res, 404, "Record not found", "NOT_FOUND");
  return ok(res, updated, "Image uploaded");
});

mastersRouter.patch("/:table/:id", requirePermission("masters.edit"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const table = tableParam(req);
  if (!mastersRepo.known(table)) return fail(res, 404, "Unknown master table", "NOT_FOUND");
  const updated = await mastersRepo.update(table, req.params.id, { ...req.body, updated_by: req.user!.id });
  if (updated === false) return fail(res, 404, "Record not found", "NOT_FOUND");
  await writeAudit({
    user: req.user,
    action: "MASTER_UPDATED",
    entityType: table,
    entityId: req.params.id,
    description: `Updated ${table} record`,
  });
  return ok(res, updated, "Updated");
});

mastersRouter.delete("/:table/:id", requirePermission("masters.delete"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const table = tableParam(req);
  if (!mastersRepo.known(table)) return fail(res, 404, "Unknown master table", "NOT_FOUND");
  const okDel = await mastersRepo.remove(table, req.params.id);
  if (!okDel) return fail(res, 404, "Record not found", "NOT_FOUND");
  await writeAudit({
    user: req.user,
    action: "MASTER_DEACTIVATED",
    entityType: table,
    entityId: req.params.id,
    description: `Deactivated ${table} record`,
  });
  return ok(res, { ok: true }, "Deactivated");
});

export const notificationsRouter = Router();
notificationsRouter.use(authJwt);

notificationsRouter.get("/", requirePermission("notifications.view"), async (req: AuthedRequest, res) => {
  const items = await notificationsRepo.list(req.user!.id);
  const unread = items.filter((n: any) => !n.read && !n.isRead).length;
  return ok(res, { items, unread });
});

notificationsRouter.patch("/:id/read", async (req: AuthedRequest, res) => {
  const row = await notificationsRepo.markRead(req.params.id, req.user!.id);
  if (!row) return fail(res, 404, "Notification not found", "NOT_FOUND");
  return ok(res, row);
});

notificationsRouter.post("/read-all", async (req: AuthedRequest, res) => {
  await notificationsRepo.markAllRead(req.user!.id);
  return ok(res, { ok: true }, "All notifications marked as read");
});
