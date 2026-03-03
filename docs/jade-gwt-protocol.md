# jade.io GWT-RPC Protocol Reference

Reverse-engineered from HAR analysis of jade.io sessions (2026-03-02 and 2026-03-03).

HAR sources:
- `jade.io_03-02-2026-13-48-33.har`: article 67401 navigation (article content)
- `jade.io_03-03-2026-10-08-59.har`: "Mabo " and "rice v as" searches (case search)
- `jade-ground-truth.har` (2026-03-03): six controlled queries with Chrome navigation to confirm true article IDs
- `jade-citator.har` (2026-03-03): citator search for Mabo [1992] HCA 23 (695 citing cases)

---

## GWT-RPC Services Discovered

| Service | Strong Name | Methods |
|---------|------------|---------|
| JadeRemoteService | `B4F37C2BEC5AB097C4C8696FD843C56D` | proposeCitables, searchArticles, getInitialContent, getArticleStructuredMetadata, loadTranches |
| ArticleViewRemoteService | `159521E79F7322FD92335ED73B4403F9` | avd2Request, getCitedPreview |
| LeftoverRemoteService | `CCB23EABE2EF1A4CA63F2E243C979468` | search (citation search: "who cites this article"), getCitableCitations |

Constants are in `src/services/jade-gwt.ts`.

---

## Endpoint

All GWT-RPC methods POST to `https://jade.io/jadeService.do`.

**Standard request headers:**
```
Content-Type: text/x-gwt-rpc; charset=UTF-8
X-GWT-Module-Base: https://jade.io/au.com.barnet.jade.JadeClient/
X-GWT-Permutation: FEBDA911A95AD2DF02425A9C60379101
Origin: https://jade.io
Referer: https://jade.io/
Cookie: <JADE_SESSION_COOKIE>
```

---

## proposeCitables (JadeRemoteService) — Case Search

The ONLY method that returns full case search results in a single call. Used by jade.io's search/autocomplete box.

### Request

Static template with the query string inserted at position 6 in the string table:

```
7|0|10|https://jade.io/au.com.barnet.jade.JadeClient/|B4F37C2BEC5AB097C4C8696FD843C56D|au.com.barnet.jade.cs.remote.JadeRemoteService|proposeCitables|java.lang.String/2004016611|au.com.barnet.jade.cs.csobjects.qsearch.QuickSearchFlags/2740681188|{QUERY}|au.com.barnet.jade.cs.csobjects.qsearchdesktop.QuickSearchFlagsDesktop/2291862948|java.util.HashSet/3273092938|au.com.barnet.jade.cs.persistent.shared.CitableType/1576180844|1|2|3|4|2|5|6|7|8|1|1|1|0|0|1|0|9|4|10|0|10|1|10|2|10|3|1|0|0|1|0|9|0|0|0|0|0|1|1|1|
```

The query string is embedded verbatim (no GWT encoding). See `buildProposeCitablesRequest()` in `src/services/jade-gwt.ts`.

### Response Format

```
//OK[<flat_int_array>, <type_table>, <string_table>, 4, 7]
```

- String table is at `parsed[parsed.length - 3]`
- Type table is at `parsed[parsed.length - 4]`
- Flat array is everything before the last 4 elements
- Negative integers in the flat array reference the string table: `-N` maps to `string_table[N-1]`
- GWT-encoded integers appear as short strings directly in the flat array (not in the string table)

### Parsing Strategy

The parser (`parseProposeCitablesResponse()` in `src/services/jade-gwt.ts`) uses "document in Jade" descriptor strings as anchors:

1. **Descriptors** follow the pattern:
   - `[YYYY] COURT NUM; REPORTER VOL PAGE - document in Jade` (with reported citation)
   - `[YYYY] COURT NUM - document in Jade` (neutral citation only)

2. **Validity integer** location in the flat array (used as presence check, stored as `articleId`):
   - For descriptors with `;`: GWT-encoded integer at `flat_pos - 3`
   - For descriptors without `;`: GWT-encoded integer at `flat_pos + 4`
   - **These are NOT jade.io article IDs.** They are internal entity/citable IDs that resolve to
     unrelated articles when used in URLs. True article IDs are extracted from the bridge section (below).

