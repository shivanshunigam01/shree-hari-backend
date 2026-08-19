import { countersRepo } from "../repos/ops.js";
import { applicationsRepo } from "../repos/applications.js";
import { resolveDocumentYear } from "../lib/export-rules.js";

export const numbering = {
  async year() {
    return resolveDocumentYear();
  },
  async application() {
    return applicationsRepo.nextAppNo();
  },
  async invoice() {
    const year = await resolveDocumentYear();
    const n = await countersRepo.next(`EXP:${year}`);
    return `EXP ${n}/${year}`;
  },
  async proforma() {
    const year = await resolveDocumentYear();
    const n = await countersRepo.next(`PI:${year}`);
    return `PI-${year}-${String(n).padStart(4, "0")}`;
  },
  async inrInvoice() {
    const year = await resolveDocumentYear();
    const n = await countersRepo.next(`INR:${year}`);
    return `INR ${n}/${year}`;
  },
  async billing() {
    const year = await resolveDocumentYear();
    const n = await countersRepo.next(`BILL:${year}`);
    return `BL-${year}-${String(n).padStart(4, "0")}`;
  },
};
