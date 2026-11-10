#!/usr/bin/env node
// Working tree, asset metadata, and git history checks that privacy-scan.sh
// does not already cover: personal mailboxes, compensation figures, family
// details, government-id shapes, and identity metadata on images and documents.
// Findings are reported as rule, file, and line. Matched text is not printed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const PUBLIC_EMAIL = "ram.vellamsetti@gmail.com";

// These commits still contain a personal mailbox address in the setup notes.
// The address is omitted here on purpose. Ignore that historical email until
// the history is rewritten. Any other address, file, or commit still fails.
const HISTORY_EMAIL_EXCEPTIONS = [
  {
    commit: "0a3b8f9f2585a19b9db3a8b2e355ade5bf7f050b",
    path: "booking-worker/SETUP.md"
  },
  {
    commit: "a4869d4332767244cc16405af8c0ad02ee54b0aa",
    path: "booking-worker/SETUP.md"
  }
];

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const EMAIL_OBFUSCATED = /\b[A-Z0-9._%+-]+\s+at\s+[A-Z0-9.-]+\s+dot\s+[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;
const STREET = /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.|Lane|Ln\.|Boulevard|Blvd\.|Court|Ct\.|Place|Pl\.|Terrace|Circle|Parkway)\b/g;
const academicAverage = ["G", "P", "A"].join("");
const gradePattern = new RegExp(`\\b${academicAverage}\\b|grade[\\s-]*point|\\bG\\s*\\.\\s*P\\s*\\.\\s*A\\b`, "gi");
const examNames = [["SA", "T"], ["GR", "E"], ["GM", "AT"], ["TO", "EFL"], ["IE", "LTS"], ["PS", "AT"], ["LS", "AT"], ["MC", "AT"]]
  .map((parts) => parts.join(""));
