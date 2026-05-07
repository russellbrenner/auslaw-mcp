# auslaw-mcp - Claude Code Project Instructions

## Project Overview

MCP server for Australian/NZ legal research. Searches AustLII and jade.io, retrieves full-text judgments, formats AGLC4 citations.

## Build & Test

```bash
npm run build          # TypeScript compile
npm test               # All tests (unit + integration + perf; integration hits live services)
npx vitest run src/test/unit/  # Unit tests only (fast, no network)
npm run lint           # ESLint (flat config via eslint.config.mjs)
npm run lint:fix       # Auto-fix lint issues
```

- Always run `npm run build` before pushing (CI runs on push)
- Unit tests must all pass before committing; integration/perf test failures from network timeouts are acceptable
- ESLint uses flat config (`eslint.config.mjs`), NOT legacy `.eslintrc`

## When auslaw-mcp returns a 403 (Cloudflare cookie expired)

If any `mcp__auslaw-mcp__*` tool returns an error containing `"AUSTLII_COOKIE may have expired"` or `"AUSTLII_COOKIE is not set"`, **automatically refresh the cookie before doing anything else, then retry the failing tool call**. The user does not need to be prompted — this is a routine maintenance step that should be invisible to them.

The refresh procedure (do all of this without asking):

1. Ensure **Claude in Chrome** is connected: call `mcp__Claude_in_Chrome__list_connected_browsers`. If empty, ask the user to open Chrome with the Claude extension signed in. Otherwise:
2. Get an existing tab via `mcp__Claude_in_Chrome__tabs_context_mcp` (createIfEmpty: true), then navigate it to `https://www.austlii.edu.au/`. Read `document.title` — if it contains `"moment"` (Cloudflare's challenge page), wait 5 seconds and check again. Repeat up to ~3 times. Cloudflare almost always self-resolves silently for the user's normal Chrome.
3. Once `document.title` is `"Australasian Legal Information Institute"` (or anything other than `"Just a moment..."`), Chrome has stored fresh `cf_clearance` and `__cf_bm` cookies in its DB. Run:
   ```bash
   node /Users/JaamaeHB/auslaw-mcp/scripts/refresh-austlii-cookie.mjs
   ```
   This decrypts the cookies from Chrome's SQLite cookie store using the macOS Keychain key and writes `AUSTLII_COOKIE` to every `.env` in scope (main repo + any worktrees discovered via `git rev-parse --git-common-dir`). One-time keychain prompt the very first run; silent thereafter.
4. Kill running auslaw-mcp processes so they respawn against the new env:
   ```bash
   ps -ef | grep -E 'node .*auslaw-mcp.*dist/index\.js|node dist/index\.js' | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
   ```
5. Retry the original failing tool call with the same arguments.

Edge cases and recovery:

- **Cloudflare presents a visible challenge** (rare — only if the user's browser fingerprint is flagged): the title stays `"Just a moment..."` after a few polls. Tell the user to glance at the Chrome window and click anything Cloudflare asks for, then re-run from step 3.
- **Keychain access denied** (script exits with code 2): tell the user that the macOS Keychain prompt was declined or didn't appear; suggest re-running the script and clicking "Always Allow" in the dialog.
- **Cookies not in DB** (script exits with code 1): the user has never visited AustLII in this Chrome profile, or cookies were cleared. Navigate Chrome to AustLII first, then re-run.
- **Decryption fails** (exit 3): Chrome upgraded its cookie format. The script handles `v10`/`v11` and the Chrome ≥130 SHA-256 integrity prefix; anything else is a Chrome version drift — flag to the user, don't keep retrying silently.

Do **not** ask the user to manually paste cookies unless the automated refresh has failed for one of the reasons above — the whole point of this procedure is to remove the manual paste step.

The `AUSTLII_USER_AGENT` in `.env` does **not** need refreshing on each cookie rotation as long as the user's Chrome version doesn't change. If Chrome auto-updates and refreshes start failing with cookie-bound errors despite a successful run, capture the new UA via `mcp__Claude_in_Chrome__javascript_tool` running `navigator.userAgent` and update `AUSTLII_USER_AGENT` in `.env` to match.

## Key Architecture

- `src/index.ts` - MCP server, 10 tool registrations
- `src/services/jade-gwt.ts` - GWT-RPC protocol: `proposeCitables` (search), `avd2Request` (fetch), citator, strong names, GWT encoding
- `src/services/jade.ts` - jade.io integration: `searchJade`, `resolveArticle`, `searchCitingCases`, bridge section resolution
- `src/services/austlii.ts` - AustLII search with authority-based ranking
- `src/services/citation.ts` - AGLC4 formatting, validation, pinpoints
- `src/services/fetcher.ts` - Document retrieval (HTML, PDF, OCR, jade.io GWT-RPC)
- `docs/jade-gwt-protocol.md` - GWT-RPC reverse-engineering documentation

## jade.io GWT-RPC

The jade.io integration uses reverse-engineered GWT-RPC (Google Web Toolkit Remote Procedure Call). Key concepts:

- **Strong names** change on jade.io redeployment; update from HAR captures (see below)
- **proposeCitables** = search/autocomplete endpoint (JadeRemoteService)
- **avd2Request** = fetch judgment content (ArticleViewRemoteService)
- **LeftoverRemoteService** = citation search ("who cites this article") - implemented as `search_citing_cases` tool
- **Bridge section** = last ~10% of proposeCitables flat array; contains record-ID/article-ID pairs
- **Citable IDs** = internal IDs in 2M-10M range (different from article IDs 100-2M); input to citator
- **`.concat()` responses** = GWT splits arrays >32768 elements via `.concat()` join; `parseGwtConcatResponse()` handles this
- Article IDs are resolved via public GET to `jade.io/article/{id}` (no session cookie needed)

### Strong name updates

When jade.io redeploys, the GWT strong names (type hashes) change. To update:
1. Capture a HAR from jade.io (see Proxyman workflow below)
2. Find the `jadeService.do` POST requests
3. Extract the new strong name from the request body (field 4 in the pipe-delimited GWT-RPC payload)
4. Update constants in `src/services/jade-gwt.ts`: `JADE_STRONG_NAME`, `AVD2_STRONG_NAME`, `LEFTOVER_STRONG_NAME`, `JADE_PERMUTATION`
5. Update `docs/jade-gwt-protocol.md`

## Proxyman Debug Workflow

Proxyman captures HTTPS traffic from Chrome for jade.io reverse engineering. CLI at:
`/Applications/Setapp/Proxyman.app/Contents/MacOS/proxyman-cli`

### Commands

```bash
PCLI=/Applications/Setapp/Proxyman.app/Contents/MacOS/proxyman-cli

# Clear session (start fresh capture)
$PCLI clear-session

# Export jade.io traffic as HAR
$PCLI export-log --mode domains --domains 'jade.io' --format har --output /tmp/jade-capture.har

# Export all traffic as HAR
$PCLI export-log --format har --output /tmp/all-traffic.har

# Export flows after a specific flow ID (incremental capture)
$PCLI export-log --format har --since <flow-id> --output /tmp/incremental.har
```

### Typical capture workflow

1. `$PCLI clear-session` - clear previous flows
2. Interact with jade.io in Chrome (search, click article, trigger "cited by", etc.)
3. `$PCLI export-log --mode domains --domains 'jade.io' --format har -o /tmp/jade-capture.har`
4. Parse the HAR with node to extract GWT-RPC request/response bodies

### HAR parsing helper

```javascript
const har = JSON.parse(require("fs").readFileSync("/tmp/jade-capture.har", "utf-8"));
const entries = har.log.entries.filter(e => e.request.url.includes("jadeService.do"));
entries.forEach((e, i) => {
  const body = e.request.postData?.text || "";
  const service = body.match(/JadeRemoteService|ArticleViewRemoteService|LeftoverRemoteService/)?.[0] || "unknown";
  console.log(`${i}: ${service}  respLen=${e.response.content?.text?.length || 0}`);
});
```

## Credentials

- `JADE_SESSION_COOKIE`: 1Password vault `avtgkjcqwia6tzg2swwrzuan44`, item `jvpdjofjrm7srts4kowdjol5dq`, field `credential`
- Retrieve via MCP: `mcp__agent-tools__op_get_secret(vault_id, item_id, "credential")`
- Cookie contains `IID`, `alcsessionid`, `cf_clearance`; expires periodically

## Testing Notes

- Fixtures in `src/test/fixtures/` - static GWT-RPC responses for deterministic unit tests
- Integration tests in `src/test/scenarios.test.ts` hit live AustLII/jade.io; flaky due to network
- Performance tests in `src/test/performance/` have generous timeouts but still flake under load
- The `parseProposeCitablesResponse` near-descriptor article ID offsets do NOT generalise across all responses; the bridge section + `resolveArticle` validation is the reliable path
