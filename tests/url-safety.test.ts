import { describe, it, expect } from "vitest";
import { fetch as undiciFetch } from "undici";
import { assertPubliclyRoutableUrl, getSsrfSafeDispatcher } from "@/shared/utils/url-safety";

describe("assertPubliclyRoutableUrl", () => {
  it("rejects non-https schemes", async () => {
    await expect(assertPubliclyRoutableUrl("http://example.com/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assertPubliclyRoutableUrl("ftp://example.com/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPubliclyRoutableUrl("not a url")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects literal loopback and private IPv4 addresses", async () => {
    await expect(assertPubliclyRoutableUrl("https://127.0.0.1/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assertPubliclyRoutableUrl("https://10.0.0.5/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assertPubliclyRoutableUrl("https://192.168.1.1/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assertPubliclyRoutableUrl("https://172.16.0.1/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects the cloud metadata address", async () => {
    await expect(assertPubliclyRoutableUrl("https://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects literal IPv6 loopback", async () => {
    await expect(assertPubliclyRoutableUrl("https://[::1]/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a hostname that resolves to localhost", async () => {
    await expect(assertPubliclyRoutableUrl("https://localhost/hook")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts a well-formed public https URL", async () => {
    await expect(assertPubliclyRoutableUrl("https://example.com/hook")).resolves.toBeUndefined();
  });
});

describe("getSsrfSafeDispatcher (connection-level guard, independent of the pre-check)", () => {
  it("blocks a connection to a private address at the actual connect step, not just the pre-check", async () => {
    // Proves the guard lives at the dispatcher's DNS-resolution step itself —
    // this fetch never calls assertPubliclyRoutableUrl at all, so a pass here
    // can only come from the dispatcher's own filter, not the earlier check.
    await expect(
      undiciFetch("https://localhost/", { dispatcher: getSsrfSafeDispatcher(), signal: AbortSignal.timeout(3000) }),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("SSRF guard") }) });
  });

  it("still allows a real public host through the same dispatcher", async () => {
    const response = await undiciFetch("https://example.com/", { dispatcher: getSsrfSafeDispatcher(), signal: AbortSignal.timeout(8000) });
    expect(response.status).toBe(200);
  });
});
