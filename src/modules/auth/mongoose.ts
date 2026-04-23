import mongoose from "mongoose";

export type UserRole = "admin" | "eventManager";

export interface User {
  codigo: string;
  nombre: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<User>(
  {
    codigo: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    role: { type: String, enum: ["admin", "eventManager"], default: "eventManager" },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<User>("User", userSchema);
