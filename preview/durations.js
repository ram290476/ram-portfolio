/** Month difference used for every role.
 *  totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth)
 *  The end month is not added back in, so Jul 2023 to Aug 2026 is 37 months (3 yrs 1 mo).
 */
export function monthSpan(start, end) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (![sy, sm, ey, em].every((n) => Number.isInteger(n))) throw new Error("invalid month");
  return (ey - sy) * 12 + (em - sm);
}

export function formatDuration(totalMonths) {
  if (!Number.isInteger(totalMonths) || totalMonths < 0) throw new Error("invalid duration");
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts = [];
  if (years === 1) parts.push("1 yr");
  else if (years > 1) parts.push(`${years} yrs`);
  if (months === 1) parts.push("1 mo");
  else if (months > 1) parts.push(`${months} mos`);
  return parts.join(" ");
}

export function formatMonthSpan(start, end) {
  return formatDuration(monthSpan(start, end));
}

if (typeof document !== "undefined") {
  document.querySelectorAll(".exp-len").forEach((el) => {
    el.textContent = formatMonthSpan(el.dataset.start, el.dataset.end);
  });
}
