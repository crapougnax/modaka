# ==============================================================================
# Stage 1: Builder (Fast dependency installation & SSR compilation with Bun)
# ==============================================================================
FROM oven/bun:alpine AS builder

WORKDIR /app

# Build dependencies for native C++ addons (sqlite3, sharp) and git
RUN apk add --no-cache \
    git \
    ca-certificates \
    python3 \
    make \
    gcc \
    g++

# Copy package manifest and resolution script
COPY package.json ./
COPY bin ./bin

# Strip local developer portals and resolve published dependencies from npmjs
RUN bun run ./bin/resolve-workspaces.cjs

# Install dependencies cleanly from npmjs
RUN bun install

# Copy application source tree and configuration files
COPY tsconfig.json astro.config.mjs ./
COPY public ./public
COPY src ./src

# Build Astro standalone SSR bundle
RUN bun run build

# ==============================================================================
# Stage 2: Production Runtime (Ultra-lean, data-agnostic sovereign engine)
# ==============================================================================
FROM oven/bun:alpine AS runner

WORKDIR /app

# OCI standard metadata labels
LABEL org.opencontainers.image.title="Modaka"
LABEL org.opencontainers.image.description="Agnostic, touch-first sovereign OKF knowledge engine"
LABEL org.opencontainers.image.source="https://github.com/Quatrain/modaka"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.vendor="Quatrain Technologies"
LABEL org.opencontainers.image.authors="Quatrain Developers <developers@quatrain.com>"

# Runtime system dependencies:
# - git: essential for local git repo commits and remote GitHub sync
# - chromium + rendering libs: headless capture and OCR
# - curl: container healthcheck probe and network diagnostics
RUN apk add --no-cache \
    git \
    ca-certificates \
    chromium \
    curl \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont

ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

# Agnostic data defaults:
# - GIT_MODE: 'local' (mounted repository) or 'github' (remote clone/push)
# - GIT_LOCAL_PATH: Target path for the knowledge repository
# - DOCUMENT_STORAGE_PATH: Target path for binary documents (PDFs, images)
ENV GIT_MODE=local
ENV GIT_LOCAL_PATH=/data/content
ENV DOCUMENT_STORAGE_PATH=/data/documents

# Copy package metadata, installed node_modules, and compiled SSR bundle from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create agnostic storage mount targets and set permissions for unprivileged user
RUN mkdir -p /data/content /data/documents /data/queue /app/.queue && \
    chown -R bun:bun /data /app

# Non-root unprivileged execution (UID 1000)
USER bun

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
    CMD curl -f -s http://127.0.0.1:4000 || exit 1

CMD ["bun", "run", "dist/server/entry.mjs"]
