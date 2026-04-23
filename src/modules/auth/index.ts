import { Elysia, t, status } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { rateLimit } from "elysia-rate-limit";
import { login, loginJudge, register, listUsers, updateUser, deleteUser } from "./service";
import { config } from "../../config";
import { captureMessage } from "../../lib/error-tracker";
import { getCurrentRequestId } from "../../lib/logger";
import { AuthSchema } from "./schema";
import { cookieSchema } from "./common";

export type AllowedRole = "admin" | "eventManager" | "judge";

export const auth = new Elysia({ name: "auth", prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwt.secret }))
  .macro({
    auth: {
      async resolve({ cookie: { session }, jwt, request }) {
        const h = request.headers.get("authorization");
        const bearerToken = h?.startsWith("Bearer ") ? h.slice(7) : null;
        const raw = bearerToken ?? session?.value;
        if (typeof raw !== "string") return status(401, AuthSchema.unauthorized.const);
        const user = await jwt.verify(raw);
        if (!user) return status(401, AuthSchema.unauthorized.const);
        return { user };
      },
    },
    authorize: (roles: AllowedRole | AllowedRole[]) => ({
      // Cast required: Elysia macro beforeHandle receives untyped context
      beforeHandle: ((ctx: any) => {
        const allowed = Array.isArray(roles) ? roles : [roles];
        if (!ctx.user || !allowed.includes(ctx.user.role)) {
          ctx.set.status = 403;
          return AuthSchema.forbidden.const;
        }
      }) as any,
    }),
    authorizeEvent: (roles: AllowedRole | AllowedRole[]) => ({
      // Cast required: Elysia macro beforeHandle receives untyped context
      beforeHandle: ((ctx: any) => {
        const allowed = Array.isArray(roles) ? roles : [roles];
        if (!ctx.user || !allowed.includes(ctx.user.role)) {
          ctx.set.status = 403;
          return AuthSchema.forbidden.const;
        }
        if (ctx.user.role === "admin") return;
        if (ctx.user.role === "eventManager" && ctx.user.managedEventoIds?.includes(ctx.params.id)) return;
        if (ctx.user.role === "judge" && ctx.user.eventoId === ctx.params.id) return;
        ctx.set.status = 403;
        return AuthSchema.forbidden.const;
      }) as any,
    }),
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
      const payload: Record<string, unknown> = {
        codigo: result.codigo,
        nombre: result.nombre,
        role: result.role,
      };
      if (result.managedEventoIds) {
        payload.managedEventoIds = result.managedEventoIds;
      }
      const token = await jwt.sign(payload);
      session.set({
        value: token,
        httpOnly: true,
        path: "/",
      });
      return { codigo: result.codigo, nombre: result.nombre, role: result.role, token };
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
  .use(
    new Elysia()
      .use(jwt({ name: "jwt", secret: config.jwt.secret }))
      .use(
        rateLimit({
          max: 15,
          duration: 15 * 60_000,
          scoping: "scoped",
        } as Parameters<typeof rateLimit>[0])
      )
      .post(
        "/login/judge",
        async ({ body, cookie: { session }, jwt, set }) => {
          const result = await loginJudge(body);
          if (!result.success) {
            set.status = 400;
            return AuthSchema.loginInvalid.const;
          }
          const token = await jwt.sign({
            codigo: result.codigo,
            nombre: result.nombre,
            role: result.role,
            eventoId: result.eventoId,
          });
          session.set({
            value: token,
            httpOnly: true,
            path: "/",
          });
          return { codigo: result.codigo, nombre: result.nombre, role: result.role, token };
        },
        {
          body: t.Object({ codigo: t.String(), pin: t.String() }),
          cookie: cookieSchema,
          response: {
            200: AuthSchema.loginResponse,
            400: AuthSchema.loginInvalid,
          },
        }
      )
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
    async ({ body, set }) => {
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
      authorize: "admin",
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
    async () => listUsers(),
    {
      auth: true,
      authorize: "admin",
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
    async ({ body, params: { codigo }, set }) => {
      const result = await updateUser(codigo, body);
      if (!result.success) {
        set.status = 404;
        return AuthSchema.userNotFound.const;
      }
      return result.user;
    },
    {
      auth: true,
      authorize: "admin",
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
    async ({ params: { codigo }, set }) => {
      const result = await deleteUser(codigo);
      if (!result.success) {
        set.status = 404;
        return AuthSchema.userNotFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: { 204: t.Undefined(), 401: AuthSchema.unauthorized, 403: AuthSchema.forbidden, 404: AuthSchema.userNotFound },
    }
  );
