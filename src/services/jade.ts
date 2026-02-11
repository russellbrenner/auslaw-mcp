import axios from "axios";
import type { SearchResult, SearchOptions } from "./austlii.js";

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

/**
 * Placeholder for future jade.io search integration.
 * Currently returns an empty array since jade.io does not expose
 * a public search API.
 *
 * When/if jade.io provides API access, this function will perform
 * searches and return results in the standard SearchResult format.
 *
 * @param _query - Search query string
 * @param _options - Search options (jurisdiction, limit, etc.)
 * @returns Empty array (no public API available)
 */
export async function searchJade(
  _query: string,
  _options: SearchOptions,
): Promise<SearchResult[]> {
  // jade.io does not expose a public search API.
  // This function is a placeholder for future integration.
  // When API access is available, implement search here.
  return [];
}
