import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { COMPANY_DEFAULTS } from "../constants/company.js";
import { DEFAULT_STAGES } from "../models/Application.js";
import { applicationsRepo } from "../repos/applications.js";
import { documentsRepo, fxRepo, settingsRepo } from "../repos/ops.js";
import { mastersRepo } from "../repos/masters.js";
import { usersRepo } from "../repos/users.js";
import { numbering } from "../services/numbering.js";
import { generateExportPdf, type PdfKind } from "../services/pdf/index.js";
import { storage, uploadRoot } from "../services/storage.js";
import { computeTotals } from "../lib/export-rules.js";
import type { AuthUser } from "../middleware/auth.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAIAAAC+UiWgAAAAIklEQVR4nO3NMQEAAAgDINc/9K3h4QMFDbpqJEmSJEmSJEmS9G8PFjYAAQABF9sAAAAASUVORK5CYII=",
  "base64",
);

function actorFrom(user: any): AuthUser {
  const p = usersRepo.public(user);
  return {
    id: String(p.id),
    name: p.name,
    email: p.email,
    role: p.role,
    countries: p.countries,
    permissions: p.permissions as string[],
    department: p.department,
  };
}

function stagesThrough(current: string) {
  const idx = DEFAULT_STAGES.findIndex((s) => s.stage_key === current);
  return DEFAULT_STAGES.map((s, i) => ({
    ...s,
    status: i < idx ? "completed" : i === idx ? "in_progress" : "pending",
    acted_at: i <= idx ? new Date().toISOString() : undefined,
    comment:
      i === idx
        ? "Training sample — follow the generate buttons on this application in order."
        : undefined,
  }));
}

async function ensureNamed(table: string, name: string, data: Record<string, unknown>) {
  const list = ((await mastersRepo.list(table)) ?? []) as any[];
  const hit = list.find((r) => String(r.name || r.bank_name) === name);
  if (hit) return hit;
  return mastersRepo.create(table, { ...data, is_demo: true });
}

async function demoImageUrl() {
  const dir = path.join(uploadRoot, "demo");
  await fs.mkdir(dir, { recursive: true });
  const abs = path.join(dir, "sanitary-ware.png");
  await fs.writeFile(abs, TINY_PNG);
  return "/uploads/demo/sanitary-ware.png";
}

async function attachPdf(app: any, kind: PdfKind, user: AuthUser, extra?: { containerIndex?: number; type?: string }) {
  const pdf = await generateExportPdf(app, kind, extra);
  const suffix = extra?.type || (extra?.containerIndex != null ? `vgm-${extra.containerIndex + 1}` : kind);
  const stored = await storage.save(pdf, {
    folder: "generated",
    originalName: `${app.invoice_no || app.proforma_no || app.app_no}-${suffix}.pdf`,
    mimeType: "application/pdf",
  });
  await documentsRepo.create({
    application_id: app.id,
    document_type: suffix,
    file_name: stored.fileName,
    file_url: stored.url,
    mime_type: "application/pdf",
    file_size: stored.fileSize,
    uploaded_by: user.id,
    uploaded_by_name: user.name,
    version: 1,
    status: "generated",
    storage: stored.storage,
    public_id: stored.publicId,
  });
}

async function alreadySeeded() {
  const { items } = await applicationsRepo.list({}, { limit: 200 });
  return (items as any[]).some((a) => a?.meta?.demo_pack);
}

