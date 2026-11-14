import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { tokenize, isExcludedKnowledge } from "../assets/chat/chat.js";

const SAFE_LINK = /^#[a-z0-9-]+$/;
const DEFAULT_LINK = "#about";
const MAX_ANSWER = 649;
const MIN_PASSAGE = 40;
const DEFAULT_MAX_BYTES = 512 * 1024;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EMAIL_SPACED = /\b[A-Z0-9._%+-]+\s+at\s+[A-Z0-9.-]+\s+dot\s+[A-Z]{2,}\b/i;
const PHONE = [
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\d{3}[\s.-]\d{4}\b/,
  /\b\d{10,11}\b/
];
const STREET = /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,4}(?:street|avenue|road|drive|lane|boulevard|court|place|terrace|circle|parkway|st|ave|rd|dr|ln|blvd|ct|pl|pkwy)\b\.?/i;
const PO_BOX = /\bp\.?\s*o\.?\s*box\s+\d+/i;
const ZIP_PLUS_4 = /\b\d{5}-\d{4}\b/;
const APARTMENT = /\b(?:apt|apartment)\.?\s+#?\d+\b/i;
const LONG_ID = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/,
  /\b\d{7,9}\b/,
  /\b\d{12,}\b/,
  /\bsocial\s+security\b|\bssn\b/i
];
const FAMILY = /\b(?:family|household)\s+income\b|\b(?:spouse|ex-wife|ex-husband)\b|\bmy\s+(?:wife|husband|son|daughter|kids|children|mom|dad|mother|father|parents)\b/i;
const EMPTY_COUNTS = () => ({ email: 0, phone: 0, money: 0, address: 0, score: 0, id: 0, family: 0, denylist: 0 });

// Second pass for issue #14: reject a passage that still looks private. Do not redact it.
export function scrubReasons(text, terms = []) {
  const reasons = [];
  const value = String(text ?? "");
  if (!value) return reasons;
  if (EMAIL.test(value) || EMAIL_SPACED.test(value)) reasons.push("email");
  if (PHONE.some((pattern) => pattern.test(value))) reasons.push("phone");
  if (hasMoney(value)) reasons.push("money");
  if (STREET.test(value) || PO_BOX.test(value) || ZIP_PLUS_4.test(value) || APARTMENT.test(value)) reasons.push("address");
  if (hasScore(value)) reasons.push("score");
  if (LONG_ID.some((pattern) => pattern.test(value))) reasons.push("id");
  if (FAMILY.test(value)) reasons.push("family");
  if (denied(value, terms)) reasons.push("denylist");
  return reasons;
}

const EXAM_UPPER = new RegExp("\\b(?:" + ["S", "AT"].join("") + "|" + ["A", "CT"].join("") + "|" + ["G", "RE"].join("") + ")\\b");

function hasMoney(value) {
  if (value.includes("$") || value.includes("\uFF04")) return true;
  if (/\b(?:salary|salaries|compensation|wage|wages|paycheck|paychecks|stipend|stipends|base\s+pay|total\s+comp|equity\s+grant|bonuses?)\b/i.test(value)) return true;
  if (/\b\d{2,3},\d{3}(?:\.\d{2})?\b/.test(value)) return true;
  if (/\b(?:usd|eur|gbp|inr)\s?\d|\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|gbp|inr|dollars|euros|pounds)\b/i.test(value)) return true;
  if (/\b(?:paid|pay|earn|earning|earnings)\b/i.test(value) && /\b\d{2,3}\s?k\b/i.test(value)) return true;
  return false;
}

function hasScore(value) {
  if (/\bgpa\b|\bgrade[\s-]*point\b|\bG\s*\.\s*P\s*\.\s*A\b/i.test(value)) return true;
  if (/\b(?:psat|gmat|toefl|ielts|lsat|mcat)\b/i.test(value)) return true;
  if (EXAM_UPPER.test(value)) return true;
  if (/\b(?:sat|act|gre)\s+scores?\b|\btest\s+scores?\b/i.test(value)) return true;
  if (/\b(?:score|scored|scores)\b[^.]{0,40}\d|\d[^.]{0,40}\b(?:score|scored|scores)\b/i.test(value)) return true;
  if (/\b[0-4]\.\d{1,2}\s*\/\s*4(?:\.0+)?\b/.test(value)) return true;
  return false;
}

