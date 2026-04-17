import { afterEach, describe, expect, it } from "bun:test";
import { logger, runWithLogContext, serializeUnknownError } from "../src/lib/logger";

describe("serializeUnknownError", () => {
  it("includes cause chain", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    const s = serializeUnknownError(outer);
    expect(s.message).toBe("outer");
    expect(s.cause).toBeObject();
    expect((s.cause as Record<string, unknown>).message).toBe("inner");
  });

  it("truncates deep cause chains", () => {
    let e: Error = new Error("deep");
    for (let i = 0; i < 20; i++) {
      e = new Error(`wrap ${i}`, { cause: e });
    }
    const s = serializeUnknownError(e);
    expect(JSON.stringify(s)).toContain('"truncated":true');
  });

  it("serializes AggregateError children", () => {
    const ae = new AggregateError([new Error("a"), new Error("b")], "both failed");
    const s = serializeUnknownError(ae);
    expect(s.kind).toBe("AggregateError");
    expect(Array.isArray(s.errors)).toBe(true);
    expect((s.errors as unknown[]).length).toBe(2);
  });
});

describe("request correlation", () => {
  const originalWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    process.stdout.write = originalWrite;
    delete process.env.LOG_LEVEL;
  });

  it("adds requestId from log context to log output", () => {
    process.env.LOG_LEVEL = "info";
    let captured = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;

    runWithLogContext({ requestId: "test-req-123" }, () => {
      logger.info("hello");
    });

    const line = captured.trim();
    const parsed = JSON.parse(line) as { context?: { requestId?: string } };
    expect(parsed.context?.requestId).toBe("test-req-123");
  });
});
