import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findIssues,
  isAllowedEmail,
  isHistoryEmailException,
  metadataIssues
} from "../scripts/check-public-surface.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicEmail = ["ram.vellamsetti", "gmail.com"].join("@");

function rules(text, file = "index.html", options) {
  return findIssues(text, file, options).map((issue) => issue.rule);
}

test("the public contact address and example mailboxes are allowed", () => {
  assert.equal(isAllowedEmail(publicEmail), true);
  assert.equal(isAllowedEmail("synthetic.person@example.com"), true);
  assert.equal(isAllowedEmail("assets/photo@2x.jpg"), true);
  assert.deepEqual(rules(`Write ${publicEmail} or synthetic.person@example.com.`), []);
});

test("another mailbox, a compensation figure, a family detail, and an id shape fail", () => {
  const other = ["personal.mailbox", "example.net"].join("@");
  const pay = ["sal", "ary"].join("");
  const relation = ["wi", "fe"].join("");
  const id = ["123", "45", "6789"].join("-");
  assert.deepEqual(rules(`Reach me at ${other}.`), ["email"]);
  assert.ok(rules(`The fictional ${pay} is $1.`).includes("compensation"));
  assert.ok(rules(`I live with my ${relation}.`).includes("family"));
  assert.ok(rules(`Record ${id} on the form.`).includes("government-id"));
  assert.deepEqual(rules("I sat with the team and acted on the alert."), []);
});

test("document text still catches a phone number and a named exam", () => {
  const phone = ["555", "010", "0199"].join("-");
  assert.ok(rules(`Call ${phone}.`, "assets/deck.pptx", { documents: true }).includes("phone"));
  assert.deepEqual(rules("I sat in the middle of the review.", "assets/deck.pptx", { documents: true }), []);
  const exam = ["TOE", "FL"].join("");
  assert.ok(rules(`The fictional ${exam} result stays private.`, "assets/deck.pdf", { documents: true }).includes("test-score"));
});

test("asset metadata fails when an identity field or mailbox is present", () => {
  assert.deepEqual(metadataIssues({ "XML:Creator": "", "XML:Title": "Career overview" }, "assets/deck.pptx"), []);
  assert.ok(metadataIssues({ "XML:Author": "Private Author" }, "assets/photo.jpg").some((issue) => issue.rule === "metadata-identity"));
  const other = ["hidden", "example.net"].join("@");
  assert.ok(metadataIssues({ "EXIF:ImageDescription": other }, "assets/photo.jpg").some((issue) => issue.rule === "metadata-email"));
});

test("historical setup commits are the only email exception", () => {
  const commit = "0a3b8f9f2585a19b9db3a8b2e355ade5bf7f050b";
  assert.equal(isHistoryEmailException(commit, "booking-worker/SETUP.md"), true);
  assert.equal(isHistoryEmailException(commit, "index.html"), false);
  const other = ["personal.mailbox", "example.net"].join("@");
  assert.deepEqual(rules(`Account ${other}`, "booking-worker/SETUP.md", { commit }), []);
  assert.deepEqual(rules(`Account ${other}`, "index.html", { commit }), ["email"]);
});

test("the booking setup publishes only the public contact address", () => {
  const text = readFileSync(join(root, "booking-worker/SETUP.md"), "utf8");
  const found = [...text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)].map((match) => match[0].toLowerCase());
  assert.deepEqual([...new Set(found)], [publicEmail]);
});
