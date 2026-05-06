/**
 * Side-effect-only module that loads `.env` from the project root, resolved
 * relative to this script's location rather than `process.cwd()`.
 *
 * Why this exists: some MCP clients (e.g. Claude Desktop on macOS) launch the
 * server with cwd=`/`, so the default `import "dotenv/config"` would silently
 * fail to find the project's `.env` and AUSTLII_COOKIE / JADE_SESSION_COOKIE
 * would be missing.
 *
 * Why a separate module: ESM resolves and evaluates imported modules before
 * the importing module's top-level statements run. Putting the dotenv call
 * inline in `index.ts` would execute it AFTER `config.ts` (transitively
 * imported) has already read `process.env`. By isolating the call in a
 * side-effect-only module and importing it FIRST in `index.ts`, the env is
 * populated before any other module evaluates.
 */
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is .../dist after build, .../src in dev — `..` lands at project root.
dotenvConfig({ path: path.join(here, "..", ".env") });