3. **Case name** lookup in the string table:
   - Scan backward from the descriptor's string table index, looking for a string containing ` v `
   - Maximum scan depth: 100 positions
   - Fallback for non-`;` descriptors: `string_table[descriptor_idx - 1]`

4. **Filtering**: HCATrans (transcript) entries are skipped. Entries with no discoverable article ID are skipped. Results are deduplicated by neutral citation.

### Article ID Resolution (Bridge Section)

True jade.io article IDs (used in `jade.io/article/{id}` URLs) are found in the **bridge section**,
the last ~10% of the flat array. This is a lookup table mapping internal record IDs to article IDs.

**Structural pattern**: `[record ID] [article ID]`

```
flat[i-1] = GWT-encoded record ID   (larger value, e.g. 20422242 = "BN55i")
flat[i]   = GWT-encoded article ID  (smaller value, e.g. 776897 = "C9rB")
```

Both values are GWT base-64 encoded strings. The record ID is always numerically larger than the
article ID. Article IDs fall in the 100-2,000,000 range (2-5 character GWT strings).

**Extraction algorithm** (`extractBridgeCandidates()` in `src/services/jade-gwt.ts`):
1. Scan the last 10% of the flat array
2. Find GWT-encoded strings (2-5 chars) decoding to 100-2,000,000
3. Score as **high confidence** if preceded by a larger GWT value (record ID pattern)
4. Score as **medium confidence** otherwise
5. Cap at 30 candidates

**Validation**: each candidate is resolved via a public GET to `jade.io/article/{id}`. The HTML
`<title>` tag contains the case name and neutral citation. Only candidates whose neutral citation
matches a search result are accepted. Unmatched results fall back to citation search URLs.

See `resolveBridgeCandidates()` in `src/services/jade.ts`.

### Known Data

Ground-truth article IDs confirmed via Chrome navigation (2026-03-03):

| Query | Case | Article ID | GWT | Bridge Position % |
|-------|------|-----------|-----|-------------------|
| Mabo | Mabo v Queensland (No 2) [1992] HCA 23 | 67683 | Qhj | 95.5% |
| Rogers v Whitaker | Rogers v Whitaker [1992] HCA 58 | 67721 | QiJ | 95.2% |
| Dietrich v The Queen | Dietrich v The Queen [1992] HCA 57 | 67720 | QiI | 94.4% |
| Kozarov v Victoria | Victoria v Kozarov [2020] VSCA 301 | 776897 | C9rB | 93.7% |
| Kozarov v Victoria | Kozarov v State of Victoria [2020] VSC 78 | 712770 | CuBC | 94.8% |
| Kozarov v Victoria | Kozarov v Victoria [2022] HCA 12 | 912625 | Dezp | 95.9% |

**Candidate counts per response**:

| Query | Descriptors | High-confidence candidates | Total bridge candidates |
|-------|------------|---------------------------|------------------------|
| Kozarov | 6 | 6 | 7 |
| Rogers v Whitaker | 3 | 7 | 10 |
| Mabo | 16 | 94 | 309 |

---

## search (LeftoverRemoteService) — Citator ("Who Cites This Case?")

Performs a citation-context search: given a case's citable ID, returns cases that cite it.

### Key Concepts

- **Citable ID**: An internal jade.io identifier in the **2M-10M range** (e.g., Mabo = 2463606, GWT: "JZd2").
  This is NOT the same as the article ID (100-2M range) used in `jade.io/article/{id}` URLs.
- **How to get a citable ID**: Call `proposeCitables` first, parse the flat array with
  `extractCitableIds()`, and use the last citable ID (primary match).

### Two-Phase Flow

```
1. proposeCitables(caseName)   → flatArray → extractCitableIds() → citableId
2. LeftoverRemoteService.search(citableId) → parseCitatorResponse() → { results, totalCount }
```

See `searchCitingCases()` in `src/services/jade.ts`.

### Request

Static template with the citable ID (GWT-encoded) at string table position 12.
Template captured verbatim from `jade-citator.har` (2026-03-03). Byte-for-byte verified.

