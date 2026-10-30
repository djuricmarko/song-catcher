# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN npm install --global pnpm@10.24.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

RUN pnpm install --frozen-lockfile

COPY shared shared
COPY server server
COPY web web

RUN pnpm build


FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.source=https://github.com/kmille/deezer-downloader
LABEL org.opencontainers.image.description="Download music from Deezer and YouTube with a React frontend"
LABEL org.opencontainers.image.licenses=MIT

RUN apk add --no-cache ffmpeg flac yt-dlp \
    && adduser -D -u 1000 deezer \
    && mkdir -p /mnt/deezer-downloader \
    && chown deezer:deezer /mnt/deezer-downloader

RUN npm install --global pnpm@10.24.0

WORKDIR /app

# Install only production dependencies. Workspace symlinks are preserved so
# @deezer-downloader/shared resolves to /app/shared at runtime.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --prod --frozen-lockfile \
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

CMD ["node", "server/dist/cli.js"]
