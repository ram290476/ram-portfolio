#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { stripLeadingQuestionFromAnswer } from "./vault-kb.mjs";

const kbPath = resolve(process.argv[2] || fileURLToPath(new URL("../assets/chat/kb.json", import.meta.url)));
const entries = JSON.parse(readFileSync(kbPath, "utf8"));
let changed = 0;
const updated = entries.map((entry) => {
  const next = stripLeadingQuestionFromAnswer(entry.answer, entry.topic);
  if (next === entry.answer) return entry;
  changed += 1;
  return { ...entry, answer: next };
});
writeFileSync(kbPath, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Stripped a leading repeated question from ${changed} of ${entries.length} answers.`);
