/**
 * jade.io GWT-RPC utilities
 *
 * jade.io uses GWT-RPC (Google Web Toolkit Remote Procedure Call) as its
 * wire protocol. This module provides:
 *
 * - GWT integer encoding/decoding (custom base-64 used in serialised object IDs)
 * - Request body builders for article-content and search methods
 * - Response parsers that extract string payloads from //OK[...] envelopes
 *
 * ## GWT-RPC Services Discovered (from HAR analysis)
 *
 * ### JadeRemoteService (strong name: JADE_STRONG_NAME)
 * Methods: proposeCitables, searchArticles, getInitialContent,
 *          getArticleStructuredMetadata, loadTranches
 *
 * ### ArticleViewRemoteService (strong name: AVD2_STRONG_NAME)
 * Methods: avd2Request (primary content loader), getCitedPreview
 *
 * ### LeftoverRemoteService (strong name: LEFTOVER_STRONG_NAME)
 * Methods: search (citation search - "who cites this article", NOT freetext),
 *          getCitableCitations
 *
 * ## Search: proposeCitables
 *
 * proposeCitables (JadeRemoteService) is the ONLY method that returns full
 * search results in a single call. It powers jade.io's search/autocomplete box.
 * Returns case names, neutral citations, reported citations, article IDs, and
 * page pinpoints.
 *
 * - searchArticles returns only GWT-encoded article IDs (no case names)
 * - search (LeftoverRemoteService) is a citation search, not freetext
 *
 * ## Response Format
 *
 * All GWT-RPC responses follow: //OK[<flat_array>, <type_table>, <string_table>, 4, 7]
 * - String table is at parsed[parsed.length - 3]
 * - Negative integers in flat_array reference string_table: -N = string_table[N-1]
 * - GWT-encoded article IDs appear as strings in the string table
 *
 * ## Authentication
 *
 * All methods require JADE_SESSION_COOKIE (same for search and content fetch).
 *
 * ## Strong Name Staleness
 *
 * Strong names are GWT type hashes that may change when jade.io redeploys.
 * If requests return //EX exceptions, inspect the X-GWT-Permutation header
 * from a live browser session (DevTools > Network > any jadeService.do request).
 *
 * HAR sources:
 * - jade.io_03-02-2026-13-48-33.har: article 67401 navigation (first analysis)
 * - jade.io_03-03-2026-10-08-59.har: "Mabo" and "rice v as" searches (second analysis)
 */

/**
 * GWT's custom base-64 charset.
 * Index 0 = 'A', 25 = 'Z', 26 = 'a', 51 = 'z', 52 = '0', 61 = '9', 62 = '$', 63 = '_'
 */
const GWT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_";

/** jade.io GWT module base URL — part of the serialisation header */
export const JADE_MODULE_BASE = "https://jade.io/au.com.barnet.jade.JadeClient/";

/**
 * GWT-RPC strong name (type hash) for JadeRemoteService.
 * This may change when jade.io redeploys the GWT app.
 * If content fetching returns an exception response, this hash may need refreshing
 * by inspecting the X-GWT-Permutation header in a fresh browser session.
 * Last verified: 2026-03-03.
 */
export const JADE_STRONG_NAME = "B4F37C2BEC5AB097C4C8696FD843C56D";

/**
 * GWT-RPC strong name (type hash) for ArticleViewRemoteService.
 * This service handles article content loading via the avd2Request method.
 * Discovered via SPA navigation interception (2026-03-02). Last verified: 2026-03-03.
 */
export const AVD2_STRONG_NAME = "159521E79F7322FD92335ED73B4403F9";

/**
 * GWT permutation identifier for the Chrome/macOS compiled JS bundle.
 * Sent in the X-GWT-Permutation request header.
 * Different from JADE_STRONG_NAME - this identifies the browser-specific
 * JavaScript permutation, not the serialisation type hash.
 * Last verified: 2026-03-03.
 */
export const JADE_PERMUTATION = "FEBDA911A95AD2DF02425A9C60379101";

