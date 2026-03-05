import { t } from "elysia";
import { AuthSchema } from "./schema";

export const cookieSchema = t.Cookie({
  session: t.Optional(t.String()),
});

export const sharedAuthResponses = {
  401: AuthSchema.unauthorized,
  403: AuthSchema.forbidden,
};
