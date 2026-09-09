FROM node:24-bookworm-slim
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY sources ./sources
COPY apps/worker ./apps/worker
RUN pnpm --filter @sak/worker... install --prod --frozen-lockfile
USER node
WORKDIR /app/apps/worker
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD node -e "const fs=require('fs');process.exit(Date.now()-fs.statSync('/tmp/sak-worker-heartbeat').mtimeMs<90000?0:1)"
CMD ["pnpm", "start", "--scheduler"]
