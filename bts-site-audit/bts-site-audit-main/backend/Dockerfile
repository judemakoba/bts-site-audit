# ============================================================
# BTS Audit API — Production Dockerfile
# ============================================================
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --ignore-scripts

# Rebuild native addons (sharp)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
RUN npm rebuild sharp 2>/dev/null || true

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Install sharp prebuilt
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps    /app/node_modules ./node_modules

# Copy app source
COPY backend/ ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
