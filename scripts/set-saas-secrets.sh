#!/bin/bash
# Set secrets on the school-ledger worker (SaaS production for school.jsdevelop.ir)
# Reads sensitive values from .env (gitignored) — nothing hardcoded here.
# Usage: ADMIN_USERNAME="sobh@n" ADMIN_PASSWORD="..." bash scripts/set-saas-secrets.sh [dbName]
set -e
cd "$(dirname "$0")/.."
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
DB_NAME="${1:-school_saas}"
WORKER_NAME="${WORKER_NAME:-school-ledger}"

# DB URL: same TiDB cluster, dedicated database
BASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed -E 's|/[a-z_0-9]+\?|/'"$DB_NAME"'?|')
JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

tg() { grep "^$1=" .env | cut -d= -f2-; }

put() { printf '%s' "$2" | npx wrangler secret put "$1" --name "$WORKER_NAME" 2>/dev/null | grep -E "Success|error" || echo "($1 done)"; }

put DATABASE_URL "$BASE_URL"
put JWT_SECRET "$JWT"
put ADMIN_USERNAME "${ADMIN_USERNAME:?set ADMIN_USERNAME}"
put ADMIN_PASSWORD "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"
put TELEGRAM_BOT_TOKEN "$(tg TELEGRAM_BOT_TOKEN)"
put TELEGRAM_CHANNEL_ID "$(tg TELEGRAM_CHANNEL_ID)"
put TELEGRAM_WEBHOOK_SECRET "$(tg TELEGRAM_WEBHOOK_SECRET)"
put NODE_ENV "production"

echo "--- secrets on $WORKER_NAME ---"
npx wrangler secret list --name "$WORKER_NAME" 2>/dev/null | python3 -c "import json,sys; print([s['name'] for s in json.load(sys.stdin)])"
