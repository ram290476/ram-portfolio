#!/usr/bin/env bash
# Fail if the working tree or git history contains a personal phone number,
# a street address, a home postal code, an academic average, a named exam,
# or household-earnings language. Banned literals are assembled at runtime
# so this file does not store them contiguously.
# scripts/check-public-surface.mjs adds personal mailboxes, compensation
# figures, family details, government-id shapes, and asset identity metadata.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

P1=408
P2=329
P3=3609
Z1=945
Z2=82
G1=GP
G2=A
EX1=SA
EX2=T
EX3=GR
EX4=E
EX5=GMA
EX6=T
EX7=TOEF
EX8=L
EX9=IELT
EX10=S
FAM=family
HOLD=household
INC=income

PERSONAL_PHONE="${P1}[-.[:space:]]*${P2}[-.[:space:]]*${P3}|${P1}${P2}${P3}"
HOME_ZIP="${Z1}${Z2}"
AVERAGE_PAT="\\b${G1}${G2}\\b|grade[[:space:]-]point"
EXAM_PAT="\\b(${EX1}${EX2}|${EX3}${EX4}|${EX5}${EX6}|${EX7}${EX8}|${EX9}${EX10})\\b"
EARNINGS_PAT="${FAM} ${INC}|${HOLD} ${INC}"

RULES=(
  "phone:${PERSONAL_PHONE}"
  "phone-generic:\\(?[0-9]{3}\\)?[-. ][0-9]{3}[-. ][0-9]{4}"
  "street:[0-9]{1,6}[[:space:]]+[A-Za-z0-9.]+[[:space:]]+(Street|St\\.|Avenue|Ave\\.|Road|Rd\\.|Drive|Dr\\.|Lane|Ln\\.|Boulevard|Blvd\\.|Court|Ct\\.|Place|Pl\\.)\\b"
  "zip-home:${HOME_ZIP}"
  "gpa:${AVERAGE_PAT}"
  "test-score:${EXAM_PAT}"
  "income:${EARNINGS_PAT}"
)

fail=0

scan_text() {
  local label="$1"
  local file="$2"
  local rule name pat
  for rule in "${RULES[@]}"; do
    name="${rule%%:*}"
    pat="${rule#*:}"
    if grep -nE -I -H "$pat" "$file" > /tmp/privacy-hits.txt 2>/dev/null; then
      echo "PRIVACY FAIL rule=${name} source=${label}"
      # Line numbers only. Do not print the matching text.
      cut -d: -f1-2 /tmp/privacy-hits.txt | sed 's/^/  /'
      fail=1
    fi
  done
}

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "pdftotext is required (poppler-utils)" >&2
  exit 2
fi

while IFS= read -r -d '' path; do
  case "$path" in
    *.pdf)
      tmp="$(mktemp)"
      pdftotext "$path" "$tmp"
      scan_text "$path" "$tmp"
      rm -f "$tmp"
      ;;
    *)
      if [ -f "$path" ]; then
        scan_text "$path" "$path"
      fi
      ;;
  esac
done < <(git ls-files -z --cached --others --exclude-standard)

history_file="$(mktemp)"
git log -p --all -- . ':(exclude)*.pdf' > "$history_file"
scan_text "git log -p" "$history_file"
rm -f "$history_file"

while IFS= read -r commit; do
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    tmp="$(mktemp)"
    git show "${commit}:${path}" | pdftotext - "$tmp"
    scan_text "${commit}:${path}" "$tmp"
    rm -f "$tmp"
  done < <(git ls-tree -r --name-only "$commit" | grep -E '\.pdf$' || true)
done < <(git rev-list --all)

rm -f /tmp/privacy-hits.txt

if [ "$fail" -ne 0 ]; then
  echo "Privacy scan failed."
  exit 1
fi

if ! command -v exiftool >/dev/null 2>&1; then
  echo "exiftool is required (libimage-exiftool-perl)" >&2
  exit 2
fi

node scripts/check-public-surface.mjs

echo "Privacy scan clean (working tree, git history, documents, and asset metadata)."
