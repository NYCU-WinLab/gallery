# syntax=docker/dockerfile:1
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# The build corner shows the commit, links its CD run and tips the time.
ARG BUILD_SHA BUILD_TIME BUILD_URL
ENV NEXT_PUBLIC_BUILD_SHA=$BUILD_SHA \
    NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME \
    NEXT_PUBLIC_BUILD_URL=$BUILD_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build \
 && bun build scripts/migrate.ts --target node --external pg-native --outfile migrate.mjs

FROM node:24-slim
# ffmpeg re-encodes uploaded videos and takes their poster frame.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/cache \
 && chown node:node /data/cache
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    MEDIA_CACHE_DIR=/data/cache
# EXIF times carry no zone; the lab's cameras are in Taipei.
ENV TZ=Asia/Taipei
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/migrate.mjs ./migrate.mjs
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
# web by default; compose's migrate service runs `node migrate.mjs`.
CMD ["node", "server.js"]
