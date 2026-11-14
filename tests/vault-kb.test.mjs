import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildKnowledge, formatReport, scrubReasons, stripLeadingQuestion, stripLeadingQuestionFromAnswer } from "../scripts/vault-kb.mjs";
import { upgradePublishedKnowledge } from "../scripts/upgrade-chat-kb.mjs";
import { createRetriever, replyTo, validKnowledge } from "../assets/chat/chat.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = join(root, "tests/fixtures/vault-notes");
const kbPath = join(root, "assets/chat/kb.json");
const kept = ["KEEPMIXED", "QUOTEDFIXTURE", "NESTEDFIXTURE", "Northwind Clockworks"];
const blocked = [
  "UNTAGGED_SENTINEL_DO_NOT_PUBLISH",
  "PRIVATE_SENTINEL_DO_NOT_PUBLISH",
  "NOPE_SENTINEL_DO_NOT_PUBLISH",
  "NOFRONT_SENTINEL_DO_NOT_PUBLISH",
  "BODYFLAG_SENTINEL_DO_NOT_PUBLISH",
  "DOTDIR_SENTINEL_DO_NOT_PUBLISH",
  "MAILFIXTURE",
  "SALARYFIXTURE",
  "IDFIXTURE",
  "synthetic.person@example.com",
  "999999999999"
];

function curated(id = "about") {
  return {
    id,
    topic: "About",
    questions: ["What is his background?", "Who is Ram?"],
    answer: "Synthetic curated answer used as the hand-written entry for the vault build test.",
    tags: ["background", "ram"],
    link: "#about"
  };
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "vault-kb-"));
}

function writeNote(dir, name, body) {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  return path;
}

function buildFixtures(base = [curated()]) {
  return buildKnowledge({ vaultDir: fixtures, baseEntries: base });
}

test("scrub drops sensitive passages and leaves ordinary prose", () => {
  const phone = ["555", "010", "0199"].join("-");
  const street = [12, "Fictional", ["St", "reet"].join("")].join(" ");
  const gpa = ["G", "P", "A"].join("");
  const exam = ["S", "A", "T"].join("");
  const household = ["household", "income"].join(" ");
  assert.deepEqual(scrubReasons("Northwind Clockworks restarts the fictional worker."), []);
  assert.deepEqual(scrubReasons("I sat down to write the fictional runbook."), []);
  assert.deepEqual(scrubReasons("We act as the on-call owner for the fictional cluster."), []);
  assert.ok(scrubReasons("Write synthetic.person@example.com for this fixture.").includes("email"));
  assert.ok(scrubReasons(`Call ${phone} about the fixture.`).includes("phone"));
  assert.ok(scrubReasons("The fictional salary is $1.").includes("money"));
  assert.ok(scrubReasons("The fictional figure is 150,000.").includes("money"));
  assert.deepEqual(scrubReasons("About 1,000 lines in the fictional checklist."), []);
  assert.ok(scrubReasons(`Meet at ${street} for the fixture.`).includes("address"));
  assert.ok(scrubReasons(`The fictional academic ${gpa} was 3.2.`).includes("score"));
  assert.ok(scrubReasons(`The fictional ${exam} result was 1400.`).includes("score"));
  assert.ok(scrubReasons("The fictional score of 12 must be rejected.").includes("score"));
  assert.ok(scrubReasons(`Record ${"9".repeat(8)} is a fictional id.`).includes("id"));
  assert.ok(scrubReasons(`The fictional ${household} must be rejected.`).includes("family"));
  assert.ok(scrubReasons("The zephyr-codename appears here.", ["zephyr-codename"]).includes("denylist"));
});

