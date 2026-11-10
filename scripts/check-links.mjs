import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageDir = root;
const htmlPath = resolve(pageDir, "index.html");
const html = readFileSync(htmlPath, "utf8");
const preview = readFileSync(resolve(root, "preview/index.html"), "utf8");

if (/Ram Prasad Vellamsetti — Coming soon/i.test(html)) {
  console.error("root index.html is still the coming-soon page");
  process.exit(1);
}
if (/\/preview\//i.test(html)) {
  console.error("homepage links to /preview/");
  process.exit(1);
}
if (/noindex,\s*nofollow/i.test(html)) {
  console.error("homepage should be indexable");
  process.exit(1);
}
if (!/noindex,\s*nofollow/i.test(preview)) {
  console.error("preview redirect is missing noindex");
  process.exit(1);
}
if (!/location\.replace/i.test(preview)) {
  console.error("preview page does not redirect to the homepage");
  process.exit(1);
}

const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((match) => match[1]);
for (const match of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
  hrefs.push(match[1]);
}
for (const match of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) {
  hrefs.push(match[1]);
}
const failures = [];

function exists(relativePath) {
  try {
    readFileSync(resolve(pageDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

for (const href of hrefs) {
  if (href.startsWith("mailto:")) continue;
  if (href.startsWith("#")) {
    const id = href.slice(1);
    if (!ids.has(id)) failures.push(`missing anchor ${href}`);
    continue;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      const response = await fetch(href, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "ram-portfolio-link-check" },
        signal: AbortSignal.timeout(20000)
      });
      const linkedin = href.includes("linkedin.com");
      const datacamp = href.includes("datacamp.com");
      const certmetrics = href.includes("certmetrics.com");
      const botWall = response.status === 403 || response.status === 429 || response.status === 999 || response.status === 503;
      const tolerated = response.ok || response.status === 301 || response.status === 302
        || (linkedin && botWall)
        || (datacamp && botWall)
        || (certmetrics && botWall);
      if (!tolerated) failures.push(`${response.status} ${href}`);
    } catch (error) {
      // certmetrics and some credential hosts reset or challenge automated fetches
      if (href.includes("certmetrics.com") || href.includes("linkedin.com") || href.includes("datacamp.com")) continue;
      failures.push(`fetch failed ${href} (${error instanceof Error ? error.name : "error"})`);
    }
    continue;
  }
  const path = href.split("#")[0];
  if (!exists(path)) failures.push(`missing file ${href}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${hrefs.length} links in index.html. Preview path redirects to the homepage.`);
