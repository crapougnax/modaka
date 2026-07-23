# Final stage using Bun for fast SSR execution
FROM oven/bun:alpine
WORKDIR /app

# Install Chromium and basic fonts/libs for headless execution in container
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# OCI standard labels
LABEL org.opencontainers.image.title="Modaka"
LABEL org.opencontainers.image.description="Tactile and touch-first PWA knowledge management system"
LABEL org.opencontainers.image.source="https://github.com/crapougnax/modaka"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.vendor="Quatrain Technologies"
LABEL org.opencontainers.image.authors="Quatrain Developers <developers@quatrain.com>"

# Copy pre-built application from host build context
COPY dist ./dist
COPY node_modules ./node_modules
COPY package.json ./

# Create data directories for Local Storage
RUN mkdir -p /data/modaka/metadata /data/modaka/documents && \
    chown -R bun:bun /data/modaka

# Run as non-root unprivileged user
USER bun

ENV PORT=4000
ENV HOST=0.0.0.0
EXPOSE 4000

CMD ["bun", "run", "dist/server/entry.mjs"]
