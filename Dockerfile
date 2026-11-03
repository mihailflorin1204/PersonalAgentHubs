FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/tsconfig.json packages/database/tsconfig.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/auth/tsconfig.json packages/auth/tsconfig.json
RUN pnpm install --frozen-lockfile
COPY apps/api/src apps/api/src
COPY packages/database/src packages/database/src
COPY packages/database/drizzle packages/database/drizzle
COPY packages/auth/src packages/auth/src
RUN pnpm --filter @agenthub/database build && pnpm --filter @agenthub/auth build && pnpm --filter @agenthub/api build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/auth/package.json packages/auth/package.json
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/database/dist packages/database/dist
COPY --from=build /app/packages/database/drizzle packages/database/drizzle
COPY --from=build /app/packages/auth/dist packages/auth/dist
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint.sh && chmod +x /usr/local/bin/api-entrypoint.sh
USER node
EXPOSE 3001
ENTRYPOINT ["api-entrypoint.sh"]
