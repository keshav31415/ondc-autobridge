FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN mkdir -p /app/.data/artifacts && chown -R node:node /app/.data

FROM base AS api
ENV NODE_ENV=production PORT=4100 INLINE_WORKER=false
USER node
EXPOSE 4100
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/api/src/index.ts"]

FROM base AS web-build
ARG API_ORIGIN=http://api:4100
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm build

FROM web-build AS web
ENV NODE_ENV=production
USER node
EXPOSE 3100
CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "--port", "3100", "--hostname", "0.0.0.0"]
