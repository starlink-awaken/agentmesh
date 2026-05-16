# 使用多阶段构建
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun build ./src/index.ts --outdir=dist --target bun

FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/
COPY config/ /app/config/

ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["bun", "run", "dist/index.js"]
