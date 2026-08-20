import { dbMode } from "../config/db.js";
import { Application, DEFAULT_STAGES } from "../models/Application.js";
import { jsonDb, serializeRow } from "../db/json.js";
import { serialize } from "../lib/serialize.js";
import { randomUUID } from "node:crypto";

function flattenMongo(doc: any) {
  const a = serialize<any>(doc);
  a.containers = (doc.containers ?? []).map((c: any) => serialize(c));
  a.items = (doc.items ?? []).map((i: any) => serialize(i));
  a.stages = (doc.stages ?? []).map((s: any) => serialize(s));
  a.packing_lines = (doc.packing_lines ?? []).map((s: any) => serialize(s));
  a.gst_bills = doc.gst_bills ?? [];
  return a;
}

function ensureSubIds(list: any[] = []) {
  return list.map((x, i) => ({ ...x, id: x.id || randomUUID(), seq: x.seq ?? i }));
}

function matchesCountry(app: any, filter: Record<string, unknown>) {
  if (!filter || !Object.keys(filter).length) return true;
  if (filter.final_destination_text) {
    const dest = (filter.final_destination_text as any).$in;
    if (Array.isArray(dest) && !dest.includes(app.final_destination_text) && !dest.includes(app.country_id)) return false;
  }
  if (filter.$or) {
    const or = filter.$or as any[];
    return or.some((clause) => {
      if (clause.final_destination_text?.$in) {
        return clause.final_destination_text.$in.includes(app.final_destination_text);
      }
      if (clause.country_id?.$in) {
        return clause.country_id.$in.includes(app.country_id);
      }
      return false;
    });
  }
  return true;
}

export const applicationsRepo = {
  async nextAppNo() {
    const year = String(new Date().getFullYear()).slice(-2);
    const prefix = `SHE${year}`;
    let last: string | undefined;
    if (dbMode === "mongo") {
      const row = await Application.findOne({ app_no: new RegExp(`^${prefix}`) }).sort({ app_no: -1 }).lean();
      last = row?.app_no;
    } else {
      last = jsonDb
        .find("applications")
        .map((a) => a.app_no as string)
        .filter((n) => n?.startsWith(prefix))
        .sort()
        .at(-1);
    }
    const n = last ? Number(String(last).replace(prefix, "")) + 1 : 1;
    return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, "0")}`;
  },
  async list(filter: Record<string, unknown>, opts?: { skip?: number; limit?: number; sort?: Record<string, 1 | -1> }) {
    const skip = opts?.skip ?? 0;
    const limit = opts?.limit ?? 50;
    if (dbMode === "mongo") {
      const mongoFilter = { deleted_at: { $in: [null, undefined] }, ...filter };
      const [items, total] = await Promise.all([
        Application.find(mongoFilter).sort(opts?.sort || { created_at: -1 }).skip(skip).limit(limit),
        Application.countDocuments(mongoFilter),
      ]);
      return { items: items.map(flattenMongo), total };
    }
    let rows = jsonDb.find("applications").filter((a) => !a.deleted_at && matchesCountry(a, filter) && matchesQuery(a, filter));
    rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const total = rows.length;
    return { items: rows.slice(skip, skip + limit).map(serializeRow), total };
  },
  async findById(id: string, filter: Record<string, unknown> = {}) {
    if (dbMode === "mongo") {
      const app = await Application.findOne({ _id: id, ...filter });
      return app ? flattenMongo(app) : null;
    }
    const app = jsonDb.findById("applications", id);
    if (!app || app.deleted_at) return null;
    if (!matchesCountry(app, filter)) return null;
    return serializeRow(app);
  },
  async create(body: any) {
    const stages = (body.stages ?? DEFAULT_STAGES.map((s, i) => ({
      ...s,
      id: randomUUID(),
      status: i === 0 ? "completed" : i === 1 ? "in_progress" : "pending",
      acted_at: i === 0 ? new Date().toISOString() : undefined,
    })));
    const payload = {
      ...body,
      status: body.status || "DRAFT",
      version: 1,
      containers: ensureSubIds(body.containers),
      items: ensureSubIds(body.items),
      packing_lines: ensureSubIds(body.packing_lines),
      stages: ensureSubIds(stages),
    };
    if (dbMode === "mongo") {
      const created = await Application.create(payload);
      return flattenMongo(created);
    }
    return serializeRow(jsonDb.insert("applications", payload));
  },
  async update(id: string, patch: any) {
    if (dbMode === "mongo") {
      const app = await Application.findById(id);
      if (!app) return null;
      const skip = new Set(["_id", "id", "app_no", "created_by", "created_at"]);
      for (const [k, v] of Object.entries(patch)) {
        if (!skip.has(k)) (app as any)[k] = v;
      }
      if (typeof patch.version === "number") app.set("version", patch.version);
      await app.save();
      return flattenMongo(app);
    }
    if (patch.containers) patch.containers = ensureSubIds(patch.containers);
    if (patch.items) patch.items = ensureSubIds(patch.items);
    if (patch.packing_lines) patch.packing_lines = ensureSubIds(patch.packing_lines);
    return serializeRow(jsonDb.updateById("applications", id, patch));
  },
  async updateStage(id: string, stageId: string, patch: any) {
    if (dbMode === "mongo") {
      const app = await Application.findById(id);
      if (!app) return null;
      const stage = app.stages.id(stageId);
      if (!stage) return null;
      if (patch.status) stage.status = patch.status;
      if (patch.comment) stage.comment = patch.comment;
      if (patch.completed_by) (stage as any).completed_by = patch.completed_by;
      stage.acted_at = new Date();
      await app.save();
      return flattenMongo(app);
    }
    const app = jsonDb.findById("applications", id);
    if (!app) return null;
    const stages = (app.stages ?? []).map((s: any) =>
      s.id === stageId ? { ...s, ...patch, acted_at: new Date().toISOString() } : s,
    );
    return serializeRow(jsonDb.updateById("applications", id, { stages }));
  },
  async remove(id: string) {
    if (dbMode === "mongo") {
      return Application.findByIdAndUpdate(id, { deleted_at: new Date() }, { new: true });
    }
    return jsonDb.updateById("applications", id, { deleted_at: new Date().toISOString() });
  },
};

function matchesQuery(app: any, filter: Record<string, unknown>) {
  if (filter.status && app.status !== filter.status) return false;
  if (filter.created_by && app.created_by !== filter.created_by) return false;
  if (filter.assigned_to && app.assigned_to !== filter.assigned_to) return false;
  if (filter.$or) return true;
  return true;
}
