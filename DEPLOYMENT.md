# Exclusive Messenger - Deployment Guide

This guide covers deploying Exclusive Messenger to production with comprehensive step-by-step instructions for various deployment options.

## Quick Deploy (DigitalOcean Droplet)

The fastest way to get Exclusive Messenger running in production.

### Step 1: Create a DigitalOcean Droplet

1. Sign up for [DigitalOcean](https://www.digitalocean.com) or log in to your account
2. Click "Create" > "Droplets"
3. Choose the following configuration:
   - **Region**: Choose the closest region to your users
   - **Image**: Ubuntu 22.04 (LTS) x64
   - **Size**: Basic ($24/month, 2GB RAM, 1 vCPU)
     - For production with higher traffic, consider 4GB ($48/month) or higher
   - **Authentication**: SSH key (recommended) or password
4. Click "Create Droplet" and wait for it to boot

### Step 2: SSH into the Droplet

```bash
ssh root@<droplet-ip>
```

Replace `<droplet-ip>` with the IP address shown in your DigitalOcean dashboard.

### Step 3: Install Docker and Docker Compose

```bash
# Update system packages
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Add current user to docker group (optional, allows running docker without sudo)
usermod -aG docker $USER
newgrp docker
```

### Step 4: Clone the Repository

```bash
# Create app directory
mkdir -p /app/exclusive-messenger
cd /app/exclusive-messenger

# Clone repository
git clone https://github.com/your-organization/exclusive-messenger.git .
```

### Step 5: Configure Environment Variables

```bash
# Copy production example configuration
cp .env.production.example .env

# Edit with your production values
nano .env
```

**Required environment variables:**
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/exclusive_messenger`)
- `REDIS_URL`: Redis connection string (e.g., `redis://:password@localhost:6379`)
- `NODE_ENV`: Set to `production`
- `JWT_SECRET`: Generate a secure random string for JWT signing
- `API_BASE_URL`: Your production backend URL (e.g., `https://api.yourdomain.com`)
- `WEB_BASE_URL`: Your production web URL (e.g., `https://yourdomain.com`)

**Optional but recommended:**
- `S3_ENDPOINT`: S3-compatible storage endpoint
- `S3_BUCKET`: Bucket name for file uploads
- `S3_ACCESS_KEY`: S3 access key
- `S3_SECRET_KEY`: S3 secret key
- `SMTP_HOST`: Email service hostname
- `SMTP_PORT`: Email service port
- `SMTP_USER`: Email service username
- `SMTP_PASS`: Email service password

### Step 6: Create Production Docker Compose File

Create `/app/exclusive-messenger/docker/docker-compose.prod.yml`:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: em-postgres
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER} -d ${DB_NAME}']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: em-redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ghcr.io/your-organization/exclusive-messenger/backend:latest
    container_name: em-backend
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: ${NODE_ENV}
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      API_BASE_URL: ${API_BASE_URL}
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_BUCKET: ${S3_BUCKET}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
    ports:
      - '3001:3001'
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3001/health']
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    image: ghcr.io/your-organization/exclusive-messenger/web:latest
    container_name: em-web
    restart: always
    ports:
      - '80:80'
    environment:
      REACT_APP_API_URL: ${API_BASE_URL}
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost/health']
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

### Step 7: Start the Application

```bash
cd /app/exclusive-messenger

# Pull the latest images
docker compose -f docker/docker-compose.prod.yml pull

# Start services
docker compose -f docker/docker-compose.prod.yml up -d

# Run database migrations
docker compose -f docker/docker-compose.prod.yml exec backend npm run db:migrate

# Seed database (optional)
docker compose -f docker/docker-compose.prod.yml exec backend npm run db:seed

# Check logs
docker compose -f docker/docker-compose.prod.yml logs -f
```

### Step 8: Verify Deployment

```bash
# Check service status
docker compose -f docker/docker-compose.prod.yml ps

# Test backend health
curl http://localhost:3001/health

# Test web service
curl http://localhost/health
```

---

## Domain Setup

Setting up a custom domain for your Exclusive Messenger instance.

### Option 1: Cloudflare (Recommended - Free with SSL)

