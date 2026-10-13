import { describe, expect, it } from "vitest";
import { requestOrigin, safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath (open-redirect protection)", () => {
  it.each([
    ["/matches?filter=draws", "/matches?filter=draws"],
    ["/join/ABCD", "/join/ABCD"],
    [null, "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/%09/evil.com", "/%09/evil.com"],
    ["/\t/evil.com", "/"],
    ["javascript:alert(1)", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("requestOrigin", () => {
  it("prefers forwarded headers from the proxy", () => {
    const h = new Headers({ "x-forwarded-host": "app.up.railway.app", "x-forwarded-proto": "https" });
    expect(requestOrigin(h, "http://0.0.0.0:8080")).toBe("https://app.up.railway.app");
    expect(requestOrigin(new Headers(), "http://localhost:3000")).toBe("http://localhost:3000");
  });
});

