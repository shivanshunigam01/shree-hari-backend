import { collectPdf, companyProfile, drawLetterhead, drawSeal, box, kv, loadImageBuffer, moneyWords, newDoc, COLORS, stampFooters, contentBottom } from "./common.js";
import { COMPANY_DEFAULTS } from "../../constants/company.js";
import { destIsNepalBhutan, formatInr, indianMoneyWords } from "../../lib/export-rules.js";

export type PdfKind = "invoice" | "proforma" | "packing_list" | "annexure" | "vgm" | "inr_invoice";

function titleFor(kind: PdfKind) {
  if (kind === "proforma") return "PROFORMA INVOICE";
  if (kind === "packing_list") return "PACKING LIST";
  if (kind === "annexure") return "ANNEXURE";
  if (kind === "vgm") return "ANNEXURE - 1  (VGM)";
  if (kind === "inr_invoice") return "INR INVOICE";
  return "COMMERCIAL INVOICE";
}

function wrap(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, size = 8) {
  doc.font("Helvetica").fontSize(size).fillColor("#111").text(text || "", x, y, { width: w, lineGap: 1 });
}

export async function generateExportPdf(app: any, kind: PdfKind, opts: { containerIndex?: number } = {}): Promise<Buffer> {
  if (kind === "annexure") return generateAnnexure(app);
  if (kind === "vgm") return generateVgm(app, opts.containerIndex ?? 0);
  return generateInvoiceLike(app, kind);
}

