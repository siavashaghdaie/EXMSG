#!/bin/bash
set -euo pipefail

# =============================================================
# OmniLink Messenger — VPS Deployment Script
# =============================================================
# Run this on your DigitalOcean VPS (Ubuntu 22.04+)
# Usage: bash deploy.sh [setup|deploy|ssl|update|logs|status]
# =============================================================

DOMAIN="theomnilink.io"
APP_DIR="/opt/omnilink"
REPO_DIR="$APP_DIR/app"
DOCKER_DIR="$REPO_DIR/docker"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[OmniLink]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- STEP 1: Initial Server Setup ----
cmd_setup() {
    log "Starting initial server setup..."

    # Update system
    log "Updating system packages..."
    apt-get update && apt-get upgrade -y

    # Install essentials
    log "Installing essential packages..."
    apt-get install -y \
        curl wget git ufw fail2ban \
        ca-certificates gnupg lsb-release \
        software-properties-common

    # Install Docker
    if ! command -v docker &>/dev/null; then
        log "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
    else
        log "Docker already installed: $(docker --version)"
    fi

    # Install Docker Compose plugin
    if ! docker compose version &>/dev/null; then
        log "Installing Docker Compose plugin..."
        apt-get install -y docker-compose-plugin
    else
        log "Docker Compose already installed: $(docker compose version)"
    fi

    # Configure firewall
    log "Configuring firewall..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw --force enable
    log "Firewall configured: SSH(22), HTTP(80), HTTPS(443)"

    # Configure fail2ban
    log "Configuring fail2ban..."
    systemctl enable fail2ban
    systemctl start fail2ban

    # Create app directory
    mkdir -p "$APP_DIR"

    # Set up swap (2GB) if not already present
    if [ ! -f /swapfile ]; then
        log "Creating 2GB swap file..."
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi

    log "Server setup complete!"
    echo ""
    log "Next steps:"
    echo "  1. Upload your project files to $REPO_DIR"
    echo "  2. Configure .env file in $DOCKER_DIR"
    echo "  3. Run: bash deploy.sh deploy"
}

# ---- STEP 2: Deploy Application ----
cmd_deploy() {
    log "Deploying OmniLink Messenger..."

    cd "$DOCKER_DIR" || error "Docker directory not found at $DOCKER_DIR"

    # Check .env exists
    if [ ! -f .env ]; then
        error ".env file not found! Copy and fill in .env.production.template:\n  cp .env.production.template .env\n  nano .env"
    fi

    # Source .env for variable access
    set -a; source .env; set +a

    # Pull / build images
    log "Building Docker images (this may take 5-10 minutes)..."
    docker compose -f docker-compose.prod.yml build --no-cache

    # Stop existing containers if running
    log "Stopping existing containers..."
    docker compose -f docker-compose.prod.yml down || true

    # Start services
    log "Starting services..."
    docker compose -f docker-compose.prod.yml up -d

    # Wait for postgres to be healthy
    log "Waiting for database to be ready..."
    sleep 10

    # Run Prisma migrations
    log "Running database migrations..."
    docker compose -f docker-compose.prod.yml exec -T backend \
        npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

    # Seed the database (create super admin, Linda AI, etc.)
    log "Seeding database..."
    docker compose -f docker-compose.prod.yml exec -T backend \
        npx prisma db seed --schema=packages/backend/prisma/schema.prisma || warn "Seed skipped (may already be seeded)"

    log "Deployment complete!"
    cmd_status
    echo ""
    log "App is running at http://$DOMAIN"
    log "Run 'bash deploy.sh ssl' to enable HTTPS"
}

# ---- STEP 3: SSL Certificate Setup ----
cmd_ssl() {
    log "Setting up SSL certificate for $DOMAIN..."

    cd "$DOCKER_DIR" || error "Docker directory not found"
    set -a; source .env; set +a

    CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
    if [ -z "$CERTBOT_EMAIL" ]; then
        error "CERTBOT_EMAIL not set in .env file"
    fi

    # Ensure web container is running (needed for ACME challenge)
    if ! docker compose -f docker-compose.prod.yml ps web | grep -q "Up"; then
        error "Web container must be running first. Run: bash deploy.sh deploy"
    fi

    # Request certificate
    log "Requesting SSL certificate from Let's Encrypt..."
    docker compose -f docker-compose.prod.yml run --rm certbot \
        certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$CERTBOT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"

    # Reload nginx to pick up the new certificate
    log "Reloading Nginx with SSL configuration..."
    docker compose -f docker-compose.prod.yml exec web nginx -s reload

    log "SSL certificate installed!"
    log "App is now running at https://$DOMAIN"
    log "Certificate will auto-renew via the certbot container."
}

# ---- Update (rebuild + redeploy) ----
cmd_update() {
    log "Updating OmniLink Messenger..."

    cd "$DOCKER_DIR" || error "Docker directory not found"

    log "Rebuilding images..."
    docker compose -f docker-compose.prod.yml build --no-cache

    log "Restarting services..."
    docker compose -f docker-compose.prod.yml up -d

    # Run any new migrations
    sleep 10
    log "Running migrations..."
    docker compose -f docker-compose.prod.yml exec -T backend \
        npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

    log "Update complete!"
    cmd_status
}

# ---- Logs ----
cmd_logs() {
    local service="${2:-}"
    cd "$DOCKER_DIR" || error "Docker directory not found"
    if [ -n "$service" ]; then
        docker compose -f docker-compose.prod.yml logs -f --tail=100 "$service"
    else
        docker compose -f docker-compose.prod.yml logs -f --tail=50
    fi
}

# ---- Status ----
cmd_status() {
    cd "$DOCKER_DIR" || error "Docker directory not found"
    echo ""
    log "Service Status:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    docker compose -f docker-compose.prod.yml ps
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Check if services are healthy
    for svc in postgres redis backend web; do
        status=$(docker compose -f docker-compose.prod.yml ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "not found")
        if echo "$status" | grep -qi "healthy\|up"; then
            echo -e "  ${GREEN}✓${NC} $svc: $status"
        else
            echo -e "  ${RED}✗${NC} $svc: $status"
        fi
    done
    echo ""
}

# ---- Stop ----
cmd_stop() {
    log "Stopping all services..."
    cd "$DOCKER_DIR" || error "Docker directory not found"
    docker compose -f docker-compose.prod.yml down
    log "All services stopped."
}

# ---- Main ----
case "${1:-help}" in
    setup)  cmd_setup ;;
    deploy) cmd_deploy ;;
    ssl)    cmd_ssl ;;
    update) cmd_update ;;
    logs)   cmd_logs "$@" ;;
    status) cmd_status ;;
    stop)   cmd_stop ;;
    *)
        echo ""
        echo "OmniLink Messenger — Deployment Manager"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Usage: bash deploy.sh <command>"
        echo ""
        echo "Commands:"
        echo "  setup    Initial server setup (Docker, firewall, swap)"
        echo "  deploy   Build and start all services"
        echo "  ssl      Set up SSL certificate (Let's Encrypt)"
        echo "  update   Rebuild and redeploy (after code changes)"
        echo "  logs     View logs (optionally: logs backend|web|postgres|redis)"
        echo "  status   Show service status"
        echo "  stop     Stop all services"
        echo ""
        ;;
esac
