import { notificationsRepo } from "../repos/masters.js";
import { usersRepo } from "../repos/users.js";
import { hasPermission } from "../constants/permissions.js";

export async function notifyUser(userId: string, title: string, message: string, extra?: { type?: string; entityType?: string; entityId?: string }) {
  return notificationsRepo.create({
    user_id: userId,
    title,
    message,
    type: extra?.type || "info",
    entity_type: extra?.entityType,
    entity_id: extra?.entityId,
  });
}

export async function notifyAdmins(title: string, message: string, extra?: { type?: string; entityType?: string; entityId?: string }) {
  const users = await usersRepo.list();
  const targets = users.filter((u: any) => u && u.active !== false && hasPermission(u.role, u.permissions, "applications.approve"));
  await Promise.all(targets.map((u: any) => notifyUser(u.id, title, message, extra)));
}
