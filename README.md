# ram-portfolio

Personal portfolio site for Ram Prasad Vellamsetti, served by GitHub Pages from `main`.

The public homepage is the coming-soon page at the repository root. It stays that way until launch. The full portfolio is an unlisted preview at `preview/` and is marked `noindex`. `robots.txt` disallows `/preview/`. The coming-soon page does not link to it.

## Preview

`preview/index.html` is the light-editorial page: sidebar, experience, projects, booking, a theme picker, and a static portfolio guide. There is no build step. The guide answers only from `preview/assets/chat/kb.json` in the browser. Light editorial is the default theme; the choice is stored in this browser.

Until `preview/assets/photo.jpg` exists, the sidebar shows an initials monogram. Add a square JPEG at that path to replace it.

The Experience section has an **Experience overview** button that opens a full-screen player for the six-slide deck, and a **Download slides (PowerPoint)** button next to it. Slide images live in `preview/assets/slides/`, rendered from the already-public `preview/assets/Ram_Career_Overview_Lite.pdf`. The downloadable deck is `preview/assets/Ram_Career_Overview.pptx`. Other PowerPoint sources stay gitignored.

## Booking

`preview/config.js` holds the public Worker origin and the Turnstile site key. Both start empty, and **Book a call** then says booking opens soon.

The Worker in `booking-worker/` is not deployed from this repository. Setup, including the Entra app, consent, Wrangler secrets, Turnstile, API DNS, and Mac Contacts, is in [booking-worker/SETUP.md](booking-worker/SETUP.md).

## Checks

GitHub Actions runs the Worker unit tests, a privacy scan, gitleaks, and an HTML link check.

Before pushing, run:

```bash
bash scripts/privacy-scan.sh
gitleaks detect --source . --redact --log-opts="--all"
```

Secrets, `.dev.vars`, and `.env` files stay out of git. `booking-worker/.dev.vars.example` is placeholders only.
