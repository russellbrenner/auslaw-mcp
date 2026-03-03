import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  encodeGwtInt,
  decodeGwtInt,
  buildGetInitialContentRequest,
  buildGetMetadataRequest,
  buildAvd2Request,
  buildProposeCitablesRequest,
  parseProposeCitablesResponse,
  parseGwtRpcResponse,
  parseAvd2Response,
  AVD2_STRONG_NAME,
  JADE_STRONG_NAME,
} from "../../services/jade-gwt.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function readFixture(name: string): string {
  return readFileSync(join(__dirname, "../fixtures", name), "utf-8");
}

describe("encodeGwtInt", () => {
  it("encodes 0 as single character A", () => {
    expect(encodeGwtInt(0)).toBe("A");
  });

  it("encodes 67401 as QdJ (verified against captured HAR for article 67401)", () => {
    // 67401 = 16*64² + 29*64 + 9 = 65536+1856+9
    // Q=16, d=29, J=9 in GWT charset (A-Z=0-25, a-z=26-51, 0-9=52-61, $=62, _=63)
    expect(encodeGwtInt(67401)).toBe("QdJ");
  });

  it("encodes single-digit values (0-63) as one character", () => {
    expect(encodeGwtInt(63)).toBe("_");
    expect(encodeGwtInt(62)).toBe("$");
    expect(encodeGwtInt(25)).toBe("Z");
    expect(encodeGwtInt(26)).toBe("a");
  });

  it("encodes 64 as BA (first two-character value)", () => {
    expect(encodeGwtInt(64)).toBe("BA");
  });

  it("encodes 4096 as BAA (first three-character value)", () => {
    expect(encodeGwtInt(4096)).toBe("BAA");
  });

  it("throws for negative numbers", () => {
    expect(() => encodeGwtInt(-1)).toThrow();
  });

  it("throws for non-integer input", () => {
    expect(() => encodeGwtInt(1.5)).toThrow();
  });
});

describe("buildGetInitialContentRequest", () => {
  it("produces the exact known POST body for article 67401", () => {
    // Captured verbatim from Proxyman HAR export (jade.io_03-02-2026-13-48-33.har)
    const expected =
      "7|0|7|https://jade.io/au.com.barnet.jade.JadeClient/|16E3F568878E6841670449E07D95BA3E|" +
      "au.com.barnet.jade.cs.remote.JadeRemoteService|getInitialContent|" +
      "au.com.barnet.jade.cs.persistent.Jrl/728826604|au.com.barnet.jade.cs.persistent.Article|" +
      "java.util.ArrayList/4159755760|1|2|3|4|1|5|5|QdJ|A|0|A|A|6|0|";
    expect(buildGetInitialContentRequest(67401)).toBe(expected);
  });

  it("uses the GWT-encoded article ID", () => {
    const body = buildGetInitialContentRequest(68901);
    // 68901 should appear as GWT-encoded, not the raw integer
    expect(body).not.toContain("68901");
    expect(body).toContain(encodeGwtInt(68901));
  });

  it("starts with GWT-RPC version header", () => {
    expect(buildGetInitialContentRequest(12345)).toMatch(/^7\|0\|7\|/);
  });
});

describe("buildGetMetadataRequest", () => {
  it("produces the exact known POST body for article 67401", () => {
    // Captured verbatim from Proxyman HAR export
    const expected =
      "7|0|5|https://jade.io/au.com.barnet.jade.JadeClient/|16E3F568878E6841670449E07D95BA3E|" +
      "au.com.barnet.jade.cs.remote.JadeRemoteService|getArticleStructuredMetadata|J|" +
      "1|2|3|4|1|5|QdJ|";
    expect(buildGetMetadataRequest(67401)).toBe(expected);
  });

  it("uses the GWT-encoded article ID", () => {
    const body = buildGetMetadataRequest(99999);
    expect(body).not.toContain("99999");
    expect(body).toContain(encodeGwtInt(99999));
  });
});

describe("buildAvd2Request", () => {
  it("produces the exact known POST body for article 1182103", () => {
    // Captured from live SPA navigation interception (2026-03-02)
    // Article: AA v The Trustees of the Roman Catholic Church... [2026] HCA 2
    const expected =
      "7|0|10|https://jade.io/au.com.barnet.jade.JadeClient/|" +
      "E2F710F48F8237D9E1397729B9933A69|" +
      "au.com.barnet.jade.cs.remote.ArticleViewRemoteService|avd2Request|" +
      "au.com.barnet.jade.cs.csobjects.avd.Avd2Request/2068227305|" +
      "au.com.barnet.jade.cs.persistent.Jrl/728826604|" +
      "au.com.barnet.jade.cs.persistent.Article|" +
      "java.util.ArrayList/4159755760|" +
      "au.com.barnet.jade.cs.csobjects.avd.PhraseFrequencyParams/1915696367|" +
      "cc.alcina.framework.common.client.util.IntPair/1982199244|" +
      "1|2|3|4|1|5|5|A|A|0|6|EgmX|A|0|A|A|7|0|0|0|8|0|0|9|0|10|3|500|A|8|0|";
    expect(buildAvd2Request(1182103)).toBe(expected);
  });

  it("produces the correct body for article 67401", () => {
    const body = buildAvd2Request(67401);
    // Article ID 67401 = "QdJ" in GWT encoding
    expect(body).toContain("|QdJ|");
    expect(body).not.toContain("|67401|");
  });

  it("uses ArticleViewRemoteService strong name, not JadeRemoteService", () => {
    const body = buildAvd2Request(12345);
    expect(body).toContain(AVD2_STRONG_NAME);
    expect(body).toContain("ArticleViewRemoteService");
    expect(body).not.toContain("JadeRemoteService");
  });

  it("starts with GWT-RPC version header with 10 string table entries", () => {
    expect(buildAvd2Request(12345)).toMatch(/^7\|0\|10\|/);
  });
});

