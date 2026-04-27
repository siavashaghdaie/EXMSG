#!/bin/sh
set -e

echo "=== Running Prisma migrations ==="
npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

echo "=== Starting backend server ==="
exec node packages/backend/dist/index.js
