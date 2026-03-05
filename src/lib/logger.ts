type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function serializeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v instanceof Error) {
      out[k] = { name: v.name, message: v.message, stack: v.stack };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = serializeContext(context);
  }
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    process.stdout.write(formatEntry("info", message, context) + "\n");
  },
  warn(message: string, context?: Record<string, unknown>): void {
    process.stderr.write(formatEntry("warn", message, context) + "\n");
  },
  error(message: string, context?: Record<string, unknown>): void {
    process.stderr.write(formatEntry("error", message, context) + "\n");
  },
};
