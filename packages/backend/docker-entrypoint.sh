#!/bin/sh

echo "=== Waiting for database to be ready ==="
# Wait up to 30 seconds for postgres to accept connections
for i in $(seq 1 15); do
  if npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma 2>&1; then
    echo "=== Migrations applied successfully ==="
    break
  else
    echo "=== Migration attempt $i failed, retrying in 2s... ==="
    sleep 2
  fi
done

echo "=== Starting backend server ==="
exec node packages/backend/dist/index.js