Cloudflare provides free CDN, DDoS protection, and SSL certificates.

**Step 1: Register Domain**
- Buy domain from [Namecheap](https://www.namecheap.com) or [Cloudflare Registrar](https://www.cloudflare.com/en-gb/products/registrar/) ($10-15/year)

**Step 2: Add Site to Cloudflare**
1. Sign up for [Cloudflare](https://www.cloudflare.com) (free tier available)
2. Click "Add a site"
3. Enter your domain name
4. Select the free plan

**Step 3: Change Nameservers**
1. Cloudflare will show you two nameservers
2. Go to your domain registrar (Namecheap, etc.)
3. Update nameservers to the ones provided by Cloudflare
4. Wait 24-48 hours for DNS propagation

**Step 4: Configure DNS Records**
In Cloudflare dashboard:
1. Go to DNS > Records
2. Add A record:
   - Name: `@` (for root) or `yourdomain.com`
   - Type: A
   - Content: Your Droplet IP address
   - Proxied: Yes (orange cloud)
3. Add CNAME for subdomain (optional):
   - Name: `www` or `api`
   - Type: CNAME
   - Content: `yourdomain.com`
   - Proxied: Yes

**Step 5: Enable SSL/TLS**
1. Go to SSL/TLS > Overview
2. Set encryption mode to "Full (strict)"
3. Wait for certificate to be issued (usually instant)

**Step 6: Configure Reverse Proxy on Droplet**

Install and configure Nginx as a reverse proxy:

```bash
# Install Nginx
apt-get install -y nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/exclusive-messenger << 'EOF'
upstream backend {
    server localhost:3001;
}

upstream web {
    server localhost:80;
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name yourdomain.com *.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # Cloudflare will handle SSL, but Nginx needs to know about it
    # We're using Flexible SSL (Cloudflare handles the cert)
    # If using Full SSL, you need to configure SSL certs below

    # Web application
    location / {
        proxy_pass http://web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for real-time messaging
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}

# www subdomain
server {
    listen 443 ssl http2;
    server_name www.yourdomain.com;
    return 301 https://yourdomain.com$request_uri;
}
EOF

# Enable the configuration
ln -s /etc/nginx/sites-available/exclusive-messenger /etc/nginx/sites-enabled/

# Remove default configuration
rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Start Nginx
systemctl enable nginx
systemctl start nginx
```

**Step 7: Update Docker Compose Ports**

Modify your docker-compose.prod.yml to not expose ports directly:

```yaml
services:
  backend:
    # ... other config ...
    ports: []  # Nginx will handle external access

  web:
    # ... other config ...
    ports: []  # Nginx will handle external access
```

Restart services:
```bash
docker compose -f docker/docker-compose.prod.yml down
docker compose -f docker/docker-compose.prod.yml up -d
```

---

## SSL with Let's Encrypt (Alternative to Cloudflare)

If you prefer to manage SSL certificates yourself using Let's Encrypt.

### Step 1: Install Certbot

```bash
apt-get install -y certbot python3-certbot-nginx
```

### Step 2: Request Certificate

```bash
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

This will create certificates at:
- `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

### Step 3: Configure Nginx with SSL

```bash
cat > /etc/nginx/sites-available/exclusive-messenger << 'EOF'
upstream backend {
    server localhost:3001;
}

upstream web {
    server localhost;
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS (optional but recommended)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Web application
    location / {
        proxy_pass http://web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
EOF

nginx -t
systemctl restart nginx
```

### Step 4: Auto-Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

```bash
# Test renewal (dry-run)
certbot renew --dry-run

# Certbot automatically sets up a systemd timer for renewal
systemctl enable certbot.timer
systemctl start certbot.timer

# Check renewal schedule
systemctl list-timers certbot.timer
```

---

## Managed Database Option

For production deployments, use managed databases instead of containerized ones for better reliability, backups, and performance.

### Step 1: Create Managed PostgreSQL

1. In DigitalOcean dashboard, go to Databases > Create Database Cluster
2. Select PostgreSQL 16
3. Choose configuration:
   - Size: Basic ($15/month, 1GB RAM)
   - Nodes: 1 (for high availability, choose 3)
   - Region: Same as your Droplet
4. Click "Create Database Cluster"

### Step 2: Create Managed Redis

1. Go to Databases > Create Database Cluster
2. Select Redis 7
3. Choose configuration:
   - Size: Basic ($15/month)
   - Nodes: 1
   - Region: Same as your Droplet
4. Click "Create Database Cluster"

### Step 3: Update Environment Variables

Get connection strings from DigitalOcean dashboard:

```bash
# SSH into droplet
ssh root@<droplet-ip>

# Edit .env
nano /app/exclusive-messenger/.env

# Update DATABASE_URL and REDIS_URL with managed database connection strings
# Examples:
# DATABASE_URL=postgresql://doadmin:password@db-postgresql-xxx-do-user-123456-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require
# REDIS_URL=redis://:password@db-redis-xxx-do-user-123456-0.db.ondigitalocean.com:25061
```

### Step 4: Update Docker Compose

Remove postgres and redis services from docker-compose.prod.yml, or comment them out:

```yaml
# Remove or comment out:
# postgres:
#   ...
# redis:
#   ...

# Keep only backend and web services
```

Restart services:

```bash
cd /app/exclusive-messenger
docker compose -f docker/docker-compose.prod.yml down
docker compose -f docker/docker-compose.prod.yml up -d
docker compose -f docker/docker-compose.prod.yml exec backend npm run db:migrate
```

---

## File Storage

For production, use S3-compatible object storage for file uploads and media.

### Option 1: DigitalOcean Spaces (Recommended)

DigitalOcean Spaces is S3-compatible and costs $5/month for 250GB.

**Step 1: Create Space**
1. Go to Spaces > Create Space
2. Name: `exclusive-messenger` (or your preferred name)
3. Region: Same as your Droplet
4. Click "Create Space"

**Step 2: Generate API Key**
1. Click on your Space
2. Go to Settings > CORS
3. Go to Account > API > Tokens/Keys > Spaces Keys
4. Create new key and note down Access Key and Secret Key

**Step 3: Configure Environment**

```bash
ssh root@<droplet-ip>
nano /app/exclusive-messenger/.env

# Add these variables:
# S3_ENDPOINT=https://yourdomain.nyc3.digitaloceanspaces.com
# S3_BUCKET=exclusive-messenger
# S3_ACCESS_KEY=your_access_key
# S3_SECRET_KEY=your_secret_key
```

**Step 4: Make Space Public (Optional)**

1. Click on your Space
2. Go to Settings
3. Set "File Listing" to Private
4. Leave "CORS" configured for your domain

Restart services:
```bash
docker compose -f docker/docker-compose.prod.yml restart backend web
```

### Option 2: AWS S3

If you already use AWS:

```bash
# Update .env
# S3_ENDPOINT=https://s3.amazonaws.com
# S3_BUCKET=your-bucket-name
# S3_ACCESS_KEY=your_access_key
# S3_SECRET_KEY=your_secret_key
# S3_REGION=us-east-1
```

---

## Monitoring

### Uptime Monitoring (UptimeRobot - Free)

Monitor your application health 24/7:

1. Sign up for [UptimeRobot](https://uptimerobot.com) (free tier includes 50 monitors)
2. Click "Add Monitor"
3. Choose Monitor Type: HTTP(s)
4. Set URL: `https://yourdomain.com/health`
5. Check interval: 5 minutes (free) or 1 minute (paid)
6. Get alerts via email

### View Docker Logs

```bash
# Real-time logs
docker compose -f docker/docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker/docker-compose.prod.yml logs -f backend

# Last 100 lines
docker compose -f docker/docker-compose.prod.yml logs --tail=100

# Save logs to file
docker compose -f docker/docker-compose.prod.yml logs > logs.txt
```

### System Monitoring

For production metrics, use Prometheus + Grafana:

```bash
# Install Prometheus (optional)
docker run -d --name prometheus \
  -p 9090:9090 \
  -v /app/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Install Grafana (optional)
docker run -d --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

### Health Checks

The application includes built-in health checks:

```bash
# Backend health
curl https://yourdomain.com/api/health

# Web health
curl https://yourdomain.com/health

# Database health (from inside container)
docker compose -f docker/docker-compose.prod.yml exec postgres pg_isready
```

---

## Scaling

### Vertical Scaling (Larger Droplet)

For increased traffic on a single server:

1. In DigitalOcean dashboard, go to Droplets
2. Click your Droplet
3. Click Resize (in Droplets menu)
4. Choose larger size (4GB, 8GB, 16GB RAM)
5. Power off Droplet (takes 1-2 minutes to resize)
6. Power back on

### Horizontal Scaling (Multiple Droplets)

For multiple servers, use load balancing:

**Option 1: DigitalOcean Load Balancer**
1. Create multiple Droplets with the same application
2. Create a Load Balancer
3. Point to both Droplets
4. Configure sticky sessions for WebSocket support

**Option 2: DigitalOcean App Platform**
1. Connect your GitHub repository
2. Define services (backend, web)
3. Set environment variables
4. Deploy with 1-click
5. Auto-scaling available

**Option 3: Kubernetes (Advanced)**
1. Create DigitalOcean Kubernetes cluster
2. Deploy using Helm charts
3. Auto-scaling and rolling updates

### Database Scaling

- Upgrade managed PostgreSQL to larger node
- Enable read replicas for reporting/analytics
- Implement connection pooling (PgBouncer)

### Cache Scaling

- Enable Redis persistence for faster restart
- Add Redis Sentinel for failover
- Implement caching strategy for frequently accessed data

---

## Cost Breakdown

### Minimal Setup (Development/Small Teams)
- Droplet (2GB): $24/month
- Domain (Namecheap): ~$12/year
- Cloudflare: Free
- **Total: ~$30/month**

### Recommended Setup (Growing Company)
- Droplet (4GB): $48/month
- Managed PostgreSQL (1GB): $15/month
- Managed Redis (1GB): $15/month
- DigitalOcean Spaces (250GB): $5/month
- Domain (Namecheap): ~$12/year
- Cloudflare Pro (optional): $20/month
- **Total: ~$83-103/month**

### High Availability Setup (Enterprise)
- Load Balancer: $12/month
- 2x Droplets (4GB each): $96/month
- Managed PostgreSQL (4GB, 3 nodes): $75/month
- Managed Redis (1GB, 3 nodes): $50/month
- DigitalOcean Spaces (1TB): $250/month
- Domain: ~$12/year
- Cloudflare Pro: $20/month
- **Total: ~$513/month**

---

## Troubleshooting

### Services won't start

```bash
# Check Docker status
docker compose -f docker/docker-compose.prod.yml ps

# View error logs
docker compose -f docker/docker-compose.prod.yml logs

# Rebuild images
docker compose -f docker/docker-compose.prod.yml down
docker compose -f docker/docker-compose.prod.yml pull
docker compose -f docker/docker-compose.prod.yml up -d
```

### Database migration fails

```bash
# Run migrations manually
docker compose -f docker/docker-compose.prod.yml exec backend npm run db:migrate

# Seed database (if needed)
docker compose -f docker/docker-compose.prod.yml exec backend npm run db:seed
```

### Out of disk space

```bash
# Check disk usage
df -h

# Clean up old Docker images/containers
docker system prune -a

# Check container sizes
docker ps -s
```

### High CPU/Memory usage

```bash
# Check resource usage
docker stats

# Increase Droplet size (vertical scaling)
# Or reduce container resource limits
```

### WebSocket issues

Ensure your reverse proxy (Nginx) has proper WebSocket configuration:

```nginx
location /ws {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_read_timeout 86400;
}
```

---

## Next Steps

1. **Enable automated backups**: Set up database backups in DigitalOcean or implement backup scripts
2. **Monitor performance**: Use UptimeRobot and Docker stats to track application health
3. **Set up CI/CD**: GitHub Actions workflows run automatically on push (see `.github/workflows/`)
4. **Plan scaling**: Monitor traffic and plan when to upgrade resources
5. **Security hardening**: Consider firewall rules, VPN access, regular security audits

For more help, visit the [DigitalOcean Community](https://www.digitalocean.com/community) or consult the [Docker Documentation](https://docs.docker.com).
