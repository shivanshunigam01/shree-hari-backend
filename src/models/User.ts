import mongoose, { Schema } from "mongoose";
import { ROLES, type AppRole } from "../lib/roles.js";

export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  department?: string;
  countries: string[];
  permissions?: string[];
  active: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: "documentation" },
    department: String,
    countries: { type: [String], default: [] },
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ role: 1, active: 1 });

export const User = mongoose.model<UserDoc>("User", userSchema);
