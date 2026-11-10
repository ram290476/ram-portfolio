import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatDuration,
  formatMonthSpan,
  formatRoleSum,
  monthSpan,
  parseRoles,
  sumRoleMonths
} from "../preview/durations.js";

const COMPANIES = [
  {
    name: "JPMorgan Chase",
    range: "Jul 2023 – Aug 2026",
    roles: [["2023-07", "2026-01"], ["2026-01", "2026-08"]],
    total: "3 yrs 1 mo"
  },
  {
    name: "First Republic Bank",
    range: "Apr 2020 – Jul 2023",
    roles: [["2020-04", "2023-07"]],
    total: "3 yrs 3 mos"
  },
  {
    name: "Corsair",
    range: "May 2013 – Feb 2020",
    roles: [["2013-05", "2017-01"], ["2017-01", "2020-02"]],
    total: "6 yrs 9 mos"
  },
  {
    name: "ESP",
    range: "Jan 2006 – Feb 2013",
    roles: [["2006-01", "2013-02"]],
    total: "7 yrs 1 mo"
  }
];

test("month difference does not add the end month back in", () => {
  assert.equal(monthSpan("2023-07", "2026-08"), 37);
  assert.equal(formatMonthSpan("2023-07", "2026-08"), "3 yrs 1 mo");
});

test("role month math still holds for every constituent role", () => {
  const expectRoles = {
    "2023-07/2026-01": "2 yrs 6 mos",
    "2026-01/2026-08": "7 mos",
    "2020-04/2023-07": "3 yrs 3 mos",
    "2013-05/2017-01": "3 yrs 8 mos",
    "2017-01/2020-02": "3 yrs 1 mo",
    "2006-01/2013-02": "7 yrs 1 mo"
  };
  for (const [key, label] of Object.entries(expectRoles)) {
    const [start, end] = key.split("/");
    assert.equal(formatMonthSpan(start, end), label);
  }
});

test("a company total is the sum of role months, not the overall span", () => {
  const gapped = [["2020-01", "2020-03"], ["2021-01", "2021-03"]];
  assert.equal(sumRoleMonths(gapped), 4);
  assert.equal(monthSpan("2020-01", "2021-03"), 14);
  assert.equal(formatRoleSum(gapped), "4 mos");

  assert.equal(sumRoleMonths([["2023-07", "2026-01"], ["2026-01", "2026-08"]]), 37);
  assert.equal(sumRoleMonths([["2013-05", "2017-01"], ["2017-01", "2020-02"]]), 81);

  for (const company of COMPANIES) {
    const summed = company.roles.reduce((n, [start, end]) => n + monthSpan(start, end), 0);
    assert.equal(sumRoleMonths(company.roles), summed, company.name);
    assert.equal(formatDuration(summed), company.total, company.name);
    assert.equal(formatRoleSum(company.roles), company.total, company.name);
  }
});

test("the Experience section shows one company range and a matching static total", () => {
  const html = readFileSync(new URL("../preview/index.html", import.meta.url), "utf8");
  const experience = html.split('id="experience"')[1].split('id="work-projects"')[0];

  assert.doesNotMatch(experience, /Jul 2023 – Jan 2026/);
  assert.doesNotMatch(experience, /Jan 2026 – Aug 2026/);
  assert.doesNotMatch(experience, /May 2013 – Jan 2017/);
  assert.doesNotMatch(experience, /Jan 2017 – Feb 2020/);
  assert.doesNotMatch(experience, /exp-total/);
  assert.doesNotMatch(experience, />2 yrs 6 mos</);
  assert.doesNotMatch(experience, />7 mos</);
  assert.doesNotMatch(experience, />3 yrs 8 mos</);

  const blocks = [...experience.matchAll(/<div class="exp-date">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 4);
  for (const [i, company] of COMPANIES.entries()) {
    const attr = company.roles.map(([start, end]) => `${start}/${end}`).join(",");
    assert.match(blocks[i], new RegExp(company.range));
    assert.equal((blocks[i].match(/<p[ >]/g) || []).length, 1, company.name);
    assert.match(blocks[i], new RegExp(`data-roles="${attr}">${company.total}<`));
    assert.equal(formatRoleSum(parseRoles(attr)), company.total, company.name);
  }
});
