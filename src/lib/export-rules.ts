import { settingsRepo } from "../repos/ops.js";

export function defaultDocumentYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export async function resolveDocumentYear() {
  const settings = await settingsRepo.get();
  const fromSettings = String(settings.documentYear || "").trim();
  return fromSettings || defaultDocumentYear();
}

export function destIsNepalBhutan(dest?: string | null) {
  const n = String(dest || "").toLowerCase();
  return n.includes("nepal") || n.includes("bhutan") || n === "np" || n === "bt";
}

export function countryMatches(portCountry?: string, dest?: string) {
  const a = String(portCountry || "").trim().toLowerCase();
  const b = String(dest || "").trim().toLowerCase();
  if (!a || !b) return true;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  return false;
}

export function isIndiaPort(country?: string) {
  const n = String(country || "").trim().toLowerCase();
  return !n || n === "india" || n === "in" || n.includes("india");
}

export function formatInr(n: number) {
  const num = Number(n) || 0;
  const [intRaw, dec = "00"] = num.toFixed(2).split(".");
  const last3 = intRaw.slice(-3);
  const rest = intRaw.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `₹ ${grouped}.${dec}`;
}

export function indianMoneyWords(n: number) {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  function chunk(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`.trim();
    if (num < 1000) return `${ones[Math.floor(num / 100)]} HUNDRED ${chunk(num % 100)}`.trim();
    if (num < 100000) return `${chunk(Math.floor(num / 1000))} THOUSAND ${chunk(num % 1000)}`.trim();
    if (num < 10000000) return `${chunk(Math.floor(num / 100000))} LAKH ${chunk(num % 100000)}`.trim();
    return `${chunk(Math.floor(num / 10000000))} CRORE ${chunk(num % 10000000)}`.trim();
  }
  return `INR :- ${chunk(Math.round(n)).replace(/\s+/g, " ").trim()} ONLY`;
}

export function computeTotals(body: any) {
  const items = body.items ?? [];
  const extras =
    (Number(body.loading_charge) || 0) +
    (Number(body.price_increase) || 0) +
    (Number(body.freight) || 0);
  const goods = items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0);
  const total_amount = goods + extras;
  const total_packages = items.reduce((s: number, it: any) => s + (Number(it.packages) || 0), 0);
  const total_net_weight = items.reduce((s: number, it: any) => s + (Number(it.net_weight) || 0), 0);
  const total_gross_weight = items.reduce((s: number, it: any) => s + (Number(it.gross_weight) || 0), 0);
  const rate = Number(body.exchange_rate) || 0;
  const fx_amount = total_amount;
  const inr_amount = rate ? Number((fx_amount * rate).toFixed(2)) : Number(body.inr_amount) || 0;
  const containers = (body.containers ?? []).map((c: any) => {
    const cargo = Number(c.gross_weight || total_gross_weight || 0);
    const tare = Number(c.tare_weight || 0);
    const vgm = Number(c.vgm_weight) || (cargo && tare ? cargo + tare : cargo);
    return { ...c, vgm_weight: vgm || c.vgm_weight };
  });
  return {
    total_amount,
    total_packages,
    total_net_weight,
    total_gross_weight,
    fx_amount,
    inr_amount,
    containers,
  };
}

export function sealsVerified(containers: any[] = []) {
  const used = containers.filter((c) => String(c.container_no || "").trim());
  if (!used.length) return true;
  return used.every((c) => c.line_seal_photo_url && c.electronic_seal_photo_url);
}

export function fxAmountsMatch(fxAmount: number, rate: number, inrAmount: number) {
  if (!rate) return false;
  const expected = Number((fxAmount * rate).toFixed(2));
  return Math.abs(expected - Number(inrAmount || 0)) <= 1;
}
