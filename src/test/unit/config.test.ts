import { describe, it, expect, vi, afterEach } from "vitest";
import { loadConfig } from "../../config.js";

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads JADE_SESSION_COOKIE from env", () => {
    vi.stubEnv("JADE_SESSION_COOKIE", "test-cookie-value");
    const cfg = loadConfig();
    expect(cfg.jade.sessionCookie).toBe("test-cookie-value");
  });

  it("sessionCookie is undefined when env var absent", () => {
    const cfg = loadConfig();
    expect(cfg.jade.sessionCookie).toBeUndefined();
  });
});
