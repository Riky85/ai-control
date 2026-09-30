# angar web app — image for the on-premises edition. Build from the repo root:
#   docker build -f onprem/Dockerfile .
# (kept out of the root so Railway keeps its own build). Compose: see
# src/lib/onprem/install-script.ts). The cloud runs on Railway without it.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ARG ANGAR_VERSION=dev
ENV NEXT_TELEMETRY_DISABLED=1 ANGAR_VERSION=$ANGAR_VERSION
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ARG ANGAR_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 ANGAR_ONPREM=1 ANGAR_VERSION=$ANGAR_VERSION
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.js ./
EXPOSE 3000
LABEL org.opencontainers.image.title="angar" \
      org.opencontainers.image.description="angar on-premises: AI spend and AI usage, with all data on your own server" \
      org.opencontainers.image.source="https://github.com/Riky85/ai-control"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Schema aggiornato a ogni avvio (come il preDeploy su Railway), poi il server.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && exec npx next start -p ${PORT}"]
