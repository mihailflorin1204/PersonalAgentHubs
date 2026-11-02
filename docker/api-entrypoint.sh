#!/bin/sh
set -eu
node /app/packages/database/dist/migrate.js
exec node /app/apps/api/dist/index.js
