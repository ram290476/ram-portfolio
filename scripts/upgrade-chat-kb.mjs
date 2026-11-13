#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isExcludedKnowledge, validKnowledge } from "../assets/chat/chat.js";
import { scrubReasons, splitLong } from "./vault-kb.mjs";

const titleMap = JSON.parse(readFileSync(new URL("./chat-public-titles.json", import.meta.url), "utf8"));
const bodyOf = (entry) => entry.answer.slice(entry.topic.length + 2);

export function upgradePublishedKnowledge(entries) {
  const original = new Map(entries.map((entry) => [entry.id, entry]));
  const repaired = [];
  for (const source of entries) {
    if (source.id.startsWith("public-summary-")) continue;
    const entry = structuredClone(source);
    if (entry.id === "projects") entry.answer = entry.answer.replace(/, a credit-union knowledge system/i, "");
    if (entry.id === "contact") entry.answer = entry.answer.replace(/, with no street address/i, "");
    if (isExcludedKnowledge(entry) || /^Notes: .*?\. Related(?:\s|$)/.test(entry.answer)) continue;
    const hash = entry.id.match(/-([0-9a-f]{6})(?:-|$)/)?.[1];
    if (entry.topic === "Notes: Related" && titleMap[hash]) {
      const oldTopic = entry.topic;
      entry.topic = `Notes: ${titleMap[hash]}`;
      entry.answer = entry.answer.replace(`${oldTopic}. `, `${entry.topic}. `);
      entry.questions = entry.questions.map((question) => question.replace("Related", titleMap[hash]));
      entry.tags = entry.tags.filter((tag) => tag !== "related").concat(titleMap[hash].toLowerCase().match(/[a-z0-9]+/g) || []);
    }
    if (entry.id.endsWith("a340f9-10")) entry.answer = entry.answer.split(" - Debugging:")[0];
    if (entry.id.endsWith("a340f9-11")) entry.answer = "Notes: Kubernetes horizontal pod autoscaling. - Debugging: kubectl describe hpa payments-api shows current vs. target values, conditions (AbleToScale, ScalingActive, ScalingLimited) and recent scaling events.";
    // The handwritten About entry must match the live About paragraph verbatim, even if it is longer than 649 characters.
    if (entry.id === "about" || entry.answer.length <= 649) { repaired.push(entry); continue; }
    const prefix = `${entry.topic}. `;
    for (const [index, passage] of splitLong(bodyOf(entry), 649 - prefix.length).entries()) {
      repaired.push({ ...entry, id: entry.id + (index ? `-reflow${index + 1}` : ""), answer: prefix + passage });
    }
  }

  const get = (id) => {
    const entry = original.get(id);
    if (!entry) throw new Error("A required already-public source passage is missing; do not guess a replacement.");
    return entry;
  };
  const cacheSource = get("note-cache-expiration-strategies-7c1e62-2");
  const cacheFacts = ["TTL (Time-to-Live)", "Sliding expiration", "Absolute expiration", "LRU eviction"].map((name) => {
    const cells = bodyOf(cacheSource).split("|");
    const index = cells.findIndex((cell) => cell.trim() === name);
    if (index < 0 || !cells[index + 1]) throw new Error("The approved cache table changed; review its summary first.");
    return `${name}: ${cells[index + 1].trim()}` + (name === "LRU eviction" ? `; ${cells[index + 3].trim()}` : "");
  });
  const definitions = [
    { key: "cache", aliases: ["Cache expiration strategies"], sources: [cacheSource.id], answer: `Notes: Cache expiration strategies. ${cacheFacts.join(". ")}.` },
    { key: "sast", aliases: ["SAST DAST", "SAST vs DAST", "SAST and DAST"], sources: ["note-sast-and-dast-2276e1", "note-sast-and-dast-2276e1-3"], answer: get("note-sast-and-dast-2276e1").answer + " " + bodyOf(get("note-sast-and-dast-2276e1-3")) },
    { key: "cri", aliases: ["CRI CNI CSI", "CRI CNI and CSI in Kubernetes"], sources: ["note-cri-cni-and-csi-in-kubernetes-163876-1"], answer: get("note-cri-cni-and-csi-in-kubernetes-163876-1").answer },
    { key: "proxy", aliases: ["Forward proxy vs reverse proxy"], sources: ["note-forward-proxy-vs-reverse-proxy-1b1f09-1"], answer: get("note-forward-proxy-vs-reverse-proxy-1b1f09-1").answer },
    { key: "consistency", aliases: ["Strong vs eventual consistency", "Strong consistency vs eventual consistency"], sources: ["note-strong-consistency-vs-eventual-consisten-21d86e"], answer: get("note-strong-consistency-vs-eventual-consisten-21d86e").answer }
  ];
  for (const { key, aliases, sources, answer } of definitions) {
    const topic = answer.slice(0, answer.indexOf(". "));
    repaired.push({ id: `public-summary-${key}`, topic, questions: [...aliases, `Tell me about ${topic.replace(/^Notes: /, "")}`], tags: ["notes", ...aliases], answer, link: "#skills", source: "vault", routeQuestions: aliases, publicSourceIds: sources });
  }
  if (!validKnowledge(repaired) || new Set(repaired.map((entry) => entry.id)).size !== repaired.length) throw new Error("Invalid repaired knowledge base.");
  let rejected = 0;
  for (const entry of repaired) {
    if (entry.id !== "about" && entry.answer.length > 649) throw new Error("An answer exceeds the existing size limit.");
    if (entry.source === "vault" && scrubReasons([entry.id, entry.topic, entry.answer, ...entry.questions, ...entry.tags].join("\n")).length) rejected += 1;
  }
  if (rejected) throw new Error(`Second scrub rejected ${rejected} repaired entries; knowledge base unchanged.`);
  return repaired;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kb = resolve(process.argv[2] || fileURLToPath(new URL("../assets/chat/kb.json", import.meta.url)));
  const entries = upgradePublishedKnowledge(JSON.parse(readFileSync(kb, "utf8")));
  writeFileSync(kb, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Updated ${entries.length} public entries; second scrub clean. No source notes changed.`);
}
