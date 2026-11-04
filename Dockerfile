# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

RUN npm ci

COPY shared shared
COPY server server
COPY web web

RUN npm run build


FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.source=https://github.com/kmille/deezer-downloader
LABEL org.opencontainers.image.description="Download music from Deezer and YouTube with a React frontend"
LABEL org.opencontainers.image.licenses=MIT

RUN apk add --no-cache ffmpeg flac yt-dlp \
    && adduser -D -u 1000 deezer \
    && mkdir -p /mnt/deezer-downloader \
    && chown deezer:deezer /mnt/deezer-downloader

WORKDIR /app

# Install only production dependencies. Workspace symlinks are preserved so
# @song-catcher/shared resolves to /app/shared at runtime.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace @song-catcher/server \
    && npm cache clean --force

COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

ENV NODE_ENV=production \
    DEEZER_HTTP_HOST=0.0.0.0 \
    DEEZER_HTTP_PORT=5000 \
    DEEZER_DOWNLOAD_DIR=/mnt/deezer-downloader \
    DEEZER_LOG_FILE=/tmp/deezer-downloader.log

USER deezer

EXPOSE 5000

# /api/health stays reachable without credentials even when DEEZER_AUTH_* is set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const prefix = (process.env.DEEZER_URL_PREFIX || '').replace(/^\/+|\/+$/g, ''); fetch('http://127.0.0.1:' + (process.env.DEEZER_HTTP_PORT || 5000) + (prefix ? '/' + prefix : '') + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/dist/cli.js"]
