# Build artifacts on Linux/amd64 before building this image:
#   pnpm exec turbo run build --filter=web...
#   docker build -f deployment/images/web.Dockerfile -t app-web .
# Set NEXT_PUBLIC_RPC_URL when running the container; the same image works across domains.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p /app/web && chown -R node:node /app
WORKDIR /app/web

# Keep standalone's nested node_modules in the Docker build context.
COPY --chown=node:node apps/web/.next/standalone ./
COPY --chown=node:node apps/web/.next/static ./apps/web/.next/static
# No public/ directory exists yet. If added, also copy it to ./apps/web/public.

USER node
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["apps/web/server.js"]