async function generateInvoiceLike(app: any, kind: PdfKind) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 22;
  const pageW = doc.page.width;
  const inner = pageW - m * 2;
  const nepal = destIsNepalBhutan(app.final_destination_text);
  const isInr = kind === "inr_invoice";
  const isPack = kind === "packing_list";
  const currency = isInr ? "INR" : app.invoice_currency || "USD";
  const limit = () => contentBottom(doc);
  const ensure = (need: number) => {
    if (y + need > limit()) {
      doc.addPage();
      y = 36;
    }
  };
  let y = await drawLetterhead(doc, company, app.final_destination_text);

  doc.rect(m, y, inner, 16).fillAndStroke(COLORS.fill, COLORS.navy);
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(12).text(titleFor(kind), m, y + 3, { width: inner, align: "center" });
  y += 18;
  if (isPack) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#b45309").text("NOT FOR SALE", m, y, { width: inner, align: "center" });
    y += 14;
  }

  const half = inner / 2;
  const blockH = 88;
  box(doc, m, y, half, blockH, COLORS.fill);
  box(doc, m + half, y, half, blockH);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("Exporter:-", m + 4, y + 3);
  doc.text("Details :-", m + half + 4, y + 3);
  doc.font("Helvetica-Bold").fontSize(9).text(app.exporter_name || company.companyName, m + 4, y + 14, { width: half - 8 });
  wrap(doc, app.exporter_address || String(company.exporterAddress || ""), m + 4, y + 26, half - 8, 7.5);
  const invNo = kind === "proforma" ? app.proforma_no : isInr ? app.inr_invoice_no : app.invoice_no;
  const invDate = kind === "proforma" ? app.proforma_date : isInr ? app.inr_invoice_date : app.invoice_date;
  kv(doc, m + half + 4, y + 14, kind === "proforma" ? "PI / Invoice No" : isInr ? "INR Inv" : "Invoice No", invNo || "");
  kv(doc, m + half + 4, y + 26, "Date", invDate || "");
  kv(doc, m + half + 4, y + 38, "IEC No", app.iec_no || String(company.iec || ""));
  kv(doc, m + half + 4, y + 50, "GST No", app.gst_no || String(company.gstin || ""));
  kv(doc, m + half + 4, y + 62, "AEO No", app.aeo_no || String(company.aeo || ""));
  y += blockH;

  const consH = 78;
  box(doc, m, y, half, consH);
  box(doc, m + half, y, half, consH);
  doc.font("Helvetica-Bold").fontSize(8).text("Consignee :-", m + 4, y + 3);
  doc.text(isPack ? "Notify Party :-" : "BANK DETAILS / Notify Buyer :-", m + half + 4, y + 3);
  doc.font("Helvetica-Bold").fontSize(9).text(app.consignee_name || "", m + 4, y + 14, { width: half - 8 });
  wrap(doc, [app.consignee_address, app.consignee_phone && `TEL: ${app.consignee_phone}`, app.consignee_email && `EMAIL: ${app.consignee_email}`, app.consignee_tax_id && `Tax id: ${app.consignee_tax_id}`].filter(Boolean).join("\n"), m + 4, y + 26, half - 8, 7.5);
  const notify = [app.notify_name, app.notify_address, app.notify_phone, app.notify_party].filter(Boolean).join("\n");
  if (isPack) {
    wrap(doc, notify, m + half + 4, y + 14, half - 8, 8);
  } else {
    doc.font("Helvetica-Bold").fontSize(8).text(app.bank_name || "", m + half + 4, y + 14, { width: half - 8 });
    wrap(doc, `A/C NO: ${app.bank_account || ""}\nSWIFT: ${app.bank_swift || ""}\nIFSC: ${app.bank_ifsc || ""}\n${app.bank_branch || ""}\n${notify}`, m + half + 4, y + 26, half - 8, 7);
  }
  y += consH;

  const others = (app.other_consignees || []).filter((p: any) => p?.name);
  if (app.second_notify || others.length) {
    box(doc, m, y, inner, 28);
    wrap(doc, [`Other consignee(s): ${others.map((p: any) => [p.name, p.address, p.phone].filter(Boolean).join(", ")).join(" | ")}`, app.second_notify && `Second notify: ${app.second_notify}`].filter(Boolean).join("   "), m + 4, y + 6, inner - 8, 7.5);
    y += 28;
  }

  const lcBits = [
    app.lc_no && `LC NO: ${app.lc_no}`,
    app.lc_issue_date && `LC ISSUE DATE: ${app.lc_issue_date}`,
    kind !== "proforma" && app.proforma_no && `PROFORMA INVOICE NO: ${app.proforma_no}  DATE: ${app.proforma_date || ""}`,
    app.latest_shipment_date && `LATEST SHIPMENT DATE :- ${app.latest_shipment_date}`,
    nepal && app.transit_note && `TRANSIT NOTE: ${app.transit_note}`,
  ].filter(Boolean);
  if (lcBits.length) {
    box(doc, m, y, inner, 22);
    wrap(doc, lcBits.join("    "), m + 4, y + 5, inner - 8, 7.5);
    y += 22;
  }

  const bandH = 42;
  const col = inner / 4;
  box(doc, m, y, inner, bandH);
  for (let i = 1; i < 4; i++) doc.moveTo(m + col * i, y).lineTo(m + col * i, y + bandH).stroke();
  doc.moveTo(m, y + 20).lineTo(m + inner, y + 20).stroke();
  doc.font("Helvetica-Bold").fontSize(7).text("Port of Loading", m + 3, y + 2);
  doc.text("Port of Discharge", m + col + 3, y + 2);
  doc.text("Payment Terms", m + col * 2 + 3, y + 2);
  doc.text("Export Terms", m + col * 3 + 3, y + 2);
  doc.font("Helvetica").fontSize(7).text(`${app.port_loading_text || ""}\n${app.port_loading_address || ""}`, m + 3, y + 10, { width: col - 6 });
  doc.text(`${app.port_discharge_text || ""}\n${app.port_discharge_address || ""}`, m + col + 3, y + 10, { width: col - 6 });
  doc.text(app.payment_terms || "", m + col * 2 + 3, y + 10, { width: col - 6 });
  doc.text(app.export_terms || "", m + col * 3 + 3, y + 10, { width: col - 6 });
  doc.font("Helvetica-Bold").fontSize(7).text("Country of Origin", m + 3, y + 22);
  doc.text("Final Destination", m + col + 3, y + 22);
  doc.text("H.S.N CODE", m + col * 2 + 3, y + 22);
  doc.text("PRODUCTS", m + col * 3 + 3, y + 22);
  doc.font("Helvetica").fontSize(8).text(app.country_origin || "INDIA", m + 3, y + 30, { width: col - 6 });
  doc.text(app.final_destination_text || "", m + col + 3, y + 30, { width: col - 6 });
  doc.text(app.hsn_codes || "", m + col * 2 + 3, y + 30, { width: col - 6 });
  doc.text(app.products_desc || "", m + col * 3 + 3, y + 30, { width: col - 6 });
  y += bandH;

  const containers = app.containers?.length ? app.containers : [{}];
  const cHead = 14;
  const cRow = 16;
  const cH = cHead + containers.length * cRow;
  box(doc, m, y, inner, cH);
  const cCols = [inner * 0.28, inner * 0.24, inner * 0.28, inner * 0.2];
  let cx0 = m;
  for (let i = 1; i < 4; i++) {
    cx0 += cCols[i - 1];
    doc.moveTo(cx0, y).lineTo(cx0, y + cH).stroke();
  }
  doc.moveTo(m, y + cHead).lineTo(m + inner, y + cHead).stroke();
  const cLabels = ["Container No.", "Line Seal No.", "Electronics Seal No.", "Container Quantity"];
  cx0 = m;
  cLabels.forEach((lab, i) => {
    doc.font("Helvetica-Bold").fontSize(7).text(lab, cx0 + 3, y + 3, { width: cCols[i] - 6 });
    cx0 += cCols[i];
  });
  containers.forEach((c: any, i: number) => {
    const yy = y + cHead + i * cRow + 3;
    const vals = [c.container_no || "", c.line_seal_no || "", c.electronic_seal_no || "", c.quantity || c.size || ""];
    let vx = m;
    vals.forEach((val, ci) => {
      doc.font("Helvetica").fontSize(8).text(String(val), vx + 3, yy, { width: cCols[ci] - 6 });
      vx += cCols[ci];
    });
  });
  y += cH;

  const items = app.items ?? [];
  const headers = isPack
    ? ["No & Kind of Packages", "Description of Goods", "Qty", "SET/PCS", "Net Kg", "Gross Kg"]
    : ["No & Kind of Packages", "Description of Goods", "Quantity", "SET/PCS", "RATE", "Amount"];
  const widths = isPack
    ? [95, inner - 95 - 48 - 48 - 55 - 55, 48, 48, 55, 55]
    : [95, inner - 95 - 52 - 48 - 52 - 72, 52, 48, 52, 72];
  box(doc, m, y, inner, 16);
  doc.rect(m, y, inner, 16).fillAndStroke(COLORS.fill, COLORS.line);
  let x = m;
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#111");
  headers.forEach((h, i) => {
    if (i > 0) doc.moveTo(x, y).lineTo(x, y + 16).stroke();
    doc.text(h, x + 2, y + 4, { width: widths[i] - 4, align: "center" });
    x += widths[i];
  });
  y += 16;

  const extras = (Number(app.loading_charge) || 0) + (nepal ? (Number(app.price_increase) || 0) + (Number(app.freight) || 0) : 0);
  const goods = items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0);
  const totalAmt = isInr ? Number(app.inr_amount || goods * (Number(app.exchange_rate) || 0) + extras * (Number(app.exchange_rate) || 0)) : goods + extras;
  const totalPkgs = items.reduce((s: number, it: any) => s + (Number(it.packages) || 0), 0);
  const totalNet = items.reduce((s: number, it: any) => s + (Number(it.net_weight) || 0), 0);
  const totalGross = items.reduce((s: number, it: any) => s + (Number(it.gross_weight) || 0), 0);
  const rate = Number(app.exchange_rate) || 0;

  for (const it of items) {
    const descLines = [app.products_desc && String(app.products_desc).toUpperCase(), it.description, it.brand_name && `Brand: ${it.brand_name}`, it.dimensions].filter(Boolean);
    const desc = descLines.join("\n");
    const img = await loadImageBuffer(it.image_url);
    const rowH = img ? 86 : Math.max(22, doc.heightOfString(desc, { width: widths[1] - 8 }) + 8);
    ensure(rowH);
    box(doc, m, y, inner, rowH);
    let cx = m;
    for (let i = 1; i < widths.length; i++) {
      cx += widths[i - 1];
      doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
    }
    const amt = isInr && rate ? Number(((Number(it.amount) || 0) * rate).toFixed(2)) : it.amount;
    const lineRate = isInr && rate ? Number(((Number(it.rate) || 0) * rate).toFixed(2)) : it.rate;
    if (img) {
      try {
        doc.image(img, m + (widths[0] - 70) / 2, y + 3, { fit: [70, 80] });
      } catch {
        /* ignore */
      }
    }
    doc.font("Helvetica").fontSize(7).text(String(it.packages ?? ""), m + 2, y + rowH - 12, { width: widths[0] - 4, align: "center" });
    doc.font("Helvetica-Bold").fontSize(8).text(String(app.products_desc || "").toUpperCase(), m + widths[0] + 4, y + 8, { width: widths[1] - 8, align: "center" });
    doc.font("Helvetica").fontSize(8).text(String(it.description || ""), m + widths[0] + 4, y + 22, { width: widths[1] - 8, align: "center" });
    const nums = isPack
      ? [it.quantity, it.unit, it.net_weight, it.gross_weight]
      : [it.quantity, it.unit, lineRate, amt];
    cx = m + widths[0] + widths[1];
    nums.forEach((val, i) => {
      doc.font("Helvetica").fontSize(8).text(String(val ?? ""), cx + 2, y + rowH / 2 - 4, { width: widths[i + 2] - 4, align: "center" });
      cx += widths[i + 2];
    });
    y += rowH;
  }

  const extraLines: [string, number][] = [];
  if (!isPack && app.loading_charge) extraLines.push(["LOADING CHARGE", Number(app.loading_charge)]);
  if (!isPack && nepal && app.price_increase) extraLines.push(["PRICE INCREASE", Number(app.price_increase)]);
  if (!isPack && nepal && app.freight) extraLines.push(["FREIGHT", Number(app.freight)]);
  for (const [label, val] of extraLines) {
    const shown = isInr && rate ? val * rate : val;
    ensure(16);
    box(doc, m, y, inner, 14);
    doc.font("Helvetica").fontSize(8).text(label, m + widths[0] + 4, y + 3);
    doc.text(isInr ? formatInr(shown) : String(shown), m + inner - 110, y + 3, { width: 100, align: "right" });
    y += 14;
  }

  ensure(28);
  box(doc, m, y, inner, 22);
  doc.font("Helvetica-Bold").fontSize(8);
  if (isPack) {
    doc.text(`TOTAL SET: ${totalPkgs || ""}`, m + 4, y + 6);
    doc.text(String(totalNet || app.total_net_weight || ""), m + 380, y + 6, { width: 70 });
    doc.text(String(totalGross || app.total_gross_weight || ""), m + 450, y + 6, { width: 70 });
  } else {
    const words = isInr ? (app.amount_in_words || indianMoneyWords(totalAmt)) : (app.amount_in_words || moneyWords(totalAmt, currency));
    doc.text(words || `TOTAL SET: ${totalPkgs || ""}`, m + 4, y + 6, { width: inner - 160 });
    const totalLabel = isInr ? `Total (in INR) ${formatInr(totalAmt)}` : `Total (in ${currency}) $ ${Number(totalAmt).toFixed(0)}`;
    doc.text(totalLabel, m + inner - 150, y + 6, { width: 146, align: "right" });
  }
  y += 26;
  if (!isPack && !isInr && rate) {
    doc.font("Helvetica").fontSize(7.5).text(`USD/INR week rate: ${rate}    INR equivalent: ${formatInr(Number(app.inr_amount || totalAmt * rate))}`, m, y);
    y += 12;
  }

  if (kind === "packing_list" && (app.packing_lines || []).length) {
    ensure(40);
    doc.font("Helvetica-Bold").fontSize(9).text("Per-piece packing breakdown", m, y);
    y += 12;
    const ph = ["Sr", "Description", "PCS", "Net/pc", "Gross/pc", "Net Kg", "Gross Kg"];
    const pw = [28, 200, 40, 55, 60, 55, 62];
    box(doc, m, y, inner, 12);
    let px = m;
    doc.font("Helvetica-Bold").fontSize(7);
    ph.forEach((h, i) => {
      doc.text(h, px + 2, y + 2, { width: pw[i] - 4 });
      px += pw[i];
    });
    y += 12;
    for (const pl of app.packing_lines) {
      ensure(14);
      box(doc, m, y, inner, 12);
      px = m;
      [pl.serial_no, pl.description, pl.pcs, pl.per_pcs_net, pl.per_pcs_gross, pl.net_weight, pl.gross_weight].forEach((val, i) => {
        doc.font("Helvetica").fontSize(7.5).text(String(val ?? ""), px + 2, y + 2, { width: pw[i] - 4 });
        px += pw[i];
      });
      y += 12;
    }
    y += 8;
  }

  ensure(40);
  wrap(doc, app.rodtep_text || COMPANY_DEFAULTS.rodtepText, m, y, inner, 7);
  y += 12;
  if (!nepal && !isInr) {
    wrap(doc, app.igst_bond_text || COMPANY_DEFAULTS.igstBondText, m, y, inner, 7);
    y += 14;
  }
  ensure(40);
  doc.font("Helvetica").fontSize(8).text(`LUT NO : ${app.lut_no || company.lutNo || ""}`, m, y);
  doc.text(`State of Origin ${app.state_of_origin || "GUJARAT"}`, m, y + 12);
  doc.text(`AEO : ${app.aeo_no || company.aeo || ""}`, m, y + 24);
  y += 40;

  ensure(90);
  const declY = y;
  box(doc, m, declY, half, 70);
  box(doc, m + half, declY, half, 70);
  doc.font("Helvetica-Bold").fontSize(8).text("Declaration", m + 4, declY + 4);
  wrap(doc, app.declaration || COMPANY_DEFAULTS.declaration, m + 4, declY + 16, half - 8, 7.5);
  await drawSeal(doc, m + half + 40, declY + 6, 120);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.blue).text("AUTHORISED SIGNATORY", m + half + 8, declY + 56);

  await stampFooters(doc);
  doc.end();
  return done;
}

