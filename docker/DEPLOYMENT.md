# OmniLink Messenger — Deployment Guide

## Prerequisites

- DigitalOcean VPS (Ubuntu 22.04+) with at least 2GB RAM
- Domain pointing to the VPS IP (A record)
- SSH access to the server

## DNS Setup

Add these DNS records at your domain registrar:

| Type | Host | Value |
|------|------|-------|
| A | @ | 159.223.172.5 |
| A | www | 159.223.172.5 |

DNS propagation can take up to 48 hours but typically completes in minutes.

## Step 1: Server Setup

SSH into your VPS and run:

```bash
ssh root@159.223.172.5
```

Upload or clone the project:

```bash
mkdir -p /opt/omnilink
# Option A: Clone from git
git clone <your-repo-url> /opt/omnilink/app

# Option B: Upload via scp (from your local machine)
scp -r ./Exclusive\ Messenger root@159.223.172.5:/opt/omnilink/app
```

Run the setup script:

```bash
cd /opt/omnilink/app/docker
bash deploy.sh setup
```

This installs Docker, configures the firewall (ports 22/80/443), sets up fail2ban, and creates swap.

## Step 2: Configure Environment

```bash
cd /opt/omnilink/app/docker
cp .env.production.template .env
nano .env
```

Fill in all `CHANGE_ME` values. Generate secure secrets with:

```bash
openssl rand -base64 48  # Use for JWT_SECRET, JWT_REFRESH_SECRET
openssl rand -base64 32  # Use for DB_PASSWORD, REDIS_PASSWORD
```

## Step 3: Deploy

```bash
bash deploy.sh deploy
```

This builds all Docker images, starts the stack (PostgreSQL, Redis, Backend, Web), runs database migrations, and seeds the default data.

Verify at: `http://theomnilink.io`

## Step 4: Enable HTTPS

```bash
bash deploy.sh ssl
```

This requests a Let's Encrypt certificate and auto-configures Nginx for HTTPS. Certificates renew automatically.

Verify at: `https://theomnilink.io`

## Management Commands

```bash
bash deploy.sh status       # Check all service health
bash deploy.sh logs          # View all logs
bash deploy.sh logs backend  # View specific service logs
bash deploy.sh update        # Rebuild and redeploy after code changes
bash deploy.sh stop          # Stop everything
```

## Updating the Application

After pushing code changes:

```bash
cd /opt/omnilink/app
git pull origin main
cd docker
bash deploy.sh update
```

## Troubleshooting

**Services won't start**: Check logs with `bash deploy.sh logs`

**Database connection errors**: Verify DB credentials in `.env` match what PostgreSQL expects

**SSL certificate fails**: Ensure DNS A records point to your VPS IP and ports 80/443 are open

**Out of memory**: The VPS needs at least 2GB RAM. Check with `free -h`

**WebSocket not connecting**: Ensure the nginx config proxies `/socket.io/` correctly and the backend is healthy
