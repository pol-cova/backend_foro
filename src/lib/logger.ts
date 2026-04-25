import { AsyncLocalStorage } from "node:async_hooks";

const MAX_CAUSE_DEPTH = 8;

export type LogLevelName = "debug" | "info" | "warn" | "error";

type LogLevel = LogLevelName;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevelName, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveMinLevel(): LogLevelName {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

export const logContext = new AsyncLocalStorage<{ requestId: string }>();

export function runWithLogContext<T>(store: { requestId: string }, fn: () => T): T {
  return logContext.run(store, fn);
}

export function getCurrentRequestId(): string | undefined {
  return logContext.getStore()?.requestId;
}

function mongooseExtras(err: Error): Record<string, unknown> | undefined {
  const o = err as Error & Record<string, unknown>;
  const name = o.name;
  if (name === "ValidationError" && o.errors && typeof o.errors === "object") {
    const sub: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o.errors as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const ve = v as Record<string, unknown>;
        sub[k] = {
          path: ve.path,
          kind: ve.kind,
          message: ve.message,
        };
      }
    }
    return { mongooseValidation: sub };
  }
  if (name === "CastError") {
    return {
      mongooseCast: {
        path: o.path,
        value: o.value,
        kind: o.kind,
      },
    };
  }
  return undefined;
}

export function serializeUnknownError(err: unknown, depth = 0): Record<string, unknown> {
  if (depth > MAX_CAUSE_DEPTH) {
    return { truncated: true, atDepth: depth };
  }

  if (err instanceof AggregateError) {
    return {
      kind: "AggregateError",
      name: err.name,
      message: err.message,
      stack: err.stack,
      errors: err.errors.map((e) => serializeUnknownError(e, depth + 1)),
    };
  }

  if (err instanceof Error) {
    const base: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    const mg = mongooseExtras(err);
    if (mg) Object.assign(base, mg);
    if (err.cause !== undefined && err.cause !== null) {
      base.cause = serializeUnknownError(err.cause, depth + 1);
    }
    return base;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "response" in err &&
    typeof (err as { code?: unknown }).code === "number"
  ) {
    const e = err as { code: number; response: unknown };
    return {
      kind: "ElysiaCustomStatusResponse",
      statusCode: e.code,
      response: e.response,
    };
  }

  try {
    return {
      kind: "non_error",
      value: typeof err === "object" ? JSON.stringify(err) : String(err),
    };
  } catch {
    return { kind: "non_error", value: String(err) };
  }
}

function serializeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v instanceof Error) {
      out[k] = serializeUnknownError(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeWithRequestContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  const store = logContext.getStore();
  const rid = store?.requestId;
  const base = rid ? { requestId: rid } : {};
  if (!context || Object.keys(context).length === 0) {
    return Object.keys(base).length ? base : undefined;
  }
  return { ...base, ...context };
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  const merged = mergeWithRequestContext(context);
  if (merged && Object.keys(merged).length > 0) {
    entry.context = serializeContext(merged);
  }
  return JSON.stringify(entry);
}

export class Logger {
  private shouldLog(level: LogLevelName): boolean {
    const min = resolveMinLevel();
    return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("debug")) return;
    process.stdout.write(formatEntry("debug", message, context) + "\n");
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("info")) return;
    process.stdout.write(formatEntry("info", message, context) + "\n");
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("warn")) return;
    process.stderr.write(formatEntry("warn", message, context) + "\n");
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("error")) return;
    process.stderr.write(formatEntry("error", message, context) + "\n");
  }

  logError(message: string, err: unknown, context?: Record<string, unknown>): void {
    this.error(message, { ...context, error: serializeUnknownError(err) });
  }

  http(req: Request, res: Response, durationMs: number): void {
    const status = res.status;
    const path = new URL(req.url).pathname;
    const method = req.method;
    if (path === "/health") {
      if (!this.shouldLog("debug")) return;
      const line = formatEntry("debug", "HTTP", { method, path, status, durationMs }) + "\n";
      process.stdout.write(line);
      return;
    }
    const ctx: Record<string, unknown> = { method, path, status, durationMs };
    if (status >= 500) ctx.outcome = "server_error";
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const line = formatEntry(level, "HTTP", ctx) + "\n";
    if (status >= 400) process.stderr.write(line);
    else process.stdout.write(line);
  }
}

export const logger = new Logger();
