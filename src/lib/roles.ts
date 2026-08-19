import { resolvePermissions, type Permission } from "../constants/permissions.js";

export const ROLES = [
  "super_admin",
  "admin",
  "ceo",
  "manager",
  "documentation",
  "sales",
  "accounts",
  "warehouse",
  "production",
  "purchase",
  "quality",
  "viewer",
] as const;

export type AppRole = (typeof ROLES)[number];

export const ADMIN_ROLES: AppRole[] = ["super_admin", "admin"];
export const ANALYTICS_ROLES: AppRole[] = ["super_admin", "admin", "ceo", "manager"];
export const ALL_ACCESS_ROLES: AppRole[] = ["super_admin", "admin", "ceo"];

export function isAdminRole(role: string) {
  return ADMIN_ROLES.includes(role as AppRole);
}

export function isAnalyticsRole(role: string) {
  return ANALYTICS_ROLES.includes(role as AppRole);
}

export function seesAllCountries(role: string, countries: string[] = []) {
  return ALL_ACCESS_ROLES.includes(role as AppRole) || countries.includes("ALL");
}

export function userPermissions(role: string, overrides?: string[]) {
  return resolvePermissions(role, overrides);
}

export type { Permission };
