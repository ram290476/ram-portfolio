#!/usr/bin/env bash
# Pull or clone ram290476/obsidian-job-search, then rebuild assets/chat/kb.json
# from notes tagged `portfolio: public`. Fails closed: if the second scrub or
# denylist check rejects anything, kb.json is left unchanged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_SLUG="ram290476/obsidian-job-search"
VAULT_REPO="${OBSIDIAN_JOB_SEARCH:-}"
NOTES_SUBDIR="notes"
KB_PATH=""
DENYLIST_PATH=""
CLEANUP_DIRS=()

usage() {
  cat <<'USAGE'
Usage: scripts/sync-vault-kb.sh [--repo path/to/obsidian-job-search] [--kb assets/chat/kb.json] [--denylist scripts/chat-denylist.txt]

Refresh the portfolio guide from the private, already-scrubbed notes repo.
Only notes tagged portfolio: public are eligible. If the second scrub or
denylist check rejects a passage, the script exits without writing kb.json.

If --repo is omitted, the script uses $OBSIDIAN_JOB_SEARCH, then a sibling
checkout at ../obsidian-job-search, then clones the repo with gh into a
temporary directory. A git checkout is fast-forwarded with git pull --ff-only.
USAGE
}

cleanup() {
  local dir
  for dir in "${CLEANUP_DIRS[@]+"${CLEANUP_DIRS[@]}"}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo|--vault-repo)
      VAULT_REPO="${2:-}"
      if [[ -z "$VAULT_REPO" ]]; then
        echo "Missing value for $1." >&2
        exit 1
      fi
      shift 2
      ;;
    --kb)
      KB_PATH="${2:-}"
      if [[ -z "$KB_PATH" ]]; then
        echo "Missing value for --kb." >&2
        exit 1
      fi
      shift 2
      ;;
    --denylist)
      DENYLIST_PATH="${2:-}"
      if [[ -z "$DENYLIST_PATH" ]]; then
        echo "Missing value for --denylist." >&2
        exit 1
      fi
      shift 2
      ;;
    --notes-dir)
      NOTES_SUBDIR="${2:-}"
      if [[ -z "$NOTES_SUBDIR" ]]; then
        echo "Missing value for --notes-dir." >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument $1." >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$KB_PATH" ]]; then
  KB_PATH="$ROOT/assets/chat/kb.json"
fi
if [[ "$KB_PATH" != /* ]]; then
  KB_PATH="$ROOT/$KB_PATH"
fi

if [[ -z "$DENYLIST_PATH" && -f "$ROOT/scripts/chat-denylist.txt" ]]; then
  DENYLIST_PATH="$ROOT/scripts/chat-denylist.txt"
fi
if [[ -n "$DENYLIST_PATH" && "$DENYLIST_PATH" != /* ]]; then
  DENYLIST_PATH="$ROOT/$DENYLIST_PATH"
fi
if [[ -n "$DENYLIST_PATH" && ! -f "$DENYLIST_PATH" ]]; then
  echo "Denylist file not found: $DENYLIST_PATH" >&2
  echo "kb.json unchanged." >&2
  exit 1
fi

if [[ ! -f "$KB_PATH" ]]; then
  echo "Could not read knowledge base at $KB_PATH. kb.json unchanged." >&2
  exit 1
fi

if [[ -z "$VAULT_REPO" && -d "$ROOT/../obsidian-job-search" ]]; then
  VAULT_REPO="$(cd "$ROOT/../obsidian-job-search" && pwd)"
fi

if [[ -z "$VAULT_REPO" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh is required to clone $REPO_SLUG when --repo is not given." >&2
    echo "kb.json unchanged." >&2
    exit 1
  fi
  CLONE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/obsidian-job-search.XXXXXX")"
  CLEANUP_DIRS+=("$CLONE_ROOT")
  echo "Cloning $REPO_SLUG into a temporary directory."
  if ! gh repo clone "$REPO_SLUG" "$CLONE_ROOT/repo" -- --depth 1; then
    echo "Failed to clone $REPO_SLUG. kb.json unchanged." >&2
    exit 1
  fi
  VAULT_REPO="$CLONE_ROOT/repo"
elif [[ ! -d "$VAULT_REPO" ]]; then
  echo "Vault repo path not found: $VAULT_REPO" >&2
  echo "kb.json unchanged." >&2
  exit 1
else
  VAULT_REPO="$(cd "$VAULT_REPO" && pwd)"
fi

if [[ -d "$VAULT_REPO/.git" ]]; then
  echo "Updating $VAULT_REPO with git pull --ff-only."
  if ! git -C "$VAULT_REPO" pull --ff-only; then
    echo "git pull --ff-only failed. kb.json unchanged." >&2
    exit 1
  fi
fi

NOTES_DIR="$VAULT_REPO/$NOTES_SUBDIR"
if [[ ! -d "$NOTES_DIR" ]]; then
  echo "Notes directory not found: $NOTES_DIR" >&2
  echo "kb.json unchanged." >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sync-vault-kb.XXXXXX")"
CLEANUP_DIRS+=("$WORK")
cp "$KB_PATH" "$WORK/kb.json"

BUILD_CMD=(node "$ROOT/scripts/build-kb.mjs" --vault-dir "$NOTES_DIR" --kb "$WORK/kb.json")
if [[ -n "$DENYLIST_PATH" ]]; then
  BUILD_CMD+=(--denylist "$DENYLIST_PATH")
fi

set +e
BUILD_OUTPUT="$("${BUILD_CMD[@]}" 2>&1)"
BUILD_STATUS=$?
set -e
printf '%s\n' "$BUILD_OUTPUT"

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "Vault knowledge-base build failed. kb.json unchanged." >&2
  exit 1
fi

if printf '%s\n' "$BUILD_OUTPUT" | grep -Eq 'Scrub rejected [1-9][0-9]* passage'; then
  echo "Scrub or denylist check rejected one or more passages. kb.json unchanged." >&2
  exit 1
fi

CHECK_CMD=(node "$ROOT/scripts/check-kb-privacy.mjs" "$WORK/kb.json")
if [[ -n "$DENYLIST_PATH" ]]; then
  CHECK_CMD+=("$DENYLIST_PATH")
fi
if ! "${CHECK_CMD[@]}"; then
  echo "Output knowledge base failed the privacy check. kb.json unchanged." >&2
  exit 1
fi

if cmp -s "$KB_PATH" "$WORK/kb.json"; then
  echo "kb.json unchanged."
  exit 0
fi

cp "$WORK/kb.json" "$KB_PATH"
echo "kb.json updated. Review the diff before committing. Do not commit the vault checkout or the denylist."