/**
 * GWT-RPC strong name (type hash) for LeftoverRemoteService.
 * This service handles citation-context searches ("who cites this article")
 * and citation data retrieval. NOT used for freetext case search.
 * Discovered from HAR analysis (2026-03-03).
 */
export const LEFTOVER_STRONG_NAME = "CCB23EABE2EF1A4CA63F2E243C979468";

/**
 * Encodes a non-negative integer using GWT's custom base-64 charset.
 *
 * GWT represents integers in its RPC wire format using a compact base-64
 * encoding with the charset A-Z (0-25), a-z (26-51), 0-9 (52-61), $ (62), _ (63).
 *
 * Example: 67401 = 16*64² + 29*64 + 9 → 'Q' + 'd' + 'J' = "QdJ"
 *
 * @param n - Non-negative integer to encode
 * @returns GWT base-64 encoded string
 * @throws Error if n is negative or non-integer
 */
export function encodeGwtInt(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`GWT int encoding: non-negative integer required, got: ${n}`);
  }
  if (n === 0) return "A";

  let result = "";
  let remaining = n;
  while (remaining > 0) {
    result = GWT_CHARSET[remaining & 63]! + result;
    remaining = Math.floor(remaining / 64);
  }
  return result;
}

/**
 * Decodes a GWT custom base-64 encoded integer.
 *
 * This is the inverse of {@link encodeGwtInt}. It reads each character from
 * the string and accumulates the value using base-64 positional notation with
 * the GWT charset (A-Z = 0-25, a-z = 26-51, 0-9 = 52-61, $ = 62, _ = 63).
 *
 * Used to decode article IDs that appear as GWT-encoded strings in the flat
 * array of proposeCitables responses.
 *
 * @param encoded - GWT base-64 encoded string (non-empty, valid charset only)
 * @returns Decoded non-negative integer
 * @throws Error if the string is empty or contains characters outside the GWT charset
 */
export function decodeGwtInt(encoded: string): number {
  if (!encoded) {
    throw new Error("GWT int decoding: non-empty string required");
  }
  let result = 0;
  for (const char of encoded) {
    const index = GWT_CHARSET.indexOf(char);
    if (index === -1) {
      throw new Error(`GWT int decoding: character '${char}' is not in GWT charset`);
    }
    result = result * 64 + index;
  }
  return result;
}

/**
 * Builds the GWT-RPC POST body for JadeRemoteService.proposeCitables(query).
 *
 * proposeCitables is the search/autocomplete method used by jade.io's search box.
 * It returns case names, neutral citations, reported citations, article IDs, and
 * page pinpoints in a single response — the only jade.io method that provides
 * full search results without requiring a second metadata call per result.
 *
 * The request template is 100% static except for the query string at string-table
 * position 6 (the 10th pipe-delimited field). Captured verbatim from HAR analysis
 * of jade.io_03-03-2026-10-08-59.har, entry 11 (query "Mabo ").
 *
 * @param query - Search query string (passed verbatim, no GWT encoding)
 * @returns GWT-RPC v7 serialised request body string
 */
export function buildProposeCitablesRequest(query: string): string {
  return (
    `7|0|10|${JADE_MODULE_BASE}|${JADE_STRONG_NAME}|` +
    `au.com.barnet.jade.cs.remote.JadeRemoteService|proposeCitables|` +
    `java.lang.String/2004016611|` +
    `au.com.barnet.jade.cs.csobjects.qsearch.QuickSearchFlags/2740681188|` +
    `${query}|` +
    `au.com.barnet.jade.cs.csobjects.qsearchdesktop.QuickSearchFlagsDesktop/2291862948|` +
    `java.util.HashSet/3273092938|` +
    `au.com.barnet.jade.cs.persistent.shared.CitableType/1576180844|` +
    `1|2|3|4|2|5|6|7|8|1|1|1|0|0|1|0|9|4|10|0|10|1|10|2|10|3|1|0|0|1|0|9|0|0|0|0|0|1|1|1|`
  );
}

