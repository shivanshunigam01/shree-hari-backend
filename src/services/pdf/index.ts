import { collectPdf, companyProfile, drawLetterhead, drawSeal, box, kv, loadImageBuffer, moneyWords, newDoc, COLORS } from "./common.js";
import { COMPANY_DEFAULTS } from "../../constants/company.js";

export type PdfKind = "invoice" | "proforma" | "packing_list" | "annexure" | "vgm";

function titleFor(kind: PdfKind) {
  if (kind === "proforma") return "PROFORMA INVOICE";
  if (kind === "packing_list") return "PACKING LIST";
  if (kind === "annexure") return "ANNEXURE";
  if (kind === "vgm") return "ANNEXURE – 1  (VGM)";
  return "INVOICE";
}

function wrap(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, size = 8) {
  doc.font("Helvetica").fontSize(size).fillColor("#111").text(text || "", x, y, { width: w, lineGap: 1 });
}

export async function generateExportPdf(app: any, kind: PdfKind): Promise<Buffer> {
  if (kind === "annexure") return generateAnnexure(app);
  if (kind === "vgm") return generateVgm(app);
  return generateInvoiceLike(app, kind);
}

async function generateInvoiceLike(app: any, kind: PdfKind) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 22;
  const pageW = doc.page.width;
  const inner = pageW - m * 2;
  let y = await drawLetterhead(doc, company, app.final_destination_text);

  doc.rect(m, y, inner, 16).fillAndStroke(COLORS.fill, COLORS.navy);
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(12).text(titleFor(kind), m, y + 3, { width: inner, align: "center" });
  y += 18;

  const half = inner / 2;
  const blockH = 62;
  box(doc, m, y, half, blockH, COLORS.fill);
  box(doc, m + half, y, half, blockH);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("Exporter:-", m + 4, y + 3);
  doc.text("Details :-", m + half + 4, y + 3);
  doc.font("Helvetica-Bold").fontSize(9).text(app.exporter_name || company.companyName, m + 4, y + 14, { width: half - 8 });
  wrap(doc, app.exporter_address || String(company.exporterAddress || ""), m + 4, y + 26, half - 8, 7.5);
  const invLabel = kind === "proforma" ? "PI No" : "Invoice No";
  kv(doc, m + half + 4, y + 14, invLabel, app.invoice_no || app.proforma_no || app.app_no || "");
  kv(doc, m + half + 4, y + 26, "Date", app.invoice_date || app.proforma_date || "");
  kv(doc, m + half + 4, y + 38, "IEC No", app.iec_no || String(company.iec || ""));
  kv(doc, m + half + 4, y + 50, kind === "proforma" ? "AEO No" : "GST No", kind === "proforma" ? (app.aeo_no || String(company.aeo || "")) : (app.gst_no || String(company.gstin || "")));
  y += blockH;

  const consH = 70;
  box(doc, m, y, half, consH);
  box(doc, m + half, y, half, consH);
  doc.font("Helvetica-Bold").fontSize(8).text("Consignee :-", m + 4, y + 3);
  doc.text(kind === "invoice" || kind === "proforma" ? "BANK DETAILS / Notify Buyer :-" : "Notify Buyer :-", m + half + 4, y + 3);
  doc.font("Helvetica-Bold").fontSize(9).text(app.consignee_name || "", m + 4, y + 14, { width: half - 8 });
  wrap(doc, [app.consignee_address, app.consignee_phone && `TEL: ${app.consignee_phone}`, app.consignee_email && `EMAIL: ${app.consignee_email}`, app.consignee_tax_id && `Tax id: ${app.consignee_tax_id}`].filter(Boolean).join("\n"), m + 4, y + 26, half - 8, 7.5);
  if (kind === "packing_list") {
    wrap(doc, app.notify_party || "", m + half + 4, y + 14, half - 8, 8);
  } else {
    doc.font("Helvetica-Bold").fontSize(8).text(app.bank_name || "", m + half + 4, y + 14, { width: half - 8 });
    wrap(doc, `A/C NO: ${app.bank_account || ""}\nSWIFT: ${app.bank_swift || ""}\nIFSC: ${app.bank_ifsc || ""}\n${app.notify_party || ""}`, m + half + 4, y + 26, half - 8, 7.5);
  }
  y += consH;

  const lcBits = [
    app.lc_no && `LC NO: ${app.lc_no}`,
    app.lc_issue_date && `LC ISSUE DATE: ${app.lc_issue_date}`,
    app.lc_expiry_date && `LC EXPIRY DATE: ${app.lc_expiry_date}`,
    (app.proforma_no || app.proforma_date) && `PROFORMA INVOICE NO: ${app.proforma_no || ""}  DATE: ${app.proforma_date || ""}`,
    app.latest_shipment_date && `LATEST SHIPMENT DATE :- ${app.latest_shipment_date}`,
  ].filter(Boolean);
  if (lcBits.length) {
    box(doc, m, y, inner, 22);
    wrap(doc, lcBits.join("    "), m + 4, y + 5, inner - 8, 7.5);
    y += 22;
  }

  const bandH = 36;
  const col = inner / 4;
  box(doc, m, y, inner, bandH);
  for (let i = 1; i < 4; i++) doc.moveTo(m + col * i, y).lineTo(m + col * i, y + bandH).stroke();
  doc.moveTo(m, y + 18).lineTo(m + inner, y + 18).stroke();
  doc.font("Helvetica-Bold").fontSize(7).text("Port of Loading", m + 3, y + 2);
  doc.text("Port of Discharge", m + col + 3, y + 2);
  doc.text("Payment Terms", m + col * 2 + 3, y + 2);
  doc.text("Export Terms", m + col * 3 + 3, y + 2);
  doc.font("Helvetica").fontSize(8).text(app.port_loading_text || "", m + 3, y + 10, { width: col - 6 });
  doc.text(app.port_discharge_text || "", m + col + 3, y + 10, { width: col - 6 });
  doc.text(app.payment_terms || "", m + col * 2 + 3, y + 10, { width: col - 6 });
  doc.text(app.export_terms || "", m + col * 3 + 3, y + 10, { width: col - 6 });
  doc.font("Helvetica-Bold").fontSize(7).text("Country of Origin", m + 3, y + 20);
  doc.text("Final Destination", m + col + 3, y + 20);
  doc.text("H.S.N CODE", m + col * 2 + 3, y + 20);
  doc.text("PRODUCTS", m + col * 3 + 3, y + 20);
  doc.font("Helvetica").fontSize(8).text(app.country_origin || "INDIA", m + 3, y + 28, { width: col - 6 });
  doc.text(app.final_destination_text || "", m + col + 3, y + 28, { width: col - 6 });
  doc.text(app.hsn_codes || "", m + col * 2 + 3, y + 28, { width: col - 6 });
  doc.text(app.products_desc || "", m + col * 3 + 3, y + 28, { width: col - 6 });
  y += bandH;

  const containers = app.containers?.length ? app.containers : [{}];
  box(doc, m, y, inner, 12 + containers.length * 14);
  doc.font("Helvetica-Bold").fontSize(7).text("Container No.", m + 4, y + 3);
  doc.text("Line Seal No.", m + 130, y + 3);
  doc.text("Electronic Seal No.", m + 250, y + 3);
  doc.text("Container Quantity", m + 400, y + 3);
  containers.forEach((c: any, i: number) => {
    const yy = y + 14 + i * 14;
    doc.font("Helvetica").fontSize(8).text(c.container_no || "", m + 4, yy);
    doc.text(c.line_seal_no || "", m + 130, yy);
    doc.text(c.electronic_seal_no || "", m + 250, yy);
    doc.text(c.quantity || c.size || "", m + 400, yy);
  });
  y += 14 + containers.length * 14;

  const items = app.items ?? [];
  const isPack = kind === "packing_list";
  const headers = isPack
    ? ["Pkgs", "Description of Goods", "Qty", "Unit", "Net Kg", "Gross Kg"]
    : ["Pkgs", "Description of Goods", "Qty", "Unit", `Rate (${app.invoice_currency || "USD"})`, "Amount"];
  const widths = isPack ? [40, 250, 50, 40, 70, 70] : [40, 230, 50, 40, 70, 90];
  box(doc, m, y, inner, 14);
  doc.rect(m, y, inner, 14).fillAndStroke(COLORS.fill, COLORS.line);
  let x = m;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111");
  headers.forEach((h, i) => {
    doc.text(h, x + 2, y + 3, { width: widths[i] - 4 });
    x += widths[i];
  });
  y += 14;

  const totalAmt = items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0) + (Number(app.loading_charge) || 0);
  const totalPkgs = items.reduce((s: number, it: any) => s + (Number(it.packages) || 0), 0);
  const totalNet = items.reduce((s: number, it: any) => s + (Number(it.net_weight) || 0), 0);
  const totalGross = items.reduce((s: number, it: any) => s + (Number(it.gross_weight) || 0), 0);

  for (const it of items) {
    const desc = [it.description, it.dimensions].filter(Boolean).join("\n");
    const img = await loadImageBuffer(it.image_url);
    const rowH = img ? 42 : Math.max(16, doc.heightOfString(desc, { width: widths[1] - 40 }) + 6);
    if (y + rowH > 760) {
      doc.addPage();
      y = 30;
    }
    box(doc, m, y, inner, rowH);
    let cx = m;
    const cells = isPack
      ? [it.packages, desc, it.quantity, it.unit, it.net_weight, it.gross_weight]
      : [it.packages, desc, it.quantity, it.unit, it.rate, it.amount];
    cells.forEach((val, i) => {
      if (i === 1 && img) {
        try {
          doc.image(img, cx + 2, y + 3, { width: 34, height: rowH - 6, fit: [34, rowH - 6] });
        } catch {
          /* ignore */
        }
        doc.font("Helvetica").fontSize(8).text(String(val ?? ""), cx + 38, y + 3, { width: widths[i] - 42 });
      } else {
        doc.font(i === 0 ? "Helvetica" : "Helvetica").fontSize(8).text(String(val ?? ""), cx + 2, y + 3, { width: widths[i] - 4 });
      }
      cx += widths[i];
    });
    y += rowH;
  }

  if (!isPack && app.loading_charge) {
    box(doc, m, y, inner, 14);
    doc.font("Helvetica").fontSize(8).text("LOADING CHARGE", m + 44, y + 3);
    doc.text(String(app.loading_charge), m + inner - 88, y + 3, { width: 84, align: "right" });
    y += 14;
  }

  box(doc, m, y, inner, 16);
  doc.font("Helvetica-Bold").fontSize(8).text(`TOTAL  ${totalPkgs || ""}`, m + 4, y + 4);
  if (isPack) {
    doc.text(String(totalNet || ""), m + 380, y + 4, { width: 70 });
    doc.text(String(totalGross || ""), m + 450, y + 4, { width: 70 });
  } else {
    doc.text(app.amount_in_words || moneyWords(totalAmt, app.invoice_currency || "USD"), m + 90, y + 4, { width: 300 });
    doc.text(`${app.invoice_currency || "USD"} ${Number(totalAmt).toFixed(2)}`, m + inner - 110, y + 4, { width: 100, align: "right" });
  }
  y += 22;

  if (kind === "packing_list" && (app.packing_lines || []).length) {
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

  wrap(doc, app.rodtep_text || COMPANY_DEFAULTS.rodtepText, m, y, inner, 7);
  y += 12;
  wrap(doc, app.igst_bond_text || COMPANY_DEFAULTS.igstBondText, m, y, inner, 7);
  y += 14;
  doc.font("Helvetica").fontSize(8).text(`LUT NO : ${app.lut_no || company.lutNo || ""}`, m, y);
  doc.text(`State of Origin ${app.state_of_origin || "GUJARAT"}`, m, y + 12);

  const declY = y + 28;
  box(doc, m, declY, half, 70);
  box(doc, m + half, declY, half, 70);
  doc.font("Helvetica-Bold").fontSize(8).text("Declaration", m + 4, declY + 4);
  wrap(doc, app.declaration || COMPANY_DEFAULTS.declaration, m + 4, declY + 16, half - 8, 7.5);
  await drawSeal(doc, m + half + 40, declY + 6, 120);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.blue).text("AUTHORISED SIGNATORY", m + half + 8, declY + 56);

  doc.end();
  return done;
}