async function generateAnnexure(app: any) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 28;
  const ensure = (need: number) => {
    if (y + need > contentBottom(doc)) {
      doc.addPage();
      y = 36;
    }
  };
  let y = await drawLetterhead(doc, company, app.final_destination_text);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.navy).text("ANNEXURE", m, y, { width: 540, align: "center" });
  y += 16;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text("OFFICE OF THE SUPERINTENDENT OF CGST", m, y, { align: "center", width: 540 });
  y += 12;
  doc.font("Helvetica").fontSize(8).text("RANGE : MORBI,  DIVISION : MORBI  , COMMISSIONERATE : RAJKOT", m, y, { align: "center", width: 540 });
  y += 18;

  const exporterName = app.exporter_name || company.companyName;
  const exporterAddr = app.exporter_address || company.exporterAddress;
  const gstin = app.gst_no || company.gstin;
  const doe = app.examination_date || app.vgm_date || "";
  const pkgs = app.total_packages || (app.items || []).reduce((s: number, it: any) => s + (Number(it.packages) || 0), 0);
  const rows: [string, string][] = [
    ["1. NAME OF THE EXPORTER", `${exporterName}\n${exporterAddr}`],
    ["   GSTIN", String(gstin || "")],
    ["2. a) IEC NO.", app.iec_no || String(company.iec || "")],
    ["   b) BRANCH CODE", "MORBI"],
    ["   c) BIN", app.bin_no || String(company.bin || "")],
    ["3. NAME OF THE MANUFACTURER", app.supplier_name || ""],
    ["   GSTIN", app.supplier_gst || ""],
    ["4. FACTORY ADDRESS", app.factory_address || app.supplier_address || ""],
    ["5. DATE OF EXAMINATION (DOE)", doe],
    ["6. EXAMINING OFFICER", app.examining_officer || "SELF SEALING"],
    ["7. SUPERVISION OFFICER", "SELF SEALING"],
    ["8. COMMISSIONERATE / LOCATION", `${app.commissionerate || company.companyName || ""}  ${app.location_code || ""}`],
    ["9. a) EXPORT INVOICE NO.", `${app.invoice_no || ""}   ${app.invoice_date || ""}`],
    ["   b) TOTAL NO. OF PACKAGES", `${pkgs || ""} PKGS`],
    ["   c) CONSIGNEE", [app.consignee_name || "TO ORDER", ...(app.other_consignees || []).filter((p: any) => p?.name).map((p: any) => p.name)].join(" / ")],
    ["10. PORT / DESTINATION", `${app.port_discharge_text || ""} / ${app.final_destination_text || ""}`],
    ["11. SEAL", "SELF SEALING"],
    ["12. PERMISSION NO.", app.permission_no || ""],
    ["13. AVAILING INPUT TAX CREDIT", "YES"],
    ["14. AEO No", app.aeo_no || String(company.aeo || "")],
  ];
  for (const [k, v] of rows) {
    const text = v || "-";
    const h = Math.max(16, doc.heightOfString(String(text), { width: 300 }) + 6);
    ensure(h);
    doc.font("Helvetica-Bold").fontSize(8).text(k, m, y, { width: 220 });
    doc.font("Helvetica").text(text, m + 230, y, { width: 300 });
    y += h;
  }

  y += 6;
  ensure(14);
  doc.font("Helvetica-Bold").fontSize(8).text("CONTAINER NO.        SIZE        PACKAGES        SEAL NO.        ELECTRONIC SEAL NO.", m, y);
  y += 12;
  for (const c of app.containers || []) {
    ensure(12);
    doc.font("Helvetica").fontSize(8).text(`${c.container_no || ""}    ${c.size || ""}    ${c.packages || pkgs || ""}    ${c.line_seal_no || ""}    ${c.electronic_seal_no || ""}`, m, y);
    y += 12;
  }
  y += 8;
  ensure(14);
  doc.font("Helvetica-Bold").text("15. GOODS PURCHASE BILL DETAILS", m, y);
  y += 12;
  for (const b of app.gst_bills || []) {
    ensure(12);
    doc.font("Helvetica").text(`${b.bill_no || ""}  ${b.bill_date || ""}  ${b.company_name || ""}  GST: ${b.gst_no || ""}`, m, y);
    y += 12;
  }
  y += 16;
  ensure(90);
  await drawSeal(doc, m + 320, y, 140);
  doc.font("Helvetica").fontSize(8).text("SIGNATURE OF THE EXPORTER", m, y);
  doc.text(`NAME : ${company.authorisedSignatory || "KISHORBHAI"} (${exporterName})`, m, y + 50);
  doc.text("DESIGNATION :- Authorised", m, y + 64);

  await stampFooters(doc);
  doc.end();
  return done;
}

