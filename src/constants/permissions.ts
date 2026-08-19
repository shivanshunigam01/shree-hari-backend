export const PERMISSIONS = [
  "applications.view",
  "applications.create",
  "applications.edit",
  "applications.delete",
  "applications.submit",
  "applications.approve",
  "applications.reject",
  "applications.reopen",
  "applications.assign",
  "users.view",
  "users.create",
  "users.edit",
  "users.deactivate",
  "masters.view",
  "masters.create",
  "masters.edit",
  "masters.delete",
  "documents.view",
  "documents.upload",
  "documents.generate",
  "documents.delete",
  "billing.view",
  "billing.create",
  "billing.edit",
  "billing.approve",
  "reports.view",
  "dashboard.view",
  "audit_logs.view",
  "settings.manage",
  "fx.manage",
  "notifications.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

const VIEW_ONLY: Permission[] = [
  "applications.view",
  "masters.view",
  "documents.view",
  "notifications.view",
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  ceo: [
    "applications.view",
    "applications.approve",
    "applications.reject",
    "applications.assign",
    "users.view",
    "masters.view",
    "documents.view",
    "documents.generate",
    "billing.view",
    "reports.view",
    "dashboard.view",
    "audit_logs.view",
    "notifications.view",
  ],
  manager: [
    "applications.view",
    "applications.edit",
    "applications.submit",
    "applications.approve",
    "applications.reject",
    "applications.assign",
    "masters.view",
    "documents.view",
    "documents.generate",
    "reports.view",
    "dashboard.view",
    "notifications.view",
  ],
  documentation: [
    "applications.view",
    "applications.create",
    "applications.edit",
    "applications.submit",
    "masters.view",
    "masters.create",
    "masters.edit",
    "documents.view",
    "documents.upload",
    "documents.generate",
    "billing.view",
    "billing.create",
    "billing.edit",
    "fx.manage",
    "notifications.view",
  ],
  sales: [
    "applications.view",
    "applications.create",
    "applications.edit",
    "applications.submit",
    "masters.view",
    "masters.create",
    "documents.view",
    "documents.generate",
    "billing.view",
    "billing.create",
    "billing.edit",
    "fx.manage",
    "notifications.view",
  ],
  accounts: [
    "applications.view",
    "applications.create",
    "applications.edit",
    "applications.submit",
    "masters.view",
    "documents.view",
    "documents.generate",
    "billing.view",
    "billing.create",
    "billing.edit",
    "reports.view",
    "fx.manage",
    "notifications.view",
  ],
  warehouse: [
    "applications.view",
    "applications.edit",
    "masters.view",
    "documents.view",
    "documents.upload",
    "notifications.view",
  ],
  production: ["applications.view", "masters.view", "documents.view", "notifications.view"],
  purchase: ["applications.view", "masters.view", "masters.create", "documents.view", "notifications.view"],
  quality: ["applications.view", "masters.view", "documents.view", "notifications.view"],
  viewer: VIEW_ONLY,
};

export function permissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? VIEW_ONLY;
}

export function resolvePermissions(role: string, overrides?: string[] | null): Permission[] {
  if (role === "super_admin") return ALL;
  if (overrides && overrides.length) {
    return overrides.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
  }
  return permissionsForRole(role);
}

export function hasPermission(role: string, overrides: string[] | undefined, needed: Permission | Permission[]) {
  const have = new Set(resolvePermissions(role, overrides));
  const list = Array.isArray(needed) ? needed : [needed];
  return list.some((p) => have.has(p));
}
