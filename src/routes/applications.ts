import { Router } from "express";
import { authJwt, forbidViewerWrite, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { applicationsRepo } from "../repos/applications.js";
import { approvalRepo, documentsRepo } from "../repos/ops.js";
import { applicationService, countryFilter } from "../services/applications.js";
import { workflow } from "../services/workflow.js";
import { applicationBodySchema, commentSchema } from "../validators/application.js";
import { fail, ok, zodErrors, HttpError } from "../lib/http.js";
import { upload } from "../middleware/upload.js";
import { storage } from "../services/storage.js";
import { generateExportPdf, type PdfKind } from "../services/pdf/index.js";
import { writeAudit } from "../services/audit.js";
import { usersRepo } from "../repos/users.js";

export const applicationsRouter = Router();
applicationsRouter.use(authJwt);

applicationsRouter.get("/", requirePermission("applications.view"), async (req: AuthedRequest, res) => {
  const result = await applicationService.list(req.user!, req.query as Record<string, string | undefined>);
  return ok(res, result);
});

applicationsRouter.get("/:id", requirePermission("applications.view"), async (req: AuthedRequest, res) => {
  const app = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!app) return fail(res, 404, "Application not found", "NOT_FOUND");
  const history = await approvalRepo.listByApplication(req.params.id);
  const documents = await documentsRepo.listByApplication(req.params.id);
  return ok(res, {
    app,
    containers: app.containers ?? [],
    items: app.items ?? [],
    stages: app.stages ?? [],
    packing_lines: app.packing_lines ?? [],
    history,
    documents,
  });
});

applicationsRouter.post("/", requirePermission("applications.create"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const parsed = applicationBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, "Validation failed", "VALIDATION_ERROR", zodErrors(parsed.error.issues));
  const created = await applicationService.create(req.user!, parsed.data, req.ip);
  return ok(res, created, "Application created successfully", 201);
});

