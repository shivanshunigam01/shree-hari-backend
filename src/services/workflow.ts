import { applicationsRepo } from "../repos/applications.js";
import { approvalRepo } from "../repos/ops.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins, notifyUser } from "./notifications.js";
import { canTransition, normalizeStatus, type AppStatus } from "../constants/status.js";
import { hasPermission } from "../constants/permissions.js";
import { HttpError } from "../lib/http.js";
import type { AuthUser } from "../middleware/auth.js";

function requireApp(app: any) {
  if (!app) throw new HttpError(404, "Application not found", "NOT_FOUND");
  return app;
}

async function transition(opts: {
  id: string;
  to: AppStatus;
  user: AuthUser;
  comment?: string;
  action: string;
  ip?: string;
  extra?: Record<string, unknown>;
}) {
  const app = requireApp(await applicationsRepo.findById(opts.id));
  const from = normalizeStatus(app.status);
  if (!canTransition(from, opts.to)) {
    throw new HttpError(409, `Cannot change status from ${from} to ${opts.to}`, "CONFLICT");
  }
  const patch: Record<string, unknown> = { status: opts.to, ...opts.extra };
  if (opts.to === "APPROVED") patch.current_stage = "pi";
  if (opts.to === "IN_PROGRESS") {
    if (app.payment_received && app.inr_invoice_no) patch.current_stage = "packing_stuffing";
    else if (app.invoice_no) patch.current_stage = "commercial_invoice";
    else patch.current_stage = "pi";
  }
  if (opts.to === "READY_FOR_DISPATCH") patch.current_stage = "vgm_annexure";
  if (opts.to === "DISPATCHED") patch.current_stage = "dispatch";
  if (opts.to === "COMPLETED") patch.current_stage = "completed";
  const updated = await applicationsRepo.update(opts.id, patch);
  await approvalRepo.create({
    application_id: opts.id,
    action: opts.action,
    previous_status: from,
    new_status: opts.to,
    performed_by: opts.user.id,
    performed_by_name: opts.user.name,
    comment: opts.comment || "",
  });
  await writeAudit({
    user: opts.user,
    action: opts.action,
    entityType: "application",
    entityId: opts.id,
    description: `Application ${app.app_no}: ${from} → ${opts.to}`,
    ip: opts.ip,
    metadata: { comment: opts.comment },
  });
  return updated;
}

export const workflow = {
  async submit(id: string, user: AuthUser, ip?: string) {
    const app = requireApp(await applicationsRepo.findById(id));
    const from = normalizeStatus(app.status);
    if (from !== "DRAFT" && from !== "CHANGES_REQUIRED") {
      throw new HttpError(409, "Only draft or changes-required applications can be submitted", "CONFLICT");
    }
    if (from === "CHANGES_REQUIRED") {
      const updated = await transition({ id, to: "SUBMITTED", user, action: "APPLICATION_SUBMITTED", ip });
      await applicationsRepo.update(id, { status: "UNDER_REVIEW", current_stage: "customer" });
      await notifyAdmins(
        "Application resubmitted",
        `Application ${app.app_no} was resubmitted and is waiting for approval.`,
        { type: "approval", entityType: "application", entityId: id },
      );
      return applicationsRepo.findById(id);
    }
    await transition({ id, to: "SUBMITTED", user, action: "APPLICATION_SUBMITTED", ip });
    const updated = await applicationsRepo.update(id, { status: "UNDER_REVIEW", current_stage: "customer" });
    await notifyAdmins(
      "New application waiting for approval",
      `Application ${app.app_no} is waiting for approval.`,
      { type: "approval", entityType: "application", entityId: id },
    );
    return updated;
  },
  async approve(id: string, user: AuthUser, comment: string, ip?: string) {
    if (!hasPermission(user.role, user.permissions, "applications.approve")) {
      throw new HttpError(403, "You do not have permission to approve this application", "FORBIDDEN");
    }
    const app = requireApp(await applicationsRepo.findById(id));
    if (app.created_by === user.id && user.role !== "super_admin") {
      throw new HttpError(403, "Staff cannot approve their own application", "FORBIDDEN");
    }
    const updated = await transition({
      id,
      to: "APPROVED",
      user,
      comment,
      action: "APPLICATION_APPROVED",
      ip,
    });
    if (app.created_by) {
      await notifyUser(
        app.created_by,
        "Application approved",
        `Application ${app.app_no} has been approved.`,
        { type: "success", entityType: "application", entityId: id },
      );
    }
    return updated;
  },
  async reject(id: string, user: AuthUser, comment: string, ip?: string) {
    if (!hasPermission(user.role, user.permissions, "applications.reject")) {
      throw new HttpError(403, "You do not have permission to reject this application", "FORBIDDEN");
    }
    if (!comment?.trim()) throw new HttpError(400, "A reason is required", "VALIDATION_ERROR", { comment: "Required" });
    const app = requireApp(await applicationsRepo.findById(id));
    const updated = await transition({ id, to: "REJECTED", user, comment, action: "APPLICATION_REJECTED", ip });
    if (app.created_by) {
      await notifyUser(app.created_by, "Application rejected", `Application ${app.app_no} was rejected. ${comment}`, {
        type: "danger",
        entityType: "application",
        entityId: id,
      });
    }
    return updated;
  },
  async requestChanges(id: string, user: AuthUser, comment: string, ip?: string) {
    if (!hasPermission(user.role, user.permissions, "applications.reject")) {
      throw new HttpError(403, "You do not have permission to request changes", "FORBIDDEN");
    }
    if (!comment?.trim()) throw new HttpError(400, "A reason is required", "VALIDATION_ERROR", { comment: "Required" });
    const app = requireApp(await applicationsRepo.findById(id));
    const updated = await transition({
      id,
      to: "CHANGES_REQUIRED",
      user,
      comment,
      action: "APPLICATION_CHANGES_REQUESTED",
      ip,
    });
    if (app.created_by) {
      await notifyUser(app.created_by, "Changes requested", `Changes requested for ${app.app_no}. ${comment}`, {
        type: "warning",
        entityType: "application",
        entityId: id,
      });
    }
    return updated;
  },
  async resubmit(id: string, user: AuthUser, ip?: string) {
    return this.submit(id, user, ip);
  },
  async advance(id: string, user: AuthUser, to: AppStatus, ip?: string) {
    return transition({ id, to, user, action: `APPLICATION_${to}`, ip });
  },
};
