import mongoose from "mongoose";
import { env } from "./env.js";
import { loadJsonDb } from "../db/json.js";

export let dbMode: "mongo" | "file" = "file";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  if (process.env.FORCE_JSON_DB === "1") {
    dbMode = "file";
    loadJsonDb();
    console.warn("FORCE_JSON_DB=1 — using local JSON database");
    return;
  }
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 2000 });
    dbMode = "mongo";
    console.log("MongoDB connected:", env.mongoUri);
    return;
  } catch {
    dbMode = "file";
    loadJsonDb();
    console.warn("MongoDB is not running. Using local JSON database at backend/data/db.json (fully functional; install MongoDB or set MONGODB_URI for production).");
  }
}
