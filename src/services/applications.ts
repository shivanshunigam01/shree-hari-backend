import { applicationsRepo } from "../repos/applications.js";
import { numbering } from "./numbering.js";
import { writeAudit } from "./audit.js";
import { COMPANY_DEFAULTS } from "../constants/company.js";
import { fxRepo, settingsRepo } from "../repos/ops.js";
import { HttpError } from "../lib/http.js";
import { normalizeStatus } from "../constants/status.js";
import type { AuthUser } from "../middleware/auth.js";
import { seesAllCountries } from "../lib/roles.js";
import { computeTotals, countryMatches, destIsNepalBhutan, isIndiaPort, resolveDocumentYear } from "../lib/export-rules.js";
import { mastersRepo } from "../repos/masters.js";

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

async function applyPorts(body: any) {
  const ports = (await mastersRepo.list("ports")) ?? [];
  const loading = ports.find((p: any) => p.name === body.port_loading_text);
  const discharge = ports.find((p: any) => p.name === body.port_discharge_text);
  if (body.port_loading_text && loading && !isIndiaPort(loading.country)) {
    throw new HttpError(422, "Port of loading must be in India", "VALIDATION_ERROR", { port_loading_text: "Must be an India port" });
  }
  if (body.port_discharge_text && discharge && body.final_destination_text && !countryMatches(discharge.country, body.final_destination_text)) {
    throw new HttpError(422, "Port of discharge must match the destination country", "VALIDATION_ERROR", {
      port_discharge_text: "Country does not match destination",
    });
  }
  return {
    port_loading_address: loading?.address || body.port_loading_address || "",
    port_discharge_address: discharge?.address || body.port_discharge_address || "",
  };
}

function syncDoe(body: any) {
  const vgm_date = body.vgm_date || body.examination_date || "";
  return { vgm_date, examination_date: vgm_date };
}

export const applicationService = {
  countryFilter,

  async create(user: AuthUser, body: any, ip?: string) {
    const company = await settingsRepo.get();
    const fx = await fxRepo.latest();
    const app_no = await numbering.application();
    const year = await resolveDocumentYear();
    const portPatch = await applyPorts(body);
    const doe = syncDoe(body);
    const created = await applicationsRepo.create({
      ...body,
      ...computeTotals({ ...body, exchange_rate: body.exchange_rate ?? fx?.usd_inr }),
      ...snapshots(body),
      ...portPatch,
      ...doe,
      app_no,
      financial_year: year,
      exchange_rate: body.exchange_rate ?? fx?.usd_inr ?? null,
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
      igst_bond_text: destIsNepalBhutan(body.final_destination_text) ? "" : body.igst_bond_text || COMPANY_DEFAULTS.igstBondText,
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
    const portPatch = await applyPorts({ ...existing, ...body });
    const doe = syncDoe({ ...existing, ...body });
    if (destIsNepalBhutan(body.final_destination_text || existing.final_destination_text)) {
      const bills = body.gst_bills ?? existing.gst_bills ?? [];
      const missing = bills.filter((b: any) => (b.bill_no || b.company_name) && !String(b.gst_no || "").trim());
      if (missing.length) {
        throw new HttpError(422, "GST number is required on purchase bills for Nepal/Bhutan", "VALIDATION_ERROR");
      }
    }
    const patch = {
      ...body,
      ...computeTotals({ ...existing, ...body }),
      ...snapshots(body),
      ...portPatch,
      ...doe,
      financial_year: existing.financial_year,
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
