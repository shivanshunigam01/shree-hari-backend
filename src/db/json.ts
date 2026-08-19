import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const file = path.join(dir, "db.json");

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

function empty(): DB {
  return {
    users: [],
    applications: [],
    customers: [],
    products: [],
    countries: [],
    ports: [],
    shipping_lines: [],
    banks: [],
    suppliers: [],
    notifications: [],
    audit_logs: [],
    approval_histories: [],
    documents: [],
    counters: [],
    settings: [],
    billing: [],
    fx_rates: [],
  };
}

let cache: DB = empty();
let ready = false;

function persist() {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
}

export function loadJsonDb() {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    try {
      cache = { ...empty(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch {
      cache = empty();
    }
  } else {
    cache = empty();
    persist();
  }
  ready = true;
}

function coll(name: string): Row[] {
  if (!ready) loadJsonDb();
  if (!cache[name]) cache[name] = [];
  return cache[name];
}

function matches(row: Row, query: Row) {
  return Object.entries(query).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "$in" in v) {
      return (v.$in as any[]).includes(row[k]);
    }
    return row[k] === v;
  });
}

export const jsonDb = {
  find(name: string, query: Row = {}) {
    return coll(name).filter((r) => matches(r, query));
  },
  findOne(name: string, query: Row) {
    return coll(name).find((r) => matches(r, query)) ?? null;
  },
  findById(name: string, id: string) {
    return coll(name).find((r) => r.id === id) ?? null;
  },
  insert(name: string, doc: Row) {
    const now = new Date().toISOString();
    const row = {
      id: doc.id || randomUUID(),
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
      ...doc,
    };
    if (!row.id) row.id = randomUUID();
    coll(name).unshift(row);
    persist();
    return row;
  },
  insertMany(name: string, docs: Row[]) {
    return docs.map((d) => this.insert(name, d));
  },
  updateById(name: string, id: string, patch: Row) {
    const list = coll(name);
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const skip = new Set(["id", "_id", "created_at", "createdAt"]);
    const next = { ...list[i] };
    for (const [k, v] of Object.entries(patch)) {
      if (!skip.has(k)) next[k] = v;
    }
    next.updated_at = new Date().toISOString();
    next.updatedAt = next.updated_at;
    list[i] = next;
    persist();
    return next;
  },
  deleteById(name: string, id: string) {
    const list = coll(name);
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const [removed] = list.splice(i, 1);
    persist();
    return removed;
  },
  count(name: string) {
    return coll(name).length;
  },
};

export function serializeRow(row: Row | null): any {
  if (!row) return row;
  const o = { ...row };
  delete o.passwordHash;
  delete o._id;
  delete o.__v;
  return o;
}
