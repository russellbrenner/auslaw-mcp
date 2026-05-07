#!/usr/bin/env node
/**
 * Refresh AUSTLII_COOKIE in .env by decrypting the cookies Chrome already
 * holds for .austlii.edu.au. macOS only.
 *
 * No browser interaction needed — Chrome silently passes Cloudflare's challenge
 * with its normal browser fingerprint, so the cookies are already in Chrome's
 * cookie store; we just decrypt them and write to .env.
 *
 * Pipeline:
 *  1. `security find-generic-password -wa Chrome` reads Chrome's AES key from
 *     the macOS Keychain. macOS prompts for permission the first time.
 *  2. Derive 16-byte AES key via PBKDF2-HMAC-SHA1 (salt=saltysalt, iter=1003).
 *  3. Read encrypted_value blobs from Chrome's Cookies SQLite DB.
 *  4. AES-128-CBC decrypt with 16-byte IV of 0x20 ("space"); strip "v10"/"v11"
 *     prefix and PKCS#7 padding. Chrome ≥130 prepends a 32-byte SHA-256
 *     integrity hash that we also strip.
 *  5. Update AUSTLII_COOKIE in <project-root>/.env; preserve everything else.
 *
 * Exit codes: 0 success, 1 cookies missing in DB, 2 keychain access denied,
 * 3 decryption failed.
 */

import { execFileSync } from "node:child_process";
import { pbkdf2Sync, createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = path.dirname(HERE);
// Resolve all project roots that need the same .env. With git worktrees, the
// MCP server may be spawned from any of the main repo or any worktree — they
// all need the cookie. We enumerate every checkout via `git worktree list`.
const PROJECT_ROOTS = (() => {
  const roots = new Set([SCRIPT_ROOT]);
  try {
    const out = execFileSync(
      "git",
      ["-C", SCRIPT_ROOT, "worktree", "list", "--porcelain"],
      { encoding: "utf8" },
    );
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) {
        roots.add(line.slice("worktree ".length));
      }
    }
  } catch {
    // not a git checkout — fall through, write to SCRIPT_ROOT only
  }
  return [...roots];
})();
const COOKIE_DB = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome/Default/Cookies",
);

const HOST = ".austlii.edu.au";
const NAMES = ["cf_clearance", "__cf_bm"];

function step(msg) {
  console.error(`[refresh] ${msg}`);
}

// 1. Keychain key
function readChromeSafeStorageKey() {
  try {
    return execFileSync("security", ["find-generic-password", "-wa", "Chrome"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    console.error(
      "[refresh] Keychain access failed. Approve the macOS prompt for `security`, " +
        "or pre-approve it in Keychain Access > Chrome Safe Storage > Access Control.",
    );
    process.exit(2);
  }
}

// 2. Derive AES key
function deriveAesKey(safeStorageKey) {
  // Chrome on macOS: PBKDF2-HMAC-SHA1, salt='saltysalt', iter=1003, keyLen=16.
  return pbkdf2Sync(safeStorageKey, "saltysalt", 1003, 16, "sha1");
}

// 3. Read encrypted blobs from SQLite
function readEncryptedCookies() {
  const placeholders = NAMES.map((n) => `'${n}'`).join(",");
  const sql = `SELECT name, hex(encrypted_value) FROM cookies WHERE host_key='${HOST}' AND name IN (${placeholders});`;
  const out = execFileSync("sqlite3", [COOKIE_DB, sql], { encoding: "utf8" });
  const rows = {};
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [name, hex] = line.split("|");
    rows[name] = Buffer.from(hex, "hex");
  }
  for (const n of NAMES) {
    if (!rows[n]) {
      console.error(
        `[refresh] Cookie ${n} not found in DB. Visit https://www.austlii.edu.au/ in Chrome first.`,
      );
      process.exit(1);
    }
  }
  return rows;
}

// 4. Decrypt one blob
function decryptBlob(encrypted, aesKey) {
  const prefix = encrypted.slice(0, 3).toString("ascii");
  if (prefix !== "v10" && prefix !== "v11") {
    throw new Error(`Unknown Chrome encryption prefix: ${JSON.stringify(prefix)}`);
  }
  const ciphertext = encrypted.slice(3);
  const iv = Buffer.alloc(16, 0x20); // 16 bytes of 0x20
  const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
  decipher.setAutoPadding(true);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain;
}

// Strip Chrome ≥130 SHA-256(host) integrity prefix if present.
function stripIntegrityPrefix(plain, host) {
  // Chrome stores SHA-256(host_key) as the first 32 bytes of plaintext for
  // cookies it wrote in v10+; older entries don't have this. Detect by
  // checking whether the first 32 bytes equal sha256(host).
  if (plain.length < 32) return plain;
  const expected = createHash("sha256").update(host).digest();
  if (plain.slice(0, 32).equals(expected)) {
    return plain.slice(32);
  }
  return plain;
}

function main() {
  step("reading Chrome safe storage key from Keychain");
  const safeStorageKey = readChromeSafeStorageKey();
  step(`got key (length=${safeStorageKey.length})`);

  step("deriving AES-128 key");
  const aesKey = deriveAesKey(safeStorageKey);

  step("reading encrypted cookie blobs from Chrome's Cookies DB");
  const encrypted = readEncryptedCookies();
  for (const name of NAMES) {
    step(`  ${name}: ${encrypted[name].length} bytes encrypted`);
  }

  step("decrypting");
  const decrypted = {};
  for (const name of NAMES) {
    try {
      const plain = decryptBlob(encrypted[name], aesKey);
      const stripped = stripIntegrityPrefix(plain, HOST);
      decrypted[name] = stripped.toString("utf8");
    } catch (err) {
      console.error(`[refresh] decrypt ${name} failed: ${err.message}`);
      process.exit(3);
    }
    step(`  ${name}: ${decrypted[name].length} chars decrypted`);
  }

  // 5. Build cookie string and update every .env that's in scope.
  const cookieStr = NAMES.map((n) => `${n}=${decrypted[n]}`).join("; ");
  for (const root of PROJECT_ROOTS) {
    const envPath = path.join(root, ".env");
    const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    let next;
    if (/^AUSTLII_COOKIE=.*/m.test(env)) {
      next = env.replace(/^AUSTLII_COOKIE=.*/m, `AUSTLII_COOKIE="${cookieStr}"`);
    } else {
      next =
        env +
        (env.endsWith("\n") || env === "" ? "" : "\n") +
        `AUSTLII_COOKIE="${cookieStr}"\n`;
    }
    writeFileSync(envPath, next);
    step(`wrote ${envPath}`);
  }
  console.log(
    `OK refreshed cf_clearance(${decrypted.cf_clearance.length}) __cf_bm(${decrypted.__cf_bm.length}) -> ${PROJECT_ROOTS.length} .env file(s)`,
  );
}

main();
