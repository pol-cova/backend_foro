# syntax=docker/dockerfile:1
FROM oven/bun AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma

RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
RUN bunx prisma generate

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--outfile server \
	src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000