See `buildCitatorSearchRequest()` in `src/services/jade-gwt.ts`.

Criteria encoded in the template:
- Sort: effective date descending
- IgnoreSelfCitations: true
- IgnoreShortCitations: true (repeated citations in short sections)

### Response Format

The response uses GWT's `.concat()` segment joining for arrays exceeding 32768 elements:

```
//OK[seg1...].concat([seg2..., [type_table], [string_table], 4, 7])
```

See `parseGwtConcatResponse()` in `src/services/jade-gwt.ts`.

After reassembly:
- `string_table` = `fullArray[fullArray.length - 3]` (1647 entries for Mabo)
- `type_table` = `fullArray[fullArray.length - 4]` (6893 entries for Mabo)
- `flat_array` = `fullArray.slice(0, fullArray.length - 3)` (46850 entries for Mabo)

### Parsing Strategy

`parseCitatorResponse()` in `src/services/jade-gwt.ts`:

1. **Article ID map**: scan string table for `jade.io/article/src/{id}/` URLs; for each, look
   ±30 positions for a non-zero-padded neutral citation to build a citation → article ID map.
2. **Citations**: scan string table for non-zero-padded neutral citations (`/^\[\d{4}\]\s+[A-Z]/`)
   shorter than 40 chars.
3. **Case names**: for each citation, scan forward (idx+1..idx+10), then backward (idx-1..idx-20)
   for a string containing ` v ` or ` & `. Strip trailing `[citation]` suffix.
4. **totalCount**: scan last 2500 elements of flat array for a positive integer preceded by `5`
   (Article type index) and followed by a value < -1000 (large string table reference).

### Known Data

| Case | Citable ID | GWT | Total Citing Cases |
|------|-----------|-----|--------------------|
| Mabo v Queensland (No 2) [1992] HCA 23 | 2463606 | JZd2 | 695 |

**Stuart v South Australia [2025] HCA 12** (article 1127773) confirmed as citing Mabo in this fixture.

---

## avd2Request (ArticleViewRemoteService) — Article Content

Primary method for loading article content. Reliably returns full article HTML including paragraph anchors.

See `buildAvd2Request()` and `parseAvd2Response()` in `src/services/jade-gwt.ts`.

---

## GWT Integer Encoding

GWT uses a custom base-64 charset: `A-Z (0-25), a-z (26-51), 0-9 (52-61), $ (62), _ (63)`.

- `encodeGwtInt(n)`: converts integer to GWT base-64 string
- `decodeGwtInt(s)`: inverse — converts GWT base-64 string back to integer

Examples:
- `67401` = "QdJ"
- `67683` = "Qhj" (Mabo [1992] HCA 23 true article ID)
- `82343` = "UGn" (near-descriptor integer, NOT the article URL ID)
- `721251` = "CwFj" (near-descriptor integer, NOT the article URL ID)
- `1182103` = "EgmX"

---

## Authentication

All methods require `JADE_SESSION_COOKIE`. Extract from browser DevTools:
> Network tab > any jadeService.do request > Request Headers > Cookie

The cookie typically has the form: `IID=...; alcsessionid=...; cf_clearance=...`

---

## Strong Name Staleness

Strong names (type hashes) change when jade.io redeploys its GWT application. If requests return `//EX` exception responses, refresh the strong name:

1. Open jade.io in a browser
2. DevTools > Network tab > filter for `jadeService.do`
3. Click any request > Request Headers > `X-GWT-Permutation`
4. Update `JADE_PERMUTATION` in `src/services/jade-gwt.ts`
5. Also compare `X-GWT-Module-Base` to check if `JADE_MODULE_BASE` changed
6. For service-specific strong names, look at the POST body (pipe-delimited field 5)

---

## Why Not Other Methods?

- `searchArticles` (JadeRemoteService): returns only GWT-encoded article IDs, no case names — requires a second metadata call per result
- `search` (LeftoverRemoteService): citation context search ("who cites this article") — implemented as `search_citing_cases` MCP tool
- `proposeCitables` is the only method that returns full case search results in a single call
