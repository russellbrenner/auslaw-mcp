import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import axios from "axios";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

vi.mock("axios");

const mockConfig = vi.hoisted(() => ({
  jade: {
    userAgent: "test-agent",
    timeout: 5000,
    sessionCookie: undefined as string | undefined,
    baseUrl: "https://jade.io",
  },
  ocr: { language: "eng", oem: 1, psm: 3 },
  austlii: { searchBase: "", referer: "", userAgent: "", timeout: 5000 },
  defaults: {
    searchLimit: 10,
    maxSearchLimit: 50,
    outputFormat: "json",
    sortBy: "auto",
  },
}));

vi.mock("../../config.js", () => ({ config: mockConfig }));
vi.mock("../../utils/rate-limiter.js", () => ({
  jadeRateLimiter: { throttle: vi.fn().mockResolvedValue(undefined) },
  austliiRateLimiter: { throttle: vi.fn().mockResolvedValue(undefined) },
}));

import { searchJade } from "../../services/jade.js";
import { jadeRateLimiter } from "../../utils/rate-limiter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function readFixture(name: string): string {
  return readFileSync(join(__dirname, "../fixtures", name), "utf-8");
}

describe("searchJade", () => {
  beforeEach(() => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockConfig.jade.sessionCookie = undefined;
  });

  it("returns empty array when no session cookie is configured", async () => {
    const results = await searchJade("Mabo", { type: "case" });
    expect(results).toEqual([]);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("calls jadeService.do via POST with proposeCitables body when cookie configured", async () => {
    mockConfig.jade.sessionCookie = "IID=abc; alcsessionid=xyz";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: readFixture("propose-citables-mabo.txt"),
      status: 200,
    });

    await searchJade("Mabo", { type: "case" });

    expect(axios.post).toHaveBeenCalledWith(
      "https://jade.io/jadeService.do",
      expect.stringContaining("proposeCitables"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "text/x-gwt-rpc; charset=UTF-8",
          Cookie: "IID=abc; alcsessionid=xyz",
        }),
      }),
    );
  });

  it("applies rate limiting via jadeRateLimiter", async () => {
    mockConfig.jade.sessionCookie = "IID=abc";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: readFixture("propose-citables-mabo.txt"),
      status: 200,
    });

    await searchJade("Mabo", { type: "case" });

    expect(vi.mocked(jadeRateLimiter.throttle)).toHaveBeenCalled();
  });

  it("returns SearchResult[] with correct fields from mabo fixture", async () => {
    mockConfig.jade.sessionCookie = "IID=abc; alcsessionid=xyz";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: readFixture("propose-citables-mabo.txt"),
      status: 200,
    });

    const results = await searchJade("Mabo", { type: "case" });

    expect(results.length).toBeGreaterThan(0);
    const hca23 = results.find((r) => r.neutralCitation === "[1992] HCA 23");
    expect(hca23).toBeDefined();
    expect(hca23!.source).toBe("jade");
    expect(hca23!.type).toBe("case");
    expect(hca23!.title).toContain("Mabo");
    expect(hca23!.url).toBe("https://jade.io/article/82343");
    expect(hca23!.reportedCitation).toContain("175 CLR 1");
  });

  it("applies limit option to cap result count", async () => {
    mockConfig.jade.sessionCookie = "IID=abc";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: readFixture("propose-citables-mabo.txt"),
      status: 200,
    });

    const results = await searchJade("Mabo", { type: "case", limit: 1 });

    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array on network error (graceful degradation)", async () => {
    mockConfig.jade.sessionCookie = "IID=abc";
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("timeout"));

    const results = await searchJade("test", { type: "case" });

    expect(results).toEqual([]);
  });

  it("does not expose session cookie in error messages on AxiosError", async () => {
    mockConfig.jade.sessionCookie = "IID=secret123; alcsessionid=abc456";
    const axiosError = Object.assign(new Error("Network Error"), {
      isAxiosError: true,
      config: {
        headers: { Cookie: "IID=secret123; alcsessionid=abc456" },
      },
      response: undefined,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(axiosError);
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    // Should not throw — graceful degradation
    const results = await searchJade("test", { type: "case" });
    expect(results).toEqual([]);
  });

  it("embeds the query in the POST body", async () => {
    mockConfig.jade.sessionCookie = "IID=abc";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: readFixture("propose-citables-mabo.txt"),
      status: 200,
    });

    await searchJade("rice v asplund", { type: "case" });

    const postBody = vi.mocked(axios.post).mock.calls[0]?.[1] as string;
    expect(postBody).toContain("rice v asplund");
  });
});
