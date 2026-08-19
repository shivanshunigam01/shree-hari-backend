import { env } from "../config/env.js";
import { usersRepo, hashPassword } from "../repos/users.js";
import { mastersRepo } from "../repos/masters.js";
import { settingsRepo } from "../repos/ops.js";
import { COMPANY_DEFAULTS } from "../constants/company.js";

export async function seedIfEmpty() {
  if ((await usersRepo.count()) === 0) {
    await usersRepo.create({
      name: "Arjun Patel",
      email: env.adminEmail,
      passwordHash: await hashPassword(env.adminPassword),
      role: "super_admin",
      countries: ["ALL"],
      active: true,
    });
    await usersRepo.create({
      name: "Rahul Mehta",
      email: "employee@srihari.co",
      passwordHash: await hashPassword("Staff@1234"),
      role: "documentation",
      countries: ["USA", "Nigeria", "Sri Lanka"],
      active: true,
    });
    console.log(`Seeded Super Admin ${env.adminEmail} / ${env.adminPassword}`);
    console.log("Seeded staff employee@srihari.co / Staff@1234");
  }

  const countries = (await mastersRepo.list("countries")) ?? [];
  if (!countries.length) {
    for (const row of [
      { name: "India", code: "IN", is_demo: true },
      { name: "Sri Lanka", code: "LK", is_demo: true },
      { name: "Nigeria", code: "NG", is_demo: true },
      { name: "UAE", code: "AE", is_demo: true },
      { name: "United Kingdom", code: "GB", is_demo: true },
      { name: "USA", code: "US", is_demo: true },
      { name: "Nepal", code: "NP", is_demo: true },
      { name: "Bhutan", code: "BT", is_demo: true },
    ]) {
      await mastersRepo.create("countries", row);
    }
  }

  const customers = (await mastersRepo.list("customers")) ?? [];
  if (!customers.length) {
    await mastersRepo.create("customers", {
      name: "NEROS TRADING ONE MEMBER PLC",
      contact_person: "Haben Rezene",
      email: "Habenrezene@gmail.com",
      phone: "0963777777",
      city: "Addis Ababa",
      country: "Ethiopia",
      address: "LIDETA SUBCITY WOREDA 09 HOUSE NO.B006/102, ADDIS ABABA ETHIOPIA",
      tax_id: "0102471561",
      is_demo: true,
    });
    await mastersRepo.create("customers", {
      name: "Ceylon Trading Co.",
      contact_person: "Nimal Perera",
      email: "nimal@ceylon.example",
      city: "Colombo",
      country: "Sri Lanka",
      phone: "+94 11 234 5678",
      is_demo: true,
    });
    await mastersRepo.create("customers", {
      name: "Lagos Sanitary Imports Ltd.",
      contact_person: "Adaobi Okonkwo",
      city: "Lagos",
      country: "Nigeria",
      is_demo: true,
    });
  }

  const products = (await mastersRepo.list("products")) ?? [];
  if (!products.length) {
    await mastersRepo.create("products", {
      name: "GOLDEN DRAGON FULL SEAT",
      hsn_code: "69109000",
      unit: "SET",
      default_rate: 42,
      dimensions: "(H:790 MM, L:660 MM, W:350 MM) ONE PCS",
      description: "Ceramic sanitary ware — demo seed",
      is_demo: true,
    });
    await mastersRepo.create("products", {
      name: "EASTERN PAN",
      hsn_code: "69101000",
      unit: "PCS",
      default_rate: 3.2,
      description: "Ceramic sanitary ware — demo seed",
      is_demo: true,
    });
    await mastersRepo.create("products", {
      name: "AQUA PEDESTAL WASH BASIN SET",
      hsn_code: "69109000",
      unit: "SET",
      default_rate: 18,
      is_demo: true,
    });
  }

  const ports = (await mastersRepo.list("ports")) ?? [];
  if (!ports.length) {
    await mastersRepo.create("ports", { name: "KANDLA", code: "INIXY", port_type: "sea", country: "India", address: "Kandla Port, Kutch, Gujarat, India", is_demo: true });
    await mastersRepo.create("ports", { name: "MUNDRA", code: "INMUN", port_type: "sea", country: "India", address: "Mundra Port, Kutch, Gujarat, India", is_demo: true });
    await mastersRepo.create("ports", { name: "RAXAUL", code: "INRXL", port_type: "land", country: "India", address: "Raxaul LCS, Bihar, India", is_demo: true });
    await mastersRepo.create("ports", { name: "BIRGUNJ", code: "NPBIR", port_type: "land", country: "Nepal", address: "Birgunj ICD, Nepal", is_demo: true });
    await mastersRepo.create("ports", { name: "DJIBOUTI SEA PORT", code: "DJJIB", port_type: "sea", country: "Djibouti", is_demo: true });
    await mastersRepo.create("ports", { name: "Jebel Ali", code: "AEJEA", port_type: "sea", country: "UAE", is_demo: true });
  }

  const lines = (await mastersRepo.list("shipping_lines")) ?? [];
  if (!lines.length) {
    await mastersRepo.create("shipping_lines", { name: "Maersk", code: "MAEU", is_demo: true });
    await mastersRepo.create("shipping_lines", { name: "MSC", code: "MSCU", is_demo: true });
  }

  const banks = (await mastersRepo.list("banks")) ?? [];
  if (!banks.length) {
    await mastersRepo.create("banks", {
      bank_name: "ICICI BANK",
      account_no: "249805501181",
      swift_code: "ICICINBBCTS",
      ifsc_code: "ICIC0002498",
      branch: "ISHAN CERAMIC ZONE, NATIONAL HIGHWAY 8-A, LALPUR, MORBI-363642",
      is_demo: true,
    });
  }

  const suppliers = (await mastersRepo.list("suppliers")) ?? [];
  if (!suppliers.length) {
    await mastersRepo.create("suppliers", {
      name: "DUCK SANITARYWARE LLP",
      gst_no: "24AAVFD3915G1ZC",
      factory_address: "SURVEY NO. 5 P2, 3, OPP. UNCHI MANDAL, TALAVIYA SHANALA ROAD, HALVAD ROAD, MORBI, GUJARAT-363642",
      country: "India",
      is_demo: true,
    });
  }

  await settingsRepo.save({ ...COMPANY_DEFAULTS, ...(await settingsRepo.get()) });

  if (process.env.FORCE_JSON_DB !== "1") {
    const { seedDemoPack } = await import("./demo-pack.js");
    await seedDemoPack();
  }
}

if (process.argv[1]?.includes("seed")) {
  const { connectDb } = await import("../config/db.js");
  await connectDb();
  await seedIfEmpty();
  console.log("Seed complete");
  process.exit(0);
}
