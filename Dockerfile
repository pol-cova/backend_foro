# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production

FROM base AS runner
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY ./src ./src
COPY ./seeds ./seeds
COPY ./scripts ./scripts
EXPOSE 3145
CMD ["bun", "run", "src/server.ts"]
