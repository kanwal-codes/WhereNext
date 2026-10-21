#!/bin/zsh
# Phone redesign dev server: the LOCAL Docker Supabase stack only, every provider key blank.
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
# Optional: let named provider keys through from .env.local (PHONE_PROVIDER_KEYS="GOOGLE_MAPS_API_KEY MAPBOX_ACCESS_TOKEN ..."), so
# Discover, stays, the map and weather show real data. Everything else stays blank, and every provider answer is cached on disk
# (scripts/api-cache.cjs) so a screen is paid for once, not on every reload.
if [ -n "${PHONE_PROVIDER_KEYS:-}" ]; then
  for name in ${=PHONE_PROVIDER_KEYS}; do
    value=$(sed -n "s/^${name}=//p" .env.local | head -1 | sed -e 's/^"//' -e 's/"$//')
    [ -n "$value" ] && export "$name=$value"
  done
  export NODE_OPTIONS="--require ./scripts/api-cache.cjs ${NODE_OPTIONS:-}"
fi
NEXT_DIST_DIR=.next-dev-4000 exec npx next dev -p 4000
