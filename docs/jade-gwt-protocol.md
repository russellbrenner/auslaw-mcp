# jade.io GWT-RPC Protocol Reference

Reverse-engineered from HAR analysis of jade.io sessions (2026-03-02 and 2026-03-03).

HAR sources:
- `jade.io_03-02-2026-13-48-33.har`: article 67401 navigation (article content)
- `jade.io_03-03-2026-10-08-59.har`: "Mabo " and "rice v as" searches (case search)

---

## GWT-RPC Services Discovered

| Service | Strong Name | Methods |
|---------|------------|---------|
| JadeRemoteService | `16E3F568878E6841670449E07D95BA3E` | proposeCitables, searchArticles, getInitialContent, getArticleStructuredMetadata, loadTranches |
| ArticleViewRemoteService | `E2F710F48F8237D9E1397729B9933A69` | avd2Request, getCitedPreview |
| LeftoverRemoteService | `EF3980F48D304DEE936E425DA22C0A1D` | search (citation search: "who cites this article"), getCitableCitations |

Constants are in `src/services/jade-gwt.ts`.

---

## Endpoint

All GWT-RPC methods POST to `https://jade.io/jadeService.do`.

**Standard request headers:**
```
Content-Type: text/x-gwt-rpc; charset=UTF-8
X-GWT-Module-Base: https://jade.io/au.com.barnet.jade.JadeClient/
X-GWT-Permutation: 0BCBB10F3C94380A7BB607710B95A8EF
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
7|0|10|https://jade.io/au.com.barnet.jade.JadeClient/|16E3F568878E6841670449E07D95BA3E|au.com.barnet.jade.cs.remote.JadeRemoteService|proposeCitables|java.lang.String/2004016611|au.com.barnet.jade.cs.csobjects.qsearch.QuickSearchFlags/2740681188|{QUERY}|au.com.barnet.jade.cs.csobjects.qsearchdesktop.QuickSearchFlagsDesktop/2291862948|java.util.HashSet/3273092938|au.com.barnet.jade.cs.persistent.shared.CitableType/1576180844|1|2|3|4|2|5|6|7|8|1|1|1|0|0|1|0|9|4|10|0|10|1|10|2|10|3|1|0|0|1|0|9|0|0|0|0|0|1|1|1|
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
- GWT-encoded article IDs appear as short strings directly in the flat array (not in the string table)

### Parsing Strategy

The parser (`parseProposeCitablesResponse()` in `src/services/jade-gwt.ts`) uses "document in Jade" descriptor strings as anchors:

1. **Descriptors** follow the pattern:
   - `[YYYY] COURT NUM; REPORTER VOL PAGE - document in Jade` (with reported citation)
   - `[YYYY] COURT NUM - document in Jade` (neutral citation only)

2. **Article ID** location in the flat array:
   - For descriptors with `;`: article ID is at `flat_pos - 3` (before the two zero-padding values)
   - For descriptors without `;`: article ID is at `flat_pos + 4` (after Provenance class ref + [11, 1])

3. **Case name** lookup in the string table:
   - Scan backward from the descriptor's string table index, looking for a string containing ` v `
   - Maximum scan depth: 25 positions
   - Fallback for non-`;` descriptors: `string_table[descriptor_idx - 1]`

4. **Filtering**: HCATrans (transcript) entries are skipped. Entries with no discoverable article ID are skipped. Results are deduplicated by neutral citation.

### Known Data (from "Mabo " query)

| Result | Article ID (URL) | Citable ID (internal) | Descriptor |
|--------|-----------------|----------------------|------------|
| Mabo v Queensland (No 2) | 82343 (UGn) | 721251 (CwFj) | `[1992] HCA 23; 175 CLR 1` |
| Mabo v Queensland | 82308 (UGE) | 721178 (CwEa) | `[1988] HCA 69; 166 CLR 186` |

**Article IDs** (3-char GWT, ~82k range) are used in `jade.io/article/{id}` URLs.
**Citable IDs** (4-char GWT, ~721k range) are jade.io's internal citation object IDs. They are
NOT URL-addressable — resolving them via `/article/{id}` returns unrelated content.

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
- `82343` = "UGn" (Mabo [1992] HCA 23 article URL ID)
- `82308` = "UGE" (Mabo [1988] HCA 69 article URL ID)
- `721251` = "CwFj" (Mabo [1992] HCA 23 Citable ID — not URL-addressable)
- `721178` = "CwEa" (Mabo [1988] HCA 69 Citable ID — not URL-addressable)
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
- `search` (LeftoverRemoteService): citation context search ("who cites this article"), NOT freetext case search
- `proposeCitables` is the only method that returns full case search results in a single call