applicationsRouter.patch("/:id", requirePermission("applications.edit"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const parsed = applicationBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, "Validation failed", "VALIDATION_ERROR", zodErrors(parsed.error.issues));
  try {
    const updated = await applicationService.update(req.params.id, req.user!, parsed.data, countryFilter(req.user!));
    return ok(res, updated, "Application saved");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/submit", requirePermission("applications.submit"), async (req: AuthedRequest, res) => {
  try {
    const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
    if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
    const updated = await workflow.submit(req.params.id, req.user!, req.ip);
    return ok(res, updated, "Application submitted");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/resubmit", requirePermission("applications.submit"), async (req: AuthedRequest, res) => {
  try {
    const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
    if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
    const updated = await workflow.resubmit(req.params.id, req.user!, req.ip);
    return ok(res, updated, "Application resubmitted");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/approve", requirePermission("applications.approve"), async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, "Comment is required", "VALIDATION_ERROR", zodErrors(parsed.error.issues));
  try {
    const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
    if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
    const updated = await workflow.approve(req.params.id, req.user!, parsed.data.comment, req.ip);
    return ok(res, updated, "Application approved");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/reject", requirePermission("applications.reject"), async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, "A reason is required", "VALIDATION_ERROR", zodErrors(parsed.error.issues));
  try {
    const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
    if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
    const updated = await workflow.reject(req.params.id, req.user!, parsed.data.comment, req.ip);
    return ok(res, updated, "Application rejected");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/request-changes", requirePermission("applications.reject"), async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, "A reason is required", "VALIDATION_ERROR", zodErrors(parsed.error.issues));
  try {
    const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
    if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
    const updated = await workflow.requestChanges(req.params.id, req.user!, parsed.data.comment, req.ip);
    return ok(res, updated, "Changes requested");
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.status, e.message, e.code, e.errors);
    throw e;
  }
});

applicationsRouter.post("/:id/assign", requirePermission("applications.assign"), async (req: AuthedRequest, res) => {
  const assignedTo = String(req.body?.assignedTo || req.body?.assigned_to || "");
  if (!assignedTo) return fail(res, 400, "assignedTo is required", "VALIDATION_ERROR");
  const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
  const staff = await usersRepo.findById(assignedTo);
  if (!staff) return fail(res, 404, "Staff not found", "NOT_FOUND");
  const updated = await applicationsRepo.update(req.params.id, { assigned_to: assignedTo });
  return ok(res, updated, "Application assigned");
});

applicationsRouter.patch("/:id/stages/:stageId", requirePermission("applications.edit"), forbidViewerWrite, async (req: AuthedRequest, res) => {
  const updated = await applicationsRepo.updateStage(req.params.id, req.params.stageId, {
    ...req.body,
    completed_by: req.user!.id,
  });
  if (!updated) return fail(res, 404, "Application or stage not found", "NOT_FOUND");
  return ok(res, updated, "Stage updated");
});

applicationsRouter.post("/:id/stages/:stageId/complete", requirePermission("applications.edit"), async (req: AuthedRequest, res) => {
  const updated = await applicationsRepo.updateStage(req.params.id, req.params.stageId, {
    status: "completed",
    comment: req.body?.comment,
    completed_by: req.user!.id,
  });
  if (!updated) return fail(res, 404, "Application or stage not found", "NOT_FOUND");
  return ok(res, updated, "Stage completed");
});

applicationsRouter.get("/:id/documents", requirePermission("documents.view"), async (req: AuthedRequest, res) => {
  const app = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!app) return fail(res, 404, "Application not found", "NOT_FOUND");
  return ok(res, await documentsRepo.listByApplication(req.params.id));
});

applicationsRouter.post("/:id/documents", requirePermission("documents.upload"), upload.single("file"), async (req: AuthedRequest, res) => {
  const app = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!app) return fail(res, 404, "Application not found", "NOT_FOUND");
  if (!req.file) return fail(res, 400, "File is required", "VALIDATION_ERROR");
  const stored = await storage.save(req.file.buffer, {
    folder: "documents",
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
  const row = await documentsRepo.create({
    application_id: req.params.id,
    document_type: req.body?.documentType || req.body?.document_type || "attachment",
    file_name: stored.fileName,
    file_url: stored.url,
    mime_type: stored.mimeType,
    file_size: stored.fileSize,
    uploaded_by: req.user!.id,
    uploaded_by_name: req.user!.name,
    version: 1,
    status: "uploaded",
    storage: stored.storage,
    public_id: stored.publicId,
  });
  await writeAudit({
    user: req.user,
    action: "DOCUMENT_UPLOADED",
    entityType: "document",
    entityId: (row as any)?.id,
    description: `Uploaded ${stored.fileName} to ${app.app_no}`,
  });
  return ok(res, row, "Document uploaded", 201);
});

applicationsRouter.post("/:id/documents/generate", requirePermission("documents.generate"), async (req: AuthedRequest, res) => {
  const kind = String(req.body?.type || "invoice") as PdfKind;
  const allowed: PdfKind[] = ["invoice", "proforma", "packing_list", "annexure", "vgm"];
  if (!allowed.includes(kind)) return fail(res, 400, "Unknown document type", "BAD_REQUEST");
  const app = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!app) return fail(res, 404, "Application not found", "NOT_FOUND");
  const pdf = await generateExportPdf(app, kind);
  const stored = await storage.save(pdf, {
    folder: "generated",
    originalName: `${app.invoice_no || app.app_no}-${kind}.pdf`,
    mimeType: "application/pdf",
  });
  const existing = (await documentsRepo.listByApplication(req.params.id)).filter((d: any) => d.document_type === kind);
  const row = await documentsRepo.create({
    application_id: req.params.id,
    document_type: kind,
    file_name: stored.fileName,
    file_url: stored.url,
    mime_type: "application/pdf",
    file_size: stored.fileSize,
    uploaded_by: req.user!.id,
    uploaded_by_name: req.user!.name,
    version: existing.length + 1,
    status: "generated",
    storage: stored.storage,
    public_id: stored.publicId,
  });
  return ok(res, row, "Document generated", 201);
});

applicationsRouter.delete("/:id", requirePermission("applications.delete"), async (req: AuthedRequest, res) => {
  const existing = await applicationsRepo.findById(req.params.id, countryFilter(req.user!));
  if (!existing) return fail(res, 404, "Application not found", "NOT_FOUND");
  await applicationsRepo.remove(req.params.id);
  return ok(res, { ok: true }, "Application cancelled");
});
