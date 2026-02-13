import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { formatFetchResponse, formatSearchResults } from "./utils/formatter.js";
import { fetchDocumentText } from "./services/fetcher.js";
import { searchAustLii } from "./services/austlii.js";
import {
  resolveArticle,
  buildCitationLookupUrl,
  searchJade,
  searchJadeByCitation,
  mergeSearchResults,
} from "./services/jade.js";

const formatEnum = z.enum(["json", "text", "markdown", "html"]).default("json");
const jurisdictionEnum = z.enum([
  "cth",
  "vic",
  "nsw",
  "qld",
  "sa",
  "wa",
  "tas",
  "nt",
  "act",
  "federal",
  "nz",
  "other",
]);
const sortByEnum = z.enum(["relevance", "date", "auto"]).default("auto");
const caseMethodEnum = z.enum(["auto", "title", "phrase", "all", "any", "near", "boolean"]).default("auto");
const legislationMethodEnum = z.enum(["auto", "title", "phrase", "all", "any", "near", "legis", "boolean"]).default("auto");

async function main() {
  const server = new McpServer({
    name: "auslaw-mcp",
    version: "0.1.0",
    description: "Australian legislation and case law searcher with OCR-aware document retrieval.",
  });

  const searchLegislationShape = {
    query: z.string().min(1, "Query cannot be empty."),
    jurisdiction: jurisdictionEnum.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    format: formatEnum.optional(),
    sortBy: sortByEnum.optional(),
    method: legislationMethodEnum.optional(),
    offset: z.number().int().min(0).max(500).optional(),
    includeJade: z.boolean().optional(),
  };
  const searchLegislationParser = z.object(searchLegislationShape);

  server.registerTool(
    "search_legislation",
    {
      title: "Search Legislation",
      description:
        "Search Australian and New Zealand legislation. Jurisdictions: cth, vic, nsw, qld, sa, wa, tas, nt, act, federal, nz, other (all). Methods: auto, title (titles only), phrase (exact match), all (all words), any (any word), near (proximity), legis (legislation names). Use offset for pagination. Set includeJade=true to also search jade.io and merge results.",
      inputSchema: searchLegislationShape,
    },
    async (rawInput) => {
      const { query, jurisdiction, limit, format, sortBy, method, offset, includeJade } =
        searchLegislationParser.parse(rawInput);
      const options = {
        type: "legislation" as const,
        jurisdiction,
        limit,
        sortBy,
        method,
        offset,
      };
      const austliiResults = await searchAustLii(query, options);

      if (includeJade) {
        const jadeResults = await searchJade(query, options);
        const merged = mergeSearchResults(austliiResults, jadeResults);
        return formatSearchResults(merged, format ?? "json");
      }

      return formatSearchResults(austliiResults, format ?? "json");
    },
  );

  const searchCasesShape = {
    query: z.string().min(1, "Query cannot be empty."),
    jurisdiction: jurisdictionEnum.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    format: formatEnum.optional(),
    sortBy: sortByEnum.optional(),
    method: caseMethodEnum.optional(),
    offset: z.number().int().min(0).max(500).optional(),
    includeJade: z.boolean().optional(),
  };
  const searchCasesParser = z.object(searchCasesShape);

  server.registerTool(
    "search_cases",
    {
      title: "Search Cases",
      description:
        "Search Australian and New Zealand case law. Jurisdictions: cth, vic, nsw, qld, sa, wa, tas, nt, act, federal, nz, other (all). Methods: auto, title (case names only), phrase (exact match), all (all words), any (any word), near (proximity), boolean. Sorting: auto (smart detection), relevance, date. Use offset for pagination (e.g., offset=50 for page 2). Set includeJade=true to also search jade.io (BarNet Jade) and merge results.",
      inputSchema: searchCasesShape,
    },
    async (rawInput) => {
      const { query, jurisdiction, limit, format, sortBy, method, offset, includeJade } =
        searchCasesParser.parse(rawInput);
      const options = {
        type: "case" as const,
        jurisdiction,
        limit,
        sortBy,
        method,
        offset,
      };
      const austliiResults = await searchAustLii(query, options);

      if (includeJade) {
        const jadeResults = await searchJade(query, options);
        const merged = mergeSearchResults(austliiResults, jadeResults);
        return formatSearchResults(merged, format ?? "json");
      }

      return formatSearchResults(austliiResults, format ?? "json");
    },
  );

  const fetchDocumentShape = {
    url: z.string().url("URL must be valid."),
    format: formatEnum.optional(),
  };
  const fetchDocumentParser = z.object(fetchDocumentShape);

  server.registerTool(
    "fetch_document_text",
    {
      title: "Fetch Document Text",
      description:
        "Fetch full text for a legislation or case URL (AustLII or jade.io), with OCR fallback for scanned PDFs.",
      inputSchema: fetchDocumentShape,
    },
    async (rawInput) => {
      const { url, format } = fetchDocumentParser.parse(rawInput);
      const response = await fetchDocumentText(url);
      return formatFetchResponse(response, format ?? "json");
    },
  );

  const resolveJadeArticleShape = {
    articleId: z.number().int().min(1, "Article ID must be a positive integer."),
  };
  const resolveJadeArticleParser = z.object(resolveJadeArticleShape);

  server.registerTool(
    "resolve_jade_article",
    {
      title: "Resolve jade.io Article",
      description:
        "Resolve metadata for a jade.io article by its numeric ID. Returns case name, neutral citation, jurisdiction, and year. Useful for looking up specific articles on jade.io (BarNet Jade).",
      inputSchema: resolveJadeArticleShape,
    },
    async (rawInput) => {
      const { articleId } = resolveJadeArticleParser.parse(rawInput);
      const article = await resolveArticle(articleId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(article, null, 2),
          },
        ],
      };
    },
  );

  const jadeLookupShape = {
    citation: z.string().min(1, "Citation cannot be empty."),
  };
  const jadeLookupParser = z.object(jadeLookupShape);

  server.registerTool(
    "jade_citation_lookup",
    {
      title: "Look up Citation on jade.io",
      description:
        "Generate a jade.io lookup URL for a given neutral citation (e.g. '[2008] NSWSC 323'). Returns a URL that opens jade.io with the citation search. jade.io does not expose a public search API, so this provides a direct link for the user.",
      inputSchema: jadeLookupShape,
    },
    async (rawInput) => {
      const { citation } = jadeLookupParser.parse(rawInput);
      const lookupUrl = buildCitationLookupUrl(citation);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { citation, jadeUrl: lookupUrl },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  const searchJadeShape = {
    query: z.string().min(1, "Query cannot be empty."),
    jurisdiction: jurisdictionEnum.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    format: formatEnum.optional(),
    sortBy: sortByEnum.optional(),
    type: z.enum(["case", "legislation"]).default("case"),
  };
  const searchJadeParser = z.object(searchJadeShape);

  server.registerTool(
    "search_jade",
    {
      title: "Search jade.io (BarNet Jade)",
      description:
        "Search Australian legal materials on jade.io (BarNet Jade). Works without API access by cross-referencing AustLII search results with jade.io article metadata. Returns results with jade.io URLs when articles are found. Best for finding cases with jade.io links. For direct citation lookup, use search_jade_by_citation instead.",
      inputSchema: searchJadeShape,
    },
    async (rawInput) => {
      const { query, jurisdiction, limit, format, sortBy, type } =
        searchJadeParser.parse(rawInput);
      const results = await searchJade(query, {
        type,
        jurisdiction,
        limit,
        sortBy,
      });
      return formatSearchResults(results, format ?? "json");
    },
  );

  const searchJadeByCitationShape = {
    citation: z.string().min(1, "Citation cannot be empty."),
    format: formatEnum.optional(),
  };
  const searchJadeByCitationParser = z.object(searchJadeByCitationShape);

  server.registerTool(
    "search_jade_by_citation",
    {
      title: "Find jade.io Article by Citation",
      description:
        "Find a jade.io article by its neutral citation (e.g. '[2008] NSWSC 323', '[1992] HCA 23'). Resolves article metadata including case name, jurisdiction, and year from jade.io. Returns the jade.io article URL if found.",
      inputSchema: searchJadeByCitationShape,
    },
    async (rawInput) => {
      const { citation, format } = searchJadeByCitationParser.parse(rawInput);
      const article = await searchJadeByCitation(citation);
      if (!article) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { citation, found: false, message: "No jade.io article found for this citation." },
                null,
                2,
              ),
            },
          ],
        };
      }
      if (format === "text" || format === "markdown") {
        return {
          content: [
            {
              type: "text" as const,
              text: `${article.title}\nCitation: ${article.neutralCitation ?? "N/A"}\nURL: ${article.url}\nJurisdiction: ${article.jurisdiction ?? "N/A"}\nYear: ${article.year ?? "N/A"}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ citation, found: true, article }, null, 2),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal server error", error);
  process.exit(1);
});
