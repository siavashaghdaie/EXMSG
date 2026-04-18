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

# Build shared package first (backend depends on it)
RUN cd packages/shared && npx tsc --build tsconfig.json 2>/dev/null || true

# Build backend explicitly (avoid workspace flag issues)
RUN cd packages/backend && npx tsc --project tsconfig.json || \
    (echo "TSC failed, trying without incremental..." && \
     cd /app/packages/backend && npx tsc --project tsconfig.json --incremental false --composite false)

# Verify dist was created
RUN ls -la packages/backend/dist/index.js && \
    ls -la packages/backend/dist/middleware/validate.js && \
    echo "Build verification passed!"

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

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3001

CMD ["node", "packages/backend/dist/index.js"]
