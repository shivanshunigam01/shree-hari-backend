import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { seedIfEmpty } from "./seed/index.js";
import { env } from "./config/env.js";
import { pingCloudinary } from "./config/cloudinary.js";

async function start() {
  try {
    await connectDb();
    await seedIfEmpty();
    const cloudinary = await pingCloudinary();
    if (cloudinary.ok) {
      console.log(`Cloudinary connected (${cloudinary.cloudName})`);
    } else if (cloudinary.reason === "missing_cloud_name") {
      console.warn(
        "Cloudinary key/secret are set, but CLOUDINARY_CLOUD_NAME is missing. Copy Cloud name from Cloudinary Dashboard → Product environment credentials. “Root” is the API key name, not the cloud name.",
      );
    } else {
      console.warn("Cloudinary not connected:", cloudinary.reason, cloudinary.message || "");
    }
    const app = createApp();
    app.listen(env.port, () => {
      console.log(`Shreehari Export API running on http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error("Failed to start backend:", err);
    process.exit(1);
  }
}

start();
