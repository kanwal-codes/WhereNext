#!/bin/zsh
# A production build with the phone redesign on, against the LOCAL stack only: every name in .env.local (a production env)
# is exported empty first, then the local Supabase values are set, exactly as scripts/dev-phone.sh does. Own dist dir.
set -e
cd "${0:A:h}/.."
: "${PHONE_KEYS_FILE:?set PHONE_KEYS_FILE to the local demo keys JSON}"
for name in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.local); do export "$name="; done
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(node -p "require('$PHONE_KEYS_FILE').anon")
export SUPABASE_SERVICE_ROLE_KEY=$(node -p "require('$PHONE_KEYS_FILE').service")
export NEXT_PUBLIC_SITE_URL=http://localhost:4000
NEXT_DIST_DIR=.next-build-phone exec npx next build
