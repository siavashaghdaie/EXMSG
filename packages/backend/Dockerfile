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

# Stage 2: Production
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application from builder stage
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/node_modules ./node_modules
COPY --from=builder /app/node_modules ./root_node_modules
COPY --from=builder /app/packages/backend/prisma ./prisma
COPY --from=builder /app/packages/shared ./packages/shared

# Copy package.json files for reference
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/backend/package.json ./packages/backend/

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to nodejs user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/index.js"]