describe("parseAvd2Response", () => {
  it("extracts HTML from a response with string table", () => {
    // Simplified avd2Response format: [integers..., [string_table], 4, 7]
    const html = "<DIV><P>Judgment text</P></DIV>";
    const response = `//OK[0,-2,0,["SomeType/123","${html}"],4,7]`;
    expect(parseAvd2Response(response)).toBe(html);
  });

  it("handles unicode escape sequences in HTML", () => {
    const response = '//OK[0,-2,0,["Type/1","\\u003CDIV\\u003Econtent\\u003C/DIV\\u003E"],4,7]';
    expect(parseAvd2Response(response)).toBe("<DIV>content</DIV>");
  });

  it("joins GWT string concatenation markers before parsing", () => {
    // GWT splits long strings with "+" at the response level
    const html = "<DIV>long content here</DIV>";
    const half1 = html.substring(0, 15);
    const half2 = html.substring(15);
    const response = `//OK[0,["Type/1","${half1}"+"${half2}"],4,7]`;
    expect(parseAvd2Response(response)).toBe(html);
  });

  it("throws on //EX server exception response", () => {
    expect(() => parseAvd2Response("//EX WebException")).toThrow(/exception/i);
  });

  it("throws on unexpected format (no //OK prefix)", () => {
    expect(() => parseAvd2Response('{"json":"object"}')).toThrow();
  });

  it("throws when no HTML content found in string table", () => {
    const response = '//OK[0,["Type/1","Type/2"],4,7]';
    expect(() => parseAvd2Response(response)).toThrow(/no html content/i);
  });

  it("selects the longest string as HTML content", () => {
    const shortStr = "Type/123456";
    const html = "<DIV><P>[1] A paragraph of judgment text about negligence.</P></DIV>";
    const response = `//OK[0,["${shortStr}","${html}"],4,7]`;
    expect(parseAvd2Response(response)).toBe(html);
  });
});

describe("decodeGwtInt", () => {
  it("decodes 'A' as 0", () => {
    expect(decodeGwtInt("A")).toBe(0);
  });

  it("decodes 'QdJ' as 67401 (inverse of encodeGwtInt)", () => {
    expect(decodeGwtInt("QdJ")).toBe(67401);
  });

  it("decodes 'CwFj' as 721251 (Mabo [1992] HCA 23 Citable ID — NOT the article URL ID)", () => {
    expect(decodeGwtInt("CwFj")).toBe(721251);
  });

  it("decodes 'CwEa' as 721178 ([1988] HCA 69 Citable ID — NOT the article URL ID)", () => {
    expect(decodeGwtInt("CwEa")).toBe(721178);
  });

  it("decodes 'UGn' as 82343 (Mabo [1992] HCA 23 article URL ID)", () => {
    expect(decodeGwtInt("UGn")).toBe(82343);
  });

  it("decodes 'UGE' as 82308 (Mabo [1988] HCA 69 article URL ID)", () => {
    expect(decodeGwtInt("UGE")).toBe(82308);
  });

  it("is the inverse of encodeGwtInt for round-trip", () => {
    const values = [0, 1, 63, 64, 4096, 67401, 721251, 1182103];
    for (const n of values) {
      expect(decodeGwtInt(encodeGwtInt(n))).toBe(n);
    }
  });

  it("throws for an empty string", () => {
    expect(() => decodeGwtInt("")).toThrow();
  });

  it("throws for a string with characters outside the GWT charset", () => {
    expect(() => decodeGwtInt("!invalid")).toThrow();
  });
});