async function generateVgm(app: any, containerIndex = 0) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 40;
  const ensure = (need: number) => {
    if (y + need > contentBottom(doc)) {
      doc.addPage();
      y = 36;
    }
  };
  let y = await drawLetterhead(doc, company, app.final_destination_text);
  const list = app.containers?.length ? app.containers : [{}];
  const c0 = list[containerIndex] || list[0] || {};
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.navy).text("ANNEXURE - 1", m, y, { align: "center", width: 515 });
  y += 16;
  doc.font("Helvetica-Bold").fontSize(10).text("INFORMATION ABOUT VERIFIED GROSS MASS OF CONTAINER", m, y, { align: "center", width: 515 });
  y += 12;
  doc.font("Helvetica").fontSize(8).text(`Container ${containerIndex + 1} of ${list.length}`, m, y, { align: "center", width: 515 });
  y += 16;

  const cargo = Number(c0.gross_weight || app.total_gross_weight || 0);
  const tare = Number(c0.tare_weight || 3700);
  const vgm = Number(c0.vgm_weight || cargo + tare);
  const doe = app.vgm_date || app.examination_date || "";
  const rows: [string, string, string][] = [
    ["1", "Name of the shipper", `${app.exporter_name || company.companyName}\n${company.letterheadAddress || COMPANY_DEFAULTS.letterheadAddress}`],
    ["2", "Shipper Registration / License no. (IEC)", app.iec_no || String(company.iec || "")],
    ["3", "Name and designation of official of the shipper authorized to sign document", String(company.vgmOfficial || "MR.KISHORBHAI")],
    ["4", "24 x 7 contact details of authorized official of shipper", `${company.vgmOfficial || "MR. KISHORBHAI"}  ${company.phone || ""}`],
    ["5", "Container No.", c0.container_no || ""],
    ["6", "Container Size (TEU/FEU/other)", c0.quantity || c0.size || "1X40"],
    ["7", "Maximum permissible weight of container as per the CSC plate", `${c0.csc_max_weight || 32500} KGS`],
    ["8", "Verified gross mass of container (method-1/method-2)", `${cargo} KGS + ${tare} KGS = ${vgm} KGS`],
    ["9", "Type (Normal/Reefer/Hazardous/others)", c0.container_type || "NORMAL"],
    ["10", "If Hazardous UN NO. / IMDG class", "N.A."],
    ["11", "DOE / VGM date", doe],
  ];
  for (const [n, k, v] of rows) {
    ensure(28);
    box(doc, m, y, 30, 28);
    box(doc, m + 30, y, 250, 28);
    box(doc, m + 280, y, 235, 28);
    doc.font("Helvetica-Bold").fontSize(8).text(n, m + 4, y + 8);
    doc.font("Helvetica").fontSize(8).text(k, m + 34, y + 4, { width: 242 });
    doc.text(v, m + 284, y + 4, { width: 226 });
    y += 28;
  }
  y += 20;
  ensure(110);
  doc.font("Helvetica").fontSize(8).text("Signature of Authorized Person of Shipper", m + 280, y);
  await drawSeal(doc, m + 300, y + 10, 130);
  doc.text(`Name- ${company.vgmOfficial || "Mr. KISHORBHAI"}`, m + 280, y + 80);
  doc.text(`DATE  ${doe}`, m, y + 80);
  await stampFooters(doc);
  doc.end();
  return done;
}
