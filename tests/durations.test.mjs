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
} from "../durations.js";

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

test("each Experience company card shows its year range and a matching static total", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const experience = html.split('id="experience"')[1].split('id="certifications"')[0];

  assert.doesNotMatch(experience, /exp-total/);
  const cards = [...experience.matchAll(/<button type="button" class="xp-card"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
  assert.equal(cards.length, 4);
  for (const [i, company] of COMPANIES.entries()) {
    const attr = company.roles.map(([start, end]) => `${start}/${end}`).join(",");
    const startYear = company.roles[0][0].slice(0, 4);
    const lastEnd = company.roles[company.roles.length - 1][1];
    const [ey, em] = lastEnd.split("-").map(Number);
    const endYear = em === 1 ? ey - 1 : ey;
    assert.match(cards[i], new RegExp(`<span class="xp-years">${startYear}–${endYear}</span>`), company.name);
    assert.match(cards[i], new RegExp(`data-roles="${attr}">${company.total}<`), company.name);
    assert.equal(formatRoleSum(parseRoles(attr)), company.total, company.name);
    const panel = experience.split(`id="xp-panel-`)[i + 1];
    assert.match(panel, new RegExp(`data-range="${company.range}"`), company.name);
  }

  // Every role shows its own dates, and its duration matches the month data.
  const roles = [...experience.matchAll(/<span class="xp-role-d">([A-Z][a-z]{2} \d{4}) – ([A-Z][a-z]{2} \d{4}) · <span class="exp-len" data-start="(\d{4}-\d{2})" data-end="(\d{4}-\d{2})">([^<]+)<\/span>/g)];
  assert.equal(roles.length, 6);
  for (const [, , , start, end, total] of roles) assert.equal(formatMonthSpan(start, end), total);
});
