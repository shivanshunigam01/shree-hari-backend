import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { authJwt, type AuthedRequest } from "../middleware/auth.js";
import { usersRepo, checkPassword } from "../repos/users.js";
import { writeAudit } from "../services/audit.js";
import { fail, ok, zodErrors } from "../lib/http.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === "production" ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv !== "production",
  handler: (_req, res) => fail(res, 429, "Too many login attempts. Try again later.", "RATE_LIMIT"),
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Email and password are required", "VALIDATION_ERROR", zodErrors(parsed.error.issues));

  const email = parsed.data.email.toLowerCase().trim();
  const user = await usersRepo.findByEmail(email);
  if (!user) return fail(res, 401, "Invalid email or password", "UNAUTHORIZED");
  if (user.active === false) return fail(res, 403, "This staff account is deactivated", "FORBIDDEN");

  const okPass = await checkPassword(parsed.data.password, usersRepo.passwordOf(user));
  if (!okPass) return fail(res, 401, "Invalid email or password", "UNAUTHORIZED");

  await usersRepo.save(user, { lastLoginAt: new Date().toISOString() as any });
  const pub = usersRepo.public(user);
  const token = signToken(pub.id);
  await writeAudit({
    user: { id: pub.id, name: pub.name, email: pub.email, role: pub.role, countries: pub.countries, permissions: pub.permissions },
    action: "LOGIN",
    entityType: "user",
    entityId: pub.id,
    description: `${pub.email} signed in`,
    ip: req.ip,
  });
  return ok(res, { token, user: pub }, "Signed in");
});

authRouter.get("/me", authJwt, async (req: AuthedRequest, res) => {
  const user = await usersRepo.findById(req.user!.id);
  if (!user || user.active === false) return fail(res, 401, "Account is inactive", "UNAUTHORIZED");
  return ok(res, { user: usersRepo.public(user) });
});

authRouter.post("/logout", authJwt, async (req: AuthedRequest, res) => {
  await writeAudit({
    user: req.user,
    action: "LOGOUT",
    entityType: "user",
    entityId: req.user!.id,
    description: `${req.user!.email} signed out`,
    ip: req.ip,
  });
  return ok(res, { ok: true }, "Signed out");
});

authRouter.post("/refresh", authJwt, async (req: AuthedRequest, res) => {
  const token = signToken(req.user!.id);
  return ok(res, { token, user: req.user }, "Token refreshed");
});