function denied(value, terms) {
  if (!terms.length) return false;
  const haystack = value.normalize("NFKD").toLowerCase().replace(/\s+/g, " ");
  return terms.some((term) => haystack.includes(term));
}

export function loadDenylist(path) {
  if (!path || !existsSync(path)) return { status: "missing", terms: [], short: 0 };
  const terms = [];
  let short = 0;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const term = trimmed.normalize("NFKD").toLowerCase().replace(/\s+/g, " ");
    if (term.length < 3) short += 1;
    else terms.push(term);
  }
  return { status: terms.length ? "loaded" : "empty", terms, short };
}

export function parseFrontMatter(source) {
  const text = String(source).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  let closeAt = text.indexOf("\n---\n", 4);
  let bodyStart = closeAt === -1 ? -1 : closeAt + 5;
  if (closeAt === -1 && /\n---\s*$/.test(text)) {
    closeAt = text.lastIndexOf("\n---");
    bodyStart = text.length;
  }
  if (closeAt === -1) return { data: {}, body: text };
  return { data: parseYamlBlock(text.slice(4, closeAt)), body: text.slice(bodyStart).replace(/^\n/, "") };
}

function parseYamlBlock(block) {
  const data = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const raw = match[2].trim();
    if (raw === "") {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i += 1;
        items.push(unquote(stripComment(lines[i].replace(/^\s+-\s+/, ""))));
      }
      data[key] = items.length ? items : "";
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      data[key] = raw.slice(1, -1).split(",").map((part) => unquote(part.trim())).filter(Boolean);
      continue;
    }
    data[key] = unquote(stripComment(raw));
  }
  return data;
}

