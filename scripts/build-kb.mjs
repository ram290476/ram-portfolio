#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildKnowledge, formatReport } from "./vault-kb.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const known = new Set(["--vault-dir", "--kb", "--denylist"]);

function flag(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

for (let i = 0; i < args.length; i += 1) {
  if (!args[i].startsWith("--")) continue;
  if (!known.has(args[i])) {
    console.error(`Unknown argument ${args[i]}.`);
    process.exit(1);
  }
  i += 1;
}

const vaultDir = flag("--vault-dir");
const kbPath = resolve(flag("--kb") || join(root, "assets/chat/kb.json"));
const denylistPath = resolve(flag("--denylist") || join(root, "scripts/chat-denylist.txt"));

if (!vaultDir) {
  console.log("Usage: node scripts/build-kb.mjs --vault-dir path/to/obsidian-job-search/notes [--kb assets/chat/kb.json] [--denylist scripts/chat-denylist.txt]");
  console.log("No vault directory was given. No notes added. kb.json unchanged.");
  process.exit(0);
}

let baseEntries;
try {
  baseEntries = JSON.parse(readFileSync(kbPath, "utf8"));
} catch {
  console.error(`Could not read knowledge base at ${kbPath}. kb.json unchanged.`);
  process.exit(1);
}

let report;
try {
  report = buildKnowledge({ vaultDir: resolve(vaultDir), baseEntries, denylistPath });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Vault build failed.");
  console.error("kb.json unchanged.");
  process.exit(1);
}

console.log(formatReport(report));
if (report.status === "unreadable" || report.status === "not-directory") process.exit(1);
if (report.status !== "ready") process.exit(0);
if (!report.changed) {
  console.log("kb.json unchanged.");
  process.exit(0);
}
writeFileSync(kbPath, `${JSON.stringify(report.entries, null, 2)}\n`);
console.log("kb.json updated.");
