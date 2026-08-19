import { applicationsRepo } from "../repos/applications.js";
import { numbering } from "./numbering.js";
import { writeAudit } from "./audit.js";
import { COMPANY_DEFAULTS } from "../constants/company.js";
import { settingsRepo } from "../repos/ops.js";
import { HttpError } from "../lib/http.js";
import { normalizeStatus } from "../constants/status.js";
import type { AuthUser } from "../middleware/auth.js";
import { seesAllCountries } from "../lib/roles.js";

export function countryFilter(user: AuthUser) {
  if (seesAllCountries(user.role, user.countries)) return {};
  if (!user.countries.length) {
    return { final_destination_text: { $in: ["__none__"] } };
  }
  return {
    $or: [
      { final_destination_text: { $in: user.countries } },
      { country_id: { $in: user.countries } },
    ],
  };
}

function totals(body: any) {
  const items = body.items ?? [];
  const total_amount =
    items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0) + (Number(body.loading_charge) || 0);
  const total_packages = items.reduce((s: number, it: any) => s + (Number(it.packages) || 0), 0);
  const total_net_weight = items.reduce((s: number, it: any) => s + (Number(it.net_weight) || 0), 0);
  const total_gross_weight = items.reduce((s: number, it: any) => s + (Number(it.gross_weight) || 0), 0);
  return { total_amount, total_packages, total_net_weight, total_gross_weight };
}

function snapshots(body: any) {
  const customer_snapshot = body.customer_snapshot || {
    id: body.customer_id,
    company_name: body.consignee_name,
    address: body.consignee_address,
    phone: body.consignee_phone,
    email: body.consignee_email,
    tax_id: body.consignee_tax_id,
    country: body.final_destination_text,
  };
  const supplier_snapshot = body.supplier_snapshot || {
    id: body.supplier_id,
    company_name: body.supplier_name,
    address: body.supplier_address,
    gst_no: body.supplier_gst,
    factory_address: body.factory_address,
  };
  const bank_snapshot = body.bank_snapshot || {
    bank_name: body.bank_name,
    account_no: body.bank_account,
    swift_code: body.bank_swift,
    ifsc_code: body.bank_ifsc,
    branch: body.bank_branch,
  };
  const meta = {
    ...(body.meta || {}),
    bank_name: body.bank_name,
    bank_account: body.bank_account,
    bank_swift: body.bank_swift,
    bank_ifsc: body.bank_ifsc,
  };
  return { customer_snapshot, supplier_snapshot, bank_snapshot, meta };
}

export const applicationService = {
  countryFilter,

  async create(user: AuthUser, body: any, ip?: string) {
    const company = await settingsRepo.get();
    const app_no = await numbering.application();
    const invoice_no = body.invoice_no?.trim() ? body.invoice_no : await numbering.invoice();
    const year = new Date().getFullYear();
    const created = await applicationsRepo.create({
      ...body,
      ...totals(body),
      ...snapshots(body),
      app_no,
      invoice_no,
      financial_year: `${year}-${year + 1}`,
      status: "DRAFT",
      current_stage: "created",
      created_by: user.id,
      created_by_name: user.name,
      exporter_name: body.exporter_name || company.companyName || COMPANY_DEFAULTS.companyName,
      exporter_address: body.exporter_address || company.exporterAddress || COMPANY_DEFAULTS.exporterAddress,
      iec_no: body.iec_no || company.iec || COMPANY_DEFAULTS.iec,
      gst_no: body.gst_no || company.gstin || COMPANY_DEFAULTS.gstin,
      bin_no: body.bin_no || company.bin || COMPANY_DEFAULTS.bin,
      aeo_no: body.aeo_no || company.aeo || COMPANY_DEFAULTS.aeo,
      lut_no: body.lut_no || company.lutNo || COMPANY_DEFAULTS.lutNo,
      state_of_origin: body.state_of_origin || COMPANY_DEFAULTS.stateOfOrigin,
      declaration: body.declaration || COMPANY_DEFAULTS.declaration,
      rodtep_text: body.rodtep_text || COMPANY_DEFAULTS.rodtepText,
      igst_bond_text: body.igst_bond_text || COMPANY_DEFAULTS.igstBondText,
    });
    await writeAudit({
      user,
      action: "APPLICATION_CREATED",
      entityType: "application",
      entityId: created.id,
      description: `Created application ${app_no}`,
      ip,
    });
    return created;
  },

  async update(id: string, user: AuthUser, body: any, filter: Record<string, unknown>) {
    const existing = await applicationsRepo.findById(id, filter);
    if (!existing) throw new HttpError(404, "Application not found", "NOT_FOUND");
    const status = normalizeStatus(existing.status);
    const locked = ["APPROVED", "DISPATCHED", "COMPLETED", "CANCELLED"].includes(status);
    if (locked && !["super_admin", "admin"].includes(user.role)) {
      throw new HttpError(409, "This application cannot be edited in its current status", "CONFLICT");
    }
    if (body.version != null && existing.version != null && Number(body.version) !== Number(existing.version)) {
      throw new HttpError(409, "This application was updated by someone else. Reload and try again.", "CONFLICT");
    }
    const patch = {
      ...body,
      ...totals(body),
      ...snapshots(body),
      version: Number(existing.version || 1) + 1,
      app_no: existing.app_no,
    };
    delete (patch as any).status;
    const updated = await applicationsRepo.update(id, patch);
    await writeAudit({
      user,
      action: "APPLICATION_UPDATED",
      entityType: "application",
      entityId: id,
      description: `Updated application ${existing.app_no}`,
    });
    return updated;
  },

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const filter: Record<string, unknown> = { ...countryFilter(user) };
    if (query.status) filter.status = query.status;
    if (query.created_by) filter.created_by = query.created_by;
    if (query.assigned_to) filter.assigned_to = query.assigned_to;
    if (query.mine === "1") filter.created_by = user.id;
    if (query.pending === "1") filter.status = "UNDER_REVIEW";
    if (query.drafts === "1") filter.status = "DRAFT";

    const { items, total } = await applicationsRepo.list(filter, { skip: (page - 1) * limit, limit });
    const search = (query.search || query.q || "").toLowerCase().trim();
    const country = (query.country || "").toLowerCase().trim();
    let rows = items;
    if (search) {
      rows = rows.filter((a: any) =>
        [a.app_no, a.invoice_no, a.consignee_name, a.final_destination_text, a.created_by_name]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }
    if (country) {
      rows = rows.filter((a: any) =>
        String(a.final_destination_text || a.country_id || "").toLowerCase().includes(country),
      );
    }
    return { items: rows, page, limit, total: search || country ? rows.length : total };
  },
};