const examPattern = new RegExp(`\\b(?:${examNames.join("|")})\\b`, "g");
const INCOME = /\b(?:family|household)\s+income\b/gi;
const SSN_SHAPE = /\b\d{3}-\d{2}-\d{4}\b/g;
const ASSET_EXT = new Set([".pdf", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const TEXT_EXT = new Set([
  ".html", ".js", ".mjs", ".css", ".json", ".md", ".txt", ".yml", ".yaml",
  ".toml", ".svg", ".py", ".ts", ".sh", ".xml"
]);
const IDENTITY_KEY = /(^|:)(Author|Creator|LastModifiedBy|Artist|OwnerName|Copyright|CopyrightNotice|ImageDescription|UserComment|XPComment|Comment|CameraOwnerName|GPSLatitude|GPSLongitude|GPSPosition|GPSAltitude)$/i;

const salaryWord = ["sal", "ary"].join("");
const compensationWord = ["comp", "ensation"].join("");
const paycheckWord = ["pay", "check"].join("");
const stipendWord = ["sti", "pend"].join("");
const SALARY_FIGURE = new RegExp(
  `\\b(?:${salaryWord}|${salaryWord.slice(0, 3)}aries|${compensationWord}|base pay|total comp|${paycheckWord}|${stipendWord})\\b.{0,40}(?:\\$|\\d)|(?:\\$\\s?\\d{2,3}(?:,\\d{3})+)`,
  "i"
);
const familyWife = ["wi", "fe"].join("");
const familyHusband = ["hus", "band"].join("");
const FAMILY_DETAIL = new RegExp(
  `\\b(?:my|our)\\s+(?:${familyWife}|${familyHusband}|son|daughter|kids|children|mom|dad|mother|father|parents|brother|sister)\\b|\\b(?:spouse|ex-${familyWife}|ex-${familyHusband})\\b`,
  "i"
);
const socialSecurity = ["social", "security"].join(" ");
const passportNumber = ["passport", "number"].join(" ");
const licensePhrase = ["driver", "license"].join("'s ");
const GOV_ID_WORD = new RegExp(`\\b(?:${socialSecurity}|${passportNumber}|${licensePhrase})\\b`, "i");

function salaryFamilySkipped(file) {
  return file.startsWith("tests/")
    || file === "scripts/vault-kb.mjs"
    || file === "scripts/check-public-surface.mjs"
    || file === "scripts/privacy-scan.sh";
}

export function isAllowedEmail(value) {
  const email = String(value).toLowerCase();
  if (email === PUBLIC_EMAIL) return true;
  if (email.endsWith("@example.com")) return true;
  if (email.endsWith("@users.noreply.github.com")) return true;
  const domain = email.split("@")[1] || "";
  const tld = domain.split(".").pop();
  if (["jpg", "jpeg", "png", "webp", "gif", "svg", "ico", "css", "js"].includes(tld)) return true;
  return false;
}

export function isHistoryEmailException(commit, file) {
  return HISTORY_EMAIL_EXCEPTIONS.some((item) => item.commit === commit && item.path === file);
}

function pushMatch(issues, rule, file, line, commit) {
  issues.push({ rule, file, line, commit: commit || "" });
}

export function findIssues(text, file, options = {}) {
  const issues = [];
  const commit = options.commit || "";
  const documents = Boolean(options.documents);
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    EMAIL.lastIndex = 0;
    for (const match of line.matchAll(EMAIL)) {
      if (isAllowedEmail(match[0])) continue;
      if (commit && isHistoryEmailException(commit, file)) continue;
      pushMatch(issues, "email", file, lineNo, commit);
    }
    EMAIL_OBFUSCATED.lastIndex = 0;
    if (EMAIL_OBFUSCATED.test(line)) pushMatch(issues, "email", file, lineNo, commit);
    if (!salaryFamilySkipped(file) && SALARY_FIGURE.test(line)) {
      pushMatch(issues, "compensation", file, lineNo, commit);
    }
    if (!salaryFamilySkipped(file) && FAMILY_DETAIL.test(line)) {
      pushMatch(issues, "family", file, lineNo, commit);
    }
    SSN_SHAPE.lastIndex = 0;
    if (SSN_SHAPE.test(line) || GOV_ID_WORD.test(line)) {
      pushMatch(issues, "government-id", file, lineNo, commit);
    }
    if (!documents) return;
    PHONE.lastIndex = 0;
    if (PHONE.test(line)) pushMatch(issues, "phone", file, lineNo, commit);
    STREET.lastIndex = 0;
    if (STREET.test(line)) pushMatch(issues, "street", file, lineNo, commit);
    gradePattern.lastIndex = 0;
    if (gradePattern.test(line)) pushMatch(issues, "gpa", file, lineNo, commit);
    examPattern.lastIndex = 0;
    if (examPattern.test(line)) pushMatch(issues, "test-score", file, lineNo, commit);
    INCOME.lastIndex = 0;
    if (INCOME.test(line)) pushMatch(issues, "income", file, lineNo, commit);
  });
  return issues;
}

export function metadataIssues(record, file) {
  const issues = [];
  for (const [key, raw] of Object.entries(record || {})) {
    if (key === "SourceFile" || key.startsWith("File:") || key.startsWith("System:") || key.startsWith("ExifTool")) continue;
    const value = String(raw ?? "").trim();
    if (!value || value === "-") continue;
    IDENTITY_KEY.lastIndex = 0;
    if (IDENTITY_KEY.test(key)) pushMatch(issues, "metadata-identity", file, 0, "");
    const emailMatch = value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    if (emailMatch && !isAllowedEmail(emailMatch[0])) pushMatch(issues, "metadata-email", file, 0, "");
    if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/.test(value)) {
      pushMatch(issues, "metadata-phone", file, 0, "");
    }
  }
  return issues;
}

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
}

function trackedFiles() {
  return git(["ls-files"]).split("\n").filter(Boolean);
}

