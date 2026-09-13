#!/usr/bin/with-contenv bashio
set -e

export DATA_DIR="/data"
export PORT="3000"
export RECIPE_APP_PASSWORD="$(bashio::config 'password')"

# Auto-generate a session secret on first run and persist it in the
# add-on's own /data volume, so users don't have to run `openssl rand`
# themselves — but still respect an explicit override if one is set.
SECRET="$(bashio::config 'session_secret')"
if [ -z "${SECRET}" ]; then
  if [ -f "/data/.session_secret" ]; then
    SECRET="$(cat /data/.session_secret)"
  else
    SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    echo -n "${SECRET}" > /data/.session_secret
  fi
fi
export SESSION_SECRET="${SECRET}"

bashio::log.info "Starting Recipe Box on port ${PORT}..."
cd /app
exec node server/index.js
