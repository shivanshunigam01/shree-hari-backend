import multer from "multer";
import path from "node:path";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http.js";

const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx", ".webp"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new HttpError(400, "File type is not allowed", "BAD_REQUEST"));
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith("image/")) {
      return cb(new HttpError(400, "MIME type is not allowed", "BAD_REQUEST"));
    }
    cb(null, true);
  },
});

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function assertImage(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    throw new HttpError(400, "Only JPG, PNG or WEBP images are allowed", "BAD_REQUEST");
  }
}
