import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { signIn } from "./service";
import { AuthSchema } from "./model";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export const auth = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .post("/sign-in",
    async ({ body, cookie: { session }, jwt, set }) => {
      const result = await signIn(body);

      if (result.success === false) {
        if (result.reason === "forbidden") {
          set.status = 403;
          return AuthSchema.signInForbidden.const;
        }
        set.status = 400;
        return AuthSchema.signInInvalid.const;
      }

      const token = await jwt.sign({
        codigo: result.codigo,
        nombre: result.nombre,
        isAdmin: result.isAdmin,
      });

      session.value = token;
      return {
        codigo: result.codigo,
        nombre: result.nombre,
        isAdmin: result.isAdmin,
        token,
      };
    },
    {
      body: AuthSchema.signInBody,
      cookie: t.Object({
        session: t.Optional(t.String()),
      }),
      response: {
        200: AuthSchema.signInResponse,
        400: AuthSchema.signInInvalid,
        403: AuthSchema.signInForbidden,
      },
    }
  );