# ram-portfolio

Personal portfolio site for Ram Prasad Vellamsetti, served by GitHub Pages from `main`.

The public homepage is the coming-soon page at the repository root. It stays that way until launch. The full portfolio is an unlisted preview at `preview/` and is marked `noindex`. `robots.txt` disallows `/preview/`. The coming-soon page does not link to it.

## Preview

`preview/index.html` is the light-editorial page: sidebar, experience, projects, booking, a theme picker, and a static portfolio guide. The page is static. The guide answers only from `preview/assets/chat/kb.json` in the browser. Light editorial is the default theme; the choice is stored in this browser.

Until `preview/assets/photo.jpg` exists, the sidebar shows an initials monogram. Add a square JPEG at that path to replace it.

The Experience section has an **Experience overview** button that opens a full-screen player for the six-slide deck, and a **Download slides (PowerPoint)** button next to it. Slide images live in `preview/assets/slides/`, rendered from the already-public `preview/assets/Ram_Career_Overview_Lite.pdf`. The downloadable deck is `preview/assets/Ram_Career_Overview.pptx`. Other PowerPoint sources stay gitignored.

## Portfolio guide notes

Hand-written entries in `preview/assets/chat/kb.json` stay in that file and rank ahead of anything the build adds. An optional command can append passages from a local checkout of the private notes repo `ram290476/obsidian-job-search`. The command does not clone that repo. GitHub Actions does not have it, so the published `kb.json` changes only when you run the build and commit the result.

Tag a note by putting `portfolio: public` in its front matter. Any other value, or no front matter, leaves the note out of the guide.

```yaml
---
portfolio: public
title: Short public title
link: "#experience"
tags: [runbook, kubernetes]
---
```

`title` is the source label (`Notes: <title>`). `link` is optional and must be a preview anchor such as `#experience`; it defaults to `#about`. Notes live under `notes/` in that repo.

```bash
node scripts/build-kb.mjs --vault-dir path/to/obsidian-job-search/notes
```

If that directory is missing or has no Markdown files, the command adds nothing and says so. `kb.json` is left unchanged. When the directory has Markdown, only `portfolio: public` notes are chunked into passages the guide can retrieve. Earlier generated passages are replaced, so removing the tag drops a note on the next run.

Before a passage is written, a second scrub rejects it. This pass does not use the vault repo’s scrubber (that layer is issue #14). A passage is dropped, not redacted, when it still contains any of these: an email; a phone number; a `$` or salary figure; a street address; an academic average, a named exam, or a numbered test result; a long digit id; household-earnings phrasing; or a term from the optional denylist. Ordinary words stay. The log shows counts only.

Copy `scripts/chat-denylist.txt.example` to `scripts/chat-denylist.txt` and put one term per line. That file is gitignored. Pass another path with `--denylist` if you keep the list somewhere else.

Review the `kb.json` diff before you commit it. Do not commit the vault checkout or the denylist.

## Booking

`preview/config.js` holds the public Worker origin and the Turnstile site key. Both start empty, and **Book a call** then says booking opens soon.

The Worker in `booking-worker/` is not deployed from this repository. Setup, including the Entra app, consent, Wrangler secrets, Turnstile, API DNS, and Mac Contacts, is in [booking-worker/SETUP.md](booking-worker/SETUP.md).

## Checks

GitHub Actions runs the Worker unit tests, a privacy scan, gitleaks, and an HTML link check.

Before pushing, run:

```bash
bash scripts/privacy-scan.sh
gitleaks detect --source . --redact --log-opts="--all"
node --test tests/preview-chat.test.mjs tests/durations.test.mjs tests/vault-kb.test.mjs
```

Secrets, `.dev.vars`, and `.env` files stay out of git. `booking-worker/.dev.vars.example` is placeholders only.