/**
 * Builds the GWT-RPC POST body for JadeRemoteService.getInitialContent(articleId).
 *
 * The request body template was captured verbatim from a live authenticated
 * session (Proxyman HAR, 2026-03-02). Only the GWT-encoded article ID changes
 * between requests; the string table and token stream are otherwise fixed.
 *
 * @param articleId - Numeric jade.io article ID
 * @returns GWT-RPC v7 serialised request body string
 */
export function buildGetInitialContentRequest(articleId: number): string {
  const encodedId = encodeGwtInt(articleId);
  return (
    `7|0|7|${JADE_MODULE_BASE}|${JADE_STRONG_NAME}|` +
    `au.com.barnet.jade.cs.remote.JadeRemoteService|` +
    `getInitialContent|` +
    `au.com.barnet.jade.cs.persistent.Jrl/728826604|` +
    `au.com.barnet.jade.cs.persistent.Article|` +
    `java.util.ArrayList/4159755760|` +
    `1|2|3|4|1|5|5|${encodedId}|A|0|A|A|6|0|`
  );
}

/**
 * Builds the GWT-RPC POST body for JadeRemoteService.getArticleStructuredMetadata(articleId).
 *
 * Returns a schema.org JSON string with the case name and neutral citation.
 * This call takes an int (JNI type 'J') rather than a Jrl object, making
 * it simpler than getInitialContent.
 *
 * @param articleId - Numeric jade.io article ID
 * @returns GWT-RPC v7 serialised request body string
 */
export function buildGetMetadataRequest(articleId: number): string {
  const encodedId = encodeGwtInt(articleId);
  return (
    `7|0|5|${JADE_MODULE_BASE}|${JADE_STRONG_NAME}|` +
    `au.com.barnet.jade.cs.remote.JadeRemoteService|` +
    `getArticleStructuredMetadata|J|` +
    `1|2|3|4|1|5|${encodedId}|`
  );
}

/**
 * Builds the GWT-RPC POST body for ArticleViewRemoteService.avd2Request(articleId).
 *
 * This is the primary method for loading article content on jade.io. Unlike
 * getInitialContent (which returns empty body when called directly), avd2Request
 * reliably returns the full article HTML including paragraph anchors.
 *
 * Discovered by intercepting SPA navigation within an authenticated jade.io
 * session (2026-03-02). The request template was captured from Jade Browser
 * case listing navigation to article 1182103.
 *
 * @param articleId - Numeric jade.io article ID
 * @returns GWT-RPC v7 serialised request body string
 */
export function buildAvd2Request(articleId: number): string {
  const encodedId = encodeGwtInt(articleId);
  return (
    `7|0|10|${JADE_MODULE_BASE}|${AVD2_STRONG_NAME}|` +
    `au.com.barnet.jade.cs.remote.ArticleViewRemoteService|avd2Request|` +
    `au.com.barnet.jade.cs.csobjects.avd.Avd2Request/2068227305|` +
    `au.com.barnet.jade.cs.persistent.Jrl/728826604|` +
    `au.com.barnet.jade.cs.persistent.Article|` +
    `java.util.ArrayList/4159755760|` +
    `au.com.barnet.jade.cs.csobjects.avd.PhraseFrequencyParams/1915696367|` +
    `cc.alcina.framework.common.client.util.IntPair/1982199244|` +
    `1|2|3|4|1|5|5|A|A|0|6|${encodedId}|A|0|A|A|7|0|0|0|8|0|0|9|0|10|3|500|A|8|0|`
  );
}

/**
 * Parses an avd2Request GWT-RPC response and extracts the article HTML.
 *
 * The avd2Request response is a complex GWT-RPC serialised object. The format
 * after stripping the //OK prefix is a JavaScript array (not strict JSON - it
 * uses "+" string concatenation for long strings):
 *
 *   [integer_refs..., [string_table_entries...], 4, 7]
 *
 * The HTML content is the longest string in the string table. Unicode escape
 * sequences (\u003C etc.) are decoded by JSON.parse automatically.
 *
 * @param responseText - Raw GWT-RPC response string from avd2Request
 * @returns Decoded HTML content string
 * @throws Error if the response is an exception, malformed, or contains no HTML
 */
