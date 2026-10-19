# Build artifacts on Linux/amd64 before building this image:
#   pnpm exec turbo run build --filter=api --filter=cli
#   docker build -f deployment/images/api.Dockerfile -t app-api .
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim

ENV NODE_ENV=production \
    PORT=3001 \
    STORAGE_LOCAL_ROOT=/app/storage

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/api /app/storage \
 && chown -R node:node /app

WORKDIR /app/api
COPY --chown=node:node deployment/images/api-runtime-package.json ./package.json
COPY --chown=node:node deployment/images/api-runtime-package-lock.json ./package-lock.json
USER node
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

COPY --chown=node:node apps/api/dist/index.js ./dist/index.js
COPY --chown=node:node apps/cli/dist/cli.js ./dist/cli.js
COPY --chown=node:node apps/api/drizzle/postgres ./drizzle/postgres

EXPOSE 3001
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
