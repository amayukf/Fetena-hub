# syntax=docker/dockerfile:1
# -------------------------------------------------------------
# Fetena Hub — Production Multi-Stage Dockerfile
# -------------------------------------------------------------

FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# -------------------------------------------------------------
# Stage 1: Dependencies & Build
# -------------------------------------------------------------
FROM base AS builder

COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Production Runner
# -------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

WORKDIR /app

# Create a non-root service user for container security
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/bash -m fetena

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig*.json ./

RUN chown -R fetena:nodejs /app
USER fetena

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
