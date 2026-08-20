import { Router } from "express";
import { authJwt, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { applicationsRepo } from "../repos/applications.js";
import { countryFilter } from "../services/applications.js";
import { auditRepo, documentsRepo, settingsRepo, billingRepo, fxRepo } from "../repos/ops.js";
import { numbering } from "../services/numbering.js";
import { fail, ok } from "../lib/http.js";
import { normalizeStatus } from "../constants/status.js";
import { upload, assertImage } from "../middleware/upload.js";
import { storage } from "../services/storage.js";
import { generateExportPdf, type PdfKind } from "../services/pdf/index.js";
import { upsertIssuedBilling } from "../services/billing.js";
import path from "node:path";
import fs from "node:fs";

function sendStoredFile(res: any, doc: any) {
  const url = String(doc.file_url || "");
  if (url.startsWith("http")) return res.redirect(url);
  const abs = storage.resolveLocal(url);
  if (!abs || !fs.existsSync(abs)) return fail(res, 404, "File missing", "NOT_FOUND");
  return res.download(abs, String(doc.file_name || path.basename(abs)));
}

export const dashboardRouter = Router();
dashboardRouter.use(authJwt);

dashboardRouter.get("/summary", requirePermission("dashboard.view"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list(countryFilter(req.user!), { limit: 5000 });
  const count = (status: string) => items.filter((a: any) => normalizeStatus(a.status) === status).length;
  return ok(res, {
    total: items.length,
    draft: count("DRAFT"),
    submitted: count("SUBMITTED"),
    pending: count("UNDER_REVIEW"),
    changesRequired: count("CHANGES_REQUIRED"),
    approved: count("APPROVED"),
    inProgress: count("IN_PROGRESS"),
    ready: count("READY_FOR_DISPATCH"),
    dispatched: count("DISPATCHED"),
    completed: count("COMPLETED"),
    rejected: count("REJECTED"),
  });
});

dashboardRouter.get("/recent-applications", requirePermission("dashboard.view"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list(countryFilter(req.user!), { limit: 10 });
  return ok(res, items);
});

dashboardRouter.get("/pending-approvals", requirePermission("applications.approve"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list({ ...countryFilter(req.user!), status: "UNDER_REVIEW" }, { limit: 50 });
  return ok(res, items);
});

export const auditRouter = Router();
auditRouter.use(authJwt);
auditRouter.get("/", requirePermission("audit_logs.view"), async (_req, res) => {
  return ok(res, await auditRepo.list({}, 200));
});

export const reportsRouter = Router();
reportsRouter.use(authJwt);
reportsRouter.get("/applications", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list(countryFilter(req.user!), { limit: 2000 });
  return ok(res, items);
});
reportsRouter.get("/shipments", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list(countryFilter(req.user!), { limit: 2000 });
  return ok(res, items.filter((a: any) => ["DISPATCHED", "COMPLETED", "READY_FOR_DISPATCH"].includes(normalizeStatus(a.status))));
});
reportsRouter.get("/countries", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { items } = await applicationsRepo.list(countryFilter(req.user!), { limit: 2000 });
  const map: Record<string, number> = {};
  for (const a of items) {
    const c = (a as any)?.final_destination_text || (a as any)?.country_id || "Unknown";
    map[c] = (map[c] || 0) + 1;
  }
  return ok(res, Object.entries(map).map(([country, count]) => ({ country, count })));
});

export const settingsRouter = Router();
settingsRouter.use(authJwt);
settingsRouter.get("/", async (_req, res) => ok(res, await settingsRepo.get()));
settingsRouter.patch("/", requirePermission("settings.manage"), async (req, res) => {
  return ok(res, await settingsRepo.save(req.body ?? {}), "Settings saved");
});

