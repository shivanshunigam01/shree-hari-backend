import { dbMode } from "../config/db.js";
import { AuditLog, ApprovalHistory, AppDocument, Counter, CompanySettings, BillingRecord, FxRate } from "../models/AuditLog.js";
import { jsonDb, serializeRow } from "../db/json.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { COMPANY_DEFAULTS } from "../constants/company.js";

export const auditRepo = {
  async create(doc: Record<string, unknown>) {
    if (dbMode === "mongo") return serialize(await AuditLog.create(doc));
    return serializeRow(jsonDb.insert("audit_logs", doc));
  },
  async list(query: Record<string, unknown> = {}, limit = 100) {
    if (dbMode === "mongo") {
      const rows = await AuditLog.find(query).sort({ created_at: -1 }).limit(limit);
      return serializeMany(rows);
    }
    return jsonDb.find("audit_logs").slice(0, limit).map(serializeRow);
  },
};

export const approvalRepo = {
  async create(doc: Record<string, unknown>) {
    if (dbMode === "mongo") return serialize(await ApprovalHistory.create(doc));
    return serializeRow(jsonDb.insert("approval_histories", { ...doc, performed_at: new Date().toISOString() }));
  },
  async listByApplication(applicationId: string) {
    if (dbMode === "mongo") {
      return serializeMany(await ApprovalHistory.find({ application_id: applicationId }).sort({ performed_at: -1 }));
    }
    return jsonDb.find("approval_histories", { application_id: applicationId }).map(serializeRow);
  },
};

export const documentsRepo = {
  async create(doc: Record<string, unknown>) {
    if (dbMode === "mongo") return serialize(await AppDocument.create(doc));
    return serializeRow(jsonDb.insert("documents", { ...doc, uploaded_at: new Date().toISOString() }));
  },
  async listByApplication(applicationId: string) {
    if (dbMode === "mongo") {
      return serializeMany(await AppDocument.find({ application_id: applicationId }).sort({ uploaded_at: -1 }));
    }
    return jsonDb.find("documents", { application_id: applicationId }).map(serializeRow);
  },
  async findById(id: string) {
    if (dbMode === "mongo") {
      const row = await AppDocument.findById(id);
      return row ? serialize(row) : null;
    }
    return serializeRow(jsonDb.findById("documents", id));
  },
  async update(id: string, patch: Record<string, unknown>) {
    if (dbMode === "mongo") {
      const row = await AppDocument.findByIdAndUpdate(id, patch, { new: true });
      return row ? serialize(row) : null;
    }
    const row = jsonDb.updateById("documents", id, patch);
    return row ? serializeRow(row) : null;
  },
  async remove(id: string) {
    if (dbMode === "mongo") return Boolean(await AppDocument.findByIdAndDelete(id));
    return Boolean(jsonDb.deleteById("documents", id));
  },
  async listAll(limit = 100) {
    if (dbMode === "mongo") return serializeMany(await AppDocument.find().sort({ uploaded_at: -1 }).limit(limit));
    return jsonDb.find("documents").slice(0, limit).map(serializeRow);
  },
};

export const countersRepo = {
  async next(key: string) {
    if (dbMode === "mongo") {
      const row = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
      return row.seq as number;
    }
    const existing = jsonDb.findOne("counters", { key });
    if (!existing) {
      jsonDb.insert("counters", { key, seq: 1, id: key });
      return 1;
    }
    const seq = Number(existing.seq || 0) + 1;
    jsonDb.updateById("counters", existing.id, { seq });
    return seq;
  },
};

export const settingsRepo = {
  async get() {
    if (dbMode === "mongo") {
      const row = await CompanySettings.findOne({ key: "company" });
      return { ...COMPANY_DEFAULTS, ...((row?.value as Record<string, unknown>) || {}) };
    }
    const row = jsonDb.findOne("settings", { key: "company" });
    return { ...COMPANY_DEFAULTS, ...((row?.value as Record<string, unknown>) || {}) };
  },
  async save(value: Record<string, unknown>) {
    const merged = { ...COMPANY_DEFAULTS, ...value };
    if (dbMode === "mongo") {
      await CompanySettings.findOneAndUpdate({ key: "company" }, { value: merged }, { upsert: true, new: true });
      return merged;
    }
    const row = jsonDb.findOne("settings", { key: "company" });
    if (row) jsonDb.updateById("settings", row.id, { value: merged });
    else jsonDb.insert("settings", { key: "company", value: merged });
    return merged;
  },
};

export const billingRepo = {
  async create(doc: Record<string, unknown>) {
    if (dbMode === "mongo") return serialize(await BillingRecord.create(doc));
    return serializeRow(jsonDb.insert("billing", doc));
  },
  async list(query: Record<string, unknown> = {}) {
    if (dbMode === "mongo") return serializeMany(await BillingRecord.find(query).sort({ created_at: -1 }));
    return jsonDb.find("billing").map(serializeRow);
  },
  async findById(id: string) {
    if (dbMode === "mongo") {
      const row = await BillingRecord.findById(id);
      return row ? serialize(row) : null;
    }
    return serializeRow(jsonDb.findById("billing", id));
  },
  async update(id: string, patch: Record<string, unknown>) {
    if (dbMode === "mongo") {
      const row = await BillingRecord.findByIdAndUpdate(id, patch, { new: true });
      return row ? serialize(row) : null;
    }
    const row = jsonDb.updateById("billing", id, patch);
    return row ? serializeRow(row) : null;
  },
};

export const fxRepo = {
  async list() {
    if (dbMode === "mongo") return serializeMany(await FxRate.find().sort({ week_start: -1, created_at: -1 }).limit(52));
    return jsonDb.find("fx_rates").map(serializeRow);
  },
  async create(doc: Record<string, unknown>) {
    if (dbMode === "mongo") return serialize(await FxRate.create(doc));
    return serializeRow(jsonDb.insert("fx_rates", doc));
  },
  async latest() {
    if (dbMode === "mongo") {
      const row = await FxRate.findOne().sort({ week_start: -1, created_at: -1 });
      return row ? serialize(row) : null;
    }
    const rows = jsonDb
      .find("fx_rates")
      .slice()
      .sort((a, b) => String(b.week_start || "").localeCompare(String(a.week_start || "")));
    return rows[0] ? serializeRow(rows[0]) : null;
  },
};
