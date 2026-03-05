import { t, type UnwrapSchema } from "elysia";

export const AuthSchema = {
  loginBody: t.Object({
    codigo: t.String(),
    password: t.String(),
  }),
  loginResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    isAdmin: t.Boolean(),
    token: t.String(),
  }),
  loginInvalid: t.Literal("Código o contraseña incorrectos"),
  loginForbidden: t.Literal("User not allowed to access this application"),

  registerBody: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    isAdmin: t.Optional(t.Boolean()),
  }),
  registerResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    isAdmin: t.Boolean(),
  }),
  registerConflict: t.Literal("User already exists"),

  updateBody: t.Object({
    nombre: t.Optional(t.String()),
    isAdmin: t.Optional(t.Boolean()),
  }),
  updateResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    isAdmin: t.Boolean(),
  }),
  userNotFound: t.Literal("User not found"),
  usersListResponse: t.Array(
    t.Object({
      codigo: t.String(),
      nombre: t.String(),
      isAdmin: t.Boolean(),
    })
  ),

  unauthorized: t.Literal("Unauthorized"),
  forbidden: t.Literal("Forbidden"),
} as const;

export type AuthModel = {
  [k in keyof typeof AuthSchema]: UnwrapSchema<(typeof AuthSchema)[k]>;
};

type LoginSuccess = { success: true } & Omit<AuthModel["loginResponse"], "token">;
type LoginForbidden = { success: false; reason: "forbidden" };
type LoginInvalid = { success: false; reason: "invalid" };
export type LoginResult = LoginSuccess | LoginForbidden | LoginInvalid;
