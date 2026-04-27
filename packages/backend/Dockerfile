# Multi-stage Dockerfile for backend production build
# Stage 1: Builder
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy entire monorepo
COPY . .

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Generate Prisma client for linux-musl-openssl-3.0.x (Alpine 3.18+)
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

# Debug: show what we have
RUN echo "=== Checking source files ===" && \
    ls packages/backend/src/index.ts && \
    ls packages/backend/src/middleware/validate.ts && \
    cat packages/backend/tsconfig.json

# Build backend - capture all output
RUN cd packages/backend && \
    npx tsc --project tsconfig.json --incremental false --composite false 2>&1; \
    echo "=== TSC exit code: $? ===" && \
    echo "=== Checking dist ===" && \
    find dist -name "*.js" 2>/dev/null | head -20 || echo "NO DIST FOUND" && \
    ls -la dist/ 2>/dev/null || echo "dist/ does not exist"

# Stage 2: Production — use node:20-slim (Debian) to avoid Alpine OpenSSL issues
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL (Debian slim already has it, but ensure it's there)
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nodejs

# Copy the root node_modules (where hoisted deps like express live)
COPY --from=builder /app/node_modules ./node_modules

# Copy backend node_modules (for any non-hoisted deps + prisma client)
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules

# Copy built backend code
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json

# Copy shared package
COPY --from=builder /app/packages/shared ./packages/shared

# Copy root package.json (needed for workspace resolution)
COPY --from=builder /app/package.json ./

# Re-generate Prisma client for Debian (different platform than Alpine builder)
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

# Copy entrypoint script
COPY packages/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create uploads directories and set ownership
RUN mkdir -p /app/uploads/avatars && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3001

CMD ["/app/docker-entrypoint.sh"]
