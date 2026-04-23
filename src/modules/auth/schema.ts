import { t, type UnwrapSchema } from "elysia";

export const AuthSchema = {
  loginBody: t.Object({
    codigo: t.String(),
    password: t.String(),
  }),
  loginResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    role: t.Union([t.Literal("admin"), t.Literal("eventManager"), t.Literal("judge")]),
    token: t.String(),
  }),
  loginInvalid: t.Literal("Código o contraseña incorrectos"),
  loginForbidden: t.Literal("User not allowed to access this application"),

  registerBody: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    role: t.Optional(t.Union([t.Literal("admin"), t.Literal("eventManager")])),
  }),
  registerResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    role: t.Union([t.Literal("admin"), t.Literal("eventManager")]),
  }),
  registerConflict: t.Literal("User already exists"),

  updateBody: t.Object({
    nombre: t.Optional(t.String()),
    role: t.Optional(t.Union([t.Literal("admin"), t.Literal("eventManager")])),
  }),
  updateResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    role: t.Union([t.Literal("admin"), t.Literal("eventManager")]),
  }),
  userNotFound: t.Literal("User not found"),
  usersListResponse: t.Array(
    t.Object({
      codigo: t.String(),
      nombre: t.String(),
      role: t.Union([t.Literal("admin"), t.Literal("eventManager")]),
    })
  ),

  unauthorized: t.Literal("Unauthorized"),
  forbidden: t.Literal("Forbidden"),
} as const;

export type AuthModel = {
  [k in keyof typeof AuthSchema]: UnwrapSchema<(typeof AuthSchema)[k]>;
};

type LoginSuccess = {
  success: true;
  codigo: string;
  nombre: string;
  role: "admin" | "eventManager" | "judge";
  managedEventoIds?: string[];
  eventoId?: string;
};
type LoginForbidden = { success: false; reason: "forbidden" };
type LoginInvalid = { success: false; reason: "invalid" };
export type LoginResult = LoginSuccess | LoginForbidden | LoginInvalid;
