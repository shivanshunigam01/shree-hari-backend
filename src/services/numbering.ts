import { applicationsRepo } from "../repos/applications.js";
import { countersRepo } from "../repos/ops.js";

export const numbering = {
  async application() {
    return applicationsRepo.nextAppNo();
  },
  async invoice() {
    const n = await countersRepo.next("EXP");
    return `EXP ${n}`;
  },
  async proforma() {
    const n = await countersRepo.next("PI");
    return `PI-${String(n).padStart(4, "0")}`;
  },
  async billing() {
    const n = await countersRepo.next("BILL");
    return `BL-${String(n).padStart(4, "0")}`;
  },
};
