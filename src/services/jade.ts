import axios from "axios";
import type { SearchResult, SearchOptions } from "./austlii.js";
import { searchAustLii } from "./austlii.js";
import { logger } from "../utils/logger.js";

/**
 * jade.io integration service
 *
 * jade.io (BarNet Jade) is an Australian legal research platform providing
 * judgments, decisions, and statutes. It does not expose a public search API,
 * so this service provides:
 *
 * 1. Article metadata resolution from jade.io article URLs
 * 2. Citation-based jade.io URL construction
 * 3. Cross-referencing AustLII results with jade.io article links
 * 4. jade.io URL detection and normalization
 *
 * Search is not available as jade.io uses a GWT single-page application
 * with no server-rendered results or public REST API.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface JadeArticle {
  /** jade.io article numeric ID */
  id: number;
  /** Case/legislation title extracted from page metadata */
  title: string;
  /** Neutral citation if present, e.g. "[2008] NSWSC 323" */
  neutralCitation?: string;
  /** Jurisdiction code extracted from citation, e.g. "nsw" */
  jurisdiction?: string;
  /** Year extracted from citation */
  year?: string;
  /** Full canonical URL on jade.io */
  url: string;
  /** Whether the article appears to be accessible (title was resolved) */
  accessible: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────

const JADE_BASE_URL = "https://jade.io";
const JADE_ARTICLE_URL = `${JADE_BASE_URL}/article`;
const JADE_SEARCH_URL = `${JADE_BASE_URL}/search`;

const JADE_USER_AGENT = "auslaw-mcp/0.1.0 (legal research tool)";
const JADE_TIMEOUT = 15000;

/** jade.io's generic/fallback title when an article isn't publicly accessible */
const JADE_GENERIC_TITLE =
  "BarNet Jade - Find recent Australian legal decisions";

/** Neutral citation pattern: [YYYY] COURT NUM */
const NEUTRAL_CITATION_RE = /\[(\d{4})\]\s+([A-Z]+(?:\s+[A-Z]+)?)\s+(\d+)/;

/** Map court abbreviations to jurisdiction codes */
const COURT_TO_JURISDICTION: Record<string, string> = {
  HCA: "cth",
  FCAFC: "cth",
  FCA: "cth",
  AATA: "cth",
  NSWSC: "nsw",
  NSWCA: "nsw",
  NSWCCA: "nsw",
  NSWDC: "nsw",
  NSWLEC: "nsw",
  VSC: "vic",
  VSCA: "vic",
  VCC: "vic",
  QSC: "qld",
  QCA: "qld",
  QDC: "qld",
  SASC: "sa",
  SASCFC: "sa",
  SADC: "sa",
  WASC: "wa",
  WASCA: "wa",
  WADC: "wa",
  TASSC: "tas",
  TASFC: "tas",
  NTSC: "nt",
  NTCA: "nt",
  ACTSC: "act",
  ACTCA: "act",
  NZHC: "nz",
  NZCA: "nz",
  NZSC: "nz",
};

// ── URL Utilities ──────────────────────────────────────────────────────

/**
 * Checks whether a URL belongs to jade.io
 */
export function isJadeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "jade.io" || parsed.hostname.endsWith(".jade.io");
  } catch {
    return false;
  }
}

/**
 * Extracts article ID from a jade.io URL
 * Supports patterns:
 *   - https://jade.io/article/12345
 *   - https://jade.io/j/?a=outline&id=12345
 *   - https://jade.io/article/12345/some/path
 */
export function extractArticleId(url: string): number | undefined {
  // Pattern 1: /article/{id}
  const articleMatch = url.match(/\/article\/(\d+)/);
  if (articleMatch?.[1]) {
    return parseInt(articleMatch[1], 10);
  }

  // Pattern 2: ?id={id} or &id={id}
  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get("id");
    if (idParam && /^\d+$/.test(idParam)) {
      return parseInt(idParam, 10);
    }
  } catch {
    // Invalid URL, fall through
  }

  return undefined;
}

/**
 * Constructs the canonical jade.io article URL for a given article ID
 */
export function buildArticleUrl(articleId: number): string {
  return `${JADE_ARTICLE_URL}/${articleId}`;
}

/**
 * Constructs a jade.io search URL for a given query.
 * Note: This URL opens jade.io's SPA with the search pre-filled.
 * It does NOT return machine-readable results.
 */
export function buildSearchUrl(query: string): string {
  return `${JADE_SEARCH_URL}/${encodeURIComponent(query)}`;
}

// ── Citation Parsing ───────────────────────────────────────────────────

/**
 * Extracts neutral citation from a jade.io page title.
 * jade.io titles follow the pattern: "Case Name [YYYY] COURT NUM - BarNet Jade"
 */
