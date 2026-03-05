import mongoose from "mongoose";

export interface User {
  codigo: string;
  nombre: string;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<User>(
  {
    codigo: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<User>("User", userSchema);
