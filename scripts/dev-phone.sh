#!/bin/zsh
# Phone redesign dev server: the LOCAL Docker Supabase stack only, every provider key blank, the redesign flag on.
# Nothing here can reach the hosted project, production Redis, or a paid API. Usage:
#   scripts/dev-phone.sh            # serves on :4000 with its own dist dir
# Needs the local stack running (open -a Docker; the supabase_*_sb containers restart on their own) and a keys file
# (PHONE_KEYS_FILE, JSON {"anon":"...","service":"..."}) holding the local demo JWTs, which are not secrets.
set -e
cd "${0:A:h}/.."
: "${PHONE_KEYS_FILE:?set PHONE_KEYS_FILE to the local demo keys JSON}"
# .env.local is a Vercel-pulled PRODUCTION env. Next never lets it override a variable that is already set, so every
# name in it is exported empty first (the code uses `||`), then the local values are set.
for name in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.local); do export "$name="; done
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(node -p "require('$PHONE_KEYS_FILE').anon")
export SUPABASE_SERVICE_ROLE_KEY=$(node -p "require('$PHONE_KEYS_FILE').service")
export NEXT_PUBLIC_SITE_URL=http://localhost:4000
export NEXT_PUBLIC_PHONE_V2=1
NEXT_DIST_DIR=.next-dev-4000 exec npx next dev -p 4000
