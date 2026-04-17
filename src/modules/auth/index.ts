import { Elysia, t, status } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { login, register, listUsers, updateUser, deleteUser } from "./service";
import { config } from "../../config";
import { captureMessage } from "../../lib/error-tracker";
import { getCurrentRequestId } from "../../lib/logger";
import { AuthSchema } from "./schema";
import { cookieSchema } from "./common";

export const auth = new Elysia({ name: "auth", prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwt.secret }))
  .derive(({ request }) => {
    const h = request.headers.get("authorization");
    return { bearerToken: h?.startsWith("Bearer ") ? h.slice(7) : null };
  })
  .macro({
    auth: {
      async resolve({ cookie: { session }, jwt, bearerToken }) {
        const raw = bearerToken ?? session?.value;
        if (typeof raw !== "string") return status(401, AuthSchema.unauthorized.const);
        const user = await jwt.verify(raw);
        if (!user) return status(401, AuthSchema.unauthorized.const);
        return { user };
      },
    },
  })
  .post(
    "/login",
    async ({ body, cookie: { session }, jwt, set }) => {
      const result = await login(body);
      if (!result.success) {
        const forbidden = result.reason === "forbidden";
        set.status = forbidden ? 403 : 400;
        return forbidden ? AuthSchema.loginForbidden.const : AuthSchema.loginInvalid.const;
      }
      const token = await jwt.sign({
        codigo: result.codigo,
        nombre: result.nombre,
        isAdmin: result.isAdmin,
      });
      session.set({
        value: token,
        httpOnly: true,
        path: "/",
      });
      return { codigo: result.codigo, nombre: result.nombre, isAdmin: result.isAdmin, token };
    },
    {
      body: AuthSchema.loginBody,
      cookie: cookieSchema,
      response: {
        200: AuthSchema.loginResponse,
        400: AuthSchema.loginInvalid,
        403: AuthSchema.loginForbidden,
      },
    }
  )
  .post(
    "/logout",
    async ({ cookie: { session }, set }) => {
      session.remove();
      set.status = 204;
    },
    { cookie: cookieSchema, response: { 204: t.Undefined() } }
  )
  .post(
    "/register",
    async ({ body, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const result = await register(body);
      if (!result.success) {
        captureMessage("Auth user registration failed: user already exists", "warning", {
          requestId: getCurrentRequestId(),
          tags: { flow: "auth_register", reason: "conflict" },
        });
        set.status = 409;
        return AuthSchema.registerConflict.const;
      }
      set.status = 201;
      return result.user;
    },
    {
      auth: true,
      body: AuthSchema.registerBody,
      cookie: cookieSchema,
      response: {
        201: AuthSchema.registerResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        409: AuthSchema.registerConflict,
      },
    }
  )
  .get(
    "/users",
    async ({ user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      return listUsers();
    },
    {
      auth: true,
      cookie: cookieSchema,
      response: {
        200: AuthSchema.usersListResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
      },
    }
  )
  .patch(
    "/users/:codigo",
    async ({ body, params: { codigo }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const result = await updateUser(codigo, body);
      if (!result.success) {
        set.status = 404;
        return AuthSchema.userNotFound.const;
      }
      return result.user;
    },
    {
      auth: true,
      body: AuthSchema.updateBody,
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        200: AuthSchema.updateResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: AuthSchema.userNotFound,
      },
    }
  )
  .delete(
    "/users/:codigo",
    async ({ params: { codigo }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const result = await deleteUser(codigo);
      if (!result.success) {
        set.status = 404;
        return AuthSchema.userNotFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: { 204: t.Undefined(), 401: AuthSchema.unauthorized, 403: AuthSchema.forbidden, 404: AuthSchema.userNotFound },
    }
  );
