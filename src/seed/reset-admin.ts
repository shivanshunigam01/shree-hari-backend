import { env } from "../config/env.js";
import { connectDb } from "../config/db.js";
import { usersRepo, hashPassword } from "../repos/users.js";

async function resetAdmin() {
  await connectDb();
  const email = env.adminEmail.toLowerCase().trim();
  const passwordHash = await hashPassword(env.adminPassword);
  const existing = await usersRepo.findByEmail(email);

  if (existing) {
    await usersRepo.save(existing, { name: env.adminName, passwordHash, active: true, role: "super_admin" as const });
    console.log(`Reset password for existing admin ${env.adminName} <${email}>`);
  } else {
    await usersRepo.create({
      name: env.adminName,
      email,
      passwordHash,
      role: "super_admin",
      countries: ["ALL"],
      active: true,
    });
    console.log(`Created admin ${email}`);
  }

  console.log("You can now sign in with ADMIN_EMAIL / ADMIN_PASSWORD from .env");
  process.exit(0);
}

resetAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