async function generateAnnexure(app: any) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 28;
  let y = await drawLetterhead(doc, company, app.final_destination_text);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.navy).text("ANNEXURE", m, y, { width: 540, align: "center" });
  y += 16;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text("OFFICE OF THE SUPERINTENDENT OF CGST", m, y, { align: "center", width: 540 });
  y += 12;
  doc.font("Helvetica").fontSize(8).text("RANGE : MORBI,  DIVISION : MORBI  , COMMISSIONERATE : RAJKOT", m, y, { align: "center", width: 540 });
  y += 18;

  const rows: [string, string][] = [
    ["1. NAME OF THE EXPORTER", `${app.exporter_name || company.companyName}\n${app.exporter_address || company.exporterAddress}`],
    ["2. a) IEC NO.", app.iec_no || String(company.iec || "")],
    ["   b) BRANCH CODE", "MORBI"],
    ["   c) BIN", app.bin_no || String(company.bin || "")],
    ["3. NAME OF THE MANUFACTURER", app.supplier_name || ""],
    ["4. FACTORY ADDRESS", app.factory_address || app.supplier_address || ""],
    ["5. DATE OF EXAMINATION", app.examination_date || app.invoice_date || ""],
    ["6. EXAMINING OFFICER", app.examining_officer || "SELF SEALING"],
    ["7. SUPERVISION OFFICER", "SELF SEALING"],
    ["8. COMMISSIONERATE / LOCATION", `${app.commissionerate || ""}  ${app.location_code || ""}`],
    ["9. a) EXPORT INVOICE NO.", `${app.invoice_no || ""}   ${app.invoice_date || ""}`],
    ["   b) TOTAL NO. OF PACKAGES", `${app.total_packages || ""} PKGS`],
    ["   c) CONSIGNEE", app.consignee_name || "TO ORDER"],
    ["10. PORT / DESTINATION", app.final_destination_text || ""],
    ["11. SEAL", "SELF SEALING"],
    ["12. PERMISSION NO.", app.permission_no || ""],
    ["13. AVAILING INPUT TAX CREDIT", "YES"],
    ["14. AEO No", app.aeo_no || String(company.aeo || "")],
  ];
  for (const [k, v] of rows) {
    doc.font("Helvetica-Bold").fontSize(8).text(k, m, y, { width: 220 });
    doc.font("Helvetica").text(v || "—", m + 230, y, { width: 300 });
    y += Math.max(16, doc.heightOfString(String(v || "—"), { width: 300 }) + 6);
  }

  y += 6;
  doc.font("Helvetica-Bold").fontSize(8).text("CONTAINER NO.        SIZE        PACKAGES        SEAL NO.        ELECTRONIC SEAL NO.", m, y);
  y += 12;
  for (const c of app.containers || []) {
    doc.font("Helvetica").fontSize(8).text(`${c.container_no || ""}    ${c.size || ""}    ${c.packages || app.total_packages || ""}    ${c.line_seal_no || ""}    ${c.electronic_seal_no || ""}`, m, y);
    y += 12;
  }
  y += 8;
  doc.font("Helvetica-Bold").text("15. GOODS PURCHASE BILL DETAILS", m, y);
  y += 12;
  for (const b of app.gst_bills || []) {
    doc.font("Helvetica").text(`${b.bill_no || ""}  ${b.bill_date || ""}  ${b.company_name || ""}  ${b.gst_no || ""}`, m, y);
    y += 12;
  }
  y += 16;
  await drawSeal(doc, m + 320, y, 140);
  doc.font("Helvetica").fontSize(8).text("SIGNATURE OF THE EXPORTER", m, y);
  doc.text(`NAME : ${company.authorisedSignatory || "KISHORBHAI"} (SHREE HARI EXPORT HOUSE)`, m, y + 50);
  doc.text("DESIGNATION :- Authorised", m, y + 64);

  doc.end();
  return done;
}

