import bcrypt from "bcryptjs";
import { dbMode } from "../config/db.js";
import { User } from "../models/User.js";
import { jsonDb, serializeRow } from "../db/json.js";
import { serialize } from "../lib/serialize.js";
import type { AppRole } from "../lib/roles.js";
import { resolvePermissions } from "../constants/permissions.js";

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  department?: string;
  countries: string[];
  permissions?: string[];
  active: boolean;
  lastLoginAt?: string;
  passwordHash?: string;
}

function fromMongo(user: any): StaffRecord {
  return serialize<StaffRecord>(user);
}

export const usersRepo = {
  async count() {
    return dbMode === "mongo" ? User.countDocuments() : jsonDb.count("users");
  },
  async findByEmail(email: string) {
    if (dbMode === "mongo") return User.findOne({ email });
    return jsonDb.findOne("users", { email });
  },
  async findById(id: string) {
    if (dbMode === "mongo") return User.findById(id);
    return jsonDb.findById("users", id);
  },
  async list() {
    if (dbMode === "mongo") {
      const users = await User.find().sort({ createdAt: -1 });
      return users.map(fromMongo);
    }
    return jsonDb.find("users").map((u) => serializeRow(u));
  },
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: AppRole;
    countries: string[];
    active: boolean;
    department?: string;
    permissions?: string[];
  }) {
    if (dbMode === "mongo") {
      const user = await User.create(data);
      return fromMongo(user);
    }
    return serializeRow(jsonDb.insert("users", data));
  },
  async save(user: any, patch: Partial<StaffRecord> & { passwordHash?: string; lastLoginAt?: Date | string }) {
    if (dbMode === "mongo") {
      Object.assign(user, patch);
      await user.save();
      return fromMongo(user);
    }
    return serializeRow(jsonDb.updateById("users", user.id || user._id, patch));
  },
  passwordOf(user: any) {
    return user.passwordHash as string;
  },
  public(user: any) {
    const raw = dbMode === "mongo" && user?.toObject ? fromMongo(user) : serializeRow(user);
    const u = raw || ({} as StaffRecord);
    const role = u.role as AppRole;
    const permissions = resolvePermissions(role, u.permissions);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role,
      department: u.department || "",
      countries: u.countries ?? [],
      permissions,
      permissionOverrides: u.permissions ?? [],
      active: u.active,
      roles: [role],
      full_name: u.name,
      lastLoginAt: u.lastLoginAt,
    };
  },
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
