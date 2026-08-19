import { auditRepo } from "../repos/ops.js";
import type { AuthUser } from "../middleware/auth.js";

export async function writeAudit(opts: {
  user?: AuthUser | null;
  action: string;
  entityType?: string;
  entityId?: string;
  description: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}) {
  await auditRepo.create({
    user_id: opts.user?.id,
    user_name: opts.user?.name,
    action: opts.action,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    description: opts.description,
    ip: opts.ip,
    metadata: opts.metadata ?? {},
  });
}
