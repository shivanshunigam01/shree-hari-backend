import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";

export { cloudinary };

export type CloudinaryStatus =
  | { ok: true; cloudName: string }
  | { ok: false; reason: "missing_cloud_name" | "missing_credentials" | "ping_failed"; message?: string };

export function cloudinaryConfigured() {
  return Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
}

export function configureCloudinary() {
  if (!cloudinaryConfigured()) return false;
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName.trim(),
    api_key: env.cloudinary.apiKey.trim(),
    api_secret: env.cloudinary.apiSecret.trim(),
    secure: true,
  });
  return true;
}

export async function pingCloudinary(): Promise<CloudinaryStatus> {
  if (!env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    return { ok: false, reason: "missing_credentials" };
  }
  if (!env.cloudinary.cloudName) {
    return { ok: false, reason: "missing_cloud_name" };
  }
  configureCloudinary();
  try {
    await cloudinary.api.ping();
    return { ok: true, cloudName: env.cloudinary.cloudName.trim() };
  } catch (err: any) {
    const message = err?.error?.message || err?.message || "Cloudinary ping failed";
    return { ok: false, reason: "ping_failed", message };
  }
}