function readText(file) {
  return readFileSync(file, "utf8");
}

function pdfText(file) {
  return execFileSync("pdftotext", [file, "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function pptxText(file) {
  return execFileSync("python3", ["-c", [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "    for name in archive.namelist():",
    "        if name.endswith('.xml'):",
    "            sys.stdout.buffer.write(archive.read(name))",
    "            sys.stdout.buffer.write(b'\\n')"
  ].join("\n"), file], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function exifRecords(file) {
  const raw = execFileSync("exiftool", ["-j", "-a", "-G1", file], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  return parsed[0] || {};
}

function scanHistory() {
  const log = git(["log", "-p", "--all", "--format=@@@COMMIT %H"]);
  const issues = [];
  let commit = "";
  let file = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("@@@COMMIT ")) {
      commit = line.slice("@@@COMMIT ".length).trim();
      continue;
    }
    if (line.startsWith("diff --git ")) {
      const parts = line.split(" ");
      const next = parts[parts.length - 1] || "";
      file = next.startsWith("b/") ? next.slice(2) : next;
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (!file || file === "dev/null") continue;
    issues.push(...findIssues(line.slice(1), file, { commit }));
  }
  return issues;
}

function scanHistoricalAssets() {
  const issues = [];
  const seen = new Set();
  const dir = mkdtempSync(join(tmpdir(), "privacy-assets-"));
  try {
    for (const line of git(["rev-list", "--all", "--objects"]).split("\n")) {
      const splitAt = line.indexOf(" ");
      if (splitAt < 0) continue;
      const sha = line.slice(0, splitAt);
      const file = line.slice(splitAt + 1);
      const ext = extname(file).toLowerCase();
      if (!ASSET_EXT.has(ext) || seen.has(sha)) continue;
      seen.add(sha);
      const copy = join(dir, `${sha}${ext}`);
      writeFileSync(copy, execFileSync("git", ["cat-file", "blob", sha], { maxBuffer: 64 * 1024 * 1024 }));
      const label = `${sha.slice(0, 10)}:${file}`;
      issues.push(...metadataIssues(exifRecords(copy), label));
      if (ext === ".pdf") issues.push(...findIssues(pdfText(copy), label, { documents: true }));
      if (ext === ".pptx") issues.push(...findIssues(pptxText(copy), label, { documents: true }));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return issues;
}

function dedupe(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = [issue.rule, issue.file, issue.line, issue.commit].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scanRepository() {
  const issues = [];
  for (const file of trackedFiles()) {
    const ext = extname(file).toLowerCase();
    if (TEXT_EXT.has(ext)) issues.push(...findIssues(readText(file), file));
    if (ext === ".pdf") issues.push(...findIssues(pdfText(file), file, { documents: true }));
    if (ext === ".pptx") issues.push(...findIssues(pptxText(file), file, { documents: true }));
    if (ASSET_EXT.has(ext)) issues.push(...metadataIssues(exifRecords(file), file));
  }
  issues.push(...scanHistory());
  issues.push(...scanHistoricalAssets());
  return dedupe(issues);
}

function report(issues) {
  for (const issue of issues) {
    const where = issue.commit ? ` commit=${issue.commit.slice(0, 10)}` : "";
    const line = issue.line ? ` line=${issue.line}` : "";
    console.error(`PRIVACY FAIL rule=${issue.rule} file=${issue.file}${line}${where}`);
  }
}

function main() {
  for (const command of ["pdftotext", "exiftool", "python3"]) {
    execFileSync("which", [command], { stdio: "ignore" });
  }
  const issues = scanRepository();
  if (issues.length) {
    report(issues);
    console.error(`Public-surface privacy check failed (${issues.length}).`);
    process.exit(1);
  }
  console.log("Public-surface privacy check passed.");
}

const invoked = process.argv[1] && process.argv[1].endsWith("check-public-surface.mjs");
if (invoked) main();
