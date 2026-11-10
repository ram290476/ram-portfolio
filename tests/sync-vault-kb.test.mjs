import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "scripts/sync-vault-kb.sh");
const kbPath = join(root, "assets/chat/kb.json");
const originalKb = readFileSync(kbPath);

function tempDir() {
  return mkdtempSync(join(tmpdir(), "sync-vault-kb-"));
}

function writeNote(dir, name, body) {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  return path;
}

function publicNote(title, marker) {
  return [
    "---",
    "portfolio: public",
    `title: ${title}`,
    "---",
    "",
    `${marker} This synthetic runbook explains a fictional workshop checklist in enough detail to be kept.`
  ].join("\n");
}

function runSync(args, env = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

test("the sync script appends a public note and leaves a private note out", () => {
  const work = tempDir();
  try {
    const repo = join(work, "obsidian-job-search");
    const notes = join(repo, "notes");
    mkdirSync(notes, { recursive: true });
    writeNote(notes, "public-runbook.md", publicNote("Sync public runbook", "SYNCPUBLICFIXTURE"));
    writeNote(notes, "private.md", [
      "---",
      "portfolio: private",
      "---",
      "",
      "SYNC_PRIVATE_SENTINEL_DO_NOT_PUBLISH stays out of the public guide."
    ].join("\n"));
    writeNote(notes, "untagged.md", "UNTAGGED_SYNC_SENTINEL_DO_NOT_PUBLISH has no front matter.\n");

    const kb = join(work, "kb.json");
    copyFileSync(kbPath, kb);
    const result = runSync(["--repo", repo, "--kb", kb]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /1 tagged public/);
    assert.match(result.stdout, /Note passages appended: 1/);
    assert.match(result.stdout, /kb.json updated/);
    const text = readFileSync(kb, "utf8");
    assert.match(text, /SYNCPUBLICFIXTURE/);
    assert.match(text, /Notes: Sync public runbook/);
    assert.equal(text.includes("SYNC_PRIVATE_SENTINEL_DO_NOT_PUBLISH"), false);
    assert.equal(text.includes("UNTAGGED_SYNC_SENTINEL_DO_NOT_PUBLISH"), false);
    assert.equal(originalKb.equals(readFileSync(kbPath)), true);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(originalKb), true);
  }
});

test("the sync script leaves kb.json unchanged when no notes are tagged public", () => {
  const work = tempDir();
  try {
    const repo = join(work, "obsidian-job-search");
    const notes = join(repo, "notes");
    mkdirSync(notes, { recursive: true });
    writeNote(notes, "private.md", "---\nportfolio: private\n---\n\nSYNC_ZERO_PRIVATE_SENTINEL stays private.\n");
    writeNote(notes, "plain.md", "SYNC_ZERO_PLAIN_SENTINEL has no public tag.\n");

    const kb = join(work, "kb.json");
    const handWritten = JSON.parse(readFileSync(kbPath, "utf8")).filter((entry) => entry?.source !== "vault");
    writeFileSync(kb, `${JSON.stringify(handWritten, null, 2)}\n`);
    const before = readFileSync(kb);
    const result = runSync(["--repo", repo, "--kb", kb]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /0 tagged public/);
    assert.match(result.stdout, /Note passages appended: 0/);
    assert.match(result.stdout, /kb.json unchanged/);
    assert.equal(readFileSync(kb).equals(before), true);
    const text = readFileSync(kb, "utf8");
    assert.equal(text.includes("SYNC_ZERO_PRIVATE_SENTINEL"), false);
    assert.equal(text.includes("SYNC_ZERO_PLAIN_SENTINEL"), false);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(originalKb), true);
  }
});

test("the sync script fails closed when a public note still looks private", () => {
  const work = tempDir();
  try {
    const repo = join(work, "obsidian-job-search");
    const notes = join(repo, "notes");
    mkdirSync(notes, { recursive: true });
    writeNote(notes, "salary.md", [
      "---",
      "portfolio: public",
      "title: Sync salary fixture",
      "---",
      "",
      "SYNC_SALARY_SENTINEL The fictional salary is $1 and must not be published."
    ].join("\n"));

    const kb = join(work, "kb.json");
    copyFileSync(kbPath, kb);
    const before = readFileSync(kb);
    const result = runSync(["--repo", repo, "--kb", kb]);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /kb.json unchanged/);
    assert.equal(readFileSync(kb).equals(before), true);
    const text = readFileSync(kb, "utf8");
    assert.equal(text.includes("SYNC_SALARY_SENTINEL"), false);
    assert.equal(text.includes("$1"), false);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(originalKb), true);
  }
});

test("the sync script fails closed when a denylist term appears in a public note", () => {
  const work = tempDir();
  try {
    const repo = join(work, "obsidian-job-search");
    const notes = join(repo, "notes");
    mkdirSync(notes, { recursive: true });
    writeNote(notes, "named.md", publicNote("Sync denylist fixture", "zephyr-codename SYNC_DENY_SENTINEL"));
    const list = join(work, "denylist.txt");
    writeFileSync(list, "zephyr-codename\n");

    const kb = join(work, "kb.json");
    copyFileSync(kbPath, kb);
    const before = readFileSync(kb);
    const result = runSync(["--repo", repo, "--kb", kb, "--denylist", list]);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /kb.json unchanged/);
    assert.equal(readFileSync(kb).equals(before), true);
    const text = `${readFileSync(kb, "utf8")}\n${result.stdout}\n${result.stderr}`;
    assert.equal(text.includes("SYNC_DENY_SENTINEL"), false);
    assert.equal(readFileSync(kb).equals(before), true);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(originalKb), true);
  }
});

test("the sync script fails when the notes directory is missing", () => {
  const work = tempDir();
  try {
    const repo = join(work, "obsidian-job-search");
    mkdirSync(repo);
    const kb = join(work, "kb.json");
    copyFileSync(kbPath, kb);
    const before = readFileSync(kb);
    const result = runSync(["--repo", repo, "--kb", kb]);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /Notes directory not found/);
    assert.equal(readFileSync(kb).equals(before), true);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(originalKb), true);
  }
});