export const documentsPublicRouter = Router();
documentsPublicRouter.use(authJwt);
documentsPublicRouter.get("/", requirePermission("documents.view"), async (_req, res) => {
  return ok(res, await documentsRepo.listAll(200));
});
documentsPublicRouter.get("/:id/download", requirePermission("documents.view"), async (req, res) => {
  const doc = await documentsRepo.findById(req.params.id);
  if (!doc) return fail(res, 404, "Document not found", "NOT_FOUND");
  return sendStoredFile(res, doc);
});
documentsPublicRouter.post("/", requirePermission("documents.upload"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return fail(res, 400, "File is required", "VALIDATION_ERROR");
  const applicationId = String(req.body?.application_id || "").trim() || undefined;
  const stored = await storage.save(req.file.buffer, {
    folder: applicationId ? `documents/${applicationId}` : "documents",
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
  const row = await documentsRepo.create({
    application_id: applicationId,
    document_type: String(req.body?.document_type || req.body?.documentType || "attachment"),
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
  return ok(res, row, "Document uploaded", 201);
});
documentsPublicRouter.delete("/:id", requirePermission("documents.delete"), async (req: AuthedRequest, res) => {
  const doc = await documentsRepo.findById(req.params.id);
  if (!doc) return fail(res, 404, "Document not found", "NOT_FOUND");
  await storage.remove({
    url: doc.file_url as string | undefined,
    publicId: (doc.public_id || doc.publicId) as string | undefined,
    storage: doc.storage as string | undefined,
  });
  await documentsRepo.remove(req.params.id);
  return ok(res, { ok: true }, "Document removed");
});

export const uploadsRouter = Router();
uploadsRouter.use(authJwt);
uploadsRouter.post("/", requirePermission("documents.upload", "masters.edit"), upload.single("file"), async (req, res) => {
  if (!req.file) return fail(res, 400, "File is required", "VALIDATION_ERROR");
  const folder = String(req.body?.folder || "uploads").replace(/[^a-z0-9/_-]/gi, "") || "uploads";
  const stored = await storage.save(req.file.buffer, {
    folder,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
  return ok(res, stored, "Uploaded", 201);
});
uploadsRouter.post("/image", requirePermission("documents.upload", "masters.edit"), upload.single("file"), async (req, res) => {
  if (!req.file) return fail(res, 400, "File is required", "VALIDATION_ERROR");
  assertImage(req.file);
  const stored = await storage.save(req.file.buffer, {
    folder: String(req.body?.folder || "images").replace(/[^a-z0-9/_-]/gi, "") || "images",
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });
  return ok(res, stored, "Uploaded", 201);
});

export const billingRouter = Router();
billingRouter.use(authJwt);
billingRouter.get("/", requirePermission("billing.view"), async (_req, res) => ok(res, await billingRepo.list()));
billingRouter.get("/:id/download", requirePermission("billing.view", "documents.view"), async (req: AuthedRequest, res) => {
  const bill = await billingRepo.findById(req.params.id);
  if (!bill) return fail(res, 404, "Billing record not found", "NOT_FOUND");

  let doc = bill.document_id ? await documentsRepo.findById(String(bill.document_id)) : null;
  if (!doc && bill.application_id) {
    const docs = await documentsRepo.listByApplication(String(bill.application_id));
    const kind = String(bill.document_type || "proforma");
    doc = docs.find((d: any) => d.document_type === kind) || null;
  }

  if (!doc && bill.application_id) {
    const app = await applicationsRepo.findById(String(bill.application_id), countryFilter(req.user!));
    if (!app) return fail(res, 404, "Linked application not found", "NOT_FOUND");
    const kind = (String(bill.document_type || "proforma") as PdfKind);
    const allowed: PdfKind[] = ["invoice", "proforma", "packing_list", "annexure", "vgm", "inr_invoice"];
    if (!allowed.includes(kind)) return fail(res, 400, "This billing record has no downloadable PDF", "BAD_REQUEST");
    if (kind === "proforma" || kind === "invoice" || kind === "inr_invoice") {
      const missingImg = (app.items || []).filter((it: any) => String(it.description || "").trim() && !String(it.image_url || "").trim());
      if (missingImg.length) {
        return fail(res, 422, "Upload a product image on every PI / invoice line item", "VALIDATION_ERROR");
      }
    }
    const pdf = await generateExportPdf(app, kind);
    const stored = await storage.save(pdf, {
      folder: "generated",
      originalName: `${app.invoice_no || app.proforma_no || app.app_no}-${kind}.pdf`,
      mimeType: "application/pdf",
    });
    const existing = (await documentsRepo.listByApplication(String(bill.application_id))).filter((d: any) => d.document_type === kind);
    doc = await documentsRepo.create({
      application_id: String(bill.application_id),
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
    await billingRepo.update(bill.id, { document_id: doc.id, status: "ISSUED" });
    await upsertIssuedBilling({ application: app, kind, documentId: doc.id, userId: req.user!.id });
  }

  if (!doc) return fail(res, 404, "No PDF for this bill yet. Generate it from the application screen.", "NOT_FOUND");
  return sendStoredFile(res, doc);
});
billingRouter.post("/", requirePermission("billing.create"), async (req: AuthedRequest, res) => {
  const billing_no = await numbering.billing();
  const row = await billingRepo.create({
    ...req.body,
    billing_no,
    status: req.body?.status || "DRAFT",
    created_by: req.user!.id,
  });
  return ok(res, row, "Billing record created", 201);
});
billingRouter.patch("/:id", requirePermission("billing.edit"), async (req, res) => {
  const row = await billingRepo.update(req.params.id, req.body ?? {});
  if (!row) return fail(res, 404, "Not found", "NOT_FOUND");
  return ok(res, row);
});

export const fxRouter = Router();
fxRouter.use(authJwt);
fxRouter.get("/", requirePermission("fx.manage", "applications.view"), async (_req, res) => {
  const items = await fxRepo.list();
  const latest = await fxRepo.latest();
  return ok(res, { items, latest });
});
fxRouter.post("/", requirePermission("fx.manage"), async (req: AuthedRequest, res) => {
  const usd_inr = Number(req.body?.usd_inr);
  const week_start = String(req.body?.week_start || new Date().toISOString().slice(0, 10));
  if (!usd_inr || usd_inr <= 0) return fail(res, 400, "usd_inr rate is required", "VALIDATION_ERROR");
  const row = await fxRepo.create({
    week_start,
    usd_inr,
    pairs: req.body?.pairs || { USD_INR: usd_inr },
    note: req.body?.note || "",
    created_by: req.user!.id,
    created_by_name: req.user!.name,
    active: true,
  });
  return ok(res, row, "Exchange rate saved", 201);
});
