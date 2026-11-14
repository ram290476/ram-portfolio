#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { cleanAnswerBody, stripTopicLabel, stripLeadingRewordedQuestion, topicTitle } from "./vault-kb.mjs";

const kbPath = resolve(process.argv[2] || fileURLToPath(new URL("../assets/chat/kb.json", import.meta.url)));
const entries = JSON.parse(readFileSync(kbPath, "utf8"));
let labels = 0;
const reworded = [];
const updated = entries.map((entry) => {
  const afterLabel = stripTopicLabel(entry.answer, entry.topic);
  const hadLabel = afterLabel !== entry.answer;
  const afterReword = stripLeadingRewordedQuestion(afterLabel, topicTitle(entry.topic));
  const removedQuestion = afterLabel !== afterReword && afterLabel.endsWith(afterReword)
    ? afterLabel.slice(0, afterLabel.length - afterReword.length).trim()
    : "";
  const next = cleanAnswerBody(entry.answer, entry.topic);
  if (hadLabel) labels += 1;
  if (removedQuestion) {
    reworded.push({ id: entry.id, topic: entry.topic, removed: removedQuestion });
  }
  if (next === entry.answer) return entry;
  return { ...entry, answer: next };
});
writeFileSync(kbPath, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Removed a leading "Notes: <title>." label from ${labels} of ${entries.length} answers.`);
console.log(`Removed a leading reworded question from ${reworded.length} answers:`);
for (const item of reworded) {
  console.log(`- ${item.id}`);
  console.log(`  topic: ${item.topic}`);
  console.log(`  removed: ${item.removed}`);
}
