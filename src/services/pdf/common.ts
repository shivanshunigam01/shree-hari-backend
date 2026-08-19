import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { COMPANY_DEFAULTS } from "../../constants/company.js";
import { settingsRepo } from "../../repos/ops.js";
import { storage } from "../storage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const branding = path.join(root, "assets/branding");

export const COLORS = {
  blue: "#0096D6",
  orange: "#F38B21",
  navy: "#0B3A6A",
  line: "#333333",
  muted: "#555555",
  fill: "#F3F7FC",
};

export function brandingPath(name: string) {
  return path.join(branding, name);
}

export function hasFile(p: string) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function companyProfile() {
  const saved = await settingsRepo.get();
  return { ...COMPANY_DEFAULTS, ...saved };
}

export async function loadImageBuffer(url?: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/uploads/")) {
      const abs = storage.resolveLocal(url);
      if (abs && fs.existsSync(abs)) return fs.readFileSync(abs);
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    if (fs.existsSync(url)) return fs.readFileSync(url);
  } catch {
    return null;
  }
  return null;
}

const FLAG_MAP: Record<string, string> = {
  india: "in",
  ind: "in",
  "sri lanka": "lk",
  nigeria: "ng",
  uae: "ae",
  dubai: "ae",
  "united arab emirates": "ae",
  uk: "gb",
  "united kingdom": "gb",
  usa: "us",
  "united states": "us",
  ethiopia: "et",
  guinea: "gn",
  nepal: "np",
  uzbekistan: "uz",
  france: "fr",
  zambia: "zm",
};

export function countryCode(name?: string) {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (n.length === 2) return n;
  return FLAG_MAP[n] || "";
}

export async function loadFlag(name?: string) {
  const code = countryCode(name);
  if (!code) return null;
  return loadImageBuffer(`https://flagcdn.com/w80/${code}.png`);
}

export function newDoc() {
  return new PDFDocument({ size: "A4", margin: 22, info: { Author: "Shree Hari Export House", Creator: "EAMS" } });
}

export function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function drawLetterhead(doc: PDFKit.PDFDocument, company: Record<string, any>, dest?: string) {
  const pageW = doc.page.width;
  const m = 22;
  let y = 18;

  const letterhead = brandingPath("letterhead.png");
  const logo = brandingPath("logo.jpg");

  if (hasFile(letterhead)) {
    try {
      doc.image(letterhead, m, y, { width: pageW - m * 2 - 10, height: 52 });
      y += 56;
    } catch {
      /* fall through */
    }
  } else {
    if (hasFile(logo)) {
      try {
        doc.image(logo, m, y, { width: 42, height: 42 });
      } catch {
        /* ignore */
      }
    }
    doc.fillColor(COLORS.blue).font("Times-Bold").fontSize(18).text(String(company.companyName || "SHREE HARI"), m + 50, y, { width: 220 });
    doc.fillColor("#222").font("Helvetica").fontSize(8).text("EXPORT HOUSE", m + 50, y + 20, { characterSpacing: 2, width: 220 });
    doc.font("Helvetica").fontSize(7).fillColor("#222").text(`Corporate Office : ${company.letterheadAddress || COMPANY_DEFAULTS.letterheadAddress}`, pageW - m - 260, y, { width: 250, align: "left" });
    doc.text(`E-mail : ${(company.emails || COMPANY_DEFAULTS.emails).join(", ")}`, pageW - m - 260, y + 22, { width: 250 });
    doc.text(`Web : ${company.website || COMPANY_DEFAULTS.website}   Ph.: ${company.phone || COMPANY_DEFAULTS.phone}`, pageW - m - 260, y + 32, { width: 250 });
    y += 50;
  }

  doc.save();
  doc.rect(pageW - 10, 16, 6, 54).fill(COLORS.orange);
  doc.restore();

  const inFlag = await loadFlag("India");
  const destFlag = await loadFlag(dest);
  let fx = pageW - m - 70;
  if (destFlag) {
    try {
      doc.image(destFlag, fx, y, { width: 28, height: 18 });
      fx -= 34;
    } catch {
      /* ignore */
    }
  }
  if (inFlag) {
    try {
      doc.image(inFlag, fx, y, { width: 28, height: 18 });
    } catch {
      /* ignore */
    }
  }
  y += 8;
  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor(COLORS.blue).lineWidth(1.2).stroke();
  doc.strokeColor(COLORS.line).lineWidth(0.4);
  return y + 6;
}

export async function drawSeal(doc: PDFKit.PDFDocument, x: number, y: number, w = 110) {
  const seal = brandingPath("seal.png");
  if (hasFile(seal)) {
    try {
      doc.image(seal, x, y, { width: w });
      return;
    } catch {
      /* ignore */
    }
  }
  doc.fillColor(COLORS.blue).font("Helvetica-Bold").fontSize(9).text("Shree Hari Export House", x, y, { width: w });
  doc.font("Helvetica-Oblique").fontSize(10).text("K. V. Patel", x, y + 22, { width: w });
  doc.font("Helvetica-Bold").fontSize(9).text("Partner", x, y + 40, { width: w, align: "right" });
}

export function box(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) doc.save().rect(x, y, w, h).fill(fill).restore();
  doc.rect(x, y, w, h).stroke();
}

export function kv(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, labelW = 52) {
  doc.font("Helvetica").fontSize(8).fillColor("#111").text(`${label} :-`, x, y, { width: labelW, continued: false });
  doc.font("Helvetica-Bold").text(value || " ", x + labelW, y, { width: 140 });
}

export function moneyWords(n: number, currency = "USD") {
  if (!n) return "";
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  function chunk(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`.trim();
    if (num < 1000) return `${ones[Math.floor(num / 100)]} HUNDRED ${chunk(num % 100)}`.trim();
    if (num < 1000000) return `${chunk(Math.floor(num / 1000))} THOUSAND ${chunk(num % 1000)}`.trim();
    return `${chunk(Math.floor(num / 1000000))} MILLION ${chunk(num % 1000000)}`.trim();
  }
  const prefix = currency === "USD" ? "US $ :- " : `${currency} :- `;
  return `${prefix}${chunk(Math.round(n)).replace(/\s+/g, " ").trim()}`;
}
