export function serialize<T>(doc: any): T {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject({ virtuals: true }) : { ...doc };
  o.id = String(o._id ?? o.id);
  delete o._id;
  delete o.__v;
  delete o.passwordHash;
  return o as T;
}

export function serializeMany<T extends Record<string, unknown>>(docs: any[]): T[] {
  return (docs ?? []).map((d) => serialize<T>(d));
}
