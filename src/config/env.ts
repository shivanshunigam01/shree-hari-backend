import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

function firstToken(value: string) {
  return value.trim().split(/\s+/)[0];
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: firstToken(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shreehari_export"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:8080",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8080",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@srihari.co").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@1234",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
  },
};

export function isProd() {
  return env.nodeEnv === "production";
}
