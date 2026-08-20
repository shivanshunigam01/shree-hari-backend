import mongoose, { Schema } from "mongoose";

const auditSchema = new Schema(
  {
    user_id: String,
    user_name: String,
    action: { type: String, required: true },
    entity_type: String,
    entity_id: String,
    description: String,
    ip: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

auditSchema.index({ created_at: -1 });
auditSchema.index({ action: 1 });
auditSchema.index({ entity_type: 1, entity_id: 1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);

const historySchema = new Schema(
  {
    application_id: { type: String, required: true },
    action: String,
    previous_status: String,
    new_status: String,
    performed_by: String,
    performed_by_name: String,
    comment: String,
  },
  { timestamps: { createdAt: "performed_at", updatedAt: false } },
);

historySchema.index({ application_id: 1, performed_at: -1 });

export const ApprovalHistory =
  mongoose.models.ApprovalHistory || mongoose.model("ApprovalHistory", historySchema);

const documentSchema = new Schema(
  {
    application_id: String,
    document_type: String,
    file_name: String,
    file_url: String,
    mime_type: String,
    file_size: Number,
    uploaded_by: String,
    uploaded_by_name: String,
    version: { type: Number, default: 1 },
    status: { type: String, default: "uploaded" },
    storage: String,
    public_id: String,
  },
  { timestamps: { createdAt: "uploaded_at", updatedAt: "updated_at" } },
);

documentSchema.index({ application_id: 1, document_type: 1 });

export const AppDocument = mongoose.models.AppDocument || mongoose.model("AppDocument", documentSchema);

const counterSchema = new Schema({
  key: { type: String, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

const settingsSchema = new Schema(
  {
    key: { type: String, unique: true, default: "company" },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const CompanySettings =
  mongoose.models.CompanySettings || mongoose.model("CompanySettings", settingsSchema);

const billingSchema = new Schema(
  {
    billing_no: String,
    application_id: String,
    customer: String,
    amount: Number,
    currency: String,
    tax: Number,
    status: { type: String, default: "DRAFT" },
    document_type: { type: String, default: "proforma" },
    document_id: String,
    created_by: String,
    approved_by: String,
    generated_at: Date,
    approved_at: Date,
    version: { type: Number, default: 1 },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

export const BillingRecord = mongoose.models.BillingRecord || mongoose.model("BillingRecord", billingSchema);

const fxSchema = new Schema(
  {
    week_start: { type: String, required: true },
    usd_inr: { type: Number, required: true },
    pairs: { type: Schema.Types.Mixed, default: {} },
    note: String,
    created_by: String,
    created_by_name: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
fxSchema.index({ week_start: -1 });

export const FxRate = mongoose.models.FxRate || mongoose.model("FxRate", fxSchema);
