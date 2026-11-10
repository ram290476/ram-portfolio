# ram-portfolio

Personal portfolio site for Ram Prasad Vellamsetti, served by GitHub Pages from `main` at https://ram.vellamsetti.com/.

The homepage at the repository root is the full portfolio. The former unlisted preview at `preview/` now redirects to the homepage (hash fragments such as `#experience` are preserved). `robots.txt` still disallows `/preview/`.

## Site

`index.html` is the light-editorial page: sidebar, experience, projects, booking, a theme picker, and a static portfolio guide. The page is static. The guide answers only from `assets/chat/kb.json` in the browser. Light editorial is the default theme; the choice is stored in this browser.

The sidebar uses `assets/photo.jpg`. If that file is missing, it falls back to an initials monogram. Add a square JPEG at that path to replace it.

The Experience section has an **Experience overview** button that opens a full-screen player for the six-slide deck, and a **Download slides (PowerPoint)** button next to it. Slide images live in `assets/slides/`, rendered from the already-public `assets/Ram_Career_Overview_Lite.pdf`. The downloadable deck is `assets/Ram_Career_Overview.pptx`. Other PowerPoint sources stay gitignored.

## Portfolio guide notes

Hand-written entries in `assets/chat/kb.json` stay in that file and rank ahead of anything the build adds. `scripts/sync-vault-kb.sh` refreshes those entries from the private notes repo `ram290476/obsidian-job-search`. It uses a local checkout, or clones the repo with `gh` into a temporary directory, then runs `scripts/build-kb.mjs` against that repo's `notes/` directory. The published `kb.json` changes only when you run the script and commit the reviewed result.

Tag a note by putting `portfolio: public` in its front matter. Any other value, or no front matter, leaves the note out of the guide.

```yaml
---
portfolio: public
title: Short public title
link: "#experience"
tags: [runbook, kubernetes]
---
```

`title` is the source label (`Notes: <title>`). `link` is optional and must be a page anchor such as `#experience`; it defaults to `#about`. Notes live under `notes/` in that repo.

```bash
# Preferred: pull or clone the notes repo, then rebuild kb.json
scripts/sync-vault-kb.sh --repo path/to/obsidian-job-search

# Lower-level builder, if the notes directory is already local
node scripts/build-kb.mjs --vault-dir path/to/obsidian-job-search/notes
```

If `--repo` is omitted, the sync script uses `$OBSIDIAN_JOB_SEARCH`, then a sibling checkout at `../obsidian-job-search`, then `gh repo clone ram290476/obsidian-job-search` into a temporary directory. A git checkout is updated with `git pull --ff-only`. The clone is never left inside this repository.

If the notes directory is missing or has no Markdown files, the builder adds nothing and says so. `kb.json` is left unchanged. When the directory has Markdown, only `portfolio: public` notes are chunked into passages the guide can retrieve. Earlier generated passages are replaced, so removing the tag drops a note on the next run.

The sync script fails closed: it builds into a copy, and if the second scrub or denylist check rejects any passage, or if a later privacy check of the output fails, it exits without writing `kb.json`.

A GitHub Action could run this on a schedule, but this public repository's default token cannot read the private notes repo. That would need a cross-repo token or deploy key, which this change does not add. Until then, run the script locally and commit the reviewed `kb.json`.

Before a passage is written, a second scrub rejects it. This pass does not use the vault repo’s scrubber (that layer is issue #14). A passage is dropped, not redacted, when it still contains any of these: an email; a phone number; a `$` or salary figure; a street address; an academic average, a named exam, or a numbered test result; a long digit id; household-earnings phrasing; or a term from the optional denylist. Ordinary words stay. The log shows counts only.

Copy `scripts/chat-denylist.txt.example` to `scripts/chat-denylist.txt` and put one term per line. That file is gitignored. Pass another path with `--denylist` if you keep the list somewhere else.

Review the `kb.json` diff before you commit it. Do not commit the vault checkout or the denylist.

## Booking

`config.js` holds the public Worker origin and the Turnstile site key. Both start empty, and **Book a call** then says booking opens soon.

The Worker in `booking-worker/` is not deployed from this repository. Setup, including the Entra app, consent, Wrangler secrets, Turnstile, API DNS, and Mac Contacts, is in [booking-worker/SETUP.md](booking-worker/SETUP.md).

## Checks

GitHub Actions runs the Worker unit tests, a privacy scan, gitleaks, and an HTML link check.

Before pushing, run:

```bash
bash scripts/privacy-scan.sh
gitleaks detect --source . --redact --log-opts="--all"
node --test tests/preview-chat.test.mjs tests/durations.test.mjs tests/vault-kb.test.mjs tests/sync-vault-kb.test.mjs
```

Secrets, `.dev.vars`, and `.env` files stay out of git. `booking-worker/.dev.vars.example` is placeholders only.
