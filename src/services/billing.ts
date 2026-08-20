import { billingRepo } from "../repos/ops.js";
import { numbering } from "./numbering.js";

export async function upsertIssuedBilling(opts: {
  application: any;
  kind: string;
  documentId: string;
  userId?: string;
}) {
  const { application, kind, documentId, userId } = opts;
  if (!["proforma", "invoice", "inr_invoice"].includes(kind)) return null;
  const applicationId = String(application.id || application._id || "");
  if (!applicationId) return null;
  const amount =
    kind === "inr_invoice"
      ? Number(application.inr_amount || 0)
      : Number(application.total_amount || application.fx_amount || 0);
  const patch: Record<string, unknown> = {
    application_id: applicationId,
    document_type: kind,
    document_id: documentId,
    amount,
    currency: kind === "inr_invoice" ? "INR" : application.invoice_currency || "USD",
    status: "ISSUED",
    customer: application.consignee_name || "",
    generated_at: new Date(),
  };
  const existing = await billingRepo.findOne({ application_id: applicationId, document_type: kind });
  if (existing?.id) return billingRepo.update(existing.id, patch);
  return billingRepo.create({
    ...patch,
    billing_no: await numbering.billing(),
    created_by: userId,
    version: 1,
  });
}
