import { t, type UnwrapSchema } from "elysia";

export const AuthSchema = {
  signInBody: t.Object({
    codigo: t.String(),
    password: t.String(),
  }),
  signInResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    isAdmin: t.Boolean(),
    token: t.String(),
  }),
  signInInvalid: t.Literal("Código o contraseña incorrectos"),
  signInForbidden: t.Literal("User not allowed to access this application"),
} as const;

export type AuthModel = {
  [k in keyof typeof AuthSchema]: UnwrapSchema<(typeof AuthSchema)[k]>;
};

type SignInSuccess = { success: true } & Omit<AuthModel["signInResponse"], "token">;

type SignInForbidden = {
  success: false;
  reason: "forbidden";
};

type SignInInvalid = {
  success: false;
  reason: "invalid";
};

export type SignInResult = SignInSuccess | SignInForbidden | SignInInvalid;