#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadDenylist, scrubReasons } from "./vault-kb.mjs";
import { isExcludedKnowledge } from "../assets/chat/chat.js";

const kbPath = process.argv[2];
const denylistPath = process.argv[3];

if (!kbPath) {
  console.error("Usage: node scripts/check-kb-privacy.mjs path/to/kb.json [path/to/denylist]");
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(readFileSync(kbPath, "utf8"));
} catch {
  console.error(`Could not read knowledge base at ${kbPath}.`);
  process.exit(1);
}

if (!Array.isArray(entries)) {
  console.error("Knowledge base must be a JSON array.");
  process.exit(1);
}

const denylist = loadDenylist(denylistPath);
let failed = 0;
let checked = 0;
for (const entry of entries) {
  if (isExcludedKnowledge(entry)) {
    failed += 1;
    console.error("An excluded source or project was found in the knowledge base.");
    continue;
  }
  // Hand-written entries may include public contact details. The second scrub
  // applies to vault-sourced passages only.
  if (entry?.source !== "vault") continue;
  checked += 1;
  const text = [
    entry?.id,
    entry?.topic,
    entry?.answer,
    ...(Array.isArray(entry?.questions) ? entry.questions : []),
    ...(Array.isArray(entry?.tags) ? entry.tags : [])
  ].join("\n");
  const reasons = [...new Set(scrubReasons(text, denylist.terms))];
  if (!reasons.length) continue;
  failed += 1;
  const id = typeof entry?.id === "string" && entry.id ? entry.id : "(missing-id)";
  console.error(`Entry ${id} failed the privacy check (${reasons.join(", ")}).`);
}

if (failed) {
  console.error(`${failed} knowledge-base entries failed the privacy check.`);
  process.exit(1);
}

console.log(`Privacy check passed (${checked} vault entries).`);