async function generateVgm(app: any) {
  const company = await companyProfile();
  const doc = newDoc();
  const done = collectPdf(doc);
  const m = 40;
  let y = await drawLetterhead(doc, company, app.final_destination_text);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.navy).text("ANNEXURE – 1", m, y, { align: "center", width: 515 });
  y += 16;
  doc.font("Helvetica-Bold").fontSize(10).text("INFORMATION ABOUT VERIFIED GROSS MASS OF CONTAINER", m, y, { align: "center", width: 515 });
  y += 24;

  const c0 = (app.containers || [])[0] || {};
  const cargo = Number(c0.gross_weight || app.total_gross_weight || 0);
  const tare = Number(c0.tare_weight || 3700);
  const vgm = Number(c0.vgm_weight || cargo + tare);
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
  ];
  for (const [n, k, v] of rows) {
    box(doc, m, y, 30, 28);
    box(doc, m + 30, y, 250, 28);
    box(doc, m + 280, y, 235, 28);
    doc.font("Helvetica-Bold").fontSize(8).text(n, m + 4, y + 8);
    doc.font("Helvetica").fontSize(8).text(k, m + 34, y + 4, { width: 242 });
    doc.text(v, m + 284, y + 4, { width: 226 });
    y += 28;
  }
  y += 20;
  doc.font("Helvetica").fontSize(8).text("Signature of Authorized Person of Shipper", m + 280, y);
  await drawSeal(doc, m + 300, y + 10, 130);
  doc.text(`Name- ${company.vgmOfficial || "Mr. KISHORBHAI"}`, m + 280, y + 80);
  doc.text(`DATE  ${app.invoice_date || ""}`, m, y + 80);
  doc.end();
  return done;
}
