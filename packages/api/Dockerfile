# Backend facturAI (@sfr/api). Se construye desde la RAÍZ del repo:
#   docker build -f packages/api/Dockerfile -t facturai-api .
# @sfr/core se consume como código TypeScript (no hay build), por eso se ejecuta con tsx.
FROM node:22-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile --filter @sfr/api...

COPY packages/core packages/core
COPY packages/api packages/api

WORKDIR /app/packages/api
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
