import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatMonthSpan, monthSpan } from "../preview/durations.js";

test("month difference does not add the end month back in", () => {
  assert.equal(monthSpan("2023-07", "2026-08"), 37);
  assert.equal(formatMonthSpan("2023-07", "2026-08"), "3 yrs 1 mo");
});

test("every role on the page matches the same rule", () => {
  const html = readFileSync(new URL("../preview/index.html", import.meta.url), "utf8");
  const shown = [...html.matchAll(/data-start="(\d{4}-\d{2})" data-end="(\d{4}-\d{2})">([^<]+)/g)];
  assert.ok(shown.length >= 8);
  for (const [, start, end, label] of shown) {
    assert.equal(label, formatMonthSpan(start, end), `${start} to ${end}`);
  }
  const expect = {
    "2023-07/2026-01": "2 yrs 6 mos",
    "2026-01/2026-08": "7 mos",
    "2023-07/2026-08": "3 yrs 1 mo",
    "2020-04/2023-07": "3 yrs 3 mos",
    "2013-05/2017-01": "3 yrs 8 mos",
    "2017-01/2020-02": "3 yrs 1 mo",
    "2013-05/2020-02": "6 yrs 9 mos",
    "2006-01/2013-02": "7 yrs 1 mo"
  };
  for (const [key, label] of Object.entries(expect)) {
    const [start, end] = key.split("/");
    assert.equal(formatMonthSpan(start, end), label);
    assert.ok(html.includes(`data-start="${start}" data-end="${end}">${label}`), key);
  }
});