test("public notes are chunked and everything else stays out of the knowledge base", () => {
  const base = [curated()];
  const report = buildFixtures(base);
  const published = JSON.stringify(report.entries);
  const log = formatReport(report);
  assert.equal(report.status, "ready");
  assert.equal(report.markdown, 11);
  assert.equal(report.publicNotes, 6);
  assert.equal(report.ignored, 5);
  assert.equal(report.rejected, 3);
  assert.equal(report.appended, 5);
  assert.equal(report.counts.email, 1);
  assert.equal(report.counts.money, 1);
  assert.equal(report.counts.id, 1);
  assert.equal(report.counts.phone, 0);
  assert.equal(report.counts.address, 0);
  assert.equal(report.counts.score, 0);
  assert.equal(report.counts.denylist, 0);
  assert.equal(report.entries[0], base[0]);
  assert.deepEqual(report.entries.slice(0, base.length), base);
  assert.ok(report.entries.slice(base.length).every((entry) => entry.source === "vault"));
  assert.ok(validKnowledge(report.entries));
  assert.equal(new Set(report.entries.map((entry) => entry.id)).size, report.entries.length);
  for (const entry of report.entries) {
    assert.ok(entry.answer.length < 650, entry.id);
    assert.ok(entry.questions.length >= 2, entry.id);
  }
  for (const marker of kept) assert.match(published, new RegExp(marker));
  for (const marker of blocked) {
    assert.equal(published.includes(marker), false, marker);
    assert.equal(log.includes(marker), false, marker);
  }
  assert.match(log, /email=1/);
  assert.match(log, /money=1/);
  assert.match(log, /id=1/);
  const topics = report.entries.filter((entry) => entry.source === "vault").map((entry) => entry.topic);
  assert.ok(topics.includes("Notes: Northwind Clockworks runbook"));
  assert.ok(topics.includes("Notes: Quoted synthetic note"));
  assert.ok(topics.includes("Notes: Nested synthetic checklist"));
  const quoted = report.entries.find((entry) => entry.topic === "Notes: Quoted synthetic note");
  assert.equal(quoted.link, "#skills");
  const nested = report.entries.find((entry) => entry.topic === "Notes: Nested synthetic checklist");
  assert.equal(nested.link, "#about");
  assert.match(nested.answer, /^Notes: Nested synthetic checklist\. /);
});

