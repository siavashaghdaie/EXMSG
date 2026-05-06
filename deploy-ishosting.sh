#!/bin/bash
# =============================================================
# Exclusive Messenger — ISHosting Dedicated Server Deployment
# =============================================================
# Server: 38.180.123.120 (NL3-20, Netherlands)
# CPU: AMD Ryzen 9 7900X (12c/24t)
# RAM: 64GB DDR5
# Storage: 2× 1TB NVMe
# OS: Ubuntu 22
# =============================================================
# USAGE:
#   1. SSH into the server:  ssh root@38.180.123.120
#   2. Upload this script or paste it
#   3. Run: bash deploy-ishosting.sh
# =============================================================

set -euo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}═══════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════${NC}\n"; }

DOMAIN="theomnilink.io"
APP_DIR="/root/exmsg"
DOCKER_DIR="${APP_DIR}/docker"
REPO_URL="https://github.com/siavashaghdaie/EXMSG.git"
EMAIL="siavash.aghdaie@gmail.com"

# ────────────────────────────────────────────────────
step "1/8 — System Update & Prerequisites"
# ────────────────────────────────────────────────────

apt-get update && apt-get upgrade -y
apt-get install -y \
  apt-transport-https ca-certificates curl gnupg lsb-release \
  git ufw fail2ban htop wget unzip software-properties-common

log "System packages installed"

# ────────────────────────────────────────────────────
step "2/8 — Install Docker & Docker Compose"
# ────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker installed"
else
  log "Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  COMPOSE_VER=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  log "Docker Compose installed"
else
  log "Docker Compose already installed: $(docker compose version)"
fi

# ────────────────────────────────────────────────────
step "3/8 — Firewall Setup"
# ────────────────────────────────────────────────────

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw --force enable
log "Firewall configured (SSH, HTTP, HTTPS)"

# ────────────────────────────────────────────────────
step "4/8 — Clone Repository"
# ────────────────────────────────────────────────────

if [ -d "$APP_DIR" ]; then
  warn "Directory $APP_DIR already exists — pulling latest..."
  cd "$APP_DIR"
  git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  log "Repository cloned to $APP_DIR"
fi

cd "$DOCKER_DIR"

# ────────────────────────────────────────────────────
step "5/8 — Generate Environment Variables"
# ────────────────────────────────────────────────────

if [ -f .env ]; then
  warn ".env already exists — backing up to .env.bak"
  cp .env .env.bak
fi

# Generate strong random passwords
DB_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
REDIS_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SEC=$(openssl rand -base64 48)
JWT_REF=$(openssl rand -base64 48)

cat > .env << ENVEOF
# =============================================================
# OmniLink Messenger — Production Environment (ISHosting)
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# =============================================================

# --- Domain ---
DOMAIN=${DOMAIN}
CORS_ORIGIN=https://${DOMAIN}

# --- Database ---
DB_USER=omnilink
DB_PASSWORD=${DB_PASS}
DB_NAME=omnilink_messenger

# --- Redis ---
REDIS_PASSWORD=${REDIS_PASS}

# --- JWT Secrets ---
JWT_SECRET=${JWT_SEC}
JWT_REFRESH_SECRET=${JWT_REF}

# --- Anthropic Claude API (for Linda AI assistant) ---
# IMPORTANT: Copy your API key from the old server's .env
ANTHROPIC_API_KEY=PASTE_YOUR_KEY_HERE

# --- OpenAI API (for voice transcription + TTS) ---
# IMPORTANT: Copy your API key from the old server's .env
OPENAI_API_KEY=PASTE_YOUR_KEY_HERE

# --- Resend Email API ---
RESEND_API_KEY=PASTE_YOUR_KEY_HERE
EMAIL_FROM=linda@theomnilink.io

# --- S3 / DigitalOcean Spaces (file uploads) ---
# IMPORTANT: Copy these from the old server's .env
S3_ENDPOINT=PASTE_YOUR_ENDPOINT_HERE
S3_BUCKET=omnilink-uploads
S3_ACCESS_KEY=PASTE_YOUR_KEY_HERE
S3_SECRET_KEY=PASTE_YOUR_KEY_HERE
S3_REGION=nyc3

# --- SSL (Let's Encrypt) ---
CERTBOT_EMAIL=${EMAIL}
ENVEOF

