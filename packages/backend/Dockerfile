# Multi-stage Dockerfile for backend production build
# Stage 1: Builder
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy entire monorepo
COPY . .

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Generate Prisma client
RUN npm run db:generate --workspace=packages/backend

# Build backend
RUN npm run build --workspace=packages/backend

# Stage 2: Production — keep the full monorepo structure so Node resolves modules correctly
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

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

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3001

# Run from the backend package directory
CMD ["node", "packages/backend/dist/index.js"]
