import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { applicationsRouter } from "./routes/applications.js";
import { mastersRouter, notificationsRouter } from "./routes/masters.js";
import {
  dashboardRouter,
  auditRouter,
  reportsRouter,
  settingsRouter,
  documentsPublicRouter,
  uploadsRouter,
  billingRouter,
} from "./routes/ops.js";
import { errorHandler, notFound } from "./middleware/auth.js";
import { ok } from "./lib/http.js";
import { dbMode } from "./config/db.js";
import { pingCloudinary } from "./config/cloudinary.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const openapi = JSON.parse(
  fs.readFileSync(path.join(here, "openapi.json"), "utf8"),
);

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Reflect any Origin so browser/desktop clients can call the API (needed when credentials is true; "*" cannot be used).
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      optionsSuccessStatus: 204,
    }),
  );
  app.use(express.json({ limit: "4mb" }));
  app.use("/uploads", express.static(path.resolve(here, "../uploads")));

  app.get("/api/health", async (_req, res) => {
    const cloudinary = await pingCloudinary();
    return ok(res, {
      status: "ok",
      database: dbMode,
      environment: env.nodeEnv,
      uptime: process.uptime(),
      cloudinary: cloudinary.ok
        ? { connected: true, cloudName: cloudinary.cloudName }
        : {
            connected: false,
            reason: cloudinary.reason,
            message: cloudinary.message,
          },
    });
  });

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/masters", mastersRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/documents", documentsPublicRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/billing", billingRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