function stripComment(value) {
  if (value.startsWith('"') || value.startsWith("'")) return value;
  return value.replace(/\s+#.*$/, "");
}

function unquote(value) {
  const trimmed = String(value).trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function isPortfolioPublic(data) {
  return String(data?.portfolio ?? "").trim().toLowerCase() === "public";
}

function toPlain(markdown) {
  return String(markdown)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, (block) => ` ${block.replace(/```/g, " ")} `)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, "$1")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip a leading copy of the note title/question plus trailing punctuation
// and whitespace. Require punctuation after the title so a sentence that
// merely starts with the topic word ("Karpenter is an…") is left alone.
export function stripLeadingQuestion(text, title) {
  const name = String(title ?? "").replace(/[.?!:]+$/g, "").trim();
  const value = String(text ?? "");
  if (!name || !value) return value;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`^${escaped}[.?!]+\\s+`, "i"), "");
}

export function stripLeadingQuestionFromAnswer(answer, topic) {
  const prefix = `${topic}. `;
  if (!topic || !String(answer).startsWith(prefix)) return answer;
  const title = String(topic).replace(/^Notes:\s*/i, "").replace(/[.?!:]+$/g, "").trim();
  return prefix + stripLeadingQuestion(String(answer).slice(prefix.length), title);
}

function noteTitle(data, body, filename) {
  const fromMeta = typeof data.title === "string" ? data.title : "";
  const heading = [...body.matchAll(/^#{1,6}[ \t]+(.+)$/gm)].find((match) => !/^related(?:\s+notes)?$/i.test(match[1].trim()));
  const fromName = basename(filename).replace(/\.md$/i, "").replace(/[-_]+/g, " ");
  const title = toPlain(fromMeta || (heading ? heading[1] : "") || fromName).replace(/[.?!:]+$/g, "").trim();
  return (title || "Untitled").slice(0, 80);
}

function noteLink(data) {
  const link = typeof data.link === "string" ? data.link.trim() : "";
  return SAFE_LINK.test(link) ? link : DEFAULT_LINK;
}

function noteTags(data, title) {
  const listed = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
  const tags = [...listed.flatMap((tag) => tokenize(String(tag))), ...tokenize(title), "notes"];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter((tag) => tag.length > 1))].slice(0, 12);
}

function questionsFor(title, passage) {
  const name = title.trim() || "this note";
  const hint = tokenize(passage).slice(0, 8).join(" ");
  const questions = [`Tell me about ${name}`, `What does the note ${name} say?`];
  if (hint.length > 12) questions.push(`What about ${hint}?`);
  return questions;
}

function rawPassages(body) {
  let relatedLevel = 0;
  const content = String(body).split("\n").filter((line) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading && /^related(?:\s+notes)?$/i.test(heading[2].trim())) { relatedLevel = heading[1].length; return false; }
    if (heading && relatedLevel && heading[1].length <= relatedLevel) relatedLevel = 0;
    return !relatedLevel;
  }).join("\n");
  const blocks = content.split(/\n{2,}/);
  const groups = [];
  let heading = "";
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^\*{0,2}Source document:\*{0,2}.*\/(?:workspace|Users|home|tmp)\//i.test(trimmed)
      || /^Should I update .*\b(?:doc|project)\b/i.test(trimmed)) continue;
    if (/^#{1,6}\s+\S/.test(trimmed) && !trimmed.includes("\n")) {
      heading = trimmed;
      continue;
    }
    groups.push(heading ? `${heading}\n\n${trimmed}` : trimmed);
    heading = "";
  }
  if (heading) groups.push(heading);
  return groups;
}

export function splitLong(text, budget) {
  if (text.length <= budget) return [text];
  const parts = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (parts.length && /\bvs\.$/i.test(parts[parts.length - 1])) parts[parts.length - 1] += ` ${sentence}`;
    else parts.push(sentence);
  }
  const chunks = [];
  let current = "";
  const push = (piece) => { if (piece) chunks.push(piece); };
  for (const part of parts) {
    if (part.length > budget) {
      push(current);
      current = "";
      for (const piece of wrapWords(part, budget)) push(piece);
      continue;
    }
    if (!current) current = part;
    else if (`${current} ${part}`.length <= budget) current = `${current} ${part}`;
    else { push(current); current = part; }
  }
  push(current);
  return chunks;
}

function wrapWords(text, budget) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const piece = word.length > budget ? word.slice(0, budget) : word;
    if (!current) current = piece;
    else if (`${current} ${piece}`.length <= budget) current = `${current} ${piece}`;
    else { chunks.push(current); current = piece; }
  }
  if (current) chunks.push(current);
  return chunks;
}

function slugify(value) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "note";
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 6);
}

function collectMarkdown(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      const error = new Error("Vault directory could not be read");
      error.code = "UNREADABLE";
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
    }
  }
  return files.sort();
}

function blankReport(status, vaultDir, entries, extra = {}) {
  return {
    status,
    vaultDir,
    entries,
    changed: false,
    markdown: 0,
    publicNotes: 0,
    ignored: 0,
    appended: 0,
    rejected: 0,
    short: 0,
    skippedLarge: 0,
    handWritten: entries.filter((entry) => entry?.source !== "vault").length,
    denylist: "missing",
    denylistTerms: 0,
    denylistShort: 0,
    counts: EMPTY_COUNTS(),
    ...extra
  };
}

export function buildKnowledge({ vaultDir, baseEntries, denylistPath, maxBytes = DEFAULT_MAX_BYTES }) {
  if (!Array.isArray(baseEntries)) throw new Error("Knowledge base must be a JSON array");
  if (!vaultDir) return blankReport("absent", vaultDir || "", baseEntries);
  if (!existsSync(vaultDir)) return blankReport("absent", vaultDir, baseEntries);
  const stat = statSync(vaultDir);
  if (!stat.isDirectory()) return blankReport("not-directory", vaultDir, baseEntries);
  let files;
  try {
    files = collectMarkdown(vaultDir);
  } catch (error) {
    if (error.code === "UNREADABLE") return blankReport("unreadable", vaultDir, baseEntries);
    throw error;
  }
  if (!files.length) return blankReport("empty", vaultDir, baseEntries);

  const denylist = loadDenylist(denylistPath);
  const counts = EMPTY_COUNTS();
  let rejected = 0;
  let short = 0;
  let skippedLarge = 0;
  let ignored = 0;
  let publicNotes = 0;
  const curated = baseEntries.filter((entry) => entry?.source !== "vault" && !isExcludedKnowledge(entry));
  const used = new Set(curated.map((entry) => entry.id));
  const notes = [];

  const tally = (reasons) => {
    rejected += 1;
    for (const reason of reasons) counts[reason] += 1;
  };

  for (const file of files) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      const error = new Error("Vault directory could not be read");
      error.code = "UNREADABLE";
      throw error;
    }
    if (size > maxBytes) {
      skippedLarge += 1;
      continue;
    }
    const source = readFileSync(file, "utf8");
    const { data, body } = parseFrontMatter(source);
    if (!isPortfolioPublic(data) || isExcludedKnowledge(relative(vaultDir, file)) || isExcludedKnowledge(data.title || "")) {
      ignored += 1;
      continue;
    }
    publicNotes += 1;
    const relativePath = relative(vaultDir, file).replaceAll("\\", "/");
    const title = noteTitle(data, body, file);
    const link = noteLink(data);
    const tags = noteTags(data, title);
    const topic = `Notes: ${title}`;
    const budget = MAX_ANSWER - topic.length - 2;
    const titleReasons = [...new Set([
      ...scrubReasons(title, denylist.terms),
      ...scrubReasons(topic, denylist.terms),
      ...scrubReasons(tags.join(" "), denylist.terms)
    ])];
    if (titleReasons.length) {
      tally(titleReasons);
      continue;
    }
    const hash = shortHash(relativePath);
    const slug = slugify(title);
    let emitted = 0;
    for (const raw of rawPassages(body)) {
      const rawReasons = scrubReasons(raw, denylist.terms);
      if (isExcludedKnowledge(raw)) rawReasons.push("denylist");
      if (rawReasons.length) {
        tally(rawReasons);
        continue;
      }
      const plains = splitLong(stripLeadingQuestion(toPlain(raw), title), budget).filter((passage) => passage.length >= MIN_PASSAGE);
      if (!plains.length) {
        short += 1;
        continue;
      }
      for (const passage of plains) {
        const answer = `${topic}. ${passage}`;
        const questions = questionsFor(title, passage);
        const reasons = [...new Set([
          ...scrubReasons(passage, denylist.terms),
          ...scrubReasons(answer, denylist.terms),
          ...scrubReasons(questions.join("\n"), denylist.terms)
        ])];
        if (reasons.length) {
          tally(reasons);
          continue;
        }
        if (answer.length > MAX_ANSWER) {
          rejected += 1;
          continue;
        }
        emitted += 1;
        let id = `note-${slug}-${hash}${emitted > 1 || plains.length > 1 ? `-${emitted}` : ""}`;
        while (used.has(id)) id = `${id}-x`;
        used.add(id);
        notes.push({ id, topic, questions, answer, tags, link, source: "vault" });
      }
    }
  }

  const entries = [...curated, ...notes];
  return {
    status: "ready",
    vaultDir,
    entries,
    changed: JSON.stringify(entries) !== JSON.stringify(baseEntries),
    markdown: files.length,
    publicNotes,
    ignored,
    appended: notes.length,
    rejected,
    short,
    skippedLarge,
    handWritten: curated.length,
    denylist: denylist.status,
    denylistTerms: denylist.terms.length,
    denylistShort: denylist.short,
    counts
  };
}

export function formatReport(report) {
  if (report.status === "absent") {
    return `Vault directory not found (${report.vaultDir || "(none)"}). No notes added. kb.json unchanged.`;
  }
  if (report.status === "empty") {
    return `Vault directory is empty of Markdown notes (${report.vaultDir}). No notes added. kb.json unchanged.`;
  }
  if (report.status === "unreadable") {
    return `Vault directory could not be read (${report.vaultDir}). No notes added. kb.json unchanged.`;
  }
  if (report.status === "not-directory") {
    return `Vault path is not a directory (${report.vaultDir}). No notes added. kb.json unchanged.`;
  }
  const counts = report.counts;
  const denylist = report.denylist === "loaded" || report.denylist === "empty"
    ? `Denylist terms loaded: ${report.denylistTerms}. Short terms skipped: ${report.denylistShort}.`
    : "Denylist file not present. No extra terms applied.";
  return [
    `Vault notes: ${report.markdown} markdown, ${report.publicNotes} tagged public, ${report.ignored} ignored.`,
    denylist,
    `Scrub rejected ${report.rejected} passage(s). Counts: email=${counts.email} phone=${counts.phone} money=${counts.money} address=${counts.address} score=${counts.score} id=${counts.id} family=${counts.family} denylist=${counts.denylist}.`,
    `Short passages skipped: ${report.short}. Large files skipped: ${report.skippedLarge}.`,
    `Hand-written entries kept: ${report.handWritten}. Note passages appended: ${report.appended}.`
  ].join("\n");
}
