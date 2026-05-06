#!/bin/bash
# =============================================================
# Migrate data from old DigitalOcean server to ISHosting
# =============================================================
# Run this AFTER deploy-ishosting.sh has completed
# This copies: database, uploads, and .env API keys
# =============================================================

set -euo pipefail

OLD_SERVER="159.223.172.5"
NEW_DIR="/root/exmsg/docker"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "\n${CYAN}═══ $1 ═══${NC}\n"; }

step "1. Copy .env API keys from old server"
echo "Fetching old .env..."
scp root@${OLD_SERVER}:/root/exmsg/docker/.env /tmp/old-env.txt
log "Old .env downloaded to /tmp/old-env.txt"

# Extract API keys from old .env and merge into new
for KEY in ANTHROPIC_API_KEY OPENAI_API_KEY RESEND_API_KEY S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY S3_REGION TURN_SERVER TURN_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
  OLD_VAL=$(grep "^${KEY}=" /tmp/old-env.txt 2>/dev/null | cut -d'=' -f2- || echo "")
  if [ -n "$OLD_VAL" ] && [ "$OLD_VAL" != "PASTE_YOUR_KEY_HERE" ] && [ "$OLD_VAL" != "CHANGE_ME_OR_LEAVE_EMPTY" ]; then
    # Replace in new .env
    if grep -q "^${KEY}=" ${NEW_DIR}/.env; then
      sed -i "s|^${KEY}=.*|${KEY}=${OLD_VAL}|" ${NEW_DIR}/.env
      log "Copied ${KEY}"
    fi
  fi
done
log "API keys migrated"

step "2. Export database from old server"
echo "This will dump the PostgreSQL database from the old server..."
ssh root@${OLD_SERVER} 'cd /root/exmsg/docker && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U omnilink omnilink_messenger --clean --if-exists' > /tmp/db-backup.sql
log "Database exported ($(du -sh /tmp/db-backup.sql | cut -f1))"

step "3. Import database to new server"
cd ${NEW_DIR}

# Make sure postgres is running
docker compose -f docker-compose.prod.yml up -d postgres
sleep 10

# Import the dump
docker compose -f docker-compose.prod.yml exec -T postgres psql -U omnilink omnilink_messenger < /tmp/db-backup.sql
log "Database imported"

step "4. Copy uploaded files"
echo "Copying uploads from old server..."

# Find the uploads volume mount
UPLOADS_VOL=$(docker volume inspect docker_uploads_data 2>/dev/null | grep Mountpoint | cut -d'"' -f4 || echo "")
if [ -z "$UPLOADS_VOL" ]; then
  UPLOADS_VOL=$(docker volume inspect exmsg_uploads_data 2>/dev/null | grep Mountpoint | cut -d'"' -f4 || echo "")
fi

if [ -n "$UPLOADS_VOL" ]; then
  rsync -avz --progress root@${OLD_SERVER}:/var/lib/docker/volumes/docker_uploads_data/_data/ "${UPLOADS_VOL}/"
  log "Uploads synced"
else
  warn "Could not find uploads volume. You may need to sync uploads manually."
fi

step "5. Restart all services"
cd ${NEW_DIR}
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
sleep 10
docker compose -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Migration Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  All data has been migrated from ${OLD_SERVER} to this server."
echo "  Next: Update DNS A record for theomnilink.io to 38.180.123.120"
echo ""
