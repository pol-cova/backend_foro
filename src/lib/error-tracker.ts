import * as Sentry from "@sentry/bun";
import type { SeverityLevel } from "@sentry/bun";

type ErrorTrackerContext = {
  requestId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

let trackerEnabled = false;

function applyTrackerContext(
  scope: Sentry.Scope,
  context?: ErrorTrackerContext,
): void {
  if (context?.requestId) scope.setTag("request_id", context.requestId);
  for (const [key, value] of Object.entries(context?.tags ?? {})) {
    scope.setTag(key, value);
  }
  for (const [key, value] of Object.entries(context?.extra ?? {})) {
    scope.setExtra(key, value);
  }
}

export function initErrorTracker(options: {
  dsn?: string;
  environment: string;
  release?: string;
}): void {
  const dsn = options.dsn?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: options.environment,
    release: options.release,
    tracesSampleRate: 1.0,
  });
  trackerEnabled = true;
}

export function isErrorTrackerEnabled(): boolean {
  return trackerEnabled;
}

/** Maps HTTP status to Sentry severity for business/outcome events (not thrown errors). */
export function severityForHttpStatus(status: number): SeverityLevel {
  if (status >= 500) return "error";
  if (status === 409 || status === 404) return "warning";
  return "info";
}

export function captureException(
  error: unknown,
  context?: ErrorTrackerContext,
): void {
  if (!trackerEnabled) return;

  Sentry.withScope((scope) => {
    applyTrackerContext(scope, context);
    Sentry.captureException(error);
  });
}

/**
 * Use for outcomes that are not exceptions (e.g. registration rejected with 4xx).
 * Shows up in Bugsink as a message event, grouped by message + tags.
 */
export function captureMessage(
  message: string,
  level: SeverityLevel,
  context?: ErrorTrackerContext,
): void {
  if (!trackerEnabled) return;

  Sentry.withScope((scope) => {
    applyTrackerContext(scope, context);
    Sentry.captureMessage(message, level);
  });
}