export async function seedDemoPack() {
  await settingsRepo.save({ ...(await settingsRepo.get()), documentYear: "2025-26" });

  const rates = await fxRepo.list();
  if (!(rates as any[])?.length) {
    await fxRepo.create({
      week_start: "2026-02-02",
      usd_inr: 86.25,
      pairs: { USD_INR: 86.25 },
      note: "Training week rate (Kalinchowk pack style)",
      created_by: "seed",
      created_by_name: "System",
      active: true,
    });
  }

  const staff = await usersRepo.findByEmail("employee@srihari.co");
  if (staff) {
    await usersRepo.save(staff, { countries: ["ALL"] });
  }

  const img = await demoImageUrl();
  const kalinchowk = await ensureNamed("customers", "KALINCHOWK TRADING PVT. LTD.", {
    name: "KALINCHOWK TRADING PVT. LTD.",
    contact_person: "Import Desk",
    phone: "+977-51-522000",
    city: "Birgunj",
    country: "Nepal",
    address: "BIRGUNJ ICD, PARSA, NEPAL",
    tax_id: "NP-KAL-118",
  });
  const thimphu = await ensureNamed("customers", "THIMPHU SANITARY IMPORTS", {
    name: "THIMPHU SANITARY IMPORTS",
    contact_person: "Tshering Dorji",
    phone: "+975-2-323000",
    city: "Thimphu",
    country: "Bhutan",
    address: "CHANGZAMTOK, THIMPHU, BHUTAN",
    tax_id: "BT-TSI-09",
  });
  await ensureNamed("products", "GOLDEN DRAGON FULL SEAT", {
    name: "GOLDEN DRAGON FULL SEAT",
    hsn_code: "69109000",
    unit: "SET",
    default_rate: 42,
    brand_name: "OSIS",
    dimensions: "(H:790 MM, L:660 MM, W:350 MM) ONE PCS",
    image_url: img,
  });
  await ensureNamed("suppliers", "DUCK SANITARYWARE LLP", {
    name: "DUCK SANITARYWARE LLP",
    gst_no: "24AAVFD3915G1ZC",
    factory_address: "SURVEY NO. 5 P2, 3, OPP. UNCHI MANDAL, TALAVIYA SHANALA ROAD, HALVAD ROAD, MORBI, GUJARAT-363642",
    address: "MORBI, GUJARAT-363642",
    country: "India",
  });

  if (await alreadySeeded()) {
    console.log("Demo pack applications already exist — skipping.");
    return;
  }

  const adminRow = await usersRepo.findByEmail(env.adminEmail);
  const staffRow = (await usersRepo.findByEmail("employee@srihari.co")) || adminRow;
  if (!adminRow) throw new Error("Seed admin first (npm run seed)");
  const admin = actorFrom(adminRow);
  const staffUser = actorFrom(staffRow);
  const company = { ...COMPANY_DEFAULTS, ...(await settingsRepo.get()) };
  const fx = await fxRepo.latest();
  const rate = Number((fx as any)?.usd_inr || 86.25);

  const shared = {
    exporter_name: company.companyName,
    exporter_address: company.exporterAddress,
    iec_no: company.iec,
    gst_no: company.gstin,
    bin_no: company.bin,
    aeo_no: company.aeo,
    lut_no: company.lutNo,
    state_of_origin: company.stateOfOrigin,
    invoice_currency: "USD",
    exchange_rate: rate,
    country_origin: "INDIA",
    payment_terms: "100% ADVANCE",
    export_terms: "FOB INDIA",
    hsn_codes: "69109000",
    products_desc: "CERAMIC SANITARY WARE",
    bank_name: "ICICI BANK",
    bank_account: "249805501181",
    bank_swift: "ICICINBBCTS",
    bank_ifsc: "ICIC0002498",
    bank_branch: "ISHAN CERAMIC ZONE, LALPUR, MORBI-363642",
    supplier_name: "DUCK SANITARYWARE LLP",
    supplier_gst: "24AAVFD3915G1ZC",
    supplier_address: "MORBI, GUJARAT-363642",
    factory_address: "SURVEY NO. 5 P2, 3, HALVAD ROAD, MORBI, GUJARAT-363642",
    igst_bond_text: "",
    created_by: staffUser.id,
    created_by_name: staffUser.name,
    meta: { demo_pack: true },
  };

  const nepalItems = [
    {
      description: "GOLDEN DRAGON FULL SEAT",
      brand_name: "OSIS",
      dimensions: "(H:790 MM, L:660 MM, W:350 MM) ONE PCS",
      hsn_code: "69109000",
      quantity: 200,
      unit: "SET",
      rate: 42,
      amount: 8400,
      packages: 200,
      net_weight: 4200,
      gross_weight: 4600,
      image_url: img,
    },
    {
      description: "EASTERN PAN",
      brand_name: "OSIS",
      hsn_code: "69101000",
      quantity: 500,
      unit: "PCS",
      rate: 3.2,
      amount: 1600,
      packages: 25,
      net_weight: 2500,
      gross_weight: 2750,
      image_url: img,
    },
  ];

  // 1) PI issued — staff next step: Commercial invoice
  const piYear = await numbering.proforma();
  const piBody = {
    ...shared,
    customer_id: kalinchowk.id,
    consignee_name: kalinchowk.name,
    consignee_address: kalinchowk.address,
    consignee_phone: kalinchowk.phone,
    consignee_tax_id: kalinchowk.tax_id,
    notify_name: "KALINCHOWK TRADING PVT. LTD.",
    notify_phone: kalinchowk.phone,
    notify_address: kalinchowk.address,
    notify_party: "SAME AS CONSIGNEE",
    other_consignees: [{ name: "TO ORDER / BANK OF KATHMANDU", address: "KATHMANDU, NEPAL", phone: "" }],
    final_destination_text: "Nepal",
    country_id: "Nepal",
    port_loading_text: "RAXAUL",
    port_loading_address: "Raxaul LCS, Bihar, India",
    port_discharge_text: "BIRGUNJ",
    port_discharge_address: "Birgunj ICD, Nepal",
    transit_note: "TRANSIT INDIA TO NEPAL VIA RAXAUL LCS → BIRGUNJ ICD",
    price_increase: 0,
    freight: 0,
    loading_charge: 50,
    proforma_no: piYear,
    proforma_date: "2026-01-15",
    items: nepalItems,
    containers: [],
    gst_bills: [],
    status: "APPROVED",
    current_stage: "pi",
    stages: stagesThrough("pi"),
    meta: { demo_pack: true, training: "Step 1 of 3 — PI is ready. Next: generate Commercial invoice (USD)." },
  };
  const piApp = await applicationsRepo.create({
    ...piBody,
    ...computeTotals(piBody),
    app_no: await numbering.application(),
    financial_year: "2025-26",
  });
  await attachPdf(piApp, "proforma", admin);

  // 2) Bhutan commercial invoice — waiting for payment
  const expNo = await numbering.invoice();
  const pi2 = await numbering.proforma();
  const bhutanItems = [
    {
      description: "AQUA PEDESTAL WASH BASIN SET",
      brand_name: "OSIS",
      hsn_code: "69109000",
      quantity: 80,
      unit: "SET",
      rate: 18,
      amount: 1440,
      packages: 80,
      net_weight: 1600,
      gross_weight: 1840,
      image_url: img,
    },
  ];
  const fxBody = {
    ...shared,
    customer_id: thimphu.id,
    consignee_name: thimphu.name,
    consignee_address: thimphu.address,
    consignee_phone: thimphu.phone,
    consignee_tax_id: thimphu.tax_id,
    notify_name: thimphu.name,
    notify_address: thimphu.address,
    notify_party: "SAME AS CONSIGNEE",
    final_destination_text: "Bhutan",
    country_id: "Bhutan",
    port_loading_text: "KANDLA",
    port_loading_address: "Kandla Port, Kutch, Gujarat, India",
    port_discharge_text: "BIRGUNJ",
    port_discharge_address: "Birgunj ICD, Nepal (transit to Bhutan)",
    transit_note: "NEPAL TRANSIT FOR BHUTAN DESTINATION",
    freight: 120,
    price_increase: 40,
    loading_charge: 30,
    proforma_no: pi2,
    proforma_date: "2026-01-20",
    invoice_no: expNo,
    invoice_date: "2026-01-28",
    items: bhutanItems,
    containers: [
      {
        container_no: "TCLU 8877665",
        line_seal_no: "INSL44521",
        electronic_seal_no: "E-BT-9021",
        line_seal_photo_url: img,
        electronic_seal_photo_url: img,
        size: "20 FT",
        quantity: "1x20 FT",
        tare_weight: 2200,
        gross_weight: 1840,
      },
    ],
    gst_bills: [
      { bill_no: "DS/24-25/881", bill_date: "2026-01-18", company_name: "DUCK SANITARYWARE LLP", gst_no: "24AAVFD3915G1ZC" },
    ],
    status: "IN_PROGRESS",
    current_stage: "commercial_invoice",
    payment_received: false,
    stages: stagesThrough("commercial_invoice"),
    meta: { demo_pack: true, training: "Step 2 of 3 — Commercial invoice issued. Next: Payment received, then INR invoice." },
  };
  const fxApp = await applicationsRepo.create({
    ...fxBody,
    ...computeTotals(fxBody),
    app_no: await numbering.application(),
    financial_year: "2025-26",
  });
  await attachPdf(fxApp, "proforma", admin);
  await attachPdf(fxApp, "invoice", admin);

  // 3) Full Kalinchowk pack — like EXP 118 (payment + INR + packing + two VGMs)
  const exp118 = await numbering.invoice();
  const pi3 = await numbering.proforma();
  const inrNo = await numbering.inrInvoice();
  const fullItems = nepalItems.map((it) => ({ ...it }));
  const fullBody = {
    ...shared,
    customer_id: kalinchowk.id,
    consignee_name: kalinchowk.name,
    consignee_address: kalinchowk.address,
    consignee_phone: kalinchowk.phone,
    consignee_tax_id: kalinchowk.tax_id,
    notify_name: "KALINCHOWK TRADING PVT. LTD.",
    notify_phone: kalinchowk.phone,
    notify_address: kalinchowk.address,
    notify_party: "SAME AS CONSIGNEE",
    second_notify: "BANK OF KATHMANDU LTD., KATHMANDU",
    other_consignees: [{ name: "TO ORDER", address: "KATHMANDU, NEPAL", phone: "" }],
    final_destination_text: "Nepal",
    country_id: "Nepal",
    port_loading_text: "RAXAUL",
    port_loading_address: "Raxaul LCS, Bihar, India",
    port_discharge_text: "BIRGUNJ",
    port_discharge_address: "Birgunj ICD, Nepal",
    transit_note: "TRANSIT INDIA TO NEPAL VIA RAXAUL LCS → BIRGUNJ ICD",
    price_increase: 150,
    freight: 280,
    loading_charge: 50,
    proforma_no: pi3,
    proforma_date: "2026-01-10",
    invoice_no: exp118,
    invoice_date: "2026-02-02",
    inr_invoice_no: inrNo,
    inr_invoice_date: "2026-02-05",
    payment_received: true,
    vgm_date: "2026-02-08",
    examination_date: "2026-02-08",
    examining_officer: "SELF SEALING",
    permission_no: "AEO-SELF-SEAL",
    commissionerate: "RAJKOT",
    items: fullItems,
    packing_lines: [
      { serial_no: "1", description: "GOLDEN DRAGON FULL SEAT", pcs: 200, per_pcs_net: 21, per_pcs_gross: 23, net_weight: 4200, gross_weight: 4600 },
      { serial_no: "2", description: "EASTERN PAN", pcs: 500, per_pcs_net: 5, per_pcs_gross: 5.5, net_weight: 2500, gross_weight: 2750 },
    ],
    containers: [
      {
        container_no: "MSCU 1122334",
        line_seal_no: "INSL11801",
        electronic_seal_no: "E-NP-118-A",
        line_seal_photo_url: img,
        electronic_seal_photo_url: img,
        size: "40 FT",
        quantity: "1x40 FT",
        packages: 120,
        tare_weight: 3700,
        gross_weight: 4000,
      },
      {
        container_no: "MSCU 5566778",
        line_seal_no: "INSL11802",
        electronic_seal_no: "E-NP-118-B",
        line_seal_photo_url: img,
        electronic_seal_photo_url: img,
        size: "40 FT",
        quantity: "1x40 FT",
        packages: 105,
        tare_weight: 3700,
        gross_weight: 3350,
      },
    ],
    gst_bills: [
      { bill_no: "DS/25-26/118", bill_date: "2026-01-28", company_name: "DUCK SANITARYWARE LLP", gst_no: "24AAVFD3915G1ZC" },
    ],
    status: "READY_FOR_DISPATCH",
    current_stage: "vgm_annexure",
    stages: stagesThrough("vgm_annexure"),
    meta: { demo_pack: true, training: "Step 3 of 3 — Full pack (PI, commercial, INR, packing, annexure, 2× VGM). This is the finished Kalinchowk-style file." },
  };
  const fullApp = await applicationsRepo.create({
    ...fullBody,
    ...computeTotals(fullBody),
    app_no: await numbering.application(),
    financial_year: "2025-26",
  });
  await attachPdf(fullApp, "proforma", admin);
  await attachPdf(fullApp, "invoice", admin);
  await attachPdf(fullApp, "inr_invoice", admin);
  await attachPdf(fullApp, "packing_list", admin);
  await attachPdf(fullApp, "annexure", admin);
  const boxes = fullApp.containers || [];
  for (let i = 0; i < boxes.length; i++) {
    await attachPdf(fullApp, "vgm", admin, { containerIndex: i, type: `vgm-${i + 1}` });
  }

  console.log("Demo pack ready:");
  console.log(`  1. ${piApp.app_no}  PI ${piApp.proforma_no}  — next: Commercial invoice`);
  console.log(`  2. ${fxApp.app_no}  ${fxApp.invoice_no}  Bhutan — next: Payment received → INR invoice`);
  console.log(`  3. ${fullApp.app_no}  ${fullApp.invoice_no}  Kalinchowk full pack (2 containers / 2 VGMs)`);
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(self)) {
  await connectDb();
  await seedDemoPack();
  process.exit(0);
}