describe("buildProposeCitablesRequest", () => {
  it("produces the exact known POST body for query 'Mabo ' (captured from HAR entry 11)", () => {
    // Captured verbatim from jade.io_03-03-2026-10-08-59.har, entry 11
    const expected =
      "7|0|10|https://jade.io/au.com.barnet.jade.JadeClient/|" +
      "16E3F568878E6841670449E07D95BA3E|" +
      "au.com.barnet.jade.cs.remote.JadeRemoteService|proposeCitables|" +
      "java.lang.String/2004016611|" +
      "au.com.barnet.jade.cs.csobjects.qsearch.QuickSearchFlags/2740681188|" +
      "Mabo |" +
      "au.com.barnet.jade.cs.csobjects.qsearchdesktop.QuickSearchFlagsDesktop/2291862948|" +
      "java.util.HashSet/3273092938|" +
      "au.com.barnet.jade.cs.persistent.shared.CitableType/1576180844|" +
      "1|2|3|4|2|5|6|7|8|1|1|1|0|0|1|0|9|4|10|0|10|1|10|2|10|3|1|0|0|1|0|9|0|0|0|0|0|1|1|1|";
    expect(buildProposeCitablesRequest("Mabo ")).toBe(expected);
  });

  it("uses JadeRemoteService strong name", () => {
    const body = buildProposeCitablesRequest("test");
    expect(body).toContain(JADE_STRONG_NAME);
    expect(body).toContain("JadeRemoteService");
  });

  it("embeds the query string directly (no GWT encoding)", () => {
    const body = buildProposeCitablesRequest("rice v asplund");
    expect(body).toContain("rice v asplund");
  });

  it("starts with GWT-RPC version header with 10 string table entries", () => {
    expect(buildProposeCitablesRequest("test")).toMatch(/^7\|0\|10\|/);
  });
});

describe("parseProposeCitablesResponse", () => {
  it("extracts Mabo v Queensland (No 2) with [1992] HCA 23 from captured response", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    const mabo = results.find((r) => r.neutralCitation === "[1992] HCA 23");
    expect(mabo).toBeDefined();
    expect(mabo!.caseName).toContain("Mabo");
    expect(mabo!.articleId).toBe(82343);
    expect(mabo!.jadeUrl).toBe("https://jade.io/article/82343");
  });

  it("extracts reported citation 175 CLR 1 for Mabo [1992] HCA 23", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    const mabo = results.find((r) => r.neutralCitation === "[1992] HCA 23");
    expect(mabo!.reportedCitation).toContain("175 CLR 1");
  });

  it("returns multiple results for the Mabo query", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts [1988] HCA 69 result from captured response", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    const mabo2 = results.find((r) => r.neutralCitation === "[1988] HCA 69");
    expect(mabo2).toBeDefined();
    expect(mabo2!.caseName).toContain("Mabo");
    expect(mabo2!.articleId).toBe(82308);
    expect(mabo2!.reportedCitation).toContain("166 CLR");
  });

  it("does not include HCATrans transcript entries", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    expect(results.some((r) => r.neutralCitation?.includes("HCATrans"))).toBe(false);
  });

  it("sets jadeUrl correctly for all results", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    for (const r of results) {
      expect(r.jadeUrl).toBe(`https://jade.io/article/${r.articleId}`);
    }
  });

  it("throws on //EX exception response", () => {
    expect(() => parseProposeCitablesResponse("//EX error")).toThrow(/exception/i);
  });

  it("throws on response with unexpected format (no //OK prefix)", () => {
    expect(() => parseProposeCitablesResponse('{"json":"object"}')).toThrow();
  });

  it("returns empty array for response with empty string table", () => {
    const results = parseProposeCitablesResponse("//OK[0,[],[],4,7]");
    expect(results).toEqual([]);
  });

  it("deduplicates results with the same neutral citation", () => {
    const fixture = readFixture("propose-citables-mabo.txt");
    const results = parseProposeCitablesResponse(fixture);
    const citations = results.map((r) => r.neutralCitation);
    const unique = new Set(citations);
    expect(citations.length).toBe(unique.size);
  });
});

describe("parseGwtRpcResponse", () => {
  it("extracts the HTML string from a getInitialContent response", () => {
    const responseText = '//OK[1,[],["<DIV>judgment text here</DIV>"],4,7]';
    expect(parseGwtRpcResponse(responseText)).toBe("<DIV>judgment text here</DIV>");
  });

  it("extracts JSON string from a getArticleStructuredMetadata response", () => {
    // GWT-RPC string table entries are JSON-encoded strings, so inner quotes are escaped.
    // This mirrors the actual wire format observed in the Proxyman HAR capture.
    const metadata = { "@context": "http://schema.org", name: "Test v Jones" };
    const responseText = `//OK[1,[],[${JSON.stringify(JSON.stringify(metadata))}],4,7]`;
    const result = parseGwtRpcResponse(responseText);
    expect(result).toContain("schema.org");
  });

  it("decodes unicode escape sequences (\\u003C becomes <)", () => {
    const responseText = '//OK[1,[],["\\u003CDIV\\u003E"],4,7]';
    expect(parseGwtRpcResponse(responseText)).toBe("<DIV>");
  });

  it("throws on //EX server exception response", () => {
    expect(() => parseGwtRpcResponse('//EX[{"type":"exception"}]')).toThrow(
      /server.*exception/i,
    );
  });

  it("throws on unexpected format (no //OK prefix)", () => {
    expect(() => parseGwtRpcResponse('{"json":"object"}')).toThrow();
  });

  it("throws when string table is empty", () => {
    expect(() => parseGwtRpcResponse("//OK[1,[],[],4,7]")).toThrow(/empty/i);
  });
});