log "Environment file created at ${DOCKER_DIR}/.env"
warn "⚠️  You MUST edit .env and paste your API keys from the old server!"
echo ""
echo "  To copy keys from the old server (159.223.172.5):"
echo "    ssh root@159.223.172.5 'cat /root/exmsg/docker/.env'"
echo ""
echo "  Then edit:  nano ${DOCKER_DIR}/.env"
echo ""
read -p "Press Enter after you've updated the .env file (or Ctrl+C to do it later)... "

# ────────────────────────────────────────────────────
step "6/8 — SSL Certificate Setup"
# ────────────────────────────────────────────────────

mkdir -p ssl

# Create SSL directory structure for certbot
mkdir -p /tmp/certbot-webroot

# First start without SSL to get the certificate
log "Starting temporary HTTP server for certificate..."

# Build and start only the necessary services first (without SSL)
docker compose -f docker-compose.prod.yml build backend web
docker compose -f docker-compose.prod.yml up -d postgres redis backend

# Wait for backend to be healthy
log "Waiting for backend to be healthy..."
sleep 15

# Start web (nginx) for HTTP-only to serve certbot challenge
docker compose -f docker-compose.prod.yml up -d web

sleep 5

# Request SSL certificate
log "Requesting SSL certificate for ${DOMAIN}..."
docker run --rm \
  -v "$(docker volume inspect em-certbot_webroot 2>/dev/null | grep Mountpoint | cut -d'"' -f4 || echo '/var/lib/docker/volumes/docker_certbot_webroot/_data'):/var/www/certbot" \
  -v "$(docker volume inspect em-certbot_certs 2>/dev/null | grep Mountpoint | cut -d'"' -f4 || echo '/var/lib/docker/volumes/docker_certbot_certs/_data'):/etc/letsencrypt" \
  certbot/certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --non-interactive \
    --force-renewal

if [ $? -eq 0 ]; then
  log "SSL certificate obtained successfully!"
else
  warn "SSL certificate failed — make sure DNS for ${DOMAIN} points to 38.180.123.120"
  warn "You can retry later with: certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"
fi

# ────────────────────────────────────────────────────
step "7/8 — Build & Start All Services"
# ────────────────────────────────────────────────────

cd "$DOCKER_DIR"

# Rebuild and restart everything with SSL
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build backend web
docker compose -f docker-compose.prod.yml up -d

log "All services starting..."
sleep 10

# Check status
docker compose -f docker-compose.prod.yml ps

# ────────────────────────────────────────────────────
step "8/8 — Setup Auto-Renewal & Monitoring"
# ────────────────────────────────────────────────────

# Add certbot renewal cron job
(crontab -l 2>/dev/null; echo "0 3 * * * cd ${DOCKER_DIR} && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec web nginx -s reload") | crontab -
log "SSL auto-renewal cron job added"

# Create a convenient deploy update script
cat > /root/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
echo "🔄 Pulling latest code..."
cd /root/exmsg && git pull
echo "🔨 Building containers..."
cd docker && docker compose -f docker-compose.prod.yml build backend web
echo "🚀 Restarting services..."
docker compose -f docker-compose.prod.yml up -d backend web
echo "✅ Deployment complete!"
docker compose -f docker-compose.prod.yml ps
DEPLOYEOF
chmod +x /root/deploy.sh
log "Quick deploy script created at /root/deploy.sh"

# Create a status check script
cat > /root/status.sh << 'STATUSEOF'
#!/bin/bash
echo "=== Docker Containers ==="
cd /root/exmsg/docker && docker compose -f docker-compose.prod.yml ps
echo ""
echo "=== Disk Usage ==="
df -h / | tail -1
echo ""
echo "=== Memory ==="
free -h | head -2
echo ""
echo "=== Docker Logs (last 20 lines) ==="
docker logs em-backend-prod --tail 20 2>&1
STATUSEOF
chmod +x /root/status.sh
log "Status script created at /root/status.sh"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Server:     38.180.123.120"
echo "  Domain:     https://${DOMAIN}"
echo "  Deploy:     /root/deploy.sh   (pull + build + restart)"
echo "  Status:     /root/status.sh   (check all services)"
echo ""
echo -e "${YELLOW}  ⚠️  IMPORTANT NEXT STEPS:${NC}"
echo "  1. Update DNS: Point ${DOMAIN} A record to 38.180.123.120"
echo "  2. Edit .env: Add your API keys (Anthropic, OpenAI, S3, Resend)"
echo "  3. Re-run SSL: Once DNS propagates, restart for HTTPS to work"
echo ""
echo "  To update after code changes:"
echo "    /root/deploy.sh"
echo ""
