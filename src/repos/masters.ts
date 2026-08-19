import { dbMode } from "../config/db.js";
import { MASTER_MODELS, MASTER_TABLES, Notification } from "../models/masters.js";
import { jsonDb, serializeRow } from "../db/json.js";
import { serialize, serializeMany } from "../lib/serialize.js";

export const mastersRepo = {
  async list(table: string) {
    if (dbMode === "mongo") {
      const Model = MASTER_MODELS[table];
      if (!Model) return null;
      return serializeMany(await Model.find({ active: { $ne: false } }).sort({ created_at: -1 }));
    }
    return jsonDb.find(table).filter((r) => r.active !== false).map(serializeRow);
  },
  async create(table: string, body: any) {
    if (dbMode === "mongo") {
      const Model = MASTER_MODELS[table];
      if (!Model) return null;
      return serialize(await Model.create({ ...body, active: body.active !== false }));
    }
    return serializeRow(jsonDb.insert(table, { ...body, active: body.active !== false }));
  },
  async update(table: string, id: string, body: any) {
    if (dbMode === "mongo") {
      const Model = MASTER_MODELS[table];
      if (!Model) return null;
      const updated = await Model.findByIdAndUpdate(id, body, { new: true });
      return updated ? serialize(updated) : false;
    }
    const updated = jsonDb.updateById(table, id, body);
    return updated ? serializeRow(updated) : false;
  },
  async remove(table: string, id: string) {
    if (dbMode === "mongo") {
      const Model = MASTER_MODELS[table];
      if (!Model) return null;
      const updated = await Model.findByIdAndUpdate(id, { active: false }, { new: true });
      return Boolean(updated);
    }
    return Boolean(jsonDb.updateById(table, id, { active: false }));
  },
  normalizeTable(table: string) {
    return String(table || "").replace(/-/g, "_");
  },
  known(table: string) {
    return MASTER_TABLES.includes(this.normalizeTable(table));
  },
};

export const notificationsRepo = {
  async list(userId: string) {
    if (dbMode === "mongo") {
      const rows = await Notification.find({ user_id: userId }).sort({ created_at: -1 }).limit(50);
      return serializeMany(rows);
    }
    return jsonDb
      .find("notifications")
      .filter((n) => n.user_id === userId)
      .slice(0, 50)
      .map(serializeRow);
  },
  async countUnread(userId: string) {
    const rows = await this.list(userId);
    return rows.filter((n: any) => !n.read && !n.isRead).length;
  },
  async create(doc: {
    user_id: string;
    title: string;
    message: string;
    type?: string;
    entity_type?: string;
    entity_id?: string;
  }) {
    const payload = {
      ...doc,
      body: doc.message,
      read: false,
      isRead: false,
    };
    if (dbMode === "mongo") return serialize(await Notification.create(payload));
    return serializeRow(jsonDb.insert("notifications", payload));
  },
  async markRead(id: string, userId: string) {
    if (dbMode === "mongo") {
      const row = await Notification.findOneAndUpdate(
        { _id: id, user_id: userId },
        { read: true, isRead: true },
        { new: true },
      );
      return row ? serialize(row) : null;
    }
    const row = jsonDb.findById("notifications", id);
    if (!row || row.user_id !== userId) return null;
    return serializeRow(jsonDb.updateById("notifications", id, { read: true, isRead: true }));
  },
  async markAllRead(userId: string) {
    if (dbMode === "mongo") {
      await Notification.updateMany({ user_id: userId }, { read: true, isRead: true });
      return true;
    }
    for (const n of jsonDb.find("notifications").filter((x) => x.user_id === userId)) {
      jsonDb.updateById("notifications", n.id, { read: true, isRead: true });
    }
    return true;
  },
  async count() {
    return dbMode === "mongo" ? Notification.countDocuments() : jsonDb.count("notifications");
  },
};
