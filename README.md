# ram-portfolio

Personal portfolio site for Ram Prasad Vellamsetti, served by GitHub Pages from `main`.

The public homepage is the coming-soon page at the repository root. It stays that way until launch. The full portfolio is an unlisted preview at `preview/` and is marked `noindex`. `robots.txt` disallows `/preview/`. The coming-soon page does not link to it.

## Preview

`preview/index.html` is the light-editorial page: sidebar, experience, projects, and booking. There is no build step.

Until `preview/assets/photo.jpg` exists, the sidebar shows an initials monogram. Add a square JPEG at that path to replace it.

`preview/assets/Ram_Career_Overview_Lite.pdf` is the experience overview linked from the preview sidebar and the Experience section. Do not commit a PowerPoint source. `*.pptx` is gitignored.

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