export function parseTitleMetadata(rawTitle: string): {
  title: string;
  neutralCitation?: string;
  jurisdiction?: string;
  year?: string;
} {
  // Strip " - BarNet Jade" suffix
  const title = rawTitle.replace(/\s*-\s*BarNet Jade\s*$/i, "").trim();

  // Try to extract neutral citation
  const citationMatch = title.match(NEUTRAL_CITATION_RE);
  if (citationMatch) {
    const neutralCitation = citationMatch[0];
    const year = citationMatch[1];
    const court = citationMatch[2]?.replace(/\s+/g, "");
    const jurisdiction = court ? COURT_TO_JURISDICTION[court] : undefined;

    return { title, neutralCitation, jurisdiction, year };
  }

  return { title };
}

/**
 * Extracts jurisdiction from a court abbreviation
 */
export function getJurisdictionFromCourt(court: string): string | undefined {
  const normalized = court.replace(/\s+/g, "").toUpperCase();
  return COURT_TO_JURISDICTION[normalized];
}

// ── Article Resolution ─────────────────────────────────────────────────

/**
 * Resolves metadata for a jade.io article by fetching the page and
 * extracting information from the HTML <title> tag.
 *
 * jade.io renders content via GWT (client-side JavaScript), but the
 * initial HTML includes the case title in the <title> element, giving
 * us the case name and neutral citation without needing JavaScript
 * execution.
 *
 * @param articleId - Numeric jade.io article ID
 * @returns Resolved article metadata, or article with accessible=false
 */
export async function resolveArticle(articleId: number): Promise<JadeArticle> {
  const url = buildArticleUrl(articleId);

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": JADE_USER_AGENT,
        Accept: "text/html",
      },
      timeout: JADE_TIMEOUT,
      // jade.io pages are typically ~15KB with the GWT shell
      maxContentLength: 50 * 1024,
    });

    const html: string = typeof response.data === "string"
      ? response.data
      : String(response.data);

    // Extract <title> tag content
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch?.[1]?.replace(/\s+/g, " ").trim();

    if (!rawTitle || rawTitle.startsWith(JADE_GENERIC_TITLE)) {
      // Article not publicly accessible or doesn't exist
      return {
        id: articleId,
        title: "",
        url,
        accessible: false,
      };
    }

    const parsed = parseTitleMetadata(rawTitle);

    return {
      id: articleId,
      title: parsed.title,
      neutralCitation: parsed.neutralCitation,
      jurisdiction: parsed.jurisdiction,
      year: parsed.year,
      url,
      accessible: true,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        id: articleId,
        title: "",
        url,
        accessible: false,
      };
    }
    throw error;
  }
}

/**
 * Resolves metadata for a jade.io article from its URL.
 * Extracts the article ID from the URL and resolves it.
 */
export async function resolveArticleFromUrl(url: string): Promise<JadeArticle | undefined> {
  const articleId = extractArticleId(url);
  if (articleId === undefined) {
    return undefined;
  }
  return resolveArticle(articleId);
}

// ── Search Result Conversion ───────────────────────────────────────────

/**
 * Converts a resolved jade.io article into a SearchResult.
 * Used when cross-referencing AustLII results with jade.io.
 */
export function articleToSearchResult(
  article: JadeArticle,
  type: "case" | "legislation",
): SearchResult {
  return {
    title: article.title,
    neutralCitation: article.neutralCitation,
    url: article.url,
    source: "jade",
    jurisdiction: article.jurisdiction,
    year: article.year,
    type,
  };
}

/**
 * Attempts to find a jade.io article for a given neutral citation.
 * Since jade.io has no search API, this constructs a search URL
 * that the user can open, and returns metadata about the lookup.
 *
 * @param citation - Neutral citation string, e.g. "[2008] NSWSC 323"
 * @returns Search URL the user can use to find the article on jade.io
 */
export function buildCitationLookupUrl(citation: string): string {
  return buildSearchUrl(citation);
}

// ── AustLII Cross-Reference ────────────────────────────────────────────

/**
 * Enriches AustLII search results with jade.io links where possible.
 * For each result with a neutral citation, constructs a jade.io search URL.
 *
 * @param results - AustLII search results
 * @returns Results with jadeUrl added where applicable
 */
export function enrichWithJadeLinks(
  results: SearchResult[],
): Array<SearchResult & { jadeUrl?: string }> {
  return results.map((result) => {
    if (result.neutralCitation) {
      return {
        ...result,
        jadeUrl: buildCitationLookupUrl(result.neutralCitation),
      };
    }
    return result;
  });
}

/** Maximum number of jade.io articles to resolve concurrently */
const MAX_JADE_RESOLUTIONS = 5;

/**
 * Searches for Australian legal materials via jade.io.
 *
 * jade.io does not expose a public search API (it is a GWT SPA), so this
 * function works by:
 *   1. Searching AustLII for the query to obtain relevant results
 *   2. Enriching results that have neutral citations with jade.io URLs
 *   3. Attempting to resolve jade.io article metadata for top results
 *   4. Returning successfully resolved results with `source: "jade"`
 *
 * @param query   - Search query string
 * @param options - Search options (jurisdiction, limit, etc.)
 * @returns Array of jade.io search results (may be empty if resolution fails)
 */
