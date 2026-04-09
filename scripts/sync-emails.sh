#!/bin/bash
# Corson Agency — Email Sync Script
# Runs the email parser and logs results.
# Called daily by launchd at 8AM.

# ── CONFIG ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/sync-log.txt"
NODE="/usr/local/bin/node"

# Load ANTHROPIC_API_KEY from scripts/.env if set
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# ── SANITY CHECKS ─────────────────────────────────────────────────────────────
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[$(date)] ERROR: ANTHROPIC_API_KEY not set. Add it to $SCRIPT_DIR/.env" | tee -a "$LOG_FILE"
  exit 1
fi

if [ ! -f "$NODE" ]; then
  echo "[$(date)] ERROR: node not found at $NODE" | tee -a "$LOG_FILE"
  exit 1
fi

# ── RUN ───────────────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting email sync..." | tee -a "$LOG_FILE"

cd "$PROJECT_DIR"
"$NODE" "$SCRIPT_DIR/parse-emails.mjs" 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sync completed successfully" | tee -a "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sync failed with exit code $EXIT_CODE" | tee -a "$LOG_FILE"
fi

exit $EXIT_CODE
