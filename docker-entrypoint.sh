#!/bin/sh
# Apply any pending Drizzle migrations, then start Next.js.
# Failing either step exits non-zero so the container doesn't silently degrade.
set -e

echo "[entrypoint] applying database migrations"
node_modules/.bin/drizzle-kit migrate

echo "[entrypoint] starting Status Report Autopilot on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
