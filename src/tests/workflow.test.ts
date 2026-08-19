import { describe, it, expect, beforeAll } from "vitest";
process.env.FORCE_JSON_DB = "1";
import request from "supertest";
import { connectDb } from "../config/db.js";
import { seedIfEmpty } from "../seed/index.js";
import { createApp } from "../app.js";
import { loadJsonDb } from "../db/json.js";

const app = createApp();
let adminToken = "";
let staffToken = "";
let appId = "";

beforeAll(async () => {
  loadJsonDb();
  await connectDb();
  await seedIfEmpty();
});

describe("auth", () => {
  it("logs in admin", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@srihari.co", password: "Admin@1234" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    adminToken = res.body.data.token;
    expect(adminToken).toBeTruthy();
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@srihari.co", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("logs in staff", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "employee@srihari.co", password: "Staff@1234" });
    expect(res.status).toBe(200);
    staffToken = res.body.data.token;
  });

  it("rejects missing token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("rbac + country", () => {
  it("admin can list users", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("staff cannot create users", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ name: "X", email: "x@srihari.co", password: "Secret@1", role: "viewer" });
    expect(res.status).toBe(403);
  });
});

describe("applications workflow", () => {
  it("staff creates draft", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        consignee_name: "Test Buyer",
        final_destination_text: "USA",
        country_id: "USA",
        items: [{ description: "EASTERN PAN", quantity: 10, unit: "PCS", rate: 3.2, amount: 32 }],
      });
    expect(res.status).toBe(201);
    appId = res.body.data.id;
    expect(res.body.data.app_no).toMatch(/^SHE/);
    expect(res.body.data.status).toBe("DRAFT");
  });

  it("staff submits", async () => {
    const res = await request(app).post(`/api/applications/${appId}/submit`).set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("UNDER_REVIEW");
  });

  it("staff cannot approve own application", async () => {
    const res = await request(app)
      .post(`/api/applications/${appId}/approve`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ comment: "ok" });
    expect([403, 401]).toContain(res.status);
  });

  it("admin approves", async () => {
    const res = await request(app)
      .post(`/api/applications/${appId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ comment: "Customer and invoice details verified." });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("APPROVED");
  });

  it("invalid transition is rejected", async () => {
    const res = await request(app)
      .post(`/api/applications/${appId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ comment: "again" });
    expect(res.status).toBe(409);
  });
});

describe("documents", () => {
  it("rejects invalid file type", async () => {
    const res = await request(app)
      .post(`/api/applications/${appId}/documents`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("MZ"), "virus.exe");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
