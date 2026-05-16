#!/bin/bash
# Agent Mesh Gateway — 快速启动
# chmod +x start.sh

cd "$(dirname "$0")"

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  bun install
fi

# 加载 .env
if [ -f .env ]; then
  set -a; source .env; set +a
  echo "✅ .env loaded"
else
  echo "⚠️  No .env found, copy .env.example to .env and set your API keys"
fi

echo "🚀 Starting Agent Mesh Gateway..."
bun run src/index.ts