test("a tagged note that still contains private text is rejected passage by passage", () => {
  const dir = tempDir();
  try {
    const phone = ["555", "010", "0199"].join("-");
    const street = [12, "Fictional", ["St", "reet"].join("")].join(" ");
    const gpa = ["G", "P", "A"].join("");
    const exam = ["S", "A", "T"].join("");
    const household = ["household", "income"].join(" ");
    writeNote(dir, "clean.md", [
      "---",
      "portfolio: public",
      "title: Clean synthetic half",
      "---",
      "",
      "CLEANHALF The fictional workshop checklist is safe to publish in this synthetic note.",
      "",
      `DIRTYHALF Call ${phone}, visit ${street}, and ignore academic ${gpa} plus ${exam} and ${household}.`
    ].join("\n"));
    const report = buildKnowledge({ vaultDir: dir, baseEntries: [curated()] });
    const published = JSON.stringify(report.entries);
    assert.match(published, /CLEANHALF/);
    assert.equal(published.includes("DIRTYHALF"), false);
    assert.equal(published.includes(phone), false);
    assert.equal(published.includes(street), false);
    assert.equal(published.includes(gpa), false);
    assert.equal(formatReport(report).includes(phone), false);
    assert.ok(report.counts.phone >= 1);
    assert.ok(report.counts.address >= 1);
    assert.ok(report.counts.score >= 1);
    assert.ok(report.counts.family >= 1);
    assert.equal(report.appended, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("denylist terms reject a passage and are not written to the log", () => {
  const dir = tempDir();
  try {
    const list = join(dir, "denylist.txt");
    writeFileSync(list, "# comment\n\nx\nzephyr-codename\n");
    writeNote(dir, "named.md", [
      "---",
      "portfolio: public",
      "title: Denylist synthetic note",
      "---",
      "",
      "DENYFIXTURE This synthetic passage mentions zephyr-codename and must be dropped."
    ].join("\n"));
    const report = buildKnowledge({ vaultDir: dir, baseEntries: [curated()], denylistPath: list });
    const log = formatReport(report);
    assert.equal(report.counts.denylist, 1);
    assert.equal(report.appended, 0);
    assert.equal(report.denylist, "loaded");
    assert.equal(report.denylistShort, 1);
    assert.equal(JSON.stringify(report.entries).includes("zephyr-codename"), false);
    assert.equal(JSON.stringify(report.entries).includes("DENYFIXTURE"), false);
    assert.equal(log.includes("zephyr-codename"), false);
    assert.equal(log.includes("DENYFIXTURE"), false);
    assert.match(log, /denylist=1/);
    assert.match(log, /Short terms skipped: 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing or empty vault directory adds nothing", () => {
  const base = [curated(), {
    id: "note-old-aaaaaa",
    topic: "Notes: Old synthetic",
    questions: ["Tell me about the old synthetic note", "What does the note old synthetic say?"],
    answer: "Notes: Old synthetic. This generated passage should stay when the vault cannot be read.",
    tags: ["notes", "old"],
    link: "#about",
    source: "vault"
  }];
  const missing = buildKnowledge({ vaultDir: join(tmpdir(), "vault-does-not-exist-f64f"), baseEntries: base });
  assert.equal(missing.status, "absent");
  assert.equal(missing.entries, base);
  assert.match(formatReport(missing), /not found/);
  assert.match(formatReport(missing), /unchanged/);

  const empty = tempDir();
  const textOnly = tempDir();
  try {
    writeFileSync(join(textOnly, "readme.txt"), "portfolio: public\nThis is not markdown.");
    mkdirSync(join(empty, ".skip"), { recursive: true });
    writeNote(empty, ".skip/hidden.md", "---\nportfolio: public\n---\n\nDOTDIR_SENTINEL_DO_NOT_PUBLISH still hidden.");
    const emptyReport = buildKnowledge({ vaultDir: empty, baseEntries: base });
    const textReport = buildKnowledge({ vaultDir: textOnly, baseEntries: base });
    assert.equal(emptyReport.status, "empty");
    assert.equal(textReport.status, "empty");
    assert.equal(emptyReport.entries, base);
    assert.equal(textReport.entries, base);
    assert.match(formatReport(emptyReport), /empty of Markdown notes/);
    assert.match(formatReport(emptyReport), /unchanged/);
    const fileReport = buildKnowledge({ vaultDir: join(textOnly, "readme.txt"), baseEntries: base });
    assert.equal(fileReport.status, "not-directory");
    assert.equal(fileReport.entries, base);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(textOnly, { recursive: true, force: true });
  }
});

test("a later build replaces generated passages and keeps hand-written entries", () => {
  const dir = tempDir();
  try {
    writeNote(dir, "only-private.md", "---\nportfolio: private\n---\n\nPRIVATE_SENTINEL_DO_NOT_PUBLISH from a temp note.");
    const base = [curated(), {
      id: "note-stale-bbbbbb",
      topic: "Notes: Stale synthetic",
      questions: ["Tell me about the stale synthetic note", "What does the note stale synthetic say?"],
      answer: "Notes: Stale synthetic. STALEFIXTURE should be replaced when the vault is readable.",
      tags: ["notes", "stale"],
      link: "#about",
      source: "vault"
    }];
    const report = buildKnowledge({ vaultDir: dir, baseEntries: base });
    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0], base[0]);
    assert.equal(JSON.stringify(report.entries).includes("STALEFIXTURE"), false);
    assert.equal(JSON.stringify(report.entries).includes("PRIVATE_SENTINEL_DO_NOT_PUBLISH"), false);
    assert.equal(report.changed, true);

    writeNote(dir, "public.md", [
      "---",
      "portfolio: Public",
      "title: Public case synthetic",
      "---",
      "",
      "CASEFIXTURE This synthetic note uses a capitalized public flag and still belongs in the guide."
    ].join("\n"));
    const again = buildKnowledge({ vaultDir: dir, baseEntries: report.entries });
    const twice = buildKnowledge({ vaultDir: dir, baseEntries: again.entries });
    assert.equal(again.appended, 1);
    assert.match(again.entries.at(-1).topic, /^Notes: Public case synthetic$/);
    assert.deepEqual(twice.entries, again.entries);
    assert.equal(twice.changed, false);
    writeNote(dir, "crlf.md", "---\r\nportfolio: public\r\ntitle: Crlf synthetic note\r\n---\r\n\r\nCRLF_FIXTURE This synthetic note uses carriage returns and still belongs in the guide.\r\n");
    const crlf = buildKnowledge({ vaultDir: dir, baseEntries: [curated()] });
    assert.match(JSON.stringify(crlf.entries), /CRLF_FIXTURE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("long notes stay inside the knowledge-base limits and skip symlinks", () => {
  const dir = tempDir();
  const outside = tempDir();
  try {
    const sentence = "The fictional Northwind workshop repeats this synthetic sentence about checklists. ";
    writeNote(dir, "long.md", `---\nportfolio: public\ntitle: Long synthetic note\n---\n\n${sentence.repeat(40)}\n`);
    writeNote(outside, "linked.md", "---\nportfolio: public\n---\n\nSYMLINK_SENTINEL_DO_NOT_PUBLISH from outside the vault.");
    symlinkSync(join(outside, "linked.md"), join(dir, "linked.md"));
    const report = buildKnowledge({ vaultDir: dir, baseEntries: [curated()] });
    const notes = report.entries.filter((entry) => entry.source === "vault");
    assert.ok(notes.length >= 2);
    assert.ok(notes.every((entry) => entry.answer.length < 650));
    assert.equal(JSON.stringify(report.entries).includes("SYMLINK_SENTINEL_DO_NOT_PUBLISH"), false);
    assert.match(notes[0].answer, /^Notes: Long synthetic note\. /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("hand-written entries keep priority and note questions still resolve", () => {
  const kb = JSON.parse(readFileSync(kbPath, "utf8"));
  const handWritten = kb.filter((entry) => entry?.source !== "vault");
  const report = buildFixtures(kb);
  assert.deepEqual(report.entries.slice(0, handWritten.length), handWritten);
  assert.ok(validKnowledge(report.entries));
  const retrieve = createRetriever(report.entries);
  for (const [question, id] of [
    ["What is his background?", "about"],
    ["What projects has he built?", "projects"],
    ["What skills does he use?", "skills"],
    ["How do I book a call?", "booking"],
    ["Tell me about JPMorgan Chase", "jpmc"],
    ["Where is he based?", "location"],
    ["What is his email?", "contact"]
  ]) {
    assert.equal(replyTo(question, retrieve).id, id, question);
  }
  const note = replyTo("What does the note Northwind Clockworks runbook say?", retrieve);
  assert.equal(note.kind, "answer");
  assert.match(note.id, /^note-/);
  assert.equal(note.topic, "Notes: Northwind Clockworks runbook");

  const thief = {
    id: "note-thief-cccccc",
    topic: "Notes: Background",
    questions: ["What is his background?", "Who is Ram?"],
    answer: "Notes: Background. A synthetic vault passage that repeats the hand-written question.",
    tags: ["background", "ram", "notes"],
    link: "#about",
    source: "vault"
  };
  const curatedOnly = createRetriever([curated(), thief]);
  assert.equal(replyTo("What is his background?", curatedOnly).id, "about");
  const closer = {
    id: "banner",
    topic: "Banner",
    questions: ["Where is the banner?", "Tell me about the banner color"],
    answer: "The hand-written banner entry mentions a teal banner only in passing.",
    tags: ["banner", "teal"],
    link: "#about"
  };
  const specific = {
    id: "note-banner-dddddd",
    topic: "Notes: Teal banner",
    questions: ["What color is the fictional teal banner?", "Tell me about the fictional teal banner"],
    answer: "Notes: Teal banner. The fictional teal banner is reserved for this synthetic vault note.",
    tags: ["banner", "teal", "fictional", "notes"],
    link: "#about",
    source: "vault"
  };
  const specificRetrieve = createRetriever([closer, specific]);
  assert.equal(replyTo("What color is the fictional teal banner?", specificRetrieve).id, "note-banner-dddddd");
});

test("the command leaves kb.json alone when the vault is missing and appends fixtures when it is present", () => {
  const work = tempDir();
  const original = readFileSync(kbPath);
  try {
    const missingKb = join(work, "missing.json");
    copyFileSync(kbPath, missingKb);
    const absent = runCli(["--vault-dir", join(work, "no-vault-here"), "--kb", missingKb]);
    assert.equal(absent.status, 0, absent.stderr);
    assert.match(absent.stdout, /not found/);
    assert.match(absent.stdout, /unchanged/);
    assert.equal(readFileSync(missingKb).equals(original), true);

    const emptyDir = join(work, "empty");
    mkdirSync(emptyDir);
    const emptyKb = join(work, "empty.json");
    copyFileSync(kbPath, emptyKb);
    const empty = runCli(["--vault-dir", emptyDir, "--kb", emptyKb]);
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /empty of Markdown notes/);
    assert.equal(readFileSync(emptyKb).equals(original), true);

    const builtKb = join(work, "built.json");
    copyFileSync(kbPath, builtKb);
    const built = runCli(["--vault-dir", fixtures, "--kb", builtKb]);
    assert.equal(built.status, 0, built.stderr);
    assert.match(built.stdout, /kb.json updated/);
    assert.match(built.stdout, /email=1/);
    const text = readFileSync(builtKb, "utf8");
    assert.match(text, /KEEPMIXED/);
    assert.match(text, /Notes: Northwind Clockworks runbook/);
    for (const marker of blocked) assert.equal(text.includes(marker), false, marker);
    assert.equal(original.equals(readFileSync(kbPath)), true);

    const usage = runCli([]);
    assert.equal(usage.status, 0, usage.stderr);
    assert.match(usage.stdout, /No vault directory was given/);
    const unknown = runCli(["--vault", fixtures]);
    assert.equal(unknown.status, 1);
  } finally {
    rmSync(work, { recursive: true, force: true });
    assert.equal(readFileSync(kbPath).equals(original), true);
  }
});

function runCli(args) {
  return spawnSync(process.execPath, [join(root, "scripts/build-kb.mjs"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("Related navigation is not a note title or a publishable answer", () => {
  const dir = tempDir();
  try {
    writeNote(dir, "Complete reliability.md", "---\nportfolio: public\n---\n\nA complete reliability answer explains which signals protect users and which failures require a response.\n\n## Related\n- [[NAVIGATION_ONLY_CANARY]]: topic hub\n");
    const report = buildKnowledge({vaultDir:dir,baseEntries:[curated()]});
    const notes = report.entries.filter(e=>e.source==="vault");
    assert.ok(notes.length);
    assert.ok(notes.every(e=>e.topic==="Notes: Complete reliability"));
    assert.doesNotMatch(JSON.stringify(notes), /NAVIGATION_ONLY_CANARY/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("HPA abbreviation stays with its complete debugging sentence", () => {
  const dir = tempDir();
  try {
    const first = "A complete scaling explanation adds pods safely and protects downstream capacity. ".repeat(7);
    writeNote(dir,"scaling.md","---\nportfolio: public\ntitle: Horizontal scaling\n---\n\n"+first+"Debugging shows current vs. target values, conditions and recent scaling events.\n");
    const report = buildKnowledge({vaultDir:dir,baseEntries:[curated()]});
    const answers=report.entries.filter(e=>e.source==="vault").map(e=>e.answer);
    assert.ok(answers.some(x=>x.includes("current vs. target values, conditions and recent scaling events.")));
    assert.ok(answers.every(x=>!x.endsWith("vs.")&&x.length<650));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("excluded source notes stay out even if tagged public", () => {
  const dir = tempDir();
  try {
    const name=["bank","gpt"].join("");
    writeNote(dir,name+".md","---\nportfolio: public\ntitle: Synthetic excluded source\n---\n\nexcludedsourcecanary must not enter public retrieval even when someone changes the tag.\n");
    const report=buildKnowledge({vaultDir:dir,baseEntries:[curated()]});
    assert.doesNotMatch(JSON.stringify(report.entries),/excludedsourcecanary/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("published public-only repair is deterministic and idempotent", () => {
  const entries = JSON.parse(readFileSync(kbPath, "utf8"));
  assert.deepEqual(upgradePublishedKnowledge(entries), entries);
  assert.ok(entries.filter((entry) => entry.id.startsWith("public-summary-")).every((entry) =>
    entry.publicSourceIds.length > 0 && entry.publicSourceIds.every((id) => entries.some((source) => source.id === id))));
});

test("42 canary probes cannot reach private, untagged or explicitly excluded sources", () => {
  const dir = tempDir();
  try {
    const excludedName = ["bank", "gpt"].join("");
    for (const [name, tag, marker] of [["public", "public", "approvedcanary"], ["private", "private", "secretcanary"], ["untagged", "", "untaggedcanary"], [excludedName, "public", "excludedcanary"]]) {
      writeNote(dir, name + ".md", "---\n" + (tag ? "portfolio: " + tag + "\n" : "") + "title: " + name + " marker\n---\n\n" + marker + " is a synthetic source-boundary fixture that must follow the explicit publication rules.\n");
    }
    const report = buildKnowledge({vaultDir:dir,baseEntries:[]});
    assert.equal(report.publicNotes,1);
    assert.equal(report.ignored,3);
    const retrieve = createRetriever(report.entries);
    let probes = 0;
    for (const marker of ["secretcanary", "untaggedcanary", "excludedcanary"]) {
      assert.equal(JSON.stringify(report.entries).includes(marker),false);
      for (const prefix of ["", "What is ", "Tell me about ", "Show ", "Explain ", "Describe ", "How about ", "What about ", "Please show ", "Who is ", "Why ", "Where is ", "When is ", "Can you explain "]) {
        assert.notEqual(replyTo(prefix + marker, retrieve).kind,"answer");
        probes += 1;
      }
    }
    assert.equal(probes,42);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("stripLeadingQuestion removes only a punctuated leading title copy", () => {
  const title = "What skills does he use with Groovy";
  const body = "At First Republic Bank I used Groovy during my DevOps work.";
  assert.equal(stripLeadingQuestion(`${title}? ${body}`, title), body);
  assert.equal(stripLeadingQuestion(`${title}. ${body}`, title), body);
  assert.equal(stripLeadingQuestion(body, title), body);
  assert.equal(
    stripLeadingQuestion("Karpenter is an open-source Kubernetes node autoscaler.", "Karpenter"),
    "Karpenter is an open-source Kubernetes node autoscaler."
  );
});

test("a public note whose heading repeats the title does not put the question in the answer", () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-title-repeat-"));
  writeFileSync(join(dir, "groovy.md"), `---
portfolio: public
title: What skills does he use with Groovy?
link: "#experience"
---

# What skills does he use with Groovy?

At First Republic Bank I used Groovy during my DevOps work on the Azure-hosted content platform.
`);
  try {
    const report = buildKnowledge({ vaultDir: dir, baseEntries: [] });
    assert.equal(report.status, "ready");
    assert.equal(report.appended, 1);
    const entry = report.entries[0];
    assert.equal(entry.topic, "Notes: What skills does he use with Groovy");
    assert.equal(
      entry.answer,
      "Notes: What skills does he use with Groovy. At First Republic Bank I used Groovy during my DevOps work on the Azure-hosted content platform."
    );
    assert.doesNotMatch(entry.answer, /What skills does he use with Groovy\?/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stripLeadingQuestionFromAnswer is idempotent and leaves non-repeated bodies alone", () => {
  const topic = "Notes: What skills does he use with Groovy";
  const before = `${topic}. What skills does he use with Groovy? At First Republic Bank I used Groovy.`;
  const after = stripLeadingQuestionFromAnswer(before, topic);
  assert.equal(after, `${topic}. At First Republic Bank I used Groovy.`);
  assert.equal(stripLeadingQuestionFromAnswer(after, topic), after);
  const karpenter = "Notes: Karpenter. Karpenter is an open-source Kubernetes node autoscaler.";
  assert.equal(stripLeadingQuestionFromAnswer(karpenter, "Notes: Karpenter"), karpenter);
});
