export const APP_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "APPROVED",
  "IN_PROGRESS",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

export const TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CHANGES_REQUIRED"],
  CHANGES_REQUIRED: ["SUBMITTED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY_FOR_DISPATCH", "CHANGES_REQUIRED"],
  READY_FOR_DISPATCH: ["DISPATCHED"],
  DISPATCHED: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: ["CHANGES_REQUIRED"],
  CANCELLED: [],
};

export function canTransition(from: string, to: AppStatus) {
  const current = normalizeStatus(from);
  return TRANSITIONS[current]?.includes(to) ?? false;
}

export function normalizeStatus(status?: string | null): AppStatus {
  const s = String(status || "DRAFT").toUpperCase();
  if ((APP_STATUSES as readonly string[]).includes(s)) return s as AppStatus;
  const map: Record<string, AppStatus> = {
    IN_PROGRESS: "IN_PROGRESS",
    PENDING_APPROVAL: "UNDER_REVIEW",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    SHIPPED: "DISPATCHED",
    CLOSED: "COMPLETED",
    DRAFT: "DRAFT",
  };
  return map[s] ?? "DRAFT";
}
