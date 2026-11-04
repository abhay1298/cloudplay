#!/usr/bin/env node
/**
 * CloudPlay: run on your own computer.
 *   node scripts/start.mjs            set up on first run, then start
 *   node scripts/start.mjs --setup    re-enter password / public address
 *
 * - Checks Node.js (22.13+ required for the built-in SQLite)
 * - First run: asks for a password and (optional) your Tailscale https address, saves them in .env.local
 * - Installs dependencies and builds when needed
 * - Starts CloudPlay on http://127.0.0.1:3000 (this computer only; Tailscale makes it reachable from your phone)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const ENV_FILE = path.join(root, ".env.local");
const PORT = process.env.PORT || "3000";
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// ---- Node version ----------------------------------------------------------
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(`Node.js 22.13 or newer is required (you have ${process.versions.node}). Install the LTS version from https://nodejs.org and try again.`);
}

// ---- Settings (.env.local) -------------------------------------------------
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

async function setup(existing) {
  const rl = readline.createInterface({ input: process.stdin, terminal: process.stdin.isTTY });
  // Line-buffered reader: works when answers are typed, pasted together, or piped.
  const input = rl[Symbol.asyncIterator]();
  const ask = async (q) => {
    process.stdout.write(q);
    const { value, done } = await input.next();
    if (done) fail("Setup was cancelled (no input). Run the script again in a terminal window.");
    if (!process.stdin.isTTY) process.stdout.write("\n");
    return value ?? "";
  };
  console.log("\n=== CloudPlay setup ===\n");
  let password = "";
  while (password.length < 8) {
    password = (await ask("Choose a password for CloudPlay (at least 8 characters): ")).trim();
    if (password.length < 8) console.log("  Too short, try again.");
    if (/[\r\n"'`$\\]/.test(password)) {
      console.log("  Please avoid quotes, $, ` and backslashes.");
      password = "";
    }
  }
  console.log("\nIf you use Tailscale, paste your address (looks like https://my-pc.tail1234.ts.net).");
  let publicUrl = (await ask("Tailscale address (press Enter to skip for now): ")).trim().replace(/\/+$/, "");
  if (publicUrl && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(publicUrl)) {
    console.log("  That doesn't look like https://name.something - skipping. Re-run with --setup later.");
    publicUrl = "";
  }
  rl.close();
  const lines = [
    "# CloudPlay settings (created by scripts/start.mjs). Keep this file private.",
    `APP_PASSWORD=${password}`,
    `PUBLIC_URL=${publicUrl}`,
    "TRUST_PROXY=true",
    "DATABASE_PATH=./data/cloudplay.db",
    "",
  ];
  fs.writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
  console.log("\n✔ Saved settings to .env.local\n");
  return { ...existing, APP_PASSWORD: password, PUBLIC_URL: publicUrl };
}

let env = readEnv();
if (!env.APP_PASSWORD || process.argv.includes("--setup")) env = await setup(env);

// ---- Install & build when needed -------------------------------------------
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWin });
  if (r.status !== 0) fail(`"${cmd} ${args.join(" ")}" failed. Scroll up for the error.`);
}

function newestMtime(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const f of fs.readdirSync(p)) max = Math.max(max, newestMtime(path.join(p, f)));
  return max;
}

const lock = path.join(root, "package-lock.json");
const installedStamp = path.join(root, "node_modules", ".package-lock.json");
if (!fs.existsSync(installedStamp) || fs.statSync(lock).mtimeMs > fs.statSync(installedStamp).mtimeMs) {
  console.log("Installing CloudPlay (first time can take a few minutes)…");
  run(npm, ["ci", "--no-audit", "--no-fund"]);
}

const buildId = path.join(root, ".next", "BUILD_ID");
const sourceTime = Math.max(...["src", "public", "package-lock.json", "next.config.ts"].map((p) => newestMtime(path.join(root, p))));
if (!fs.existsSync(buildId) || sourceTime > fs.statSync(buildId).mtimeMs) {
  console.log("Building CloudPlay…");
  run(npm, ["run", "build"]);
}

// ---- Start -----------------------------------------------------------------
fs.mkdirSync(path.join(root, "data"), { recursive: true });
console.log(`
✔ CloudPlay is starting.
  On this computer:  http://localhost:${PORT}
  ${env.PUBLIC_URL ? `On your iPhone:    ${env.PUBLIC_URL}   (Tailscale must be ON on the phone)` : "iPhone access:     set up Tailscale (see LOCAL_SERVER.md), then run:  node scripts/start.mjs --setup"}
  Keep this window open. Press Ctrl+C to stop.
`);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", PORT], {
  stdio: "inherit",
  env: { ...process.env, ...env, NODE_ENV: "production" },
});
// Pass Ctrl+C / termination on to the server so it never keeps running in the background.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    child.kill(sig);
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
  });
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
