import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { cloudinary, cloudinaryConfigured, configureCloudinary } from "../config/cloudinary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
export const uploadRoot = path.join(root, "uploads");

export interface StoredFile {
  url: string;
  storage: "cloudinary" | "local";
  publicId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  absolutePath?: string;
}

async function saveLocal(buffer: Buffer, folder: string, originalName: string, mimeType: string): Promise<StoredFile> {
  const ext = path.extname(originalName) || "";
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  const dir = path.join(uploadRoot, folder);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, buffer);
  return {
    url: `/uploads/${folder}/${fileName}`,
    storage: "local",
    fileName: originalName,
    mimeType,
    fileSize: buffer.length,
    absolutePath,
  };
}

async function saveCloudinary(buffer: Buffer, folder: string, originalName: string, mimeType: string): Promise<StoredFile> {
  configureCloudinary();
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(dataUri, {
    folder: `shreehari/${folder}`,
    resource_type: mimeType.startsWith("image/") ? "image" : "auto",
    format: mimeType.startsWith("image/") ? "jpg" : undefined,
    use_filename: true,
    unique_filename: true,
  });
  return {
    url: uploaded.secure_url,
    storage: "cloudinary",
    publicId: uploaded.public_id,
    fileName: originalName,
    mimeType,
    fileSize: buffer.length,
  };
}

export const storage = {
  enabledCloudinary() {
    return cloudinaryConfigured();
  },
  async save(buffer: Buffer, opts: { folder: string; originalName: string; mimeType: string }): Promise<StoredFile> {
    if (this.enabledCloudinary()) {
      try {
        return await saveCloudinary(buffer, opts.folder, opts.originalName, opts.mimeType);
      } catch (err) {
        console.warn("Cloudinary upload failed, using local storage:", (err as Error).message);
      }
    }
    return saveLocal(buffer, opts.folder, opts.originalName, opts.mimeType);
  },
  async remove(file: { url?: string; publicId?: string; storage?: string }) {
    if (file.storage === "cloudinary" && file.publicId) {
      try {
        configureCloudinary();
        await cloudinary.uploader.destroy(file.publicId, { resource_type: "image" });
      } catch {
        try {
          configureCloudinary();
          await cloudinary.uploader.destroy(file.publicId, { resource_type: "raw" });
        } catch (err) {
          console.warn("Cloudinary delete failed:", (err as Error).message);
        }
      }
    }
    const local = file.url ? this.resolveLocal(file.url) : null;
    if (local) {
      await fs.unlink(local).catch(() => undefined);
    }
  },
  resolveLocal(url: string) {
    if (!url.startsWith("/uploads/")) return null;
    return path.join(root, url.replace(/^\//, ""));
  },
};
