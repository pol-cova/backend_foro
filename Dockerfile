# syntax=docker/dockerfile:1

# ── Base stage ──
FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Dependencies stage ──
FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --production

# ── Production stage ──
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S bunjs && \
    adduser -S bunuser -u 1001

# Copy only what's needed for runtime
COPY --chown=bunuser:bunjs package.json bun.lock ./
COPY --chown=bunuser:bunjs --from=deps /app/node_modules ./node_modules
COPY --chown=bunuser:bunjs tsconfig.json ./
COPY --chown=bunuser:bunjs src ./src

USER bunuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "src/server.ts"]
