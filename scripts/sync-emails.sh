#!/bin/bash
# Corson Agency — Full Email Pipeline
# Step 1: fetch-emails.mjs  → pulls inbox from Microsoft Graph → saves .eml files
# Step 2: parse-emails.mjs  → reads .eml files → extracts booking data → pushes to Supabase
#
# Runs automatically at 8AM daily via launchd.
# First run requires one-time browser sign-in for Microsoft Graph auth.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/sync-log.txt"
NODE="/usr/local/bin/node"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Load .env (ANTHROPIC_API_KEY + AZURE_CLIENT_ID + AZURE_TENANT_ID)
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# ── SANITY CHECKS ─────────────────────────────────────────────────────────────
if [ ! -f "$NODE" ]; then
  echo "[$TIMESTAMP] ERROR: node not found at $NODE" | tee -a "$LOG_FILE"
  exit 1
fi

if [ -z "$AZURE_CLIENT_ID" ]; then
  echo "[$TIMESTAMP] ERROR: AZURE_CLIENT_ID not set in scripts/.env" | tee -a "$LOG_FILE"
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[$TIMESTAMP] ERROR: ANTHROPIC_API_KEY not set in scripts/.env" | tee -a "$LOG_FILE"
  exit 1
fi

echo "" | tee -a "$LOG_FILE"
echo "======================================================================" | tee -a "$LOG_FILE"
echo "[$TIMESTAMP] PIPELINE START" | tee -a "$LOG_FILE"
echo "======================================================================" | tee -a "$LOG_FILE"

cd "$PROJECT_DIR"

# ── STEP 1: FETCH EMAILS FROM MICROSOFT GRAPH ─────────────────────────────────
echo "[$TIMESTAMP] STEP 1: Fetching emails from Microsoft Graph..." | tee -a "$LOG_FILE"
"$NODE" "$SCRIPT_DIR/fetch-emails.mjs" 2>&1 | tee -a "$LOG_FILE"
FETCH_EXIT=${PIPESTATUS[0]}

if [ $FETCH_EXIT -ne 0 ]; then
  echo "[$TIMESTAMP] STEP 1 FAILED (exit $FETCH_EXIT) — aborting pipeline" | tee -a "$LOG_FILE"
  exit $FETCH_EXIT
fi

echo "[$TIMESTAMP] STEP 1 complete." | tee -a "$LOG_FILE"

# ── STEP 2: PARSE EMAILS → SUPABASE ───────────────────────────────────────────
echo "[$TIMESTAMP] STEP 2: Parsing emails and pushing to Supabase..." | tee -a "$LOG_FILE"
"$NODE" "$SCRIPT_DIR/parse-emails.mjs" 2>&1 | tee -a "$LOG_FILE"
PARSE_EXIT=${PIPESTATUS[0]}

if [ $PARSE_EXIT -ne 0 ]; then
  echo "[$TIMESTAMP] STEP 2 FAILED (exit $PARSE_EXIT)" | tee -a "$LOG_FILE"
  exit $PARSE_EXIT
fi

echo "[$TIMESTAMP] STEP 2 complete." | tee -a "$LOG_FILE"
echo "[$TIMESTAMP] PIPELINE DONE." | tee -a "$LOG_FILE"