export async function searchJade(
  query: string,
  options: SearchOptions,
): Promise<SearchResult[]> {
  try {
    // Step 1: Search AustLII to get candidate results
    const austliiResults = await searchAustLii(query, options);

    if (austliiResults.length === 0) {
      logger.debug("searchJade: no AustLII results to cross-reference");
      return [];
    }

    // Step 2: Filter to results with neutral citations (required for jade.io matching)
    const withCitations = austliiResults.filter((r) => r.neutralCitation);
    if (withCitations.length === 0) {
      logger.debug("searchJade: no results with neutral citations");
      return [];
    }

    // Step 3: Resolve jade.io articles for top results (limit to avoid slow requests)
    const toResolve = withCitations.slice(0, MAX_JADE_RESOLUTIONS);
    logger.debug(`searchJade: resolving ${toResolve.length} jade.io articles`);

    const settlements = await Promise.allSettled(
      toResolve.map(async (result) => {
        const article = await searchJadeByCitation(result.neutralCitation!);
        if (article) {
          return articleToSearchResult(article, result.type);
        }
        return undefined;
      }),
    );

    // Step 4: Collect successfully resolved results
    const jadeResults: SearchResult[] = [];
    for (const settlement of settlements) {
      if (settlement.status === "fulfilled" && settlement.value) {
        jadeResults.push(settlement.value);
      }
    }

    logger.debug(`searchJade: resolved ${jadeResults.length} jade.io articles`);
    return jadeResults;
  } catch (error) {
    logger.warn(`searchJade: search failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// ── Citation Search ────────────────────────────────────────────────────

/**
 * Searches jade.io for an article matching a neutral citation.
 *
 * Constructs a jade.io search URL for the citation and fetches the page.
 * If jade.io redirects or renders a result page with a valid article title,
 * the article metadata is extracted from the HTML `<title>` tag.
 *
 * @param citation - Neutral citation string, e.g. "[2008] NSWSC 323"
 * @returns Resolved article metadata, or undefined if not found
 */
export async function searchJadeByCitation(
  citation: string,
): Promise<JadeArticle | undefined> {
  const searchUrl = buildSearchUrl(citation);

  try {
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent": JADE_USER_AGENT,
        Accept: "text/html",
      },
      timeout: JADE_TIMEOUT,
      maxContentLength: 50 * 1024,
      maxRedirects: 5,
    });

    const html: string =
      typeof response.data === "string"
        ? response.data
        : String(response.data);

    // Extract <title> tag content
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch?.[1]?.replace(/\s+/g, " ").trim();

    if (!rawTitle || rawTitle.startsWith(JADE_GENERIC_TITLE)) {
      return undefined;
    }

    const parsed = parseTitleMetadata(rawTitle);

    // Try to extract article ID from the final URL (after redirects)
    const finalUrl =
      typeof response.request?.res?.responseUrl === "string"
        ? response.request.res.responseUrl
        : searchUrl;
    const articleId = extractArticleId(finalUrl);

    return {
      id: articleId ?? 0,
      title: parsed.title,
      neutralCitation: parsed.neutralCitation,
      jurisdiction: parsed.jurisdiction,
      year: parsed.year,
      url: articleId ? buildArticleUrl(articleId) : finalUrl,
      accessible: true,
    };
  } catch (error) {
    logger.debug(
      `searchJadeByCitation: failed for "${citation}": ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

// ── Result Merging & Deduplication ─────────────────────────────────────

/**
 * Deduplicates an array of search results by neutral citation.
 *
 * When multiple results share the same neutral citation, jade.io results
 * are preferred over AustLII results (jade.io provides better formatting).
 * Results without neutral citations are always kept.
 *
 * @param results - Array of search results from mixed sources
 * @returns Deduplicated array preserving original order
 */
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  const output: SearchResult[] = [];

  for (const result of results) {
    if (!result.neutralCitation) {
      // No citation to deduplicate on — always include
      output.push(result);
      continue;
    }

    const key = result.neutralCitation;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, result);
      output.push(result);
    } else if (result.source === "jade" && existing.source !== "jade") {
      // Replace AustLII result with jade.io result
      const idx = output.indexOf(existing);
      if (idx !== -1) {
        output[idx] = result;
      }
      seen.set(key, result);
    }
    // Otherwise skip duplicate (keep first / jade result)
  }

  return output;
}

/**
 * Merges search results from AustLII and jade.io, deduplicates by neutral
 * citation, and returns the combined list.
 *
 * jade.io results are preferred when the same citation exists in both
 * result sets (jade.io offers richer formatting and metadata).
 *
 * @param austliiResults - Results from AustLII search
 * @param jadeResults    - Results from jade.io resolution
 * @returns Merged and deduplicated results
 */
export function mergeSearchResults(
  austliiResults: SearchResult[],
  jadeResults: SearchResult[],
): SearchResult[] {
  // Place jade results first so they win during deduplication
  return deduplicateResults([...jadeResults, ...austliiResults]);
}