export function parseAvd2Response(responseText: string): string {
  if (responseText.startsWith("//EX")) {
    throw new Error("jade.io GWT-RPC server returned an exception response");
  }
  if (!responseText.startsWith("//OK")) {
    throw new Error(
      `Unexpected GWT-RPC response format (expected //OK prefix): ${responseText.substring(0, 50)}`,
    );
  }

  // Strip //OK prefix and join GWT's string concatenation markers
  const stripped = responseText.slice(4);
  const joined = stripped.replace(/"\+"/g, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(joined);
  } catch (e) {
    throw new Error(`Failed to parse avd2 GWT-RPC response: ${e}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error("avd2 GWT-RPC response has unexpected structure");
  }

  // Response format: [...integers..., [string_table], 4, 7]
  // The string table is a nested array at parsed[len-3]
  const stringTable = parsed[parsed.length - 3];
  if (!Array.isArray(stringTable) || stringTable.length === 0) {
    throw new Error("avd2 response: could not locate string table");
  }

  // The HTML content is the longest string in the string table
  let html = "";
  for (const entry of stringTable) {
    if (typeof entry === "string" && entry.length > html.length) {
      html = entry;
    }
  }

  if (!html || !html.includes("<")) {
    throw new Error("No HTML content found in avd2 GWT-RPC response string table");
  }

  return html;
}

/**
 * Parses a GWT-RPC response envelope and extracts the string payload.
 *
 * jade.io responses for both getInitialContent and getArticleStructuredMetadata
 * follow this structure:
 *   //OK[<type_token>, [], ["<payload_string>"], <flags>, <version>]
 *
 * The payload string (parsed[2][0]) is JSON-encoded; Unicode escape sequences
 * (\uXXXX) are decoded automatically by JSON.parse.
 *
 * @param responseText - Raw GWT-RPC response string
 * @returns Decoded payload string (HTML or JSON depending on the method called)
 * @throws Error if the response is a GWT exception (//EX), malformed, or has no content
 */
export function parseGwtRpcResponse(responseText: string): string {
  if (responseText.startsWith("//EX")) {
    throw new Error("jade.io GWT-RPC server returned an exception response");
  }
  if (!responseText.startsWith("//OK")) {
    throw new Error(
      `Unexpected GWT-RPC response format (expected //OK prefix): ${responseText.substring(0, 50)}`,
    );
  }

  const jsonPart = responseText.substring(4);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch (e) {
    throw new Error(`Failed to parse GWT-RPC response body as JSON: ${e}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error(`GWT-RPC response has unexpected structure (need array of length >= 3)`);
  }

  const stringTable = parsed[2];
  if (!Array.isArray(stringTable) || stringTable.length === 0) {
    throw new Error(
      `GWT-RPC response has empty string table - article may not have content or may require authentication`,
    );
  }

  const content = stringTable[0];
  if (typeof content !== "string") {
    throw new Error(`GWT-RPC string table first element is not a string: ${typeof content}`);
  }

  return content;
}

/**
 * Checks whether a value is a plausible GWT-encoded integer string.
 * Valid GWT-encoded ints are 2-7 character strings using only the GWT base-64 charset.
 */
export function isGwtEncodedInt(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 2 || v.length > 7) return false;
  return [...v].every((c) => GWT_CHARSET.includes(c));
}

/**
 * A single search result extracted from a proposeCitables GWT-RPC response.
 */
export interface ProposeCitablesResult {
  caseName: string;
  neutralCitation: string;
  reportedCitation?: string;
  articleId?: number;
  jadeUrl: string;
}

/**
 * Parses a proposeCitables GWT-RPC response and extracts structured search results.
 *
 * ## Parsing Strategy
 *
 * The response contains a flat integer array, a type table, and a string table. Rather
 * than fully deserialising the GWT object graph, this function uses the "document in
 * Jade" descriptor strings as anchors:
 *
 * - Descriptors have the form `"[YYYY] COURT NUM; REPORTER VOL PAGE - document in Jade"`
 *   (with reported citation) or `"[YYYY] COURT NUM - document in Jade"` (neutral only).
 * - For descriptors with ";": a GWT-encoded integer may be at flat_pos - 3 (stored
 *   as `articleId` when found, but this is an entity/citable ID, NOT the jade.io URL ID).
 * - For descriptors without ";": a GWT-encoded integer may be at flat_pos + 4.
 * - True jade.io article IDs are extracted separately from the bridge section
 *   (see `extractBridgeCandidates`) and resolved via `resolveBridgeCandidates`.
 * - The `jadeUrl` uses a citation-based search URL as a fallback.
 * - Case names are found by scanning backward in the string table from the descriptor
 *   position (up to 100 entries), looking for the first string containing " v ".
 *
 * Transcript entries (HCATrans) are skipped. Results are deduplicated by neutral citation.
 *
 * @param responseText - Raw GWT-RPC response string from proposeCitables
 * @returns Object with `results` array and the raw `flatArray` for bridge section extraction
 * @throws Error if the response is a GWT exception (//EX) or has an unexpected prefix
 */
export function parseProposeCitablesResponse(
  responseText: string,
): { results: ProposeCitablesResult[]; flatArray: unknown[] } {
  if (responseText.startsWith("//EX")) {
    throw new Error("jade.io GWT-RPC server returned an exception response");
  }
  if (!responseText.startsWith("//OK")) {
    throw new Error(
      `Unexpected GWT-RPC response format (expected //OK prefix): ${responseText.substring(0, 50)}`,
    );
  }

  const stripped = responseText.slice(4);
  const joined = stripped.replace(/"\+""/g, "");

  const empty = { results: [], flatArray: [] as unknown[] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(joined);
  } catch {
    return empty;
  }

  if (!Array.isArray(parsed) || parsed.length < 4) {
    return empty;
  }

  const stringTable = parsed[parsed.length - 3];
  if (!Array.isArray(stringTable) || stringTable.length === 0) {
    return empty;
  }

  // Everything before the last 4 elements is the flat integer/string array
  const flatArray = parsed.slice(0, parsed.length - 4);

  // Helper: check whether a value is a GWT-encoded integer string
  function isGwtEncoded(v: unknown): v is string {
    return isGwtEncodedInt(v);
  }

  // Build a lookup: string-table index → flat-array positions that reference it
  const refToFlatPositions = new Map<number, number[]>();
  for (let pos = 0; pos < flatArray.length; pos++) {
    const v = flatArray[pos];
    if (typeof v === "number" && v < 0) {
      const idx = Math.abs(v) - 1;
      const arr = refToFlatPositions.get(idx);
      if (arr) {
        arr.push(pos);
      } else {
        refToFlatPositions.set(idx, [pos]);
      }
    }
  }

  const results: ProposeCitablesResult[] = [];
  const seenCitations = new Set<string>();

  for (let descIdx = 0; descIdx < stringTable.length; descIdx++) {
    const descriptor = stringTable[descIdx];
    if (typeof descriptor !== "string" || !descriptor.endsWith("- document in Jade")) {
      continue;
    }

    // Skip hearing transcripts — they are not primary judgments
    if (descriptor.includes("HCATrans")) continue;

    const descriptorContent = descriptor.slice(0, -" - document in Jade".length).trim();
    const hasSemicolon = descriptorContent.includes(";");

    let neutralCitation: string;
    let reportedCitation: string | undefined;

    if (hasSemicolon) {
      const semiIdx = descriptorContent.indexOf(";");
      neutralCitation = descriptorContent.slice(0, semiIdx).trim();
      reportedCitation = descriptorContent.slice(semiIdx + 1).trim();
    } else {
      neutralCitation = descriptorContent;
    }

    // Scan backward in the string table for the case name (string containing " v ")
    const scanStart = hasSemicolon ? descIdx - 2 : descIdx - 1;
    let caseName: string | undefined;
    for (let i = scanStart; i >= Math.max(0, descIdx - 100); i--) {
      const s = stringTable[i];
      if (typeof s === "string" && s.includes(" v ") && s.length > 5) {
        caseName = s;
        break;
      }
    }

    // Fallback for non-";" entries: use the string immediately before the descriptor
    if (!caseName && !hasSemicolon) {
      const candidate = stringTable[descIdx - 1];
      if (
        typeof candidate === "string" &&
        candidate.length > 3 &&
        !candidate.startsWith("[") &&
        !candidate.endsWith("- document in Jade") &&
        !candidate.includes("au.com.barnet")
      ) {
        caseName = candidate;
      }
    }

    if (!caseName) continue;

    // Find the article ID in the flat array
    const flatPositions = refToFlatPositions.get(descIdx) ?? [];
    let articleId: number | undefined;

    for (const flatPos of flatPositions) {
      const gwtCandidate = hasSemicolon
        ? flatArray[flatPos - 3]
        : flatArray[flatPos + 4];

      if (isGwtEncoded(gwtCandidate)) {
        articleId = decodeGwtInt(gwtCandidate);
        break;
      }
    }

    if (seenCitations.has(neutralCitation)) continue;
    seenCitations.add(neutralCitation);

    results.push({
      caseName,
      neutralCitation,
      reportedCitation,
      articleId,
      jadeUrl: `https://jade.io/search/${encodeURIComponent(neutralCitation)}`,
    });
  }

  return { results, flatArray };
}

/**
 * A candidate article ID extracted from the bridge section of a proposeCitables
 * GWT-RPC response flat array.
 */
export interface BridgeCandidate {
  /** Position in the flat array where this candidate was found */
  flatPos: number;
  /** Decoded article ID (100-2,000,000 range) */
  articleId: number;
  /** Original GWT-encoded string from the flat array */
  gwtEncoded: string;
  /**
   * Confidence level:
   * - `high`: preceded by another GWT string whose decoded value is larger
   *   (the [record ID] [article ID] structural pattern)
   * - `medium`: GWT string in range but no preceding record ID
   */
  confidence: "high" | "medium";
}

/**
 * Extracts candidate article IDs from the bridge section of a proposeCitables
 * flat array.
 *
 * ## Background
 *
 * The proposeCitables response contains a flat array where the last ~10% (the
 * "bridge section") holds lookup-table entries mapping internal record IDs to
 * jade.io article IDs. The structural pattern is:
 *
 *   flat[i-1] = GWT-encoded record ID (larger value, e.g. 20422242)
 *   flat[i]   = GWT-encoded article ID (smaller value, e.g. 776897)
 *
 * Candidates are filtered to 2-5 character GWT strings decoding to 100-2,000,000
 * (plausible jade.io article ID range). Candidates preceded by a larger GWT value
 * are scored as high confidence.
 *
 * @param flatArray - The flat array portion of a parsed proposeCitables response
 * @returns Up to 30 candidates, high-confidence first, then medium, each sorted by position
 */
export function extractBridgeCandidates(flatArray: unknown[]): BridgeCandidate[] {
  const bridgeStart = Math.floor(flatArray.length * 0.9);
  const high: BridgeCandidate[] = [];
  const medium: BridgeCandidate[] = [];

  for (let i = bridgeStart; i < flatArray.length; i++) {
    const val = flatArray[i];
    if (typeof val !== "string" || val.length < 2 || val.length > 5) continue;
    if (!isGwtEncodedInt(val)) continue;

    const decoded = decodeGwtInt(val);
    if (decoded < 100 || decoded > 2_000_000) continue;

    // Check for the [record ID] [article ID] structural pattern
    const prev = flatArray[i - 1];
    if (isGwtEncodedInt(prev) && decodeGwtInt(prev) > decoded) {
      high.push({ flatPos: i, articleId: decoded, gwtEncoded: val, confidence: "high" });
    } else {
      medium.push({ flatPos: i, articleId: decoded, gwtEncoded: val, confidence: "medium" });
    }
  }

  return [...high, ...medium].slice(0, 30);
}
