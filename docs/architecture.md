# Architecture Notes

## Objective
Deliver an MCP server that can:
- Search Australian legislation and case law from public sources (AustLII first, official registers where available).
- Return clean full text for use by LLMs, including OCR conversion for scanned PDFs.
- Prefer reported citations when available but fall back to neutral citations when paywalled or inaccessible.

## Key Components

### MCP Server (`src/index.ts`)
- Registers `search_legislation`, `search_cases`, `search_jade`, `search_jade_by_citation`, `fetch_document_text`, `resolve_jade_article`, and `jade_citation_lookup` tools.
- Normalises tool arguments and orchestrates downstream services.
- Formats responses for LLM consumption (structured JSON with citation metadata).
- Supports `includeJade` parameter on `search_cases` and `search_legislation` for multi-source merging.

### AustLII Service (`src/services/austlii.ts`)
- Executes HTTP searches against AustLII (`sinosrch.cgi`) with scoped filters.
- Parses result HTML, capturing:
  - Title
  - Reported citation (if provided)
  - Neutral citation
  - Jurisdiction code and year
  - Snippets for relevance
- Returns consistent `SearchResult` objects for cases and legislation.
- TODO: Add pagination handling and graceful degradation on rate limits.

### jade.io Service (`src/services/jade.ts`)
- Searches jade.io by cross-referencing AustLII results with jade.io article metadata.
- **Strategy**: jade.io is a GWT SPA with no public search API. Instead:
  1. Perform an AustLII search to get results with neutral citations
  2. For each result with a neutral citation, probe jade.io to resolve article info
  3. Extract metadata from the jade.io article page `<title>` tag
- Maximum 5 concurrent jade.io article resolutions to avoid overwhelming the server.
- Graceful fallback: if jade.io resolution fails, AustLII results are still returned.
- **Key functions**:
  - `searchJade(query, options)` – Full jade.io search via AustLII cross-reference
  - `searchJadeByCitation(citation)` – Find jade.io article by neutral citation
  - `deduplicateResults(results)` – Deduplicate by neutral citation, preferring jade.io
  - `mergeSearchResults(austlii, jade)` – Merge results from both sources

### Document Fetcher (`src/services/fetcher.ts`)
- Retrieves HTML or PDF content from provided URLs.
- Extracts text via:
  - Cheerio for HTML
  - `pdf-parse` for text-enabled PDFs
  - `node-tesseract-ocr` for image-based PDFs (triggered when PDF returns minimal text).
- Produces `FetchResponse` with metadata (`ocrUsed`, content type, detected citations inside the document).
- TODO: Cache downloaded files (tmpdir) and cleanup.

### Citation Normaliser (`src/services/citation.ts`) – planned
- Recognises neutral citation patterns (e.g. `[2021] HCA 12`).
- Forms fallback URLs (AustLII, JADE, BarNet LawCite) when original download fails.
- Produces machine-readable structure for LLM prompts.

## Deployment
- Node.js 20+ runtime with system-level Tesseract (`tesseract-ocr` package on Debian/Ubuntu).
- Docker image based on `node:20-bookworm-slim`, installing Tesseract + dependencies.
- CI workflow (GitHub Actions) to lint, test, build, and publish container image.

## Testing Strategy
- Unit tests with Vitest using recorded fixtures for AustLII HTML responses.
- Integration tests behind `npm run test:e2e` hitting live endpoints (skipped in CI without opt-in).
- OCR path tests using sample scanned PDF (placed in `test/fixtures`).

## Open Questions
- Which additional sources should we index for redundancy (e.g. Federal Register of Legislation API, Victorian Legislation & Parliamentary Documents API)?
- How aggressively should we cache results to avoid re-hitting public endpoints?
- Should we implement rate limiting/backoff within the server to respect source usage policies?
