import { describe, it, expect } from "vitest";
import { initSentry, captureException } from "@/infrastructure/observability/sentry";

describe("Sentry integration (no SENTRY_DSN configured in this test environment)", () => {
  it("initSentry() is a safe no-op when SENTRY_DSN is unset", () => {
    expect(() => initSentry()).not.toThrow();
  });

  it("captureException() is a safe no-op and never throws, even for a weird value", () => {
    expect(() => captureException(new Error("test error"))).not.toThrow();
    expect(() => captureException("a string, not an Error", { some: "context" })).not.toThrow();
    expect(() => captureException(null)).not.toThrow();
  });
});